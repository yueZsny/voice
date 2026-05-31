import initSqlJs, { Database } from "sql.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "data", "voice-calendar.db");

let db: Database;

export interface CalendarEvent {
  id: string;
  title: string;
  start_time: string; // ISO 8601
  end_time: string; // ISO 8601
  is_all_day: number; // 0 or 1
  asr_text: string; // 原始 ASR 识别文本
  created_at: string;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function initDb(): Promise<void> {
  const SQL = await initSqlJs();

  // Ensure data directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Load existing or create new
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create table
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      is_all_day INTEGER DEFAULT 0,
      asr_text TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // Create index
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_events_time
    ON events(start_time, end_time)
  `);

  saveDb();
  console.log("[DB] SQLite initialized at", DB_PATH);
}

function saveDb(): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DB_PATH, buffer);
}

export function insertEvent(event: Omit<CalendarEvent, "id" | "created_at">): CalendarEvent {
  const id = generateId();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO events (id, title, start_time, end_time, is_all_day, asr_text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    id,
    event.title,
    event.start_time,
    event.end_time,
    event.is_all_day,
    event.asr_text,
    now,
  ]);
  stmt.free();
  saveDb();

  return { id, ...event, created_at: now };
}

export function getEventsByDate(date: string): CalendarEvent[] {
  // date is "YYYY-MM-DD" format
  const startOfDay = `${date}T00:00:00`;
  const endOfDay = `${date}T23:59:59`;

  const stmt = db.prepare(`
    SELECT * FROM events
    WHERE start_time <= ? AND end_time >= ?
    ORDER BY start_time ASC
  `);

  stmt.bind([endOfDay, startOfDay]);

  const events: CalendarEvent[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    events.push(row as unknown as CalendarEvent);
  }
  stmt.free();

  return events;
}

export function getEventsByMonth(year: number, month: number): CalendarEvent[] {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01T00:00:00`;
  const endYear = month === 12 ? year + 1 : year;
  const endMonth = month === 12 ? 1 : month + 1;
  const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01T00:00:00`;

  const stmt = db.prepare(`
    SELECT * FROM events
    WHERE start_time < ? AND end_time >= ?
    ORDER BY start_time ASC
  `);

  stmt.bind([endDate, startDate]);

  const events: CalendarEvent[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    events.push(row as unknown as CalendarEvent);
  }
  stmt.free();

  return events;
}

/** 模糊匹配：按关键词和日期查找事件 */
export function findEventsByKeyword(keyword: string, date?: string): CalendarEvent[] {
  // 如果 keyword 为空，匹配指定日期的所有事件
  if (!keyword || keyword.trim().length === 0) {
    if (date) {
      return getEventsByDate(date);
    }
    return [];
  }

  const pattern = `%${keyword}%`;

  let sql = `
    SELECT * FROM events
    WHERE title LIKE ?
  `;
  const params: any[] = [pattern];

  if (date) {
    const startOfDay = `${date}T00:00:00`;
    const endOfDay = `${date}T23:59:59`;
    sql += ` AND start_time <= ? AND end_time >= ?`;
    params.push(endOfDay, startOfDay);
  }

  sql += ` ORDER BY start_time ASC`;

  const stmt = db.prepare(sql);
  stmt.bind(params);

  const events: CalendarEvent[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    events.push(row as unknown as CalendarEvent);
  }
  stmt.free();

  return events;
}

/** 按 ID 删除事件 */
export function deleteEvent(id: string): boolean {
  const stmt = db.prepare(`DELETE FROM events WHERE id = ?`);
  stmt.bind([id]);
  stmt.step();
  stmt.free();

  const changes = db.getRowsModified();
  saveDb();
  return changes > 0;
}

/** 更新事件 */
export function updateEvent(
  id: string,
  updates: Partial<Pick<CalendarEvent, "title" | "start_time" | "end_time" | "is_all_day">>
): CalendarEvent | null {
  // 先查找原事件
  const findStmt = db.prepare(`SELECT * FROM events WHERE id = ?`);
  findStmt.bind([id]);
  let original: CalendarEvent | null = null;
  if (findStmt.step()) {
    original = findStmt.getAsObject() as unknown as CalendarEvent;
  }
  findStmt.free();

  if (!original) return null;

  const newTitle = updates.title ?? original.title;
  const newStart = updates.start_time ?? original.start_time;
  const newEnd = updates.end_time ?? original.end_time;
  const newAllDay = updates.is_all_day ?? original.is_all_day;

  const stmt = db.prepare(`
    UPDATE events
    SET title = ?, start_time = ?, end_time = ?, is_all_day = ?
    WHERE id = ?
  `);
  stmt.bind([newTitle, newStart, newEnd, newAllDay, id]);
  stmt.step();
  stmt.free();

  saveDb();

  return {
    ...original,
    title: newTitle,
    start_time: newStart,
    end_time: newEnd,
    is_all_day: newAllDay,
  };
}
