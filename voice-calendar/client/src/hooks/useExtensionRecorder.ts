import { useCallback } from "react";

interface UseExtensionRecorderOptions {
  onChunk: (data: ArrayBuffer) => void;
  onEnd: () => void;
  onError: (error: string) => void;
}

/**
 * 扩展模式录音 Hook
 *
 * 架构：
 *  ① 侧边栏发送 startRecording → Service Worker
 *  ② SW 打开小弹窗 (chrome.windows.create popup)
 *  ③ 弹窗 getUserMedia → 权限弹窗 → 直连 WebSocket → 发送音频
 *  ④ 后端 ASR+LLM 结果 → 弹窗 WS 接收 → chrome.runtime 转发给侧边栏
 *  ⑤ useWebSocket 的 extension 监听器接收结果 → 更新 UI
 */

export function useExtensionRecorder({ onChunk, onEnd, onError }: UseExtensionRecorderOptions) {
  const isExtension = typeof chrome !== "undefined" && !!chrome.runtime?.sendMessage;

  const start = useCallback(async () => {
    if (!isExtension) {
      onError("非扩展环境");
      return;
    }
    // 通知 Service Worker 打开录音弹窗
    chrome.runtime.sendMessage({ type: "startRecording" });
  }, [isExtension, onError]);

  const stop = useCallback(() => {
    if (isExtension) {
      chrome.runtime.sendMessage({ type: "stopRecording" });
    }
  }, [isExtension]);

  if (!isExtension) {
    return { start: async () => {}, stop: () => {} };
  }

  return { start, stop };
}
