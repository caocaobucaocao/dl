/**
 * 基于Web Crypto API的加密服务
 * 适配tsconfig: target=es2021, lib=[es2021, dom]
 */
class CryptoService {
    private rsaKeyPair?: CryptoKeyPair;

    /**
     * 生成RSA密钥对（2048位，RSA-OAEP模式）
     * 修复：为公私钥指定更精确的用途
     */
    async generateRSAKeyPair(): Promise<void> {
        this.rsaKeyPair = await crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 2048,
                publicExponent: new Uint8Array([0x01, 0x00, 0x01]), // 65537
                hash: "SHA-256"
            },
            true, // 允许提取密钥
            ["encrypt", "decrypt"]  // 第3个参数：公钥用途和私钥用途的数组
        );
    }

    /**
     * 生成AES-256-GCM密钥
     */
    async generateAESKey(): Promise<CryptoKey> {
        return crypto.subtle.generateKey(
            {
                name: "AES-GCM",
                length: 256
            },
            true, // 允许提取密钥
            ["encrypt", "decrypt"]
        );
    }

    /**
     * 导出RSA公钥（PEM格式）
     */
    async exportRSAPublicKey(): Promise<string> {
        if (!this.rsaKeyPair) {
            throw new Error("RSA密钥对未生成");
        }

        // 导出SPKI格式公钥
        const publicKeyRaw = await crypto.subtle.exportKey(
            "spki",
            this.rsaKeyPair.publicKey
        );

        // 转换为PEM格式（添加适当的换行）
        const publicKeyBytes = new Uint8Array(publicKeyRaw);
        const base64 = btoa(String.fromCharCode(...publicKeyBytes));
        // 每64个字符添加一个换行符，符合PEM格式规范
        const formatted = base64.match(/.{1,64}/g)?.join('\n') || base64;
        return `-----BEGIN PUBLIC KEY-----\n${formatted}\n-----END PUBLIC KEY-----`;
    }

    /**
     * 用RSA公钥加密AES密钥
     * @param aesKey 待加密的AES密钥
     * @param publicKeyPem RSA公钥（PEM格式）
     */
    async encryptAESKeyWithRSA(aesKey: CryptoKey, publicKeyPem: string): Promise<string> {
        // 导入RSA公钥
        const publicKey = await this.importRSAPublicKey(publicKeyPem);

        // 导出AES密钥原始字节
        const aesKeyRaw = await crypto.subtle.exportKey("raw", aesKey);

        // RSA加密AES密钥
        const encrypted = await crypto.subtle.encrypt(
            {name: "RSA-OAEP"},
            publicKey,
            aesKeyRaw
        );

        return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
    }

    /**
     * 用RSA私钥解密AES密钥
     * @param encryptedAesKey 加密后的AES密钥（Base64）
     */
    async decryptAESKeyWithRSA(encryptedAesKey: string): Promise<CryptoKey> {
        if (!this.rsaKeyPair) {
            throw new Error("RSA密钥对未生成");
        }

        // 解码Base64
        const encryptedBytes = new Uint8Array(
            atob(encryptedAesKey).split('').map(c => c.charCodeAt(0))
        );

        // RSA解密
        const aesKeyRaw = await crypto.subtle.decrypt(
            {name: "RSA-OAEP"},
            this.rsaKeyPair.privateKey,
            encryptedBytes
        );

        // 修复：导入AES密钥时允许加密和解密操作
        return crypto.subtle.importKey(
            "raw",
            aesKeyRaw,
            {name: "AES-GCM"},
            false,
            ["encrypt", "decrypt"]
        );
    }

    /**
     * 从PEM格式导入RSA公钥
     */
    private async importRSAPublicKey(pem: string): Promise<CryptoKey> {
        const cleaned = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\n/g, '');
        const binary = atob(cleaned);
        const buffer = new ArrayBuffer(binary.length);
        const view = new Uint8Array(buffer);

        for (let i = 0; i < binary.length; i++) {
            view[i] = binary.charCodeAt(i);
        }

        return crypto.subtle.importKey(
            "spki",
            buffer,
            {name: "RSA-OAEP", hash: "SHA-256"},
            false,
            ["encrypt"]
        );
    }

    /**
     * 辅助方法：使用AES密钥加密数据
     */
    async encryptWithAES(aesKey: CryptoKey, data: string): Promise<{ ciphertext: string, iv: string }> {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const iv = crypto.getRandomValues(new Uint8Array(12)); // AES-GCM推荐12字节IV

        const ciphertext = await crypto.subtle.encrypt(
            {name: "AES-GCM", iv},
            aesKey,
            dataBuffer
        );

        return {
            ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
            iv: btoa(String.fromCharCode(...iv))
        };
    }

    /**
     * 辅助方法：使用AES密钥解密数据
     */
    async decryptWithAES(aesKey: CryptoKey, ciphertext: string, iv: string): Promise<string> {
        const decoder = new TextDecoder();
        const ciphertextBuffer = new Uint8Array(
            atob(ciphertext).split('').map(c => c.charCodeAt(0))
        );
        const ivBuffer = new Uint8Array(
            atob(iv).split('').map(c => c.charCodeAt(0))
        );

        const plaintextBuffer = await crypto.subtle.decrypt(
            {name: "AES-GCM", iv: ivBuffer},
            aesKey,
            ciphertextBuffer
        );

        return decoder.decode(plaintextBuffer);
    }
}

