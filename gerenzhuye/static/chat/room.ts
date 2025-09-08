// ==================================================
// 1. 类型定义模块（所有接口/枚举集中存放，便于引用）
// ==================================================
enum MessageType {
    TEXT = 'text',
    VOICE = 'voice',
    PUB_KEY = 'pubkey',
    ENCRYPT_KEY = 'encrypt_key',
}

// 消息数据接口
interface MessageData {
    username: string;
    message: string;
    message_type: MessageType;
}

// 语音录音状态接口
interface AudioRecordingState {
    isRecording: boolean;
    mediaRecorder: MediaRecorder | null;
    audioChunks: Blob[];
    stream: MediaStream | null;
    otherUsersAesKeys: Record<string, CryptoKey>; // 用户名 -> AES密钥
    otherUsersPublicKeys: Record<string, string>; // 新增：用户名 → 对方RSA公钥（PEM字符串）
}

// DOM元素类型接口
interface ChatElements {
    roomNameInput: HTMLInputElement;
    usernameInput: HTMLInputElement;
    messagesContainer: HTMLDivElement;
    holdRecord: HTMLButtonElement;
    textInput: HTMLInputElement;
    microphone: HTMLLIElement;
}

// 加密上下文接口（存储加密服务和密钥）
interface CryptoContext {
    cryptoService: CryptoService;
    aesKey: CryptoKey;
    publicKeyPem: string;
    encryptedAes: string;
}


// ==================================================
// 2. 全局常量与状态模块（全局共用的常量、状态）
// ==================================================
// 常用箭头符号（Unicode）
const Arrows = {
    right: '→',
    left: '←',
    up: '↑',
    down: '↓',
    rightDouble: '⇒',
    leftDouble: '⇐',
    upDouble: '⇑',
    downDouble: '⇓'
};

// 录音状态初始化
const state: AudioRecordingState = {
    isRecording: false,
    mediaRecorder: null,
    audioChunks: [],
    stream: null,
    otherUsersAesKeys: {}, // 初始化空对象
    otherUsersPublicKeys: {} // 初始化公钥存储
};

// 全局变量声明（后续初始化）
let cryptoContext: { cryptoService: CryptoService; aesKey: CryptoKey; publicKeyPem: string };
let ws: WebSocket;
let username: string; // 用户名（DOM加载后赋值）


// ==================================================
// 3. 加密服务模块（Web Crypto API封装，独立功能）
// ==================================================
/**
 * 基于Web Crypto API的加密服务
 * 适配tsconfig: target=es2021, lib=[es2021, dom]
 */
class CryptoService {
    private rsaKeyPair?: CryptoKeyPair;

