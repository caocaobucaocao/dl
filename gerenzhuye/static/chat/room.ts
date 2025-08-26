enum MessageType {
    TEXT = 'text',
    VOICE = 'voice'
}

// 定义消息数据接口
interface MessageData {
    username: string;
    message: string;
    message_type: MessageType
}

// 语音聊天相关类型定义
interface AudioRecordingState {
    isRecording: boolean;
    mediaRecorder: MediaRecorder | null;
    audioChunks: Blob[];
    stream: MediaStream | null;
}

// 初始化应用状态
const state: AudioRecordingState = {
    isRecording: false,
    mediaRecorder: null,
    audioChunks: [],
    stream: null
};
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

// DOM 元素类型定义
interface ChatElements {
    roomNameInput: HTMLInputElement;
    usernameInput: HTMLInputElement;
    messagesContainer: HTMLDivElement;
    startRecord: HTMLButtonElement;
    stopRecord: HTMLButtonElement;
    playRecord: HTMLButtonElement;
    textInput: HTMLInputElement;
}

// 获取 DOM 元素并进行类型断言
const elements: ChatElements = {
    roomNameInput: document.getElementById('roomName') as HTMLInputElement,
    usernameInput: document.getElementById('username') as HTMLInputElement,
    messagesContainer: document.getElementById('messages') as HTMLDivElement,
    startRecord: document.getElementById('startRecord') as HTMLButtonElement,
    stopRecord: document.getElementById('stopRecord') as HTMLButtonElement,
    playRecord: document.getElementById('playRecord') as HTMLButtonElement,
    textInput: document.getElementById('text') as HTMLInputElement,

};
if (elements.roomNameInput && elements.usernameInput && elements.messagesContainer && elements.startRecord && elements.stopRecord && elements.playRecord && elements.textInput) {
    console.log('fffffffffffffff')
}
// 连接WebSocket
const roomName = elements.roomNameInput.value;
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(
    `${wsProtocol}//${window.location.host}/ws/chat/${roomName}/`
);
// 初始化音频上下文
new (window.AudioContext || (window as any).webkitAudioContext)();

// 开始录音 - 去掉分片逻辑
elements.startRecord.addEventListener('click', async () => {
    try {
        // 申请麦克风权限
        const stream: MediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true
            }
        });

        // 初始化 MediaRecorder (不设置时间分片)
        const mediaRecorder: MediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm; codecs=opus'
        });

        // 更新状态
        state.isRecording = true;
        state.mediaRecorder = mediaRecorder;
        state.audioChunks = [];
        state.stream = stream;

        // 监听录音数据（仅在停止时获取完整数据）
        mediaRecorder.ondataavailable = (e: BlobEvent) => {
            if (e.data.size > 0) {
                state.audioChunks.push(e.data);
            }
        };

        // 开始录音（不设置时间参数，不会自动分片）
        mediaRecorder.start();

        // 更新UI状态
        elements.startRecord.disabled = true;
        elements.stopRecord.disabled = false;
        elements.playRecord.disabled = true;
    } catch (err) {
        console.error('获取麦克风权限失败:', err);
        alert('无法访问麦克风，请确保已授予权限');
    }
});

// 停止录音
elements.stopRecord.addEventListener('click', () => {
    if (state.mediaRecorder && state.isRecording) {
        // 停止录音
        state.mediaRecorder.stop();
        state.isRecording = false;

        // 停止媒体流
        if (state.stream) {
            state.stream.getTracks().forEach(track => track.stop());
            state.stream = null;
        }

        // 更新UI状态
        elements.startRecord.disabled = false;
        elements.stopRecord.disabled = true;
        elements.playRecord.disabled = false;
    }
});

// 播放本地录音
elements.playRecord.addEventListener('click', async () => {
    if (state.audioChunks.length === 0) return;
    try {
        // 创建完整音频 Blob
        const audioBlob: Blob = new Blob(state.audioChunks, {type: 'audio/webm'});
        const audioUrl: string = URL.createObjectURL(audioBlob);

        // 播放音频
        const audio: HTMLAudioElement = new Audio(audioUrl);
        await audio.play();

        // 释放URL对象
        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
        };
    } catch (err) {
        console.error('播放录音失败:', err);
    }
});

