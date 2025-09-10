from django.test import TestCase

# Create your tests here.
import asyncio
import websockets
import json

async def websocket_debug_client():
    # 连接到目标 WebSocket 服务器
    uri = "ws://localhost:8000/ws/chat/room1/"
    async with websockets.connect(uri) as websocket:
        print(f"已连接到 {uri}")

        # 发送测试消息（根据服务器协议构造数据）
        test_message = {
            "username": "debug_user",
            "message": "这是一条调试消息",
            "message_type": "text"
        }
        await websocket.send(json.dumps(test_message))
        print(f"发送消息: {test_message}")

        # 循环接收服务器消息
        while True:
            response = await websocket.recv()
            print(f"收到消息: {response}")

if __name__ == "__main__":
    try:
        asyncio.run(websocket_debug_client())
    except Exception as e:
        print(f"连接错误: {e}")