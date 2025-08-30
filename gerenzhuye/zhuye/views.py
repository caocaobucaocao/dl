import json
from threading import active_count

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
from gerenzhuye.decorators import log_execution


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


def data_analysis(request):
    template_name = 'zhuye/data_analysis.html'
    return render(request, template_name )
