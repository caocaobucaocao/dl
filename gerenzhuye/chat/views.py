from django.shortcuts import render

# Create your views here.
def chat_room(request, room_name):
    # 传递房间名到模板，支持多房间聊天
    return render(request, 'chat/chat_room.html', {'room_name': room_name})
