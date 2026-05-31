import { useState } from "react";
import type { CalendarEvent } from "../types";
import "./EventList.css";

interface Props {
  events: CalendarEvent[];
  date: Date;
  /** 自定义标题，传入时覆盖自动生成的日期标题 */
  title?: string;
  /** 自定义空状态文案 */
  emptyText?: string;
  /** 是否在时间前显示日期（用于跨天列表） */
  showDateLabels?: boolean;
  /** 删除回调 */
  onDelete?: (event: CalendarEvent) => void;
  /** 编辑回调 */
  onEdit?: (event: CalendarEvent) => void;
}

function formatTime(isoString: string, options?: { showDate?: boolean }): string {
  try {
    const d = new Date(isoString);
    const time = d.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    if (options?.showDate) {
      const dateStr = d.toLocaleDateString("zh-CN", {
        month: "long",
        day: "numeric",
      });
      return `${dateStr} ${time}`;
    }
    return time;
  } catch {
    return "--:--";
  }
}

/** 单个事件项（含操作按钮） */
function EventItem({
  event,
  showDateLabels,
  onDelete,
  onEdit,
}: {
  event: CalendarEvent;
  showDateLabels?: boolean;
  onDelete?: (event: CalendarEvent) => void;
  onEdit?: (event: CalendarEvent) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const handleDeleteClick = () => {
    if (confirming) {
      onDelete?.(event);
      setConfirming(false);
    } else {
      setConfirming(true);
      // 3 秒后自动取消确认状态
      setTimeout(() => setConfirming(false), 3000);
    }
  };

  const hasActions = onDelete || onEdit;

  return (
    <li className={`event-item ${confirming ? "event-item--confirming" : ""}`}>
      <div className="event-item-body">
        <div className="event-item-time">
          {event.is_all_day ? (
            <span className="all-day-badge">全天</span>
          ) : (
            <span>
              {formatTime(event.start_time, { showDate: showDateLabels })} - {formatTime(event.end_time)}
            </span>
          )}
        </div>
        <div className="event-item-title">{event.title}</div>
        {event.asr_text && (
          <div className="event-item-asr">语音: "{event.asr_text}"</div>
        )}
      </div>

      {hasActions && (
        <div className="event-item-actions">
          {onEdit && (
            <button
              className="action-btn action-btn--edit"
              title="编辑"
              onClick={() => onEdit(event)}
            >
              ✏️
            </button>
          )}
          {onDelete && (
            <button
              className={`action-btn action-btn--delete ${confirming ? "action-btn--confirm" : ""}`}
              title={confirming ? "再次点击确认删除" : "删除"}
              onClick={handleDeleteClick}
            >
              {confirming ? "❗" : "🗑️"}
            </button>
          )}
        </div>
      )}

      {confirming && (
        <div className="event-item-confirm-hint">再次点击确认删除</div>
      )}
    </li>
  );
}

export default function EventList({
  events,
  date,
  title,
  emptyText,
  showDateLabels,
  onDelete,
  onEdit,
}: Props) {
  const dateStr = title ?? date.toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div className="event-list">
      <h3 className="event-list-title">{dateStr}</h3>
      {events.length === 0 ? (
        <p className="event-list-empty">{emptyText ?? "暂无日程"}</p>
      ) : (
        <ul className="event-list-items">
          {events.map((event) => (
            <EventItem
              key={event.id}
              event={event}
              showDateLabels={showDateLabels}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
