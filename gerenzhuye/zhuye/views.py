import json

from bokeh.embed import components
from bokeh.models import DatetimeTickFormatter, FactorRange, HoverTool
from bokeh.models.tools import PanTool, BoxZoomTool, WheelZoomTool, ResetTool
from bokeh.plotting import figure
from django.contrib import messages
from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Q
from django.shortcuts import render, redirect
from django.urls import reverse_lazy
from django.views.generic import View, CreateView, ListView
from django.contrib.auth.decorators import login_required, permission_required
from django.contrib.auth.views import LoginView, LogoutView
from django.contrib.auth import login
from django.utils.decorators import method_decorator
from .forms import *
from .models import *
from django.http import HttpResponseRedirect, HttpResponse
from gerenzhuye.decorators import log_execution, logger


def get_real_ip(request):
    """获取用户真实IP（原有逻辑不变）"""
    ip_headers = ['HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR']
    for header in ip_headers:
        ip = request.META.get(header)
        if ip:
            if header == 'HTTP_X_FORWARDED_FOR':
                ip = ip.split(',')[0].strip()
            return ip
    return '未知IP'


@log_execution()
def index(request):
    """首页视图"""
    site_visits_count = SiteVisit.objects.all().count()
    today_visits_count = SiteVisit.active_visitor().count()
    condition = Q() | Q(url__contains="/zhuye/index/")
    active_visits_count = SiteVisit.active_visitor(condition=condition).count()
    return render(request, 'zhuye/index.html', {'count': site_visits_count, 'today_visits_count': today_visits_count,
                                                'active_visits_count': active_visits_count})


class UserRegisterView(CreateView):
    """用户注册视图"""
    model = User
    form_class = UserModelForm
    template_name = 'zhuye/rgst.html'
    success_url = reverse_lazy('index')  # 注册成功后重定向到首页

    @log_execution()
    def form_valid(self, form):
        # 先保存用户但不提交到数据库
        user = form.save(commit=False)
        # 设置密码（如果需要自定义密码处理）
        user.set_password(form.cleaned_data['password1'])
        # 提交保存用户
        user.save()
        # 手动登录用户
        login(self.request, user)
        return HttpResponseRedirect(self.success_url)


class UserLoginView(LoginView):
    """用户登录视图"""
    template_name = 'zhuye/login.html'
    form_class = LoginForm
    redirect_authenticated_user = True  # 如果用户已登录，重定向到成功页面


class CustomerLogoutView(LogoutView):
    """用户登出视图"""
    next_page = 'login'

    @log_execution()
    def dispatch(self, request, *args, **kwargs):
        print(f"用户 {request.user.username}登出")
        return super().dispatch(request, *args, **kwargs)


class UProfileView(View):
    """用户档案视图"""
    template_name = 'zhuye/uprofile.html'

    @log_execution()
    @method_decorator(login_required)
    # @method_decorator(permission_required('zhuye.test_uprofile', raise_exception=True))
    def get(self, request, *args, **kwargs):
        try:
            uprofile = request.user.user2profile
        except Uprofile.DoesNotExist:
            uprofile = None
        uprofile_form = ProfileForm(instance=uprofile, user=request.user)
        return render(request, self.template_name, {'form': uprofile_form})

    def post(self, request):
        print(1)
        # 获取当前用户的Uprofile实例（一对一关联）
        uprofile = request.user.user2profile
        # 绑定Uprofile实例到表单
        form = ProfileForm(request.POST, request.FILES, instance=uprofile, user=request.user)
        if form.is_valid():
            # 保存表单数据，包括上传的头像
            form.save()
            request.user.username = form.cleaned_data['username']
            request.user.email = form.cleaned_data['email']
            request.user.save()  # 保存User实例
            messages.success(request, '个人信息更新成功！')
        else:
            messages.error(request, '更新失败，请检查输入内容。')
        return redirect('uprofile')  # 重定向到个人资料页


@log_execution()
def tests(request, userid):  # 注意这里接收userid参数
    try:
        user = User.objects.get(id=userid)
        user_data = {
            "id": user.id,
            "username": user.username,
            # 其他字段...
        }
        return HttpResponse(json.dumps(user_data), content_type="application/json")
    except ObjectDoesNotExist:
        return HttpResponse(
            json.dumps({"error": "用户不存在"}),
            content_type="application/json",
            status=404
        )


@log_execution()
def profile(request, userid):  # 注意这里接收userid参数
    try:
        user = User.objects.get(id=userid)
        uprofile = Uprofile.objects.get(user=user)
        data = {
            "id": uprofile.id,
            "username": user.username,
            # 其他字段...
        }
        return HttpResponse(json.dumps(data), content_type="application/json")
    except ObjectDoesNotExist:
        return HttpResponse(
            json.dumps({"error": "用户不存在"}),
            content_type="application/json",
            status=404
        )


