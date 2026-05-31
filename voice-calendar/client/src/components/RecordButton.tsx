import { useRef, useEffect, useCallback } from "react";
import type { AppStatus } from "../types";
import "./RecordButton.css";

interface Props {
  status: AppStatus;
  onStart: () => void;
  onStop: () => void;
}

/** 防双击冷却时间（毫秒） */
const DEBOUNCE_MS = 400;

export default function RecordButton({ status, onStart, onStop }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const onStartRef = useRef(onStart);
  const onStopRef = useRef(onStop);
  const lastActionRef = useRef(0);
  onStartRef.current = onStart;
  onStopRef.current = onStop;

  const isRecording = status === "recording";
  const isProcessing = status === "processing";

  const toggle = useCallback(() => {
    // 防止 touchend + click 重复触发
    const now = Date.now();
    if (now - lastActionRef.current < DEBOUNCE_MS) return;
    lastActionRef.current = now;

    if (isProcessing) return;
    if (isRecording) {
      onStopRef.current();
    } else {
      onStartRef.current();
    }
  }, [isRecording, isProcessing]);

  // 只用 click 事件（移动端 touchend 后浏览器会自动触发 click）
  useEffect(() => {
    const el = buttonRef.current;
    if (!el) return;

    el.addEventListener("click", toggle);
    return () => el.removeEventListener("click", toggle);
  }, [toggle]);

  const label =
    status === "recording"
      ? "🔴 录音中，点击结束"
      : status === "processing"
        ? "识别中..."
        : status === "feedback"
          ? "✓ 完成"
          : "点击开始说话";

  return (
    <div className="record-button-container">
      <button
        ref={buttonRef}
        className={`record-button ${isRecording ? "recording" : ""} ${isProcessing ? "processing" : ""}`}
        disabled={isProcessing}
        style={{ touchAction: "manipulation" }}
      >
        <span className="record-icon">
          {isRecording ? "⏹" : isProcessing ? "⏳" : "🎤"}
        </span>
      </button>
      <span className="record-label">{label}</span>
    </div>
  );
}
