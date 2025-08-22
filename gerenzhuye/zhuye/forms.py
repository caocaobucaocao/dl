from django import forms

from django.contrib.auth.forms import AuthenticationForm, UserCreationForm
from django import forms
from .models import *
from django import forms
from django.contrib.auth.forms import UserCreationForm

class UserModelForm(UserCreationForm):
    """用户注册表单"""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # 统一设置所有字段的样式
        # 用户名
        self.fields['username'].label = '用户名'
        self.fields['username'].max_length = 10
        self.fields['username'].widget.attrs.update({
            'class': 'form-input',
            'placeholder': '请输入用户名',
            'required': 'required',
            'style': 'background-color: #e6f7ff;'
        })
        # 密码1
        self.fields['password1'].label = '密码'
        self.fields['password1'].widget.attrs.update({
            'class': 'form-input',
            'placeholder': '请输入密码',
            'required': 'required',
            'style': 'background-color: #e6f7ff;'
        })
        # 密码2（确认密码）
        self.fields['password2'].label = '确认密码'
        self.fields['password2'].widget.attrs.update({
            'class': 'form-input',
            'placeholder': '请再次输入密码',
            'required': 'required',
            'style': 'background-color: #e6f7ff;'
        })
        # 邮箱
        self.fields['email'].label = '邮箱'
        self.fields['email'].required = True
        self.fields['email'].widget.attrs.update({
            'class': 'form-input',
            'placeholder': '请输入邮箱',
            'required': 'required',
            'style': 'background-color: #e6f7ff;'
        })
    class Meta:
        model = User
        fields = ['username', 'password1', 'password2', 'email']
    def clean(self):
        cleaned_data = super().clean()
        username = cleaned_data.get("username")
        password = cleaned_data.get("password1")
        email = cleaned_data.get("email")
        print(f"清理数据：用户名={username}, 密码={password}, 邮箱={email}")
        if not username or not password or not email:
            raise forms.ValidationError("用户名和密码,邮箱不能为空")
        if len(username) > 10 or len(password) > 10:
            raise forms.ValidationError("用户名和密码不能超过10个字符")
        return cleaned_data

class LoginForm(AuthenticationForm):
    """用户登录表单"""
    username = forms.CharField(
        label='用户名',
        max_length=10,
        required=True,
        widget=forms.TextInput(attrs={
            'class': 'form-input',
            'placeholder': '请输入用户名',
            'required': 'required',
            'style': 'background-color: #e6f7ff;'
        })
    )
    password = forms.CharField(
        label='密码',
        max_length=10,
        required=True,
        widget=forms.PasswordInput(attrs={
            'class': 'form-input',
            'placeholder': '请输入密码',
            'required': 'required',
            'style': 'background-color: #e6f7ff;'
        })
    )


class ProfileForm(forms.ModelForm):
    # 可以额外添加模型外的字段（如邮箱，关联到User模型）
    username = forms.CharField(label='用户名') # 只读用户名
    email = forms.EmailField(label='电子邮件')
    class Meta:
        model = Uprofile  # 关联的模型
        fields = ['username','birthday','address',
                  'phone','wechat','avatar','website']  # 核心修改：改变此处顺序
        widgets = {
            'birthday': forms.DateInput(attrs={
            'class': 'form-input',
            'style': 'background-color: #e6f7ff;'
        }),
            'address': forms.TextInput(attrs={
            'class': 'form-input',
            'style': 'background-color: #e6f7ff;'
        }),
            'phone': forms.TextInput(attrs={
            'class': 'form-input',
            'style': 'background-color: #e6f7ff;'
        }),
            'wechat': forms.TextInput(attrs={
            'class': 'form-input',
            'style': 'background-color: #e6f7ff;'
        }),
             # 头像上传使用 ClearableFileInput 部件（修正点）
            'avatar': forms.ClearableFileInput(attrs={
                'class': 'form-input',  # 修正拼写错误：from-input → form-input
                'accept': 'image/*'
            }),
            'website': forms.TextInput(attrs={
            'class': 'form-input',
            'style': 'background-color: #e6f7ff;'
        }),
        }
       # 初始化表单时，从关联的User模型填充用户名和邮箱
    def __init__(self, *args, **kwargs):
        # 从kwargs中获取关联的User实例（需在视图中传递）
        self.user = kwargs.pop('user', None)
        super().__init__(*args, **kwargs)

        # 如果有User实例，设置初始值
        if self.user:
            self.fields['username'].initial = self.user.username
            self.fields['email'].initial = self.user.email
             # 用户名
        self.fields['username'].label = '用户名'
        self.fields['username'].max_length = 10
        self.fields['username'].widget.attrs.update({
            'class': 'form-input',
            'placeholder': '用户名',
            'required': 'required',
            'style': 'background-color: #e6f7ff;'
        })
             # 用户名
        self.fields['email'].label = '用户名'
        self.fields['email'].max_length = 20
        self.fields['email'].widget.attrs.update({
            'class': 'form-input',
            'placeholder': '邮箱',
            'required': 'required',
            'style': 'background-color: #e6f7ff;'
        })
