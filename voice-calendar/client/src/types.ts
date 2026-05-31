export interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  is_all_day: number;
  asr_text: string;
  created_at: string;
}

export interface ParsedEvent {
  title: string;
  start_time: string;
  end_time: string;
  is_all_day: boolean;
}

// WebSocket message types
export interface WsMessageIn {
  type:
    | "asr-result"
    | "llm-result"
    | "event-created"
    | "event-deleted"
    | "event-updated"
    | "events-list"
    | "error"
    | "status";
  text?: string;
  isFinal?: boolean;
  event?: CalendarEvent;
  events?: CalendarEvent[];
  message?: string;
  /** delete/update 时返回被操作的数量 */
  count?: number;
}

export type AppStatus =
  | "idle"
  | "recording"
  | "processing"
  | "feedback";