    /** 生成RSA密钥对（2048位，RSA-OAEP模式） */
    async generateRSAKeyPair(): Promise<void> {
        this.rsaKeyPair = await crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 2048,
                publicExponent: new Uint8Array([0x01, 0x00, 0x01]), // 65537
                hash: "SHA-256"
            },
            true, // 允许提取密钥
            ["encrypt", "decrypt"]
        );
        // 打印公钥指纹
        const pubFingerprint = await this.getKeyFingerprint(this.rsaKeyPair.publicKey);
        console.log('RSA公钥指纹:', pubFingerprint);
        // 打印私钥指纹（仅调试用，生产环境避免暴露）
        const privFingerprint = await this.getKeyFingerprint(this.rsaKeyPair.privateKey);
        console.log('RSA私钥指纹:', privFingerprint);
    }

    /** 生成AES-256-GCM密钥 */
    async generateAESKey(): Promise<CryptoKey> {

        return crypto.subtle.generateKey(
            {name: "AES-GCM", length: 256},
            true, // 允许提取密钥
            ["encrypt", "decrypt"]
        );

    }

    /** 导出RSA公钥（PEM格式） */
    async exportRSAPublicKey(): Promise<string> {
        if (!this.rsaKeyPair) throw new Error("RSA密钥对未生成");

        const publicKeyRaw = await crypto.subtle.exportKey(
            "spki",
            this.rsaKeyPair.publicKey
        );
        const publicKeyBytes = new Uint8Array(publicKeyRaw);
        const base64 = btoa(String.fromCharCode(...publicKeyBytes));
        const formatted = base64.match(/.{1,64}/g)?.join('\n') || base64;

        return `-----BEGIN PUBLIC KEY-----\n${formatted}\n-----END PUBLIC KEY-----`;
    }

    /** 用RSA公钥加密AES密钥 */
    async encryptAESKeyWithRSA(aesKey: CryptoKey, publicKeyPem: string): Promise<string> {
        const publicKey = await this.importRSAPublicKey(publicKeyPem);
        const aesKeyRaw = await crypto.subtle.exportKey("raw", aesKey);
        const encrypted = await crypto.subtle.encrypt(
            {name: "RSA-OAEP"},
            publicKey,
            aesKeyRaw
        );

        return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
    }

    // 3. 加密服务模块：增强解密方法的日志输出
    async decryptAESKeyWithRSA(encryptedAesKey: string): Promise<CryptoKey> {
        if (!this.rsaKeyPair) throw new Error("RSA密钥对未生成");

        try {
            // 日志1：输出加密后的密钥（前30字符，避免过长）
            console.log('待解密的AES密钥（Base64前30字符）:', encryptedAesKey.slice(0, 30) + '...');

            // 日志2：Base64解码后的字节长度
            const encryptedBytes = new Uint8Array(
                atob(encryptedAesKey).split('').map(c => c.charCodeAt(0))
            );
            console.log('Base64解码后的字节长度:', encryptedBytes.length);
            if (encryptedBytes.length !== 256) { // RSA-2048加密后的数据长度应为256字节
                throw new Error(`解码后字节长度异常（应为256，实际为${encryptedBytes.length}），可能是密钥不匹配或数据损坏`);
            }

            // 日志3：执行RSA解密
            console.log('开始用RSA私钥解密...');
            const aesKeyRaw = await crypto.subtle.decrypt(
                {name: "RSA-OAEP",},
                this.rsaKeyPair.privateKey,
                encryptedBytes
            );

            // 日志4：解密后的AES密钥长度（应为32字节，AES-256）
            console.log('解密后的AES密钥字节长度:', aesKeyRaw.byteLength);
            if (aesKeyRaw.byteLength !== 32) {
                throw new Error(`AES密钥长度异常（应为32，实际为${aesKeyRaw.byteLength}），解密失败`);
            }

            // 导入AES密钥并返回
            return crypto.subtle.importKey(
                "raw",
                aesKeyRaw,
                {name: "AES-GCM"},
                false,
                ["encrypt", "decrypt"]
            );
        } catch (error) {
            console.error('RSA解密AES密钥过程出错:', error);
            throw error; // 向上传递错误，便于外层处理
        }
    }

// 在CryptoService中添加密钥指纹生成方法
    async getKeyFingerprint(key: CryptoKey): Promise<string> {
        const keyRaw = await crypto.subtle.exportKey(
            key.type === 'public' ? 'spki' : 'pkcs8', // 公钥用spki，私钥用pkcs8
            key
        );
        const hash = await crypto.subtle.digest('SHA-256', keyRaw);
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join(':');
    }

    /** 用AES密钥加密数据 */
    async encryptWithAES(aesKey: CryptoKey, data: string): Promise<{ ciphertext: string, iv: string }> {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const iv = crypto.getRandomValues(new Uint8Array(12));

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

    /** 用AES密钥解密数据 */
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

    /** 私有：从PEM格式导入RSA公钥 */
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
}

async function extracted(aesKey: CryptoKey) {
    try {
        // 导出为原始字节数组
        const aesKeyRaw = await crypto.subtle.exportKey("raw", aesKey);
        const keyBytes = new Uint8Array(aesKeyRaw);
        // 转换为Base64格式（便于查看和复制）
        const keyBase64 = btoa(String.fromCharCode(...keyBytes));
        console.log("AES密钥 (Base64):", keyBase64);
        // 转换为十六进制格式（可选，更易读）
        const keyHex = Array.from(keyBytes)
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
        console.log("AES密钥 (Hex):", keyHex);
        console.log("AES密钥长度 (字节):", keyBytes.length); // 应为32字节（AES-256）
    } catch (error) {
        console.error("导出AES密钥失败:", error);
    }
}

