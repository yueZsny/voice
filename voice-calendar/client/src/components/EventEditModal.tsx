import { useState, useEffect } from "react";
import type { CalendarEvent } from "../types";
import "./EventEditModal.css";

interface Props {
  event: CalendarEvent;
  onSave: (event: CalendarEvent) => void;
  onClose: () => void;
}

/** 从 ISO 字符串提取日期部分 YYYY-MM-DD */
function extractDate(iso: string): string {
  try {
    return new Date(iso).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

/** 从 ISO 字符串提取时间部分 HH:MM */
function extractTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "09:00";
  }
}

/** 组合日期和时间回 ISO 字符串 */
function combineDateTime(dateStr: string, timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(dateStr + "T00:00:00+08:00");
  d.setHours(h || 9, m || 0, 0, 0);
  return d.toISOString();
}

export default function EventEditModal({ event, onSave, onClose }: Props) {
  const [title, setTitle] = useState(event.title);
  const [startDate, setStartDate] = useState(extractDate(event.start_time));
  const [startTime, setStartTime] = useState(extractTime(event.start_time));
  const [endDate, setEndDate] = useState(extractDate(event.end_time));
  const [endTime, setEndTime] = useState(extractTime(event.end_time));
  const [isAllDay, setIsAllDay] = useState(event.is_all_day === 1);

  // 按 Escape 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSave = () => {
    if (!title.trim()) return;

    const updated: CalendarEvent = {
      ...event,
      title: title.trim(),
      start_time: isAllDay
        ? `${startDate}T00:00:00+08:00`
        : combineDateTime(startDate, startTime),
      end_time: isAllDay
        ? `${endDate || startDate}T23:59:00+08:00`
        : combineDateTime(endDate || startDate, endTime),
      is_all_day: isAllDay ? 1 : 0,
    };
    onSave(updated);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>✏️ 编辑日程</h3>
          <button className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <label className="form-field">
            <span className="form-label">标题</span>
            <input
              type="text"
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="事件标题"
              autoFocus
            />
          </label>

          <label className="form-field form-field--checkbox">
            <input
              type="checkbox"
              checked={isAllDay}
              onChange={(e) => setIsAllDay(e.target.checked)}
            />
            <span>全天事件</span>
          </label>

          <div className="form-row">
            <label className="form-field">
              <span className="form-label">开始日期</span>
              <input
                type="date"
                className="form-input"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (!endDate || e.target.value > endDate) {
                    setEndDate(e.target.value);
                  }
                }}
              />
            </label>

            {!isAllDay && (
              <label className="form-field form-field--time">
                <span className="form-label">时间</span>
                <input
                  type="time"
                  className="form-input"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </label>
            )}
          </div>

          <div className="form-row">
            <label className="form-field">
              <span className="form-label">结束日期</span>
              <input
                type="date"
                className="form-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>

            {!isAllDay && (
              <label className="form-field form-field--time">
                <span className="form-label">时间</span>
                <input
                  type="time"
                  className="form-input"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </label>
            )}
          </div>

          {event.asr_text && (
            <div className="form-asr-text">
              <span className="form-label">原始语音:</span>
              <em>"{event.asr_text}"</em>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn--secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn--primary"
            onClick={handleSave}
            disabled={!title.trim()}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
