from django.contrib import admin
from .models import  *
# Register your models here.
@admin.register(User)
class ZhuYeUserAdmin(admin.ModelAdmin):
    list_display = ('id', 'username')
    search_fields = ('username', 'email')
@admin.register(Uprofile)
class UprofileAdmin(admin.ModelAdmin):
    # # 关联的 User 会显示其 __str__ 方法返回的值
    list_display = ('id', 'user','address','phone','wechat','avatar','birthday')

@admin.register(Diary)
class DiaryAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'content')