/** 初始化加密上下文（生成密钥对+密钥） */
async function initCrypto(): Promise<{ cryptoService: CryptoService; aesKey: CryptoKey; publicKeyPem: string }> {
    try {
        const cryptoService = new CryptoService();

        // 1. 生成RSA密钥对
        await cryptoService.generateRSAKeyPair();
        console.log("RSA密钥对生成完成");

        // 2. 生成AES密钥
        const aesKey = await cryptoService.generateAESKey();
        // 关键：验证密钥是否真的可提取（避免浏览器隐性限制）
        if (!aesKey.extractable) {
            throw new Error("生成的AES密钥不可提取（浏览器强制限制）");
        }
        console.log("AES密钥生成成功（可提取）");
        console.log("AES密钥生成完成");
        // 导出AES密钥（仅用于调试，生产环境删除）
        await extracted(aesKey);
        // 3. 导出RSA公钥
        const publicKeyPem = await cryptoService.exportRSAPublicKey();
        console.log("RSA公钥:\n", publicKeyPem);


        return {cryptoService, aesKey, publicKeyPem};
    } catch (error) {
        console.error("加密流程出错:", error);
        throw error;
    }
}


// ==================================================
// 4. DOM操作模块（获取DOM元素、验证DOM有效性）
// ==================================================
/** 获取并验证DOM元素 */
function getAndValidateDOMElements(): ChatElements {
    // 获取DOM元素（保留原类型断言）
    const elements: ChatElements = {
        roomNameInput: document.getElementById('roomName') as HTMLInputElement,
        usernameInput: document.getElementById('username') as HTMLInputElement,
        messagesContainer: document.getElementById('messages') as HTMLDivElement,
        holdRecord: document.getElementById('holdRecord') as HTMLButtonElement,
        textInput: document.getElementById('text') as HTMLInputElement,
        microphone: document.getElementById('microphone') as HTMLLIElement,
    };

    // 验证所有元素是否存在
    const isAllElementsValid = [
        elements.roomNameInput,
        elements.usernameInput,
        elements.messagesContainer,
        elements.holdRecord,
        elements.textInput
    ].every(el => el !== null);

    if (isAllElementsValid) {
        console.log('元素获取正常');
    } else {
        console.error('关键DOM元素缺失，部分功能可能异常');
    }

    // 赋值用户名（全局使用）
    username = elements.usernameInput.value.trim()
        ? elements.usernameInput.value.trim()
        : `${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`; // 取UUID前8位，避免过长
    console.log('username', username);
    return elements;
}

// 执行DOM获取（全局唯一一次）
const elements = getAndValidateDOMElements();


