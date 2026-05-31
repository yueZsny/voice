import { useRef, useCallback } from "react";

interface UseRecorderOptions {
  onChunk: (data: ArrayBuffer) => void;
  onEnd: () => void;
  onError: (error: string) => void;
}

let chunkIdCounter = 0;

export function useRecorder({ onChunk, onEnd, onError }: UseRecorderOptions) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const chunksSentRef = useRef(0);

  const start = useCallback(async () => {
    try {
      console.log("🎙️ 请求麦克风...");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      console.log("✅ 麦克风已授权");

      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm";
      console.log(`🎙️ MediaRecorder: ${mime}`);

      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = recorder;
      chunksRef.current = [];
      chunksSentRef.current = 0;

      let chunkN = 0;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunkN++;
          chunksRef.current.push(e.data);
          if (chunkN % 10 === 0) console.log(`🎙️ 已采集 ${chunkN} 个音频块 (最新 ${e.data.size}B)`);
        }
      };

      recorder.onstop = async () => {
        console.log(`🎙️ 录音停止，共 ${chunksRef.current.length} 个 WebM 块`);
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        if (chunksRef.current.length === 0) {
          console.error("❌ 未采集到任何音频数据");
          onError("未采集到音频，请检查麦克风");
          onEnd();
          return;
        }

        const webmBlob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];
        console.log(`🎙️ WebM 总大小: ${webmBlob.size} bytes`);

        // 方案A：浏览器解码 WebM → WAV
        const wav = await tryDecodeToWav(webmBlob);
        if (wav) {
          sendInChunks(wav, onChunk);
          console.log("✅ WAV 已发送 (浏览器解码)");
        } else {
          // 方案B：解码失败，直接发 WebM 给服务端处理
          console.warn("⚠️ 浏览器解码失败，改为发送原始 WebM");
          const buf = await webmBlob.arrayBuffer();
          sendInChunks(buf, onChunk, "webm");
        }
        onEnd();
      };

      recorder.onerror = () => onError("录音出错");
      recorder.start(); // 不分片，stop 时生成完整 WebM
      console.log("🔴 录音中...");
    } catch (err: any) {
      onError(err.message || "无法访问麦克风");
    }
  }, [onChunk, onEnd, onError]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      console.log("⏹️ 停止录音");
      recorderRef.current.stop();
    }
  }, []);

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  return { start, stop, cleanup };
}

/** 发送 ArrayBuffer 分块 */
function sendInChunks(buf: ArrayBuffer, send: (d: ArrayBuffer) => void, fmt?: string) {
  const CHUNK = 8192;
  let n = 0;
  for (let off = 0; off < buf.byteLength; off += CHUNK) {
    send(buf.slice(off, Math.min(off + CHUNK, buf.byteLength)));
    n++;
  }
  console.log(`📤 已发送 ${n} 块 (共 ${buf.byteLength}B)`);
}

/** 尝试用浏览器 AudioContext 解码 WebM → WAV */
async function tryDecodeToWav(blob: Blob): Promise<ArrayBuffer | null> {
  try {
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
      out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    const dataSize = out.length * 2;
    const wav = new ArrayBuffer(44 + dataSize);
    const v = new DataView(wav);
    const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, "RIFF"); v.setUint32(4, 36 + dataSize, true); w(8, "WAVE");
    w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, outRate, true); v.setUint32(28, outRate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, "data"); v.setUint32(40, dataSize, true);
    const sv = new DataView(wav, 44);
    for (let i = 0; i < out.length; i++) sv.setInt16(i * 2, out[i], true);

    console.log(`✅ 浏览器解码成功: ${audio.sampleRate}Hz→${outRate}Hz, ${outLen} samples`);
    return wav;
  } catch (e: any) {
    console.warn("⚠️ decodeAudioData 失败:", e.message);
    return null;
  }
}
