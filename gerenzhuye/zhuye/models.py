from django.db.models import Case, When, Value, CharField
from django.db.models.functions import Concat
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.urls import reverse
from django.utils.translation import gettext_lazy as _
from django.contrib.auth.models import AbstractUser
from datetime import date, datetime, timedelta
from django.db import models
from django.utils import timezone
import uuid


class User(AbstractUser):
    """自定义用户模型"""

    class Meta:
        verbose_name = '用户'
        verbose_name_plural = '用户'
        permissions = [
            ("zhuyeuser", "zhuyeuser"),
        ]

    def get_absolute_url(self):
        """获取用户详情页的URL"""
        return reverse('zhuye:user_detail', kwargs={'pk': self.pk})

    def __str__(self):
        """Unicode representation of ZhuYeUser."""
        return f'[name={self.username},email={self.email}]'


class Uprofile(models.Model):
    """用户档案"""

    # TODO: Define fields here

    class Meta:
        """Meta definition for UProfile."""
        verbose_name = '用户档案'
        verbose_name_plural = '用户档案'

    user = models.OneToOneField(to=User,
                                verbose_name=_("用户档案->用户"),
                                on_delete=models.CASCADE,
                                related_name="user2profile"  # 反向关联 ,便于主模型访问
                                )
    address = models.CharField(
        verbose_name='地址',
        max_length=100,
        default='000000000000000',
        help_text='地址')
    phone = models.CharField(
        verbose_name='电话',
        max_length=11,
        default='00000000000',
        help_text='电话')
    wechat = models.CharField(
        verbose_name='微信',
        max_length=50,
        default='0000000000000',
        help_text='微信')
    avatar = models.ImageField(
        upload_to='avatars/',
        default='/avatars/default_avatar.png',
        verbose_name='头像'
    )
    birthday = models.DateField(
        verbose_name='生日',
        default=date(1949, 10, 1))
    website = models.URLField(
        default='http://www.example.com',
        verbose_name='个人网站'
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='创建时间'
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='更新时间'
    )

    def __str__(self):
        """Unicode representation of UProfile."""
        return f'[name={self.user.username},\
            birth={self.birthday},\
                phone={self.phone},\
                wechat={self.wechat},\
                    address={self.address},\
                        avatar={self.avatar},\
                            website={self.website},\
                            created_at={self.created_at},\
                                updated_at={self.updated_at}]'


class Diary(models.Model):
    """Model definition for Diary."""

    # TODO: Define fields here
    class Meta:
        """Meta definition for Diary."""
        verbose_name = '日记'
        verbose_name_plural = '日记'

    user = models.ForeignKey(to=User,
                             verbose_name='用户',
                             on_delete=models.CASCADE,
                             # 由User通过，related_name 查询
                             # 如 user.user2diary.all()
                             related_name='user2diary', )
    content = models.TextField(verbose_name='内容')

    def __str__(self):
        """Unicode representation of Diary."""
        return f'user={self.user.username},content={self.content}'


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    """用户创建时自动创建档案"""
    if created:
        Uprofile.objects.create(user=instance)


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    """用户保存时自动保存档案"""
    instance.user2profile.save()


class SiteVisit(models.Model):
    """网站访问数据模型，记录用户访问行为"""

    # 访问唯一标识
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text="访问记录唯一ID"
    )
    token = models.CharField(max_length=36, null=True, blank=True)  # 非登录用户标识（UUID）
    # 访问时间
    visit_time = models.DateTimeField(
        default=timezone.now,
        help_text="用户访问时间"
    )

    # 访问的页面URL
    url = models.URLField(
        max_length=2048,
        help_text="用户访问的页面URL"
    )

    # 来源页面（ Referrer ）
    referrer = models.URLField(
        max_length=2048,
        blank=True,
        null=True,
        help_text="用户来源页面URL"
    )

    # 用户IP地址
    ip_address = models.GenericIPAddressField(
        help_text="访问者IP地址"
    )

    # 用户代理（浏览器信息）
    user_agent = models.TextField(
        blank=True,
        null=True,
        help_text="访问者浏览器及设备信息"
    )

    # 访问时长（秒）
    duration = models.PositiveIntegerField(
        default=0,
        help_text="用户在页面的停留时间（秒）,0代表,"
    )

    # 设备类型
    DEVICE_CHOICES = [
        ('desktop', '桌面设备'),
        ('mobile', '移动设备'),
        ('tablet', '平板设备'),
        ('other', '其他设备'),
    ]
    device_type = models.CharField(
        max_length=20,
        choices=DEVICE_CHOICES,
        default='other',
        help_text="访问设备类型"
    )

    # 浏览器类型
    browser = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="浏览器类型"
    )

    # 操作系统
    os = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="操作系统"
    )

    # 地区信息
    country = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="访问者所在国家"
    )

    # 城市信息
    city = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="访问者所在城市"
    )
    params = models.JSONField(
        blank=True,
        null=True,
        help_text="请求参数（GET/POST，已过滤敏感信息）"
    )
    # 关联的用户（如果已登录）
    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        help_text="已登录用户（未登录为null）"
    )

    @classmethod
    def active_visitor(cls, days=1, condition=None):
        """
        用Q对象支持复杂条件的活跃访客统计

        参数:
            days: 时间范围（天）
            condition: Q对象，定义活跃条件（如Q(duration__gt=60)）
        """
        # 时间范围
        end_time = timezone.now()
        start_time = end_time - timedelta(days=days)

        # 基础查询（时间范围）
        # __gte  __lte：是
        # Django ORM 的 “查询谓词”（可以理解为 “条件运算符”）：
        # __gte：全称 “greater than or equal”，表示 “大于或等于”。
        # __lte：全称 “less than or equal”，表示 “小于或等于”。
        query = cls.objects.filter(
            visit_time__gte=start_time,
            visit_time__lte=end_time
        )

        # 应用Q对象条件（如果有）
        if condition is not None:
            query = query.filter(condition).order_by('-visit_time')

        return query

    class Meta:
        ordering = ['-visit_time']
        indexes = [
            models.Index(fields=['-visit_time']),
            models.Index(fields=['ip_address']),
            models.Index(fields=['url']),
        ]
        verbose_name = "网站访问记录"
        verbose_name_plural = "网站访问记录"

    def __str__(self):
        return f"{self.ip_address} 访问了 {self.url} ({self.visit_time.strftime('%Y-%m-%d %H:%M')})"
