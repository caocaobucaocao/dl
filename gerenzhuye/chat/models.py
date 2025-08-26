from django.db import models
from zhuye.models import User
from django.utils.translation import gettext_lazy as _

time_format = '%Y-%m-%d %H:%M:%S'


class Room(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=100)
    type = models.CharField(max_length=100)
    memberCount = models.IntegerField(default=0)
    createTime = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f' [{self.id},{self.name}, {self.type}, {self.memberCount}, {self.createTime.strftime(time_format)}]'


class Chat(models.Model):
    id = models.AutoField(primary_key=True)
    User = models.ForeignKey(User, on_delete=models.CASCADE, related_name='user2chat')
    message = models.TextField()
    createdAt = models.DateTimeField(auto_now_add=True)
    Room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='room2chat')

    # 定义消息类型枚举
    class MessageType(models.TextChoices):

        TEXT = 'text', '文本消息'
        VIDEO = 'video', '语音消息'  # 注意：字段名用VIDEO但值是'video'，保持与前端一致

    # 添加消息类型字段，使用枚举限制值
    type = models.CharField(
        max_length=10,
        choices=MessageType.choices,
        default=MessageType.TEXT,  # 默认是文本消息
        verbose_name=_('消息类型')
    )

    def __str__(self):
        return f'[{self.id},{self.User},{self.message},{self.createdAt.strftime(time_format)},{self.Room},{self.type}]'

