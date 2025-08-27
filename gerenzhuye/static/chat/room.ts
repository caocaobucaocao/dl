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
    stream: null,

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
    holdRecord: HTMLButtonElement;
    textInput: HTMLInputElement;
    microphone: HTMLLIElement;
}

// 获取 DOM 元素并进行类型断言
const elements: ChatElements = {
    roomNameInput: document.getElementById('roomName') as HTMLInputElement,
    usernameInput: document.getElementById('username') as HTMLInputElement,
    messagesContainer: document.getElementById('messages') as HTMLDivElement,
    holdRecord: document.getElementById('holdRecord') as HTMLButtonElement,
    textInput: document.getElementById('text') as HTMLInputElement,
    microphone: document.getElementById('microphone') as HTMLLIElement,
};
if (elements.roomNameInput && elements.usernameInput && elements.messagesContainer && elements.holdRecord && elements.textInput) {
    console.log('元素获取正常')
}
// 连接WebSocket
const roomName = elements.roomNameInput.value;
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(
    `${wsProtocol}//${window.location.host}/ws/chat/${roomName}/`
);
// 初始化音频上下文
new (window.AudioContext || (window as any).webkitAudioContext)();

async function startRecording(): Promise<boolean> {
    // 如果正在录音，直接返回已完成的Promise
    if (state.isRecording) {
        return Promise.resolve(false);
    }

    // 返回新的Promise封装异步操作
    return new Promise((resolve, reject) => {
        // 申请麦克风权限（异步操作）
        navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            }
        })
            .then((stream: MediaStream) => {
                // 初始化 MediaRecorder
                const mediaRecorder: MediaRecorder = new MediaRecorder(stream, {
                    mimeType: 'audio/webm; codecs=opus'
                });

                // 更新状态
                state.isRecording = true;
                state.mediaRecorder = mediaRecorder;
                state.audioChunks = [];
                state.stream = stream;

                // 监听录音数据（收集录音片段）
                mediaRecorder.ondataavailable = (e: BlobEvent) => {
                    if (e.data.size > 0) {
                        state.audioChunks.push(e.data);
                    }
                };

                // 开始录音
                mediaRecorder.start();
                // 成功启动录音，解析Promise为true
                resolve(true);
            })
            .catch((err) => {
                console.error('获取麦克风权限失败:', err);
                // 失败时重置状态
                state.isRecording = false;
                // 捕获错误，解析Promise为false（或使用reject，但这里更适合返回布尔值）
                resolve(false);
                // 如果希望外部用try/catch捕获错误，可以使用：
                // reject(err);
            });
    });
}

// 停止录音（重构为返回Promise，确保数据处理完成）
async function stopRecording(): Promise<boolean> {
    if (!state.isRecording || !state.mediaRecorder) {
        return false;
    }

    // 返回Promise，等待MediaRecorder真正停止并处理完数据
    return new Promise((resolve) => {
        // 监听录音器停止事件（确保数据收集完成）
        state.mediaRecorder!.onstop = () => {
            // 停止媒体流（释放麦克风）
            if (state.stream) {
                state.stream.getTracks().forEach(track => track.stop());
                state.stream = null;
            }
            // 更新状态
            state.isRecording = false;
            state.mediaRecorder = null;
            // 通知等待的语句，继续执行
            resolve(true); // 停止成功
        };
        // 执行停止录音（触发onstop事件）
        state.mediaRecorder!.stop();
    });
}

// 鼠标按下：开始录音（修复异步处理）
elements.holdRecord?.addEventListener('mousedown', async (e) => {
    // 只响应左键点击
    if (e.button !== 0) return;

    // 切换图标（添加可选链防止null错误）
    elements.microphone?.classList.remove('fa-microphone-slash');
    elements.microphone?.classList.add('fa-microphone');

    // 关键修复：用await获取startRecording的结果（异步函数必须等待）
    const isStarted = await startRecording();
    if (!isStarted) {
        // 录音启动失败时重置图标
        elements.microphone?.classList.remove('fa-microphone');
        elements.microphone?.classList.add('fa-microphone-slash');
        console.log('开始录音失败');
    }
});

