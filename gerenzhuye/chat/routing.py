from django.urls import re_path
from . import consumers

# WebSocket 路由：匹配 /ws/chat/房间名/
websocket_urlpatterns = [
    re_path(r'ws/chat/(?P<room_name>\w+)/$', consumers.ChatConsumer.as_asgi()),
]