ws.onmessage = async (event: MessageEvent) => {

    try {
        console.log('收到文本消息:', event.data);
        const data: MessageData = JSON.parse(event.data);
        if (data.message_type === MessageType.VOICE) {
            console.log('voice');
            const correctVoicePath = data.message.replaceAll('\\', '/');
            const audioUrl = 'http://127.0.0.1:8000/media/' + correctVoicePath
            console.log('audioUrl:', audioUrl)
            // 创建消息元素
            const messageElement = document.createElement('div');
            messageElement.className = 'voice-message';
            // 添加音频播放器
            const audioElement = document.createElement('audio');
            audioElement.controls = true;
            audioElement.src = audioUrl;
            audioElement.dataset.time = new Date().toLocaleTimeString();

            // 添加发送者信息
            const senderInfo = document.createElement('div');
            senderInfo.className = 'message-sender';
            senderInfo.textContent = `他人 ${audioElement.dataset.time}`;
            // 组装消息元素
            messageElement.appendChild(senderInfo);
            messageElement.appendChild(audioElement);
            elements.messagesContainer.appendChild(messageElement);
        } else if (data.message_type === MessageType.TEXT) {
            try {
                const currentUser = elements.usernameInput.value;
                const msgClass = data.username === currentUser ? 'user-msg' : 'other-msg';

                if (msgClass === 'user-msg') {
                    const formattedMessage = `${data.message}${Arrows.left}`;
                    elements.messagesContainer.innerHTML += `
                          <div class="msg ${msgClass}">
                              <span class="content">${formattedMessage}</span>
                              <span class="user">${data.username}</span>
                          </div>
                          `;
                } else {
                    const formattedMessage = `${Arrows.right}${data.message}`;
                    elements.messagesContainer.innerHTML += `
                          <div class="msg ${msgClass}">
                              <span class="user">${data.username}</span>
                              <span class="content">${formattedMessage}</span>
                          </div>
                          `;
                }
                // 滚动到底部

            } catch (error) {
                console.error('解析消息失败:', error);
            }
        } else {
            console.log('errr')
        }
    } catch (err) {
        console.error('处理消息失败:', err);
    }
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
};

// 发送消息
function sendMsg(): void {
    console.log('sendMsg');
    const text = elements.textInput.value.trim();
    const username = elements.usernameInput.value.trim() || '访客';
    if (text) {
        const messageData: MessageData = {
            username: username,
            message: text,
            message_type: MessageType.TEXT,
        };
        ws.send(JSON.stringify(messageData));
        elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
        elements.textInput.value = ''; // 清空输入框
        // 清空输入框并重置样式
        elements.textInput.classList.remove('has-content', 'focused'); // 移除样式类
        elements.textInput.focus(); // 自动获取焦点
    }

}

// 支持回车键发送
elements.textInput.addEventListener('keypress', function (e: KeyboardEvent) {
    if (e.key === 'Enter') {
        sendMsg();
    }
});

// 发送完整录音（点击发送按钮时调用）
function sendVideo() {
    if (state.audioChunks.length === 0) {
        alert('请先录制语音后再发送');
        return;
    }

    if (ws.readyState !== WebSocket.OPEN) {
        alert('WebSocket连接未建立，请稍后再试');
        return;
    }

    // 创建完整音频Blob并发送
    const audioBlob: Blob = new Blob(state.audioChunks, {type: 'audio/webm'});
    ws.send(audioBlob);
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
    // 清空录音数据，准备下次录制
    state.audioChunks = [];
    elements.playRecord.disabled = true;
}

// WebSocket 连接事件
ws.onopen = () => {
    console.log('WebSocket 连接已建立');
};

ws.onclose = (event) => {
    console.log(`WebSocket 连接已关闭，代码: ${event.code}`);
    // 可以添加重连逻辑
};

ws.onerror = (error) => {
    console.error('WebSocket 错误:', error);
};
