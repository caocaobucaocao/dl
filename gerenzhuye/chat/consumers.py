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
                'username': self.scope['user'].username  # 可以标识是系统消息
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

    async def receive(self, text_data=None, bytes_data=None):
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
