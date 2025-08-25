from django.urls import path
from .views import chat_room, ChatRoomView, ChatVoiceView

urlpatterns = [
    path('room/<str:room_name>/', chat_room, name='chat_room'),
    path('room_list/', ChatRoomView.as_view(), name='chat_room_list'),
    path('voice/<str:room_name>/', ChatVoiceView.as_view(), name='chat_voice'),
]
