from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.urls import reverse
from django.utils.translation import gettext_lazy as _
from django.contrib.auth.models import AbstractUser
from datetime import date,datetime
# Create your models here.


class User (AbstractUser):
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
        return f'[name={self.username},email={self.email},phone={self.phone}]'

class Uprofile(models.Model):
    """用户档案"""

    # TODO: Define fields here

    class Meta:
        """Meta definition for UProfile."""
        verbose_name = '用户档案'
        verbose_name_plural = '用户档案'

    user=models.OneToOneField(to=User,
                                verbose_name=_("用户档案->用户"),
                                on_delete=models.CASCADE,
                                related_name="user2profile" #反向关联 ,便于主模型访问
                              )
    address=models.CharField(
        verbose_name='地址',
        max_length=100,
        default='000000000000000',
        help_text='地址')
    phone=models.CharField(
        verbose_name='电话',
        max_length=11,
        default='00000000000',
        help_text='电话')
    wechat=models.CharField(
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
                                related_name='user2diary',)
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
def save_user_profile(sender, instance,** kwargs):
    """用户保存时自动保存档案"""
    instance.user2profile.save()
