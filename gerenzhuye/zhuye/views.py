import json

import numpy as np
from bokeh.embed import components
from bokeh.plotting import figure
from django.contrib import messages
from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Q
from django.shortcuts import render, redirect
from django.urls import reverse_lazy
from django.views.generic import View, CreateView
from django.contrib.auth.decorators import login_required, permission_required
from django.contrib.auth.views import LoginView, LogoutView
from django.contrib.auth import login
from django.utils.decorators import method_decorator
from .forms import *
from .models import *
from django.http import HttpResponseRedirect, HttpResponse
from gerenzhuye.decorators import log_execution, logger
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect


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
    condition = Q(duration__gt=60) | Q(url__contains="/zhuye/index/")
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
        uprofileForm = ProfileForm(instance=uprofile, user=request.user)
        return render(request, self.template_name, {'form': uprofileForm})

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


# @csrf_protect
# def record_stay_duration(request):
#     if request.method == 'POST':
#         user_token = request.COOKIES.get('csrftoken')
#         ip_address = get_real_ip(request)
#         data = json.loads(request.body)
#         logger.info(data)
#         duration = data.get('duration', 0)
#         url = data.get('url', '')
#
#         # 此处可关联到对应的SiteVisit记录，更新duration字段
#         # 例如：通过url和用户信息找到对应记录并更新
#         try:
#             if request.user.is_authenticated:
#                 visit = SiteVisit.objects.create(
#                     user=request.user,
#                     url=url,
#                     duration=duration,
#                     ip_address=ip_address
#                 )
#             else:
#                 visit = SiteVisit.objects.create(
#                     token=user_token,
#                     url=url,
#                     duration=duration,
#                     ip_address=ip_address
#                 )
#             visit.save()
#         except Exception as e:
#             logger.error(f"更新停留时长失败：{str(e)}")
#         return JsonResponse({'status': 'success'})
#     return JsonResponse({'status': 'error'}, status=400)


def data_analysis(request):
    template_name = 'zhuye/data_analysis.html'
    x = np.linspace(0, 10, 100)
    y1 = np.sin(x)
    y2 = np.cos(x)

    # 2. 创建 Bokeh 图表
    plot = figure(
        title="正弦和余弦曲线",
        x_axis_label="X轴",
        y_axis_label="Y轴",
        width=800,
        height=600,
        sizing_mode="stretch_both",  # 自适应容器大小
        tools="pan,box_zoom,wheel_zoom,reset,hover"  # 交互式工具
    )

    # 添加曲线
    plot.line(x, y1, legend_label="sin(x)", line_width=2, color="blue")
    plot.line(x, y2, legend_label="cos(x)", line_width=2, color="red", line_dash="dashed")

    # 3. 将图表转换为可嵌入网页的组件
    script, div = components(plot)

    # 4. 传递到模板
    return render(request, template_name, {
        'script': script,
        'div': div,
        'title': 'Bokeh 与 Django 集成示例'
    })