// ==================================================
// 5. WebSocket模块（连接、事件处理）
// ==================================================
/** 初始化WebSocket（依赖加密上下文） */
function initWebSocket(context: CryptoContext): WebSocket {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const roomName = elements.roomNameInput.value.trim() || "default_room";
    const webSocket = new WebSocket(`${wsProtocol}//${window.location.host}/ws/chat/${roomName}/`);

    // 连接建立：发送密钥消息
    webSocket.onopen = () => {
        console.log('WebSocket 连接已建立');
        const joinMessage: MessageData = {
            username: username,
            message_type: MessageType.PUB_KEY,
            message: context.publicKeyPem,
        };
        webSocket.send(JSON.stringify(joinMessage));
    };

    // 接收消息：处理文本/语音/密钥类型
    webSocket.onmessage = async (event: MessageEvent) => {
        try {
            console.log('收到文本消息:', event.data);
            const data: MessageData = JSON.parse(event.data);

            // 处理语音消息
            if (data.message_type === MessageType.VOICE) {
                console.log('voice');
                const correctVoicePath = data.message.replaceAll('\\', '/');
                const audioUrl = 'http://127.0.0.1:8000/media/' + correctVoicePath;
                console.log('audioUrl:', audioUrl);

                const voiceMessage = createVoiceMessage(audioUrl, data.username);
                elements.messagesContainer.appendChild(voiceMessage);
            }

            // 处理文本消息
            else if (data.message_type === MessageType.TEXT) {
                try {
                    const isCurrentUser = data.username === username;
                    const msgClass = isCurrentUser ? 'user-msg' : 'other-msg';

                    // 创建消息DOM
                    const msgDiv = document.createElement('div');
                    msgDiv.className = `msg ${msgClass}`;

                    const userSpan = document.createElement('span');
                    userSpan.className = 'user';
                    userSpan.textContent = data.username;

                    const contentSpan = document.createElement('span');
                    contentSpan.className = 'content';
                    contentSpan.textContent = isCurrentUser
                        ? `${data.message}${Arrows.left}`
                        : `${Arrows.right}${data.message}`;

                    // 调整元素顺序
                    if (isCurrentUser) {
                        msgDiv.appendChild(contentSpan);
                        msgDiv.appendChild(userSpan);
                    } else {
                        msgDiv.appendChild(userSpan);
                        msgDiv.appendChild(contentSpan);
                    }

                    elements.messagesContainer.appendChild(msgDiv);
                    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
                } catch (error) {
                    console.error('解析消息失败:', error);
                }
            }

            // 处理密钥消息
            else if (data.message_type === MessageType.PUB_KEY) {
                if (data.username in state.otherUsersPublicKeys) {
                    console.log(`已经接收过${data.username}的公钥`)
                    return
                }
                // 检查WebSocket是否处于连接状态
                if (webSocket.readyState !== WebSocket.OPEN) {
                    console.error('WebSocket连接已断开，无法发送公钥');
                    return;
                }
                const replyMessage1: MessageData = {
                    username: username,
                    message_type: MessageType.PUB_KEY,
                    message: context.publicKeyPem, // 己方公钥
                };
                console.log('接收对方发送公钥', data.message);
                state.otherUsersPublicKeys[data.username] = data.message
                console.log('发送己方公钥');
                webSocket.send(JSON.stringify(replyMessage1));
                // 用对方公钥加密自己的AES密钥，回复给对方
                try {
                    if (data.username in state.otherUsersPublicKeys) {
                        console.log('ffffffffffff')
                    } else {
                        console.log('yyyyyyyyyyyyyyyyyyyy')
                    }
                    const encryptedAesForSender = await context.cryptoService.encryptAESKeyWithRSA(
                        context.aesKey, // 自己的AES密钥
                        data.message // 对方的RSA公钥（关键：用对方公钥加密）
                    );
                    const replyMessage: MessageData = {
                        username: username,
                        message_type: MessageType.ENCRYPT_KEY,
                        message: encryptedAesForSender, // 用对方公钥加密后的AES密钥
                    };
                    webSocket.send(JSON.stringify(replyMessage));
                    console.log('发送的加密AES密钥:',
                        encryptedAesForSender.slice(0, 50) + '...' +
                        encryptedAesForSender.slice(-50)
                    );

                    console.log(`已向用户[${data.username}]发送加密后的AES密钥`);
                } catch (e) {
                    console.error(`加密AES密钥发送给${data.username}失败:`, e);
                    // 可选：添加UI错误提示
                    const errorEl = document.createElement('div');
                    errorEl.className = 'error-msg';
                    errorEl.textContent = `与${data.username}密钥交换失败，无法发送加密后的AES密钥`;
                    elements.messagesContainer.appendChild(errorEl);
                }

            } else if (data.message_type === MessageType.ENCRYPT_KEY && data.message) {
                console.log('接收对方用己方公钥加密的aes公钥');
                // 接收端：解密前打印相同格式
                console.log('接收的加密AES密钥:',
                    data.message.slice(0, 50) + '...' +
                    data.message.slice(-50)
                );
                // 检查是否已存储对方AES密钥，避免重复解密
                if (data.username in state.otherUsersAesKeys) {
                    console.log(`已存储${data.username}的AES密钥，无需重复解密`);
                    return;
                }
                try {
                    // 验证Base64格式（关键：避免解码错误）
                    if (!/^[A-Za-z0-9+/=]+$/.test(data.message)) {
                        console.log("加密的AES密钥不是合法Base64字符串");
                        return
                    }

                    // 解密对方发送的AES密钥（用自己的RSA私钥）
                    const senderAesKey = await context.cryptoService.decryptAESKeyWithRSA(data.message);

                    // 验证解密后的密钥有效性（确保是AES-GCM密钥）
                    if (senderAesKey.algorithm.name !== "AES-GCM" || !senderAesKey.usages.includes("decrypt")) {
                        console.log("解密得到的不是有效的AES-GCM密钥");
                        return
                    }

                    // 存储对方的AES密钥（供后续解密对方文本消息）
                    state.otherUsersAesKeys[data.username] = senderAesKey;
                    await extracted(senderAesKey);
                    console.log(`已解密并存储用户[${data.username}]的AES密钥`);
                } catch (decryptError) {
                    console.error(`解密用户[${data.username}]的AES密钥失败:`, decryptError);
                    // 显示用户可理解的错误提示
                    const errorEl = document.createElement('div');
                    errorEl.className = 'error-msg';
                    errorEl.textContent = `与${data.username}的密钥交换失败，无法接收加密消息`;
                    elements.messagesContainer.appendChild(errorEl);
                }
            }
            // 未处理的消息类型
            else {
                console.log('类型无法处理');
            }
        } catch (err) {
            console.error('处理消息失败:', err);
        }

        // 滚动到底部
        elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
    };

    // 连接关闭
    webSocket.onclose = (event) => {
        console.log(`WebSocket 连接已关闭，代码: ${event.code}`);
    };

    // 连接错误
    webSocket.onerror = (error) => {
        console.error('WebSocket 错误:', error);
    };

    return webSocket;
}


