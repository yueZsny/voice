import { useRef, useState, useCallback, useEffect } from "react";
import type { WsMessageIn, AppStatus } from "../types";
import { WS_URL } from "../config";

const IS_EXTENSION =
  typeof import.meta !== "undefined" &&
  (import.meta as any).env?.VITE_EXTENSION === "true";

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const statusRef = useRef<AppStatus>("idle");
  const [status, setStatus] = useState<AppStatus>("idle");
  const chunkCountRef = useRef(0);

  const updateStatus = useCallback((s: AppStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);
  const [asrText, setAsrText] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [error, setError] = useState("");
  const [events, setEvents] = useState<any[]>([]);
  const [lastEvent, setLastEvent] = useState<any>(null);
  const [lastAction, setLastAction] = useState<"create" | "delete" | "update" | null>(null);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [createdEvent, setCreatedEvent] = useState<any>(null);

  const connect = useCallback((): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        console.log("🔗 [WS] 复用已有连接");
        resolve(wsRef.current);
        return;
      }

      console.log("🔗 [WS] 正在连接到", WS_URL);
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log("✅ [WS] 已连接到后端");
        wsRef.current = ws;
        chunkCountRef.current = 0;
        setError("");
        updateStatus("idle");
        resolve(ws);
      };

      ws.onmessage = (event) => {
        try {
          const msg: WsMessageIn = JSON.parse(event.data);
          console.log("📥 [WS] 收到消息:", msg.type, msg.text || msg.message || "");
          handleMessage(msg);
        } catch (e) {
          console.error("❌ [WS] 消息解析失败:", e);
        }
      };

      ws.onerror = (e) => {
        console.error("❌ [WS] 连接错误:", e);
        setError("WebSocket 连接失败");
        reject(e);
      };

      ws.onclose = () => {
        console.log("🔌 [WS] 连接已关闭");
        wsRef.current = null;
        if (statusRef.current === "recording" || statusRef.current === "processing") {
          updateStatus("idle");
        }
      };
    });
  }, []);

  const handleMessage = useCallback((msg: WsMessageIn) => {
    switch (msg.type) {
      case "status":
        console.log("   [WS] 服务端状态:", msg.message);
        break;

      case "asr-result":
        if (msg.text) {
          console.log(`   🎤 [ASR] 识别结果: "${msg.text}"`);
          setAsrText(msg.text);
        }
        updateStatus("processing");
        break;

      case "llm-result":
        if (msg.event) {
          console.log("   🤖 [LLM] 解析成功:", msg.event.title);
          setLastEvent(msg.event);
        }
        break;

      case "event-created":
        console.log("   ✅ [日程] 已创建:", msg.event?.title);
        setLastAction("create");
        setLastEvent(msg.event || null);
        setCreatedEvent(msg.event || null);  // 即时同步用
        setFeedbackText(msg.text || `✅ 已添加：${msg.event?.title || ""}`);
        updateStatus("feedback");
        setTimeout(() => {
          updateStatus("idle");
          setFeedbackText("");
          setLastAction(null);
          setCreatedEvent(null);
        }, 3000);
        break;

      case "event-deleted":
        console.log(`   🗑️ [日程] 已删除 ${msg.count || 0} 条`);
        setLastAction("delete");
        setDeletedIds(msg.ids || []);  // 即时同步用
        setFeedbackText(msg.text || `✅ 已删除 ${msg.count || 0} 条日程`);
        updateStatus("feedback");
        setTimeout(() => {
          updateStatus("idle");
          setFeedbackText("");
          setLastAction(null);
          setDeletedIds([]);
        }, 3000);
        break;

      case "event-updated":
        console.log("   ✏️ [日程] 已更新:", msg.event?.title);
        setLastAction("update");
        setLastEvent(msg.event || null);
        setFeedbackText(msg.text || `✅ 已更新：${msg.event?.title || ""}`);
        updateStatus("feedback");
        setTimeout(() => {
          updateStatus("idle");
          setFeedbackText("");
          setLastAction(null);
        }, 3000);
        break;

      case "events-list":
        if (msg.events) {
          console.log(`   📋 [日程列表] 共 ${msg.events.length} 条`);
          setEvents(msg.events);
        }
        break;

      case "error":
        console.error("   ❌ [错误]:", msg.message);
        setError(msg.message || "未知错误");
        updateStatus("idle");
        setTimeout(() => setError(""), 4000);
        break;
    }
  }, [updateStatus]);

  // ── 扩展模式：监听来自录音弹窗的后端结果 ──
  useEffect(() => {
    if (!IS_EXTENSION) return;
    const listener = (msg: any) => {
      // 录音弹窗将后端 WS 结果通过 chrome.runtime 转发过来
      if (
        msg.type === "asr-result" ||
        msg.type === "llm-result" ||
        msg.type === "event-created" ||
        msg.type === "event-deleted" ||
        msg.type === "event-updated" ||
        msg.type === "events-list" ||
        msg.type === "error"
      ) {
        handleMessage(msg as WsMessageIn);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [handleMessage]);

  const sendAudioChunk = useCallback((data: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const msg = {
        type: "audio-data",
        data: Array.from(new Uint8Array(data)),
        format: "webm",
      };
      wsRef.current.send(JSON.stringify(msg));
      chunkCountRef.current++;
      // 每 10 块打印一次，避免刷屏
      if (chunkCountRef.current % 10 === 0) {
        console.log(`📤 [音频] 已发送 ${chunkCountRef.current} 块 (最近一块 ${data.byteLength}B)`);
      }
    } else {
      console.warn("⚠️ [WS] WebSocket 未连接，无法发送音频块");
    }
  }, []);

  const sendAudioEnd = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log(`📤 [音频] 录音结束，共发送 ${chunkCountRef.current} 块音频`);
      wsRef.current.send(JSON.stringify({ type: "audio-end" }));
      chunkCountRef.current = 0;
    } else {
      console.error("❌ [WS] WebSocket 未连接，无法发送结束信号");
    }
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  return {
    connect,
    disconnect,
    sendAudioChunk,
    sendAudioEnd,
    status,
    setStatus: updateStatus,
    asrText,
    feedbackText,
    error,
    events,
    setEvents,
    lastEvent,
    lastAction,
    deletedIds,
    createdEvent,
  };
}