// 处理鼠标松开统一逻辑
async function handleMouseRelease() {
    if (state.isRecording) {
        // 切换图标（添加可选链）
        elements.microphone?.classList.remove('fa-microphone');
        elements.microphone?.classList.add('fa-microphone-slash');

        // 等待录音真正停止（依赖重构后的stopRecording返回Promise）
        return await stopRecording();
    }
    return false;
}

// 鼠标松开：停止录音并发送
elements.holdRecord?.addEventListener('mouseup', async () => {
    const isRecordingStopped = await handleMouseRelease();
    if (isRecordingStopped) {
        // 确认录音已停止且有数据，再发送
        if (state.audioChunks.length > 0) {
            await sendVideo();
        } else {
            console.log('无录音数据，不发送');
        }
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
            const voiceMessage: HTMLDivElement = createVoiceMessage(audioUrl, data.username);
            elements.messagesContainer.appendChild(voiceMessage);
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
async function sendVideo() {
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
}

/**
 * 创建语音消息元素
 * @param audioUrl 音频文件URL
 * @param senderName 发送者名称
 * @returns 组装好的语音消息DOM元素
 */
function createVoiceMessage(audioUrl: string, senderName: string): HTMLDivElement {
    const messageElement: HTMLDivElement = document.createElement('div');
    // 创建隐藏的原生音频元素（用于实际播放控制）
    const audioElement: HTMLAudioElement = document.createElement('audio');
    audioElement.src = audioUrl;
    audioElement.dataset.time = new Date().toLocaleTimeString();
    audioElement.className = 'audio-hidden';
    // 创建发送者信息
    const senderInfo: HTMLDivElement = document.createElement('div');
    senderInfo.className = 'message-sender';


    // 创建自定义音频播放器容器
    const audioContainer: HTMLDivElement = document.createElement('div');
    audioContainer.className = 'custom-audio-player';
    const playButton: HTMLButtonElement = document.createElement('button');
    playButton.className = 'audio-play-btn';
    // 创建播放/暂停按钮
    playButton.innerHTML = '<i class="fas fa-play"></i>'; // 使用FontAwesome图标
    // 播放/暂停功能
    playButton.addEventListener('click', function () {
        if (audioElement.paused) {
            audioElement.play().catch(error => {
                console.error('播放失败:', error);
            });
            playButton.innerHTML = '<i class="fas fa-pause"></i>';
        } else {
            audioElement.pause();
            playButton.innerHTML = '<i class="fas fa-play"></i>';
        }
    });
    // 音频播放结束时恢复按钮状态
    audioElement.addEventListener('ended', function () {
        playButton.innerHTML = '<i class="fas fa-play"></i>';
    });
    if (senderName === elements.usernameInput.value.trim()) {
        senderInfo.textContent = `${audioElement.dataset.time} ${senderName}`;
        messageElement.className = 'voice-message right';

        // 音频播放结束时恢复按钮状态
        audioElement.addEventListener('ended', function () {
            playButton.innerHTML = '<i class="fas fa-play"></i>';
        });
        // 组装自定义播放器
        audioContainer.appendChild(playButton);
        // 组装消息元素
        messageElement.appendChild(audioContainer);
        messageElement.appendChild(senderInfo);
    } else {
        messageElement.className = 'voice-message left';
        // 创建播放/暂停按钮
        senderInfo.textContent = `${senderName} ${audioElement.dataset.time}`;
        playButton.className = 'audio-play-btn';
        // 组装自定义播放器
        audioContainer.appendChild(playButton);
        // 组装消息元素
        messageElement.appendChild(senderInfo);
        messageElement.appendChild(audioContainer);
    }

    messageElement.appendChild(audioElement); // 附加隐藏的音频元素

    return messageElement;
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
