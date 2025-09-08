# chat/consumers.py
import datetime
import json
import logging
import os

from channels.generic.websocket import AsyncWebsocketConsumer
from django.conf import settings
from django.db.models.sql.query import get_order_dir
from django.shortcuts import get_list_or_404
from twisted.python.log import logerr
from typing_extensions import get_original_bases

from zhuye.models import User
from .models import Room, Chat
from channels.db import sync_to_async
from gerenzhuye.settings import UN_LOGIN_NAME, UN_LOGIN_ID, UN_EMAIL


# 1. 定义一个同步函数，一次性完成查询和数据提取
def get_chat_by_room_name(name):
    # 同步环境中执行所有ORM操作
    room, _ = Room.objects.get_or_create(name=name)
    logging.debug(f"room {room}")
    chats = Chat.objects.filter(room=room)
    # 提取需要的数据（转换为普通Python字典/列表，避免在异步中操作查询集）
    return [
        {
            'username': item.User.username,
            'message': item.message,
            'message_type': item.type,
        }
        for item in chats
    ]


class ChatConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(args, kwargs)
        self.room_group_name = None
        self.room_name = None

    async def connect(self):
        """
        异步函数，
        ws客户端建立连接，触发
        scope：类似 Django 视图中的 request，链接信息
        """
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f'chat_{self.room_name}'
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        # 接受链接
        await self.accept()
        # 当连接建立时，向房间内所有成员发送通知消息
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'handle_message',  # 对应处理消息的方法名
                'message': '加入了房间',
                'username': self.scope['user'].username or 'default',  # 可以标识是系统消息
                'message_type': 'text'
            }
        )
        # 2. 用sync_to_async包装同步函数并调用
        chatDatas = await sync_to_async(get_chat_by_room_name, thread_sensitive=False)(self.room_name)

        # 3. 迭代处理普通Python列表（非查询集）
        for i in chatDatas:
            await self.channel_layer.send(
                self.channel_name,
                {
                    'type': 'handle_message',
                    'message': i['message'],
                    'username': i['username'],
                    'message_type': i['message_type'],
                }
            )

        def update_room_member_count(room_name):
            room = Room.objects.get(name=room_name)
            room.member_count = max(0, room.memberCount + 1)  # 确保不会出现负数
            room.save()  # 同步保存操作
            return room

        # 用sync_to_async包装整个同步逻辑
        await sync_to_async(update_room_member_count, thread_sensitive=False)(self.room_name)

    async def disconnect(self, close_code):
        """
        异步，
        ws断开连接时触发
        close_code:连接关闭的状态码
        当前连接的唯一标识（self.channel_name）从房间组（self.room_group_name）中移除
        """
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        await self.close()
        await self.update_room_member_count()

    async def update_room_member_count(self):
        # 定义同步函数处理所有ORM操作
        def _update_room_member_count(room_name):
            room = Room.objects.get(name=room_name)
            room.member_count = max(0, room.memberCount - 1)  # 确保不会出现负数
            room.save()  # 同步保存操作
            return room

        # 用sync_to_async包装整个同步逻辑
        await sync_to_async(_update_room_member_count, thread_sensitive=False)(self.room_name)

    async def receive(self, text_data=None, bytes_data=None):
        if text_data is not None:
            await self.handle_json_data(text_data)
        elif bytes_data is not None:
            await self.handle_bytes(bytes_data)

    async def handle_bytes(self, bytes_data):
        try:
            timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
            file_name = f"{timestamp}.webm"
            save_path = os.path.join(settings.MEDIA_ROOT, 'voices', file_name)

            # 保存语音并创建记录
            voice_msg = await self.save_voice_message(
                self.room_name,
                bytes_data,
                file_name,
                save_path
            )
            # 广播语音消息（发送语音ID而非原始数据）
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'handle_message',
                    'username': self.scope['user'].username if self.scope['user'].is_authenticated else UN_LOGIN_NAME,
                    'message': voice_msg.message,
                    'message_type': 'voice',
                }
            )

        except Exception as e:
            print(f"处理语音消息错误: {str(e)}")

    async def handle_json_data(self, text_data):
        print(text_data)
        text_data_json = json.loads(text_data)
        message = text_data_json['message']
        # 关键改进：使用服务器端认证的用户名，而非客户端提交的
        if self.scope['user'].is_authenticated:
            username = self.scope['user'].username  # 从认证系统获取
        else:
            username = text_data_json['username']  # 未登录用户的默认名
        # 异步包装数据库操作
        get_or_create_room = sync_to_async(Room.objects.get_or_create, thread_sensitive=True)
        room, _ = await get_or_create_room(name=self.room_name)
        get_or_create_chat = sync_to_async(Chat.objects.create, thread_sensitive=True)
        # 获取或创建用户实例（关键修复）
        if self.scope['user'].is_authenticated:
            # 已登录用户直接使用
            user_ins = self.scope['user']
        else:
            get_or_create_user = sync_to_async(User.objects.get_or_create, thread_sensitive=True)
            user_ins, _ = await get_or_create_user(
                username=username
            )
        await get_or_create_chat(
            User=user_ins,
            message=message,
            room=room,
            type=text_data_json['message_type'],
        )  # create()已隐含save()，无需重复调用
        # 发送消息到房间内所有用户
        await self.send_to_group_excluding_self(
            self.room_group_name,
            {'type': 'handle_message', 'username': username, 'message': message,
             'message_type': text_data_json['message_type']}
        )

    # 异步处理语音存储
    @sync_to_async(thread_sensitive=True)
    def save_voice_message(self, room_name, voice_data, file_name, save_path):
        # 确保目录存在
        os.makedirs(os.path.dirname(save_path), exist_ok=True)

        # 保存语音文件
        with open(save_path, 'wb') as f:
            f.write(voice_data)
        # 创建数据库记录
        room, _ = Room.objects.get_or_create(name=room_name)
        # 假设 UN_LOGIN_ID 是未登录用户的固定 ID（确保这个 ID 不会与现有用户冲突）
        if self.scope['user'].is_authenticated:  # 判断用户是否登录
            # 登录用户：用自身 ID 查询/创建
            user_tuple = User.objects.get_or_create(
                id=self.scope['user'].id,
                defaults={
                    'username': self.scope['user'].username,  # 用登录用户的用户名
                    'email': self.scope['user'].email,  # 用登录用户的邮箱
                    # 不指定 id，使用查询条件中的 self.scope['user'].id
                }
            )
        else:
            # 未登录用户：用固定的 UN_LOGIN_ID 查询/创建
            user_tuple = User.objects.get_or_create(
                id=UN_LOGIN_ID,  # 查询条件与创建的 id 保持一致
                defaults={
                    'username': UN_LOGIN_NAME,
                    'email': UN_EMAIL,
                    # 这里可以省略 id，因为查询条件已经指定了 UN_LOGIN_ID
                }
            )
        # get_or_create返回元组：(实例, 是否新建)，我们只需要实例
        user_ins = user_tuple[0]

        # 创建语音消息记录
        msg = Chat.objects.create(
            User=user_ins,
            room=room,
            message=os.path.join('voices', file_name),
            type='voice'
        )
        return msg

    async def handle_message(self, event):
        # 基础消息数据
        # 检查消息是否是自己发送的：如果 sender_channel 等于当前连接的 channel_name，则不处理
        if event.get('sender_channel') == self.channel_name:
            return  # 自己发送的消息，直接忽略
        message_data = {
            'username': event['username'],
            'message': event['message']
        }

        # 如果是视频消息，添加消息类型字段
        if 'message_type' in event:
            message_data['message_type'] = event['message_type']

        # 发送消息
        await self.send(text_data=json.dumps(message_data))

    async def send_to_group_excluding_self(self, group_name, message_data):
        """向群组发送消息，但排除当前连接自身（兼容 InMemoryChannelLayer）"""
        # 在消息中添加发送者的channel_name标识
        message_with_sender = {
            **message_data,
            'sender_channel': self.channel_name  # 附加发送者标识
        }
        # 直接发送到群组（包括自己），后续在处理时过滤
        await self.channel_layer.group_send(
            group_name,
            {
                'type': 'handle_message',  # 仍然使用handle_message处理
                **message_with_sender
            }
        )