// ==================================================
// 6. 录音功能模块（录音控制、语音发送）
// ==================================================
// 初始化音频上下文
new (window.AudioContext || (window as any).webkitAudioContext)();

/** 开始录音 */
async function startRecording(): Promise<boolean> {
    if (state.isRecording) return false;

    try {
        // 申请麦克风权限
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

        // 更新录音状态
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

/** 停止录音 */
async function stopRecording(): Promise<boolean> {
    if (!state.isRecording || !state.mediaRecorder) return false;

    return new Promise(resolve => {
        state.mediaRecorder!.onstop = () => {
            // 释放媒体流
            state.stream?.getTracks().forEach(track => track.stop());

            // 重置状态
            state.isRecording = false;
            state.mediaRecorder = null;
            state.stream = null;
            resolve(true);
        };

        state.mediaRecorder!.stop();
    });
}

/** 统一处理录音停止逻辑 */
async function handleMouseRelease(): Promise<boolean> {
    if (!state.isRecording) return false;

    // 更新麦克风图标
    elements.microphone?.classList.replace('fa-microphone', 'fa-microphone-slash');

    // 停止录音并发送
    const stopped = await stopRecording();
    if (stopped && state.audioChunks.length) {
        await sendVideo();
    } else {
        console.log('无录音数据或停止失败');
    }

    return stopped;
}

/** 发送录音（注：原命名sendVideo未修改，保持逻辑一致） */
async function sendVideo(): Promise<void> {
    if (state.audioChunks.length === 0) {
        alert('请先录制语音后再发送');
        return;
    }

    if (ws.readyState !== WebSocket.OPEN) {
        alert('WebSocket连接未建立，请稍后再试');
        return;
    }

    // 创建音频Blob并发送
    const audioBlob = new Blob(state.audioChunks, {type: 'audio/webm'});
    ws.send(audioBlob);
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;

    // 清空录音数据
    state.audioChunks = [];
}

// 绑定录音相关事件
elements.holdRecord?.addEventListener('mousedown', async (e) => {
    if (e.button !== 0) return; // 仅响应左键

    elements.microphone?.classList.replace('fa-microphone-slash', 'fa-microphone');
    if (!await startRecording()) {
        elements.microphone?.classList.replace('fa-microphone', 'fa-microphone-slash');
        console.log('开始录音失败');
    }
});

elements.holdRecord?.addEventListener('mouseup', handleMouseRelease);


// ==================================================
// 7. 文本消息模块（文本发送、UI创建）
// ==================================================
/** 发送文本消息 */
function sendMsg(): void {
    console.log('sendMsg');
    const text = elements.textInput.value.trim();
    if (!text) return;

    const messageData: MessageData = {
        username: username,
        message: text,
        message_type: MessageType.TEXT,
    };

    ws.send(JSON.stringify(messageData));
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;

    // 清空输入框
    elements.textInput.value = '';
    elements.textInput.classList.remove('has-content', 'focused');
    elements.textInput.focus();
}

// 绑定文本输入事件（回车键发送）
elements.textInput.addEventListener('keypress', function (e: KeyboardEvent) {
    if (e.key === 'Enter') {
        sendMsg();
    }
});

/** 创建语音消息DOM元素 */
function createVoiceMessage(audioUrl: string, senderName: string): HTMLDivElement {
    const messageElement = document.createElement('div');

    // 隐藏的原生音频元素
    const audioElement = document.createElement('audio');
    audioElement.src = audioUrl;
    audioElement.dataset.time = new Date().toLocaleTimeString();
    audioElement.className = 'audio-hidden';

    // 发送者信息
    const senderInfo = document.createElement('div');
    senderInfo.className = 'message-sender';

    // 自定义音频播放器
    const audioContainer = document.createElement('div');
    audioContainer.className = 'custom-audio-player';

    // 播放按钮
    const playButton = document.createElement('button');
    playButton.className = 'audio-play-btn';
    playButton.innerHTML = '<i class="fas fa-play"></i>';

    // 播放/暂停逻辑
    playButton.addEventListener('click', function () {
        if (audioElement.paused) {
            // 暂停其他音频
            document.querySelectorAll('audio').forEach(otherAudio => {
                if (otherAudio !== audioElement && !otherAudio.paused) {
                    otherAudio.pause();
                    const otherButton = otherAudio.parentNode?.querySelector('.audio-play-btn');
                    if (otherButton) otherButton.innerHTML = '<i class="fas fa-play"></i>';
                }
            });

            // 播放当前音频
            audioElement.play()
                .then(() => playButton.innerHTML = '<i class="fas fa-pause"></i>')
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

    // 音频播放结束重置按钮
    audioElement.addEventListener('ended', () => {
        playButton.innerHTML = '<i class="fas fa-play"></i>';
    });

    // 区分当前用户与其他用户的UI布局
    if (senderName === username) {
        console.log('right');
        senderInfo.textContent = `${audioElement.dataset.time} ${senderName}`;
        messageElement.className = 'voice-message right';

        audioContainer.appendChild(playButton);
        messageElement.appendChild(audioContainer);
        messageElement.appendChild(senderInfo);
    } else {
        console.log('left');
        messageElement.className = 'voice-message left';
        senderInfo.textContent = `${senderName} ${audioElement.dataset.time}`;

        audioContainer.appendChild(playButton);
        messageElement.appendChild(senderInfo);
        messageElement.appendChild(audioContainer);
    }

    // 附加隐藏音频元素
    messageElement.appendChild(audioElement);

    return messageElement;
}


// ==================================================
// 8. 应用入口模块（初始化流程控制）
// ==================================================
/** 主初始化流程（加密 → WebSocket → 完成） */
async function bootstrap(): Promise<void> {
    try {
        // 步骤1：初始化加密上下文
        console.log("开始初始化加密上下文...");
        const context = await initCrypto();
        cryptoContext = context;
        console.log("加密上下文初始化完成");

        // 步骤2：初始化WebSocket（依赖加密上下文）
        console.log("开始建立WebSocket连接...");
        ws = initWebSocket(<CryptoContext>context);
        console.log("WebSocket初始化完成");
    } catch (error) {
        console.error("整体初始化失败:", error);
    }
}

// 启动应用（浏览器环境下执行）
if (typeof window !== "undefined") {
    bootstrap().then();
}