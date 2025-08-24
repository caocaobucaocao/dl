from django.urls import path
from .views import chat_room, ChatRoomView

urlpatterns = [
    path('room/<str:room_name>/', chat_room, name='chat_room'),
    path('chat/room_list/', ChatRoomView.as_view(), name='chat_room_list'),

]
