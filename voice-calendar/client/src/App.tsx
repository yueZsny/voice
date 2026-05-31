import { useState, useCallback, useEffect, useMemo } from "react";
import Calendar from "./components/Calendar";
import RecordButton from "./components/RecordButton";
import EventList from "./components/EventList";
import EventEditModal from "./components/EventEditModal";
import { useWebSocket } from "./hooks/useWebSocket";
import { useRecorder } from "./hooks/useRecorder";
import { useExtensionRecorder } from "./hooks/useExtensionRecorder";
import type { CalendarEvent, AppStatus } from "./types";
import { API_BASE_URL, IS_EXTENSION } from "./config";
import "./App.css";

/** 获取本地日期字符串 YYYY-MM-DD（禁止用 toISOString，UTC 会偏移） */
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function App() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [asrDisplay, setAsrDisplay] = useState("");
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  const {
    connect,
    sendAudioChunk,
    sendAudioEnd,
    status,
    setStatus,
    asrText,
    feedbackText,
    error,
    events: wsEvents,
    setEvents: setWsEvents,
    lastEvent,
    lastAction,
    deletedIds,
    createdEvent,
  } = useWebSocket();

  // ── ① events-list：始终按日期覆盖（服务端权威数据）──
  useEffect(() => {
    if (wsEvents.length === 0) return;
    setAllEvents((prev) => {
      // 收集 wsEvents 覆盖的日期
      const coveredDates = new Set<string>();
      wsEvents.forEach((e: CalendarEvent) => {
        coveredDates.add(e.start_time.split("T")[0]);
      });
      // 保留未被覆盖的日期的事件，替换被覆盖的日期
      const kept = prev.filter((e) => {
        const d = e.start_time.split("T")[0];
        return !coveredDates.has(d);
      });
      return [...kept, ...wsEvents];
    });
  }, [wsEvents]);

  // ── ② event-created：即时追加新事件 ──
  useEffect(() => {
    if (!createdEvent) return;
    console.log("⚡ 即时添加事件:", createdEvent.title);
    setAllEvents((prev) => {
      if (prev.some((e) => e.id === createdEvent.id)) return prev;
      return [...prev, createdEvent];
    });
  }, [createdEvent]);

  // ── ③ event-deleted：即时移除已删除事件 ──
  useEffect(() => {
    if (deletedIds.length === 0) return;
    console.log("⚡ 即时删除事件:", deletedIds);
    setAllEvents((prev) => prev.filter((e) => !deletedIds.includes(e.id)));
    // 同时清理 wsEvents，防止 events-list 到达前显示已删数据
    setWsEvents((prev) => prev.filter((e) => !deletedIds.includes(e.id)));
  }, [deletedIds, setWsEvents]);

  // 拉取单月日程
  const fetchMonth = useCallback(async (year: number, month: number) => {
    try {
      console.log(`📅 加载 ${year}年${month}月 日程...`);
      const res = await fetch(
        `${API_BASE_URL}/api/events?year=${year}&month=${month}`
      );
      const data = await res.json();
      if (data.events) {
        console.log(`📅 加载到 ${data.events.length} 条日程`);
        setAllEvents((prev) => {
          const existing = new Map(prev.map((e) => [e.id, e]));
          data.events.forEach((e: CalendarEvent) =>
            existing.set(e.id, e)
          );
          return Array.from(existing.values());
        });
      }
    } catch (err) {
      console.error("❌ 加载日程失败:", err);
    }
  }, []);

  // 同时拉取当月+下月，保证跨月"未来三天"有数据
  const fetchEventsForMonth = useCallback(
    async (year: number, month: number) => {
      await fetchMonth(year, month);
      // 预拉下个月
      const next = new Date(year, month, 1); // month 是 1-based，new Date 的 month 是 0-based，正好抵消
      await fetchMonth(next.getFullYear(), next.getMonth() + 1);
    },
    [fetchMonth]
  );

  // Fetch events for selected date
  const fetchEventsForDate = useCallback(async (date: Date) => {
    const key = toLocalDateStr(date);
    try {
      console.log(`📅 加载 ${key} 日程...`);
      const res = await fetch(`${API_BASE_URL}/api/events?date=${key}`);
      const data = await res.json();
      if (data.events) {
        setWsEvents(data.events);
      }
    } catch (err) {
      console.error("❌ 加载日程失败:", err);
    }
  }, [setWsEvents]);

  // 预连接 WebSocket，避免首次点击录音时等待连接
  useEffect(() => {
    connect().catch(() => {}); // 静默失败，点击时再重试
  }, []);

  // Initial load — fetchEventsForMonth 自动拉当月+下月
  useEffect(() => {
    const now = new Date();
    fetchEventsForMonth(now.getFullYear(), now.getMonth() + 1);
  }, []);

  // Refetch when date changes
  useEffect(() => {
    fetchEventsForDate(selectedDate);
  }, [selectedDate, fetchEventsForDate]);

  // ── 日程数据 ──
  const realToday = new Date();
  const todayStr = toLocalDateStr(realToday);
  const selectedDateStr = useMemo(
    () => toLocalDateStr(selectedDate),
    [selectedDate]
  );

  // 选中日期的日程
  const selectedDateEvents = useMemo(
    () =>
      allEvents.filter((e) => {
        const start = e.start_time.split("T")[0];
        const end = e.end_time.split("T")[0];
        return start <= selectedDateStr && end >= selectedDateStr;
      }),
    [allEvents, selectedDateStr]
  );

  // 今日待办：事件跨天覆盖今天
  const todayEvents = useMemo(
    () =>
      allEvents.filter((e) => {
        const start = e.start_time.split("T")[0];
        const end = e.end_time.split("T")[0];
        return start <= todayStr && end >= todayStr;
      }),
    [allEvents, todayStr]
  );

  // 后续日程：未来 3 天内（不含今天），按时间升序
  const upcomingEvents = useMemo(
    () => {
      const threeDaysLater = new Date(realToday);
      threeDaysLater.setDate(threeDaysLater.getDate() + 3);
      const cutoffStr = toLocalDateStr(threeDaysLater);
      return allEvents
        .filter((e) => {
          const start = e.start_time.split("T")[0];
          return start > todayStr && start <= cutoffStr;
        })
        .sort((a, b) => a.start_time.localeCompare(b.start_time));
    },
    [allEvents, todayStr]
  );

  // ── 手动删除日程 ──
  const handleDeleteEvent = useCallback(
    async (event: CalendarEvent) => {
      try {
        console.log(`🗑️ 删除日程: id=${event.id}, title="${event.title}"`);
        const res = await fetch(`${API_BASE_URL}/api/events/${event.id}`, { method: "DELETE" });
        if (res.ok) {
          setAllEvents((prev) => prev.filter((e) => e.id !== event.id));
          // 同步更新 wsEvents 当天的列表
          setWsEvents((prev) => prev.filter((e) => e.id !== event.id));
          console.log(`🗑️ 已删除: ${event.title}`);
        } else {
          const data = await res.json();
          console.error(`❌ 删除失败: ${data.error}`);
        }
      } catch (err) {
        console.error("❌ 删除请求失败:", err);
      }
    },
    [setWsEvents]
  );

  // ── 手动更新日程 ──
  const handleUpdateEvent = useCallback(
    async (updated: CalendarEvent) => {
      try {
        console.log(`✏️ 更新日程: id=${updated.id}, title="${updated.title}"`);
        const res = await fetch(`${API_BASE_URL}/api/events/${updated.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: updated.title,
            start_time: updated.start_time,
            end_time: updated.end_time,
            is_all_day: updated.is_all_day,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const saved = data.event as CalendarEvent;
          setAllEvents((prev) => prev.map((e) => (e.id === saved.id ? saved : e)));
          setWsEvents((prev) => prev.map((e) => (e.id === saved.id ? saved : e)));
          setEditingEvent(null);
          console.log(`✏️ 已更新: ${saved.title}`);
        } else {
          const data = await res.json();
          console.error(`❌ 更新失败: ${data.error}`);
        }
      } catch (err) {
        console.error("❌ 更新请求失败:", err);
      }
    },
    [setWsEvents]
  );

  // --- Recorder ---
  const handleRecordingStart = useCallback(async () => {
    console.log("🎙️ 用户点击开始录音");
    setAsrDisplay("");
    setStatus("recording");

    // ⚠️ 关键：必须先启动麦克风（getUserMedia），再连接 WebSocket。
    // Chrome 安全策略要求 getUserMedia 必须在用户点击的同一个微任务中调用。
    // await connect() 是异步网络操作，会丢失用户手势上下文 → NotAllowedError。
    recorder.start();

    // WebSocket 可以异步连接，音频数据暂存内存，用户点停止时才发送。
    try {
      await connect();
      console.log("🔗 WebSocket 已连接");
    } catch {
      console.error("❌ WebSocket 连接失败");
      recorder.stop();
      setStatus("idle");
    }
  }, [connect, setStatus]);

  const handleRecordingStop = useCallback(() => {
    console.log("⏹️ 用户点击结束录音");
    recorder.stop();
    setStatus("processing");
  }, [setStatus]);

  const handleRecorderError = useCallback(
    (err: string) => {
      console.error("❌ 录音错误:", err);
      setStatus("idle");
    },
    [setStatus]
  );

  const webRecorder = useRecorder({
    onChunk: sendAudioChunk,
    onEnd: () => {
      console.log("🎙️ 音频数据已全部发送，通知服务端开始识别");
      sendAudioEnd();
    },
    onError: handleRecorderError,
  });

  const extensionRecorder = useExtensionRecorder({
    onChunk: sendAudioChunk,
    onEnd: () => {
      console.log("🎙️ 音频数据已全部发送，通知服务端开始识别");
      sendAudioEnd();
    },
    onError: handleRecorderError,
  });

  const recorder = IS_EXTENSION ? extensionRecorder : webRecorder;

  const appStatus: AppStatus = status;

  // Update ASR display when text comes in
  useEffect(() => {
    if (asrText) {
      console.log(`📝 识别文本更新: "${asrText}"`);
      setAsrDisplay(asrText);
    }
  }, [asrText]);

  return (
    <div className="app">
      {/* ── 顶部导航栏 ── */}
      <header className="app-header">
        <div className="app-brand">
          <span className="app-logo">🎤</span>
          <div>
            <h1>语音日历</h1>
            <p className="app-subtitle">说一句话，轻松管理日程</p>
          </div>
        </div>
      </header>

      {/* ── 三栏主体 ── */}
      <main className="app-main">
        {/* 左栏：语音控制 */}
        <aside className="sidebar sidebar--left">
          <div className="sidebar-card">
            <h3 className="sidebar-title">🎙️ 语音录入</h3>
            <RecordButton
              status={appStatus}
              onStart={handleRecordingStart}
              onStop={handleRecordingStop}
            />

            {/* 状态显示区域 */}
            <div className="status-area">
              {asrDisplay && (
                <div className="asr-display">
                  <span className="asr-label">识别结果</span>
                  <span className="asr-text">{asrDisplay}</span>
                </div>
              )}

              {feedbackText && (
                <div className="feedback-display">{feedbackText}</div>
              )}

              {error && <div className="error-display">{error}</div>}
            </div>

            {/* 语音指令提示 */}
            <div className="voice-hints">
              <span className="voice-hints-label">💡 你可以这样说</span>
              <ul className="voice-hints-list">
                <li>今天下午三点开会</li>
                <li>明天全天去爬山</li>
                <li>删除今天下午的会议</li>
                <li>把明天的开会改到后天</li>
              </ul>
            </div>
          </div>
        </aside>

        {/* 中栏：日历 */}
        <section className="main-content">
          <Calendar
            events={allEvents}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onMonthChange={fetchEventsForMonth}
          />
        </section>

        {/* 右栏：日程列表 */}
        <aside className="sidebar sidebar--right">
          <EventList
            events={selectedDateEvents}
            date={selectedDate}
            title={`📌 ${selectedDate.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}`}
            emptyText="当天暂无日程 ✨"
            onDelete={handleDeleteEvent}
            onEdit={setEditingEvent}
          />
          <EventList
            events={todayEvents}
            date={realToday}
            title="📋 今天待办"
            emptyText="今天暂无日程安排 ✨"
            onDelete={handleDeleteEvent}
            onEdit={setEditingEvent}
          />
          <EventList
            events={upcomingEvents}
            date={realToday}
            title="📅 未来三天"
            emptyText="未来三天暂无日程 🎉"
            showDateLabels
            onDelete={handleDeleteEvent}
            onEdit={setEditingEvent}
          />
        </aside>
      </main>

      {/* ── 底部 ── */}
      <footer className="app-footer">
        <p>Voice Calendar MVP — 语音录入 + 日历展示</p>
      </footer>

      {/* ── 编辑日程弹窗 ── */}
      {editingEvent && (
        <EventEditModal
          event={editingEvent}
          onSave={handleUpdateEvent}
          onClose={() => setEditingEvent(null)}
        />
      )}
    </div>
  );
}

export default App;
