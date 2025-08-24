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

    async def disconnect(self, close_code):
        '''
        异步，
        ws断开连接时触发
        close_code:连接关闭的状态码
        当前连接的唯一标识（self.channel_name）从房间组（self.room_group_name）中移除
        '''
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        text_data_json = json.loads(text_data)
        message = text_data_json['message']
        username = text_data_json.get('username')

        from .models import Chat, Room
        from  zhuye.models import User
        # 异步包装数据库操作
        get_room = sync_to_async(Room.objects.get_or_create, thread_sensitive=True)
        room, _ = await get_room(room_name=self.room_name)
        create_chat = sync_to_async(Chat.objects.create, thread_sensitive=True)
        create_user=sync_to_async(User.objects.get, thread_sensitive=True)
        # 直接获取用户ID（关键修改）
        user_id = self.scope['user'].id if self.scope['user'].is_authenticated else 1
        user_ins= await create_user(id=user_id)
        await create_chat(
            chat_from=user_ins,
            chat_content=message,
            room_id=room
        )  # create()已隐含save()，无需重复调用
        # 发送消息到房间内所有用户
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'chat_message', 'username': username, 'message': message}
        )

    async def chat_message(self, event):
        await self.send(text_data=json.dumps({
            'username': event['username'],
            'message': event['message']
        }))