// 假设 CryptoService 已定义且方法返回Promise
async function initCrypto() {
    try {
        const cryptoService = new CryptoService();
        // 1. 生成RSA密钥对（异步操作，需等待完成）
        await cryptoService.generateRSAKeyPair();
        console.log("RSA密钥对生成完成");
        // 2. 生成AES密钥（异步操作）
        const aesKey = await cryptoService.generateAESKey();
        console.log("AES密钥生成完成");
        // 3. 导出RSA公钥（依赖已生成的RSA密钥对，需等待）
        const publicKeyPem = await cryptoService.exportRSAPublicKey();
        console.log("RSA公钥:\n", publicKeyPem);
        // 4. 加密AES密钥（依赖前两步的结果，需等待）
        const encryptedAes = await cryptoService.encryptAESKeyWithRSA(aesKey, publicKeyPem);
        console.log("加密后的AES密钥:", encryptedAes);

        // 返回所有结果供后续使用
        return {
            cryptoService,
            aesKey,
            publicKeyPem,
            encryptedAes
        };
    } catch (error) {
        console.error("加密流程出错:", error);
        throw error; // 向上传递错误，方便外层处理
    }
}

let cryptoContext: { encryptedAes: any; cryptoService?: CryptoService; aesKey?: CryptoKey; publicKeyPem?: string; };
// 在浏览器环境加载完成后执行测试
if (typeof window !== "undefined") {
    cryptoContext =  await initCrypto();
}
enum MessageType {
    TEXT = 'text',
    VOICE = 'voice',
    KEY = 'key'
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
const username = elements.usernameInput.value.trim() || '访客';
// 连接WebSocket
const roomName = elements.roomNameInput.value;
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(
    `${wsProtocol}//${window.location.host}/ws/chat/${roomName}/`
);
// 初始化音频上下文
new (window.AudioContext || (window as any).webkitAudioContext)();

// 开始录音
async function startRecording(): Promise<boolean> {
    // 已在录音状态直接返回
    if (state.isRecording) return false;

    try {
        // 申请麦克风权限并配置音频参数
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            }
        });

        // 初始化录音器
        const mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm; codecs=opus'
        });

        // 重置并更新状态
        state.isRecording = true;
        state.mediaRecorder = mediaRecorder;
        state.audioChunks = [];
        state.stream = stream;

        // 收集录音数据
        mediaRecorder.ondataavailable = (e) => {
            e.data.size && state.audioChunks.push(e.data);
        };

        mediaRecorder.start();
        return true;
    } catch (err) {
        console.error('获取麦克风权限失败:', err);
        state.isRecording = false;
        return false;
    }
}

// 停止录音
async function stopRecording(): Promise<boolean> {
    // 非录音状态直接返回
    if (!state.isRecording || !state.mediaRecorder) return false;

    return new Promise(resolve => {
        // 录音停止后处理
        state.mediaRecorder!.onstop = () => {
            // 释放媒体流
            state.stream?.getTracks().forEach(track => track.stop());

            // 重置状态
            state.isRecording = false;
            state.mediaRecorder = null;
            state.stream = null;
            resolve(true);
        };

        // 执行停止操作
        state.mediaRecorder!.stop();
    });
}

