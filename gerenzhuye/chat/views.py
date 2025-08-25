from django.shortcuts import render, redirect
from django.urls import reverse
from django.views.generic import ListView
from chat.models import Room, Chat, VoiceMessage


# Create your views here.
def chat_room(request, room_name):
    # 传递房间名到模板，支持多房间聊天
    chatroom, _ = Room.objects.get_or_create(room_name=room_name)
    chatroom.member_count = chatroom.member_count + 1
    chatroom.save()
    return render(request, 'chat/chat_room.html', {'room_name': room_name})


# 聊天组选择视图
class ChatRoomView(ListView):
    model = Room
    template_name = 'chat/group_selector.html'
    context_object_name = 'rooms'
    paginate_by = 3

    def get_queryset(self):
        return Room.objects.all()

    def post(self, request, *args, **kwargs):
        """处理表单提交：获取选中的房间名并跳转"""
        # 从POST数据中获取选中的房间名
        selected_room = request.POST.get('room_name')

        if selected_room:
            # 跳转至对应的聊天房间页面
            return redirect(reverse('chat_room', args=[selected_room]))
        # 如果未选择房间，返回原列表页并提示
        context = self.get_context_data()
        context['error'] = '请选择一个聊天组'
        return self.render_to_response(context)


# views.py 中修改 ChatVoiceView
class ChatVoiceView(ListView):
    model = VoiceMessage
    template_name = 'chat/yuyin.html'
    context_object_name = 'yuyins'
    paginate_by = 3

    def get_queryset(self):
        # 获取URL中的room_name参数
        room_name = self.kwargs.get('room_name')
        # 假设VoiceMessage通过room字段关联到Room模型，且Room有room_name字段
        # 筛选当前房间的语音消息
        room, _ = Room.objects.get_or_create(room_name=room_name)
        voice_msg = VoiceMessage.objects.filter(room=room)
        return voice_msg

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # 将room_name传递到模板，供前端使用
        context['room_name'] = self.kwargs.get('room_name')
        return context
