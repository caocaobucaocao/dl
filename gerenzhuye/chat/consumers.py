# chat/consumers.py
import json

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer


class ChatConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(args, kwargs)
        self.room_group_name = None
        self.room_name = None

    async def connect(self):
        '''
        异步函数，
        ws客户端建立连接，触发
        scope：类似 Django 视图中的 request，链接信息
        '''
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f'chat_{self.room_name}'
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        # 接受链接
        await self.accept()
        # 当连接建立时，向房间内所有成员发送通知消息
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'chat_message',  # 对应处理消息的方法名
                'message': '加入了房间',
                'username': self.scope['user'].username or 'default'  # 可以标识是系统消息
            }
        )
        # 2. 用sync_to_async包装同步函数并调用
        chat_data_list = await sync_to_async(get_room_chat_data, thread_sensitive=False)(self.room_name)

        # 3. 迭代处理普通Python列表（非查询集）
        for chat_data in chat_data_list:
            await self.channel_layer.send(
                self.channel_name,
                {
                    'type': 'chat_message',
                    'message': chat_data['message'],
                    'username': chat_data['username']
                }
            )

    async def disconnect(self, close_code):
        '''
        异步，
        ws断开连接时触发
        close_code:连接关闭的状态码
        当前连接的唯一标识（self.channel_name）从房间组（self.room_group_name）中移除
        '''
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        await self.close()
        await self.room_update()

    async def room_update(self):
        from .models import Room
        from channels.db import sync_to_async
        # 定义同步函数处理所有ORM操作
        def update_room_member_count(room_name):
            room = Room.objects.get(room_name=room_name)
            room.member_count = max(0, room.member_count - 1)  # 确保不会出现负数
            room.save()  # 同步保存操作
            return room

        # 用sync_to_async包装整个同步逻辑
        await sync_to_async(update_room_member_count, thread_sensitive=False)(self.room_name)

    async def receive(self, text_data=None, bytes_data=None):
        if text_data is not None:
            text_data_json = json.loads(text_data)
            message = text_data_json['message']
            username = text_data_json.get('username')
            from .models import Chat, Room
            from zhuye.models import User
            # 异步包装数据库操作
            creat_room = sync_to_async(Room.objects.get_or_create, thread_sensitive=True)
            room, _ = await creat_room(room_name=self.room_name)
            create_chat = sync_to_async(Chat.objects.create, thread_sensitive=True)
            create_user = sync_to_async(User.objects.get, thread_sensitive=True)
            # 直接获取用户ID（关键修改）
            # 1 代表默认用户
            user_id = self.scope['user'].id if self.scope['user'].is_authenticated else 1
            user_ins = await create_user(id=user_id)
            await create_chat(
                chat_from=user_ins,
                chat_content=message,
                room=room
            )  # create()已隐含save()，无需重复调用
            # 发送消息到房间内所有用户
            await self.channel_layer.group_send(
                self.room_group_name,
                {'type': 'chat_message', 'username': username, 'message': message}
            )
        elif bytes_data is not None:
            print('bytes_data')
            try:
                from .models import Chat, Room, VoiceMessage
                from zhuye.models import User
                import os
                from django.conf import settings
                import uuid
                import datetime


                timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
                filename = f"{timestamp}.webm"
                save_path = os.path.join(settings.MEDIA_ROOT, 'voices', filename)

                # 异步处理语音存储
                @sync_to_async(thread_sensitive=True)
                def save_voice_message(room_name, user_id_, voice_data, filename_):
                    # 确保目录存在
                    os.makedirs(os.path.dirname(save_path), exist_ok=True)

                    # 保存语音文件
                    with open(save_path, 'wb') as f:
                        f.write(voice_data)

                    # 创建数据库记录
                    room_, _ = Room.objects.get_or_create(room_name=room_name)
                    user = User.objects.get(id=user_id_)

                    # 创建语音消息记录
                    voice_msg_ = VoiceMessage.objects.create(
                        user=user,
                        room=room_,
                        file_path=os.path.join('voices', filename_),
                    )
                    return voice_msg_

                # 获取用户ID
                user_id = self.scope['user'].id if self.scope['user'].is_authenticated else 1

                # 保存语音并创建记录
                voice_msg = await save_voice_message(
                    self.room_name,
                    user_id,
                    bytes_data,
                    filename
                )
                print('voice_msg',voice_msg.file_path)
                # 广播语音消息（发送语音ID而非原始数据）
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'video_message',
                        'username': self.scope['user'].username if self.scope['user'].is_authenticated else '匿名用户',
                        'message': voice_msg.file_path,  # 传递语音唯一标识
                        'message_type': 'voice',
                    }
                )

            except Exception as e:
                print(f"处理语音消息错误: {str(e)}")

    async def chat_message(self, event):
        await self.send(text_data=json.dumps({
            'username': event['username'],
            'message': event['message'],
        }))

    async def video_message(self, event):
        await self.send(text_data=json.dumps({
            'username': event['username'],
            'message': event['message'],
            'message_type': event['message_type'],
        }))


# 1. 定义一个同步函数，一次性完成查询和数据提取
def get_room_chat_data(room_name):
    from .models import Room, Chat
    # 同步环境中执行所有ORM操作
    room = Room.objects.get(room_name=room_name)
    chats = Chat.objects.filter(room=room)
    # 提取需要的数据（转换为普通Python字典/列表，避免在异步中操作查询集）
    return [
        {
            'message': chat.chat_content,
            'username': chat.chat_from.username
        }
        for chat in chats
    ]
