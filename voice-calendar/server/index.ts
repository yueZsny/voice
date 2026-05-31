import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// 优先加载项目根目录的 .env（兼容从 server/ 目录启动）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, ".env") }); // fallback

import fs from "fs";
import express from "express";
import cors from "cors";
import http from "http";
import { execSync } from "child_process";
import { WebSocketServer, WebSocket } from "ws";
import { initDb, insertEvent, getEventsByDate, getEventsByMonth, findEventsByKeyword, deleteEvent, updateEvent, CalendarEvent } from "./db";
import { speechToText } from "./asr";
import { parseVoiceCommand } from "./llm";
// @ts-ignore
import ffmpegPath from "ffmpeg-static";

/** WebM → WAV (16kHz, mono, 16-bit) 使用内置 ffmpeg 静态二进制 */
// eslint-disable-next-line
function webmToWav(webmBuf: Buffer): any {
  const tmpDir = path.join(__dirname, "data");
  const inputPath = path.join(tmpDir, `_in_${Date.now()}.webm`);
  const outputPath = path.join(tmpDir, `_out_${Date.now()}.wav`);

  fs.writeFileSync(inputPath, webmBuf);
  try {
    execSync(
      `"${ffmpegPath}" -i "${inputPath}" -ar 16000 -ac 1 -sample_fmt s16 -f wav "${outputPath}" -y`,
      { stdio: "pipe", timeout: 10000 }
    );
    const wav = fs.readFileSync(outputPath);
    console.log(`🔄 WebM→WAV: ${webmBuf.length}B → ${wav.length}B`);
    return wav;
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
}

const PORT = parseInt(process.env.PORT || "3001");

// --- Message Types ---
interface WsMessageIn {
  type: "audio-data" | "audio-end";
  data?: number[]; // audio chunk as byte array
  format?: string;
}

interface WsMessageOut {
  type: "asr-result" | "llm-result" | "event-created" | "event-deleted" | "event-updated" | "events-list" | "error" | "status";
  text?: string;
  isFinal?: boolean;
  event?: CalendarEvent;
  events?: CalendarEvent[];
  message?: string;
  /** delete/update 时返回被删除/更新的数量 */
  count?: number;
  /** 被删除事件的 ID 列表 */
  ids?: string[];
}

// --- Express App ---
const app = express();
app.use(cors());
app.use(express.json());

// REST API: get events by date
app.get("/api/events", (req, res) => {
  const { date, year, month } = req.query;

  try {
    if (date) {
      const events = getEventsByDate(date as string);
      res.json({ events });
    } else if (year && month) {
      const events = getEventsByMonth(parseInt(year as string), parseInt(month as string));
      res.json({ events });
    } else {
      res.status(400).json({ error: "Provide date or year+month" });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// REST API: delete event by id
app.delete("/api/events/:id", (req, res) => {
  try {
    const { id } = req.params;
    const ok = deleteEvent(id);
    if (ok) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "事件不存在" });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// REST API: update event by id
app.put("/api/events/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { title, start_time, end_time, is_all_day } = req.body;
    const updated = updateEvent(id, {
      title,
      start_time,
      end_time,
      is_all_day: is_all_day ? 1 : 0,
    });
    if (updated) {
      res.json({ event: updated });
    } else {
      res.status(404).json({ error: "事件不存在" });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- HTTP Server + WebSocket ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws: WebSocket) => {
  const clientId = Date.now().toString(36);
  console.log(`🔗 [WS-${clientId}] 客户端已连接`);

  let audioChunks: Buffer[] = [];
  let audioFormat = "webm";
  let chunkCount = 0;

  ws.on("message", async (raw) => {
    try {
      const msg: WsMessageIn = JSON.parse(raw.toString());

      switch (msg.type) {
        case "audio-data": {
          if (msg.data) {
            audioChunks.push(Buffer.from(msg.data));
            chunkCount++;
          }
          if (msg.format) {
            audioFormat = msg.format;
          }
          // 每 10 块打印一次
          if (chunkCount % 10 === 0) {
            console.log(`📤 [WS-${clientId}] 已收到 ${chunkCount} 块音频`);
          }
          break;
        }

        case "audio-end": {
          console.log(`📤 [WS-${clientId}] 录音结束，共 ${chunkCount} 块音频，总大小 ${audioChunks.reduce((s, c) => s + c.length, 0)}B，格式=${audioFormat}`);
          chunkCount = 0;

          // Concatenate audio chunks
          const fullAudio = Buffer.concat(audioChunks);
          audioChunks = [];

          if (fullAudio.length === 0) {
            console.warn(`⚠️ [WS-${clientId}] 音频数据为空`);
            sendError(ws, "未收到音频数据");
            return;
          }

          // ── 调试：检查 WAV 头部 ──
          if (audioFormat === "wav" && fullAudio.length >= 44) {
            const riff = fullAudio.toString("ascii", 0, 4);
            const wave = fullAudio.toString("ascii", 8, 12);
            const fmt = fullAudio.toString("ascii", 12, 16);
            const channels = fullAudio.readUInt16LE(22);
            const wavSampleRate = fullAudio.readUInt32LE(24);
            const bitsPerSample = fullAudio.readUInt16LE(34);
            const dataSize = fullAudio.readUInt32LE(40);
            console.log(`🔍 [WAV 检查] RIFF="${riff}" WAVE="${wave}" fmt="${fmt}"`);
            console.log(`🔍 [WAV 检查] ${channels}ch, ${wavSampleRate}Hz, ${bitsPerSample}bit, data=${dataSize}B, total=${fullAudio.length}B`);
            // 保存到文件供排查
            const debugPath = `./data/debug_${Date.now()}.wav`;
            fs.writeFileSync(debugPath, fullAudio);
            console.log(`🔍 [WAV 文件] 已保存到 ${debugPath}，可以用播放器打开验证`);
          }

          // ── WebM → WAV 转码 ──
          let asrAudio = fullAudio;
          let asrFormat = audioFormat;
          if (audioFormat === "webm") {
            console.log(`🔄 [WS-${clientId}] WebM → WAV 转码...`);
            asrAudio = webmToWav(fullAudio);
            asrFormat = "wav";
          }

          // ── 第 1 步: ASR 语音 → 文本 ──
          console.log(`🎤 [WS-${clientId}] 步骤1/3: 调用阿里云 ASR (${asrFormat}, ${asrAudio.length}B)...`);
          const asrStart = Date.now();
          const asrText = await speechToText(asrAudio, asrFormat);
          const asrTime = Date.now() - asrStart;
          console.log(`🎤 [WS-${clientId}] ASR 完成 (${asrTime}ms): "${asrText}"`);
          sendMessage(ws, { type: "asr-result", text: asrText, isFinal: true });

          // 检查 ASR 是否返回了错误信息（识别失败 / 静音）
          if (
            asrText.startsWith("[语音识别失败") ||
            asrText.startsWith("[未检测到语音")
          ) {
            console.error(`❌ [WS-${clientId}] ASR 识别失败，中断流程`);
            sendError(ws, asrText.replace(/^\[|\]$/g, ""));
            return;
          }

          // ── 第 2 步: LLM 文本 → 结构化日程 ──
          console.log(`🤖 [WS-${clientId}] 步骤2/3: 调用 DeepSeek LLM 解析...`);
          const llmStart = Date.now();
          const parsed = await parseVoiceCommand(asrText);
          const llmTime = Date.now() - llmStart;

          if (!parsed) {
            console.error(`❌ [WS-${clientId}] LLM 解析失败`);
            sendError(ws, "无法理解您的指令，请换个说法试试");
            return;
          }
          console.log(`🤖 [WS-${clientId}] LLM 完成 (${llmTime}ms):`, JSON.stringify(parsed));

          // ── 第 3 步: 根据 action 执行数据库操作 ──
          const action = parsed.action || "create";

          if (action === "delete") {
            // ── DELETE 操作 ──
            console.log(`🗑️ [WS-${clientId}] 步骤3/3: 删除日程...`);
            const keyword = parsed.match_keyword || parsed.title || "";
            const date = parsed.match_date || parsed.start_time?.split("T")[0];
            console.log(`🗑️ [WS-${clientId}] 查找条件: keyword="${keyword}", date=${date}`);

            const matches = findEventsByKeyword(keyword, date);
            console.log(`🗑️ [WS-${clientId}] 找到 ${matches.length} 条匹配事件`);

            let deletedCount = 0;
            const deletedIds: string[] = [];
            for (const ev of matches) {
              const ok = deleteEvent(ev.id);
              if (ok) {
                deletedCount++;
                deletedIds.push(ev.id);
                console.log(`🗑️ [WS-${clientId}] 已删除: id=${ev.id}, title="${ev.title}"`);
              }
            }

            if (deletedCount > 0) {
              const matchDate = date || parsed.start_time?.split("T")[0] || new Date().toISOString().split("T")[0];
              const updatedEvents = getEventsByDate(matchDate);
              sendMessage(ws, {
                type: "event-deleted",
                text: `✅ 已删除 ${deletedCount} 条日程`,
                count: deletedCount,
                ids: deletedIds,
              });
              sendMessage(ws, { type: "events-list", events: updatedEvents });
            } else {
              sendMessage(ws, {
                type: "error",
                message: keyword
                  ? `未找到包含"${keyword}"的日程，请确认后再试`
                  : `未找到当天日程`,
              });
            }
          } else if (action === "update") {
            // ── UPDATE 操作 ──
            console.log(`✏️ [WS-${clientId}] 步骤3/3: 更新日程...`);
            const keyword = parsed.match_keyword || parsed.title || "";
            const date = parsed.match_date || parsed.start_time?.split("T")[0];
            console.log(`✏️ [WS-${clientId}] 查找条件: keyword="${keyword}", date=${date}`);

            const matches = findEventsByKeyword(keyword, date);
            console.log(`✏️ [WS-${clientId}] 找到 ${matches.length} 条匹配事件`);

            if (matches.length === 0) {
              sendMessage(ws, {
                type: "error",
                message: `未找到包含"${keyword}"的日程，无法修改`,
              });
            } else {
              // 更新第一个匹配的事件
              const target = matches[0];
              const updated = updateEvent(target.id, {
                title: parsed.title || target.title,
                start_time: parsed.start_time || target.start_time,
                end_time: parsed.end_time || target.end_time,
                is_all_day: parsed.is_all_day ? 1 : 0,
              });

              if (updated) {
                const matchDate = date || parsed.start_time?.split("T")[0] || new Date().toISOString().split("T")[0];
                const updatedEvents = getEventsByDate(matchDate);
                sendMessage(ws, { type: "llm-result", event: updated });
                sendMessage(ws, {
                  type: "event-updated",
                  event: updated,
                  text: `✅ 已更新：${updated.title}`,
                });
                sendMessage(ws, { type: "events-list", events: updatedEvents });
                console.log(`✏️ [WS-${clientId}] 已更新: id=${updated.id}, title="${updated.title}"`);
              } else {
                sendError(ws, "更新失败，请稍后重试");
              }
            }
          } else {
            // ── CREATE 操作（默认） ──
            console.log(`💾 [WS-${clientId}] 步骤3/3: 存入 SQLite...`);
            const event = insertEvent({
              title: parsed.title,
              start_time: parsed.start_time,
              end_time: parsed.end_time,
              is_all_day: parsed.is_all_day ? 1 : 0,
              asr_text: asrText,
            });
            console.log(`💾 [WS-${clientId}] 已存入: id=${event.id}, title="${event.title}", start=${event.start_time}`);

            // ── 发送结果给前端 ──
            sendMessage(ws, { type: "llm-result", event });
            sendMessage(ws, {
              type: "event-created",
              event,
              text: `✅ 已添加：${event.title}`,
            });

            const eventDate = event.start_time.split("T")[0];
            const dayEvents = getEventsByDate(eventDate);
            sendMessage(ws, { type: "events-list", events: dayEvents });
          }

          console.log(`✅ [WS-${clientId}] 全流程完成 (总耗时 ${asrTime + llmTime}ms)`);
          break;
        }

        default:
          console.log(`❓ [WS-${clientId}] 未知消息类型:`, msg.type);
      }
    } catch (error: any) {
      console.error(`💥 [WS-${clientId}] 异常:`, error.message);
      sendError(ws, error.message || "服务器内部错误");
    }
  });

  ws.on("close", () => {
    console.log(`🔌 [WS-${clientId}] 客户端断开连接`);
    audioChunks = [];
    chunkCount = 0;
  });

  ws.on("error", (err) => {
    console.error(`💥 [WS-${clientId}] WebSocket 错误:`, err);
  });
});

function sendMessage(ws: WebSocket, msg: WsMessageOut): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function sendError(ws: WebSocket, message: string): void {
  sendMessage(ws, { type: "error", message });
}

function sendStatus(ws: WebSocket, message: string): void {
  sendMessage(ws, { type: "status", message });
}

// --- Start ---
async function start() {
  await initDb();
  server.listen(PORT, () => {
    console.log(`[Server] Voice Calendar API running on http://localhost:${PORT}`);
    console.log(`[Server] WebSocket ready on ws://localhost:${PORT}`);
    console.log("[Server] ASR:", process.env.ALIBABA_CLOUD_ACCESS_KEY_ID ? "已配置" : "未配置（使用 Mock）");
    console.log("[Server] LLM:", process.env.DEEPSEEK_API_KEY ? "已配置" : "未配置（使用简易解析器）");
  });
}

start();
