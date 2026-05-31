import { useMemo } from "react";
import ReactCalendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import type { CalendarEvent } from "../types";
import "./Calendar.css";

interface Props {
  events: CalendarEvent[];
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onMonthChange?: (year: number, month: number) => void;
}

export default function Calendar({
  events,
  selectedDate,
  onDateChange,
  onMonthChange,
}: Props) {
  // Build a set of dates that have events
  const eventDates = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => {
      const date = e.start_time.split("T")[0]; // YYYY-MM-DD
      set.add(date);
    });
    return set;
  }, [events]);

  /** 本地日期字符串（禁止 toISOString，UTC 会偏移） */
  function toLocalKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function tileContent({ date, view }: { date: Date; view: string }) {
    if (view !== "month") return null;
    const key = toLocalKey(date);
    if (eventDates.has(key)) {
      return <span className="event-dot" />;
    }
    return null;
  }

  function handleActiveStartDateChange({
    activeStartDate,
  }: {
    activeStartDate: Date | null;
  }) {
    if (activeStartDate && onMonthChange) {
      const year = activeStartDate.getFullYear();
      const month = activeStartDate.getMonth() + 1;
      onMonthChange(year, month);
    }
  }

  return (
    <div className="calendar-wrapper">
      <ReactCalendar
        value={selectedDate}
        onChange={(value) => {
          if (value instanceof Date) onDateChange(value);
        }}
        tileContent={tileContent}
        onActiveStartDateChange={handleActiveStartDateChange}
        locale="zh-CN"
        calendarType="gregory"
      />
    </div>
  );
}
