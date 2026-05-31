/**
 * Offscreen Document — 音频捕获
 *
 * 侧边栏先请求权限（可见弹窗），授权后通知此 offscreen 开始录音。
 * 同源 chrome-extension://[id] 下权限共享，getUserMedia 不会再次弹窗。
 */

console.log('[Offscreen] ✅ Offscreen document 已就绪');

let mediaRecorder = null;
let audioChunks = [];
let stream = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[Offscreen] 收到消息:', msg.type);

  if (msg.type === 'startRecording') {
    startCapture()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.error('[Offscreen] 启动失败:', err.message);
        sendResponse({ ok: false, error: err.message });
      });
    return true; // 异步响应
  }

  if (msg.type === 'stopRecording') {
    stopCapture();
    sendResponse({ ok: true });
  }
});

async function startCapture() {
  console.log('[Offscreen] 请求麦克风...');

  stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  console.log('[Offscreen] ✅ 麦克风已获取');

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';

  mediaRecorder = new MediaRecorder(stream, { mimeType });
  audioChunks = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      audioChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = async () => {
    console.log(`[Offscreen] 录音停止，共 ${audioChunks.length} 块`);
    stream.getTracks().forEach((t) => t.stop());
    stream = null;

    if (audioChunks.length === 0) {
      chrome.runtime.sendMessage({ type: 'audioError', error: '未采集到音频' });
      return;
    }

    const blob = new Blob(audioChunks, { type: mimeType });
    audioChunks = [];

    try {
      const wav = await decodeToWav(blob);
      const CHUNK_SIZE = 8192;
      const bytes = new Uint8Array(wav);
      const totalChunks = Math.ceil(bytes.length / CHUNK_SIZE);

      for (let i = 0; i < totalChunks; i++) {
        const chunk = bytes.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        chrome.runtime.sendMessage({
          type: 'audioChunk',
          chunkIndex: i,
          totalChunks,
          format: 'wav',
          data: Array.from(chunk),
        });
      }
      console.log(`[Offscreen] WAV 已发送 (${totalChunks} 块)`);
    } catch (err) {
      console.warn('[Offscreen] WAV 解码失败，发送原始 WebM');
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      chrome.runtime.sendMessage({
        type: 'audioChunk',
        chunkIndex: 0,
        totalChunks: 1,
        format: 'webm',
        data: Array.from(bytes),
      });
    }

    chrome.runtime.sendMessage({ type: 'audioEnd' });
  };

  mediaRecorder.onerror = () => {
    chrome.runtime.sendMessage({ type: 'audioError', error: '录音出错' });
  };

  mediaRecorder.start();
  console.log('[Offscreen] 🔴 录音中...');
}

function stopCapture() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    mediaRecorder = null;
  }
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
  w(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, outRate, true);
  v.setUint32(28, outRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, dataSize, true);
  const sv = new DataView(wav, 44);
  for (let i = 0; i < out.length; i++) sv.setInt16(i * 2, out[i], true);

  console.log(`[Offscreen] WAV 编码完成: ${wav.byteLength}B`);
  return wav;
}
