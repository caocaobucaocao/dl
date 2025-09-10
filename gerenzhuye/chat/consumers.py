# chat/consumers.py
import datetime
import enum
import json
import logging
import os
from channels.generic.websocket import AsyncWebsocketConsumer
from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from .models import Room, Chat
from channels.db import sync_to_async
from enum import Enum


class MessageType(Enum):
    TEXT = 'text'
    VOICE = 'voice'
    PUB_KEY = 'pubkey'
    ENCRYPT_KEY = 'encrypt_key'
    CLOSE = 'close'


# 1. 定义一个同步函数，一次性完成查询和数据提取
def get_chat_by_room_name(name):
    # 同步环境中执行所有ORM操作
    room, _ = Room.objects.get_or_create(name=name)
    chats = Chat.objects.filter(room=room)
    # 提取需要的数据（转换为普通Python字典/列表，避免在异步中操作查询集）
    return [
        {
            'username': item.User.username,
            'message': item.message,
            'message_type': item.message_type,
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
        # 验证用户是否登录
        if isinstance(self.scope["user"], AnonymousUser):
            # 关键：先接受连接（完成握手）
            await self.accept()
            # 可选：发送错误消息（如需要详细说明）
            await self.send(text_data=json.dumps({
                "status": "error",
                "message": "未登录"
            }))
            # 再发送 4001 关闭码
            await self.close(code=4001)
            return
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f'chat_{self.room_name}'
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'handle_message',  # 对应处理消息的方法名
                'message': '加入了房间',
                'username': self.scope['user'].username,  # 可以标识是系统消息
                'message_type': MessageType.TEXT.value,
            }
        )
        chat_datas = await sync_to_async(get_chat_by_room_name, thread_sensitive=False)(self.room_name)

        for i in chat_datas:
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
        # 合并查询条件，一次删除两种消息类型的数据
        delete_func = sync_to_async(
            lambda: Chat.objects.filter(
                User=self.scope['user'],
                message_type__in=[MessageType.PUB_KEY, MessageType.ENCRYPT_KEY]
            ).delete()
        )
        await delete_func()

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
                    'username': self.scope['user'].username,
                    'message': voice_msg.message,
                    'message_type': MessageType.VOICE.value,
                }
            )

        except Exception as e:
            print(f"处理语音消息错误: {str(e)}")

    async def handle_json_data(self, text_data):
        text_data_json = json.loads(text_data)
        message = text_data_json['message']
        # 异步包装数据库操作
        get_or_create_room = sync_to_async(Room.objects.get_or_create, thread_sensitive=True)
        room, _ = await get_or_create_room(name=self.room_name)
        get_or_create_chat = sync_to_async(Chat.objects.create, thread_sensitive=True)
        if text_data_json.get('message_type') == MessageType.PUB_KEY.value or text_data_json.get(
                'message_type') == MessageType.ENCRYPT_KEY.value:
            logging.debug(msg='密钥信息，不存储，')
        else:
            await get_or_create_chat(
                User=self.scope['user'],
                message=message,
                room=room,
                message_type=text_data_json['message_type'],
            )
        await self.send_to_group_excluding_self(
            self.room_group_name,
            {'type': 'handle_message', 'username': self.scope['user'].username, 'message': message,
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
        room, _ = Room.objects.get_or_create(name=room_name)
        msg = Chat.objects.create(
            User=self.scope['user'],
            room=room,
            message=os.path.join('voices', file_name),
            message_type='voice'
        )
        return msg

    async def handle_message(self, event):
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
