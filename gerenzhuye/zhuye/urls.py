from django.urls import path
from .views import  *
urlpatterns = [
    path('index/', index, name='index'),  # 首页视图
    path('rgst/', UserRegisterView.as_view(), name='rgst'),
    path('login/', UserLoginView.as_view(), name='login'),
    path('logout/', CustomerLogoutView.as_view(), name='logout'),
    path('uprofile/', UProfileView.as_view(), name='uprofile'),  # 用户档案视图

]