// 鼠标按下 - 开始录音
elements.holdRecord?.addEventListener('mousedown', async (e) => {
    if (e.button !== 0) return; // 只响应左键

    // 更新图标
    elements.microphone?.classList.replace('fa-microphone-slash', 'fa-microphone');

    // 启动录音并处理失败情况
    if (!await startRecording()) {
        elements.microphone?.classList.replace('fa-microphone', 'fa-microphone-slash');
        console.log('开始录音失败');
    }
});

// 处理录音停止统一逻辑
async function handleMouseRelease() {
    if (!state.isRecording) return false;

    // 更新图标
    elements.microphone?.classList.replace('fa-microphone', 'fa-microphone-slash');

    // 停止录音
    const stopped = await stopRecording();
    if (stopped && state.audioChunks.length) {
        await sendVideo(); // 有数据则发送
    } else {
        console.log('无录音数据或停止失败');
    }
    return stopped;
}

// 鼠标松开 - 停止录音
elements.holdRecord?.addEventListener('mouseup', handleMouseRelease);

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

                const isCurrentUser = data.username === username;
                const msgClass = isCurrentUser ? 'user-msg' : 'other-msg';

                // 创建消息容器div
                const msgDiv = document.createElement('div');
                msgDiv.className = `msg ${msgClass}`;

                // 创建用户名span
                const userSpan = document.createElement('span');
                userSpan.className = 'user';
                userSpan.textContent = data.username;

                // 创建内容span
                const contentSpan = document.createElement('span');
                contentSpan.className = 'content';
                // 根据是否为当前用户设置不同的箭头方向
                contentSpan.textContent = isCurrentUser
                    ? `${data.message}${Arrows.left}`
                    : `${Arrows.right}${data.message}`;

                // 根据用户类型调整元素顺序
                if (isCurrentUser) {
                    msgDiv.appendChild(contentSpan);
                    msgDiv.appendChild(userSpan);
                } else {
                    msgDiv.appendChild(userSpan);
                    msgDiv.appendChild(contentSpan);
                }
                // 用appendChild添加新消息（不会影响已有元素）
                elements.messagesContainer.appendChild(msgDiv);
                // 滚动到底部
                elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;

            } catch (error) {
                console.error('解析消息失败:', error);
            }
        } else if (data.message_type === MessageType.KEY) {
            console.log('key', data);
        } else {
            console.log('类型无法处理')
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
// 添加点击事件处理 - 控制音频播放/暂停
    playButton.addEventListener('click', function () {
        if (audioElement.paused) {
            // 暂停其他可能正在播放的音频
            document.querySelectorAll('audio').forEach(otherAudio => {
                if (otherAudio !== audioElement && !otherAudio.paused) {
                    otherAudio.pause();
                    // 更新其他音频的播放按钮状态
                    const otherButton = otherAudio.parentNode?.querySelector('.audio-play-btn');
                    if (otherButton) {
                        otherButton.innerHTML = '<i class="fas fa-play"></i>';

                    }
                }
            });

            // 播放当前音频
            audioElement.play()
                .then(() => {
                    playButton.innerHTML = '<i class="fas fa-pause"></i>';
                })
                .catch(error => {
                    console.error('播放失败:', error);
                    alert('无法播放音频，请检查权限或文件是否存在');
                });
        } else {
            // 暂停当前音频
            audioElement.pause();
            playButton.innerHTML = '<i class="fas fa-play"></i>';
        }
    });
    // 音频播放结束时恢复按钮状态
    audioElement.addEventListener('ended', function () {
        playButton.innerHTML = '<i class="fas fa-play"></i>';
    });
    if (senderName === elements.usernameInput.value.trim()) {
        console.log('right')
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
        console.log('left')
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
ws.onopen = async () => {
    console.log('WebSocket 连接已建立');
    // 示例：连接成功后发送初始消息（如用户加入通知）
    const joinMessage: MessageData = {
        username: username,
        message_type: MessageType.KEY,
        message: cryptoContext.encryptedAes, // 假设当前用户信息已定义
    };
    ws.send(JSON.stringify(joinMessage));
};

ws.onclose = (event) => {
    console.log(`WebSocket 连接已关闭，代码: ${event.code}`);
    // 可以添加重连逻辑
};

ws.onerror = (error) => {
    console.error('WebSocket 错误:', error);
};

export { };

