from django.urls import path
from .views import *

urlpatterns = [
    path('index/', index, name='index'),  # 首页视图
    path('rgst/', UserRegisterView.as_view(), name='rgst'),
    path('login/', UserLoginView.as_view(), name='login'),
    path('logout/', CustomerLogoutView.as_view(), name='logout'),
    path('uprofile/', UProfileView.as_view(), name='uprofile'),  # 用户档案视图
    path('user/<int:userid>', tests, name='user'),
    path('user/<int:userid>', profile, name='profile'),
    # path('record_stay_duration/', record_stay_duration, name='record_stay_duration'),
    path('data_analysis/', data_analysis, name='data_analysis'),

    path('svlv/', SiteVisitListView.as_view(), name='svlv'),
]
