from django.db import models
from zhuye.models import User

time_format = '%Y-%m-%d %H:%M:%S'

class Room(models.Model):
    room_id = models.AutoField(primary_key=True)
    room_name = models.CharField(max_length=100)
    room_type = models.CharField(max_length=100)
    member_count = models.IntegerField(default=0)
    create_time = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f' [{self.room_id},{self.room_name}, {self.room_type}, {self.member_count}, {self.create_time.strftime(time_format)}]'


class Chat(models.Model):
    chat_id = models.AutoField(primary_key=True)
    chat_from = models.ForeignKey(User, on_delete=models.CASCADE, related_name='user2chat')
    chat_content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='room2chat')

    def __str__(self):
        return f'[{self.chat_id},{self.chat_from},{self.chat_content},{self.created_at.strftime(time_format)},{self.room_id}]'
