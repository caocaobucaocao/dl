// 定义消息数据接口
interface MessageData {
    username: string;
    message: string;
}

// 常用箭头符号的Unicode
const Arrows = {
    right: '→',    // 向右箭头
    left: '←',     // 向左箭头
    up: '↑',       // 向上箭头
    down: '↓',     // 向下箭头
    rightDouble: '⇒', // 双向右箭头
    leftDouble: '⇐',  // 双向左箭头
    upDouble: '⇑',    // 双向上箭头
    downDouble: '⇓'   // 双向下箭头
};
// 获取DOM元素并添加类型断言
const roomNameInput = document.getElementById('roomName') as HTMLInputElement;
const messagesContainer = document.getElementById('messages') as HTMLDivElement;
const usernameInput = document.getElementById('username') as HTMLInputElement;
const textInput = document.getElementById('text') as HTMLInputElement;
const roomNameTitle = document.querySelector('.chat-header') as HTMLInputElement;
// 检查必要元素是否存在
if (!roomNameInput || !messagesContainer || !usernameInput || !textInput ) {
    throw new Error('必要的DOM元素未找到');
}

// 连接WebSocket
const roomName = roomNameInput.value;
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(
    `${wsProtocol}//${window.location.host}/ws/chat/${roomName}/`
);

// 接收消息并显示
ws.onmessage = function (e: MessageEvent) {
    try {
        const data: MessageData = JSON.parse(e.data);
        const currentUser = usernameInput.value;
        const msgClass = data.username === currentUser ? 'user-msg' : 'other-msg';

        if (msgClass === 'user-msg') {
            const formattedMessage = `${data.message}${Arrows.left}`;
            messagesContainer.innerHTML += `
      <div class="msg ${msgClass}">
          <span class="content">${formattedMessage}</span>
          <span class="user">${data.username}</span>
      </div>
      `;
        } else {
            const formattedMessage = `${Arrows.right}${data.message}`;
            messagesContainer.innerHTML += `
      <div class="msg ${msgClass}">
          <span class="user">${data.username}</span>
          <span class="content">${formattedMessage}</span>
      </div>
      `;
        }

        // 滚动到底部
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } catch (error) {
        console.error('解析消息失败:', error);
    }
};

// 发送消息
function sendMsg(): void {
    const text = textInput.value.trim();
    const username = usernameInput.value.trim() || '访客';
    const roomName = roomNameInput.value.trim() || 'default';
    if (text) {
        const messageData: MessageData = {
            username: username,
            message: text,

        };

        ws.send(JSON.stringify(messageData));
        textInput.value = ''; // 清空输入框
        // 清空输入框并重置样式
        textInput.classList.remove('has-content', 'focused'); // 移除样式类
        textInput.focus(); // 自动获取焦点
    }
}

// 支持回车键发送
textInput.addEventListener('keypress', function (e: KeyboardEvent) {
    if (e.key === 'Enter') {
        sendMsg();
    }
});