@log_execution()
def data_analysis(request):
    template_name = 'zhuye/data_analysis.html'
    token = request.GET.get('token')
    username = request.GET.get('username')
    logger.debug(f"token: {token}")
    logger.debug(f"username: {username}")
    qs = ''
    if token or username:
        if token:
            qs = SiteVisit.objects.filter(token=token).values_list('url', 'visit_time')[:1200]
        if username:
            user = User.objects.get(username=username) or ''
            logger.debug(user)
            if user: qs = SiteVisit.objects.filter(user=user).values_list('url', 'visit_time')[:1200]
            logger.debug(qs)
    else:
        qs = ''
    if not qs:
        return render(request, template_name, {
            'script': '',
            'div': '<p class="text-center text-gray-500">暂无访问记录</p>',
            'title': '访问分析'
        })
    # 2. 提取数据（保留 URL 和时间的一一对应关系，不单独去重）
    # 格式：[(url1, time1), (url2, time2), ...]
    raw_data = list(qs)
    # 按时间排序（折线图需要按时间顺序连接，否则线条混乱）
    raw_data_sorted = sorted(raw_data, key=lambda x: x[1])  # 按时间升序

    # 拆分排序后的 x（时间）和 y（URL），确保长度一致
    visit_time_list = [item[1] for item in raw_data_sorted]  # x轴：时间（长度 N）
    visit_url_list = [item[0] for item in raw_data_sorted]  # y轴：URL（长度 N）

    # 3. 提取唯一 URL 作为分类轴（确保 FactorRange 无重复）
    unique_urls = list(dict.fromkeys(visit_url_list))  # 唯一 URL 列表（去重）
    y_range = FactorRange(factors=unique_urls)  # 分类轴范围（唯一 URL）

    logger.debug(f"排序后时间列表长度: {len(visit_time_list)}")
    logger.debug(f"排序后URL列表长度: {len(visit_url_list)}")  # 与时间列表长度一致
    logger.debug(f"去重URL列表长度: {len(unique_urls)}")
    # 定义各工具的中文配置（使用 description 设置工具按钮的悬停提示）
    pan_tool = PanTool(description="平移")  # 平移工具
    wheel_zoom_tool = WheelZoomTool(description="滚轮缩放")  # 滚轮缩放工具
    reset_tool = ResetTool(description="重置视图")  # 重置工具
    hover_tool = HoverTool(
        description="悬停查看详情",  # 工具按钮的提示
        tooltips=[("访问时间", "@x{%Y-%m-%d %H:%M}"),
                  ("访问页面", "@y")],  # 悬停时显示的数据内容（示例）
        formatters={"@x": "datetime"}  # 时间格式化
    )
    # 4. 创建图表（折线图）
    plot = figure(
        title="访问记录时间线（折线图）",
        x_axis_label="访问时间",
        y_axis_label="访问页面",
        width=800,
        height=600,
        sizing_mode="stretch_both",
        tools=[pan_tool, wheel_zoom_tool, reset_tool, hover_tool],
        x_axis_type="datetime",  # x轴：时间轴
        y_range=y_range  # y轴：分类轴（唯一 URL）
    )

    # 5. 绘制折线图（使用排序后的数据，确保线条按时间顺序连接）
    plot.line(
        x=visit_time_list,
        y=visit_url_list,
        line_width=2,  # 线条粗细
        color="blue",
        legend_label="访问顺序",
    )

    # 7. 格式化 x 轴时间显示
    plot.xaxis.formatter = DatetimeTickFormatter(
        hours="%H:%M",
        days="%Y-%m-%d",
        months="%Y-%m",
        years="%Y"
    )

    # 8. 转换为网页组件
    script, div = components(plot)

    return render(request, template_name, {
        'script': script,
        'div': div,
        'title': '访问记录分析（折线图）'
    })


# books/views.py
class SiteVisitListView(ListView):
    model = SiteVisit
    template_name = 'zhuye/svlvh.html'
    context_object_name = "site_visits"
    paginate_by = 20  # 每页5条
    paginate_orphans = 2  # 最后一页若≤2条，合并到上一页

    def get_queryset(self):
        queryset = super().get_queryset()
        # 从URL查询参数中获取作者名（如 /zhuye/?url=/zhuye/index/）
        url = self.request.GET.get("url") or ''
        if url:
            queryset = queryset.filter(url=url)  # 模糊匹配
            logger.debug(queryset.count())
        return queryset
