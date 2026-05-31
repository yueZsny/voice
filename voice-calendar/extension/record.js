/**
 * 录音弹窗 — 直连 WebSocket，速度最快
 *
 * 流程：
 *  ① Service Worker 打开此弹窗
 *  ② getUserMedia → 权限弹窗 → 用户允许
 *  ③ 录音开始，直连 ws://localhost:3001/ws
 *  ④ 用户点停止 → WAV 编码 → 直接通过 WebSocket 发送（不中继！）
 *  ⑤ 后端 ASR+LLM 结果返回给此窗口
 *  ⑥ 结果通过 chrome.runtime 转发给侧边栏 → 弹窗自动关闭
 */

let mediaRecorder = null;
let audioChunks = [];
let stream = null;
let ws = null;
let timerInterval = null;
let startTime = 0;

const timerEl = document.getElementById('timer');
const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error');
const stopBtn = document.getElementById('stopBtn');

function setStatus(text) { statusEl.textContent = text; }
function setError(text) { errorEl.textContent = text; }
function updateTimer() {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  timerEl.textContent = `${m}:${s}`;
}

function stopCapture() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    mediaRecorder = null;
  }
}

stopBtn.addEventListener('click', () => {
  stopBtn.disabled = true;
  stopBtn.textContent = '⏳ 处理中…';
  stopCapture();
});

async function startCapture() {
  setStatus('正在请求麦克风…');

  // ── ① 获取麦克风权限 ──
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
  } catch (err) {
    setError(`麦克风权限被拒绝。请在浏览器设置中允许语音日历访问麦克风。`);
    chrome.runtime.sendMessage({ type: 'audioError', error: '麦克风权限被拒绝' });
    setTimeout(() => window.close(), 4000);
    return;
  }

  setStatus('正在连接服务…');
  startTime = Date.now();
  timerInterval = setInterval(updateTimer, 200);
  updateTimer();

  // ── ② 直连 WebSocket（音频直接发送，不中继）──
  await connectWS();

  // ── ③ 开始录音 ──
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus' : 'audio/webm';

  mediaRecorder = new MediaRecorder(stream, { mimeType });
  audioChunks = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    clearInterval(timerInterval);
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
    setStatus('正在处理…');
    stopBtn.textContent = '⏳ 处理中…';

    if (audioChunks.length === 0) {
      chrome.runtime.sendMessage({ type: 'audioError', error: '未采集到音频' });
      setTimeout(() => window.close(), 2000);
      return;
    }

    const blob = new Blob(audioChunks, { type: mimeType });
    audioChunks = [];

    // ── ④ 编码 WAV 并直接通过 WebSocket 发送 ──
    try {
      const wav = await decodeToWav(blob);
      sendAudioViaWS(wav);
    } catch (err) {
      console.warn('WAV 解码失败，发送原始 WebM');
      const buf = await blob.arrayBuffer();
      sendAudioViaWS(buf, 'webm');
    }
  };

  mediaRecorder.start();
  setStatus('🔴 录音中…');
}

/** 连接 WebSocket */
function connectWS() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket('ws://localhost:3001/ws');
    ws.onopen = () => {
      console.log('[Record] WS 已连接');
      resolve();
    };
    ws.onerror = () => reject(new Error('WS 连接失败'));
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        // ── ⑤ 转发后端结果到侧边栏 ──
        if (msg.type === 'asr-result') {
          chrome.runtime.sendMessage({ type: 'asr-result', text: msg.text });
        } else if (msg.type === 'llm-result') {
          chrome.runtime.sendMessage({ type: 'llm-result', event: msg.event });
        } else if (msg.type === 'event-created') {
          chrome.runtime.sendMessage({ type: 'event-created', event: msg.event, text: msg.text });
        } else if (msg.type === 'event-deleted') {
          chrome.runtime.sendMessage({ type: 'event-deleted', text: msg.text, count: msg.count });
        } else if (msg.type === 'event-updated') {
          chrome.runtime.sendMessage({ type: 'event-updated', event: msg.event, text: msg.text });
        } else if (msg.type === 'events-list') {
          chrome.runtime.sendMessage({ type: 'events-list', events: msg.events });
        } else if (msg.type === 'error') {
          chrome.runtime.sendMessage({ type: 'audioError', error: msg.message });
        }
      } catch {}
    };
    ws.onclose = () => { ws = null; };
  });
}

/** 通过 WebSocket 发送音频 */
function sendAudioViaWS(buffer, format = 'wav') {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    chrome.runtime.sendMessage({ type: 'audioError', error: '服务连接已断开' });
    setTimeout(() => window.close(), 2000);
    return;
  }

  const bytes = new Uint8Array(buffer);
  // 分块发送给 WebSocket
  const CHUNK = 8192;
  for (let off = 0; off < bytes.length; off += CHUNK) {
    const chunk = bytes.slice(off, Math.min(off + CHUNK, bytes.length));
    ws.send(JSON.stringify({
      type: 'audio-data',
      data: Array.from(chunk),
      format,
    }));
  }
  // 发送结束标记
  ws.send(JSON.stringify({ type: 'audio-end' }));
  setStatus('✅ 已发送，等待识别…');
}


/** WebM Blob → WAV (16kHz mono 16-bit) ArrayBuffer */
async function decodeToWav(blob) {
  const arrayBuf = await blob.arrayBuffer();
  const ctx = new AudioContext();
  const audio = await ctx.decodeAudioData(arrayBuf);
  await ctx.close();

  const outRate = 16000;
  const input = audio.getChannelData(0);
  const ratio = audio.sampleRate / outRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const s = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const dataSize = out.length * 2;
  const wav = new ArrayBuffer(44 + dataSize);
  const v = new DataView(wav);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, outRate, true);
  v.setUint32(28, outRate * 2, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, dataSize, true);
  const sv = new DataView(wav, 44);
  for (let i = 0; i < out.length; i++) sv.setInt16(i * 2, out[i], true);
  return wav;
}

// ── 自动开始 ──
startCapture();

// ── 弹窗关闭时清理 ──
window.addEventListener('beforeunload', () => {
  if (ws) { try { ws.close(); } catch {} }
  if (stream) stream.getTracks().forEach(t => t.stop());
  clearInterval(timerInterval);
});
