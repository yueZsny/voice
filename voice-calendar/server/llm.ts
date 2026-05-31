import axios from "axios";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

function getApiKey(): string {
  return process.env.DEEPSEEK_API_KEY || "";
}

type LlmAction = "create" | "delete" | "update";

interface ParsedEvent {
  action: LlmAction;
  title: string;
  start_time: string; // ISO 8601
  end_time: string; // ISO 8601
  is_all_day: boolean;
  /** 用于 delete/update 时匹配目标事件的标题关键词 */
  match_keyword?: string;
  /** 用于 delete/update 时限定日期范围 (YYYY-MM-DD) */
  match_date?: string;
}

function buildSystemPrompt(): string {
  const now = new Date();
  const today = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const currentTime = now.toISOString();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const weekday = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][now.getDay()];

  return `你是一个专业的日历助手。你需要将用户的自然语言指令解析为结构化的 JSON 数据。

## 当前时间
- 日期: ${today} (${weekday})
- 完整时间: ${currentTime}
- 年份: ${year}年, 月份: ${month}月, 日期: ${day}日

## 支持的操作类型
你需要根据用户的意图判断 action 字段：
- "create": 用户想新增一个日程（默认）
- "delete": 用户想删除已有日程（关键词：删除、删去、去掉、取消、移除、去掉、不要了）
- "update": 用户想修改已有日程（关键词：修改、改成、改到、改一下、更新、变更）

## 输出格式（严格 JSON，不要输出其他内容）

### CREATE 操作：
{
  "action": "create",
  "title": "事件标题",
  "start_time": "ISO 8601 格式开始时间",
  "end_time": "ISO 8601 格式结束时间",
  "is_all_day": false
}

### DELETE 操作：
{
  "action": "delete",
  "title": "要删除的事件关键词",
  "match_keyword": "用于模糊匹配数据库中事件标题的关键词",
  "match_date": "YYYY-MM-DD（事件所属日期，如未指定则用今天 ${today}）",
  "start_time": "${today}T00:00:00+08:00",
  "end_time": "${today}T23:59:00+08:00",
  "is_all_day": false
}

### UPDATE 操作：
{
  "action": "update",
  "title": "新的标题（如不修改则用原标题）",
  "match_keyword": "用于模糊匹配数据库中原始事件标题的关键词",
  "match_date": "YYYY-MM-DD（原始事件所属日期）",
  "start_time": "新的开始时间",
  "end_time": "新的结束时间",
  "is_all_day": false
}

## 时间解析规则
1. "今天" = ${today}
2. "明天" = ${today} 的下一天
3. "后天" = ${today} 的下两天
4. "大后天" = ${today} 的下三天
5. "下周X" = 下周对应的星期X
6. "X月X日" 或 "X月X号" = ${year}年X月X日（非常重要：月份在前，日期在后。例如"5月5日" = ${year}-05-05）
7. "X月X日" 如果指定的月日已经过了今天(${today})，仍然使用当前年份 ${year}（日程可以是过去补录的）
8. "X点" = X:00, "X点半" = X:30
9. 如果用户没有指定结束时间，默认开始后 1 小时
10. 如果用户没有指定年份，默认使用当前年份 ${year}
11. "上午" ≈ 08:00-12:00, "下午" ≈ 12:00-18:00, "晚上" ≈ 18:00-24:00
12. "全天" 或 "一整天" → is_all_day = true
13. **日期最关键**：必须准确计算年月日。X月X日就是字面意思的月份和日期，不要多加一天或少一天。

## 日期计算示例（非常重要，请逐字遵守）
- "${year}年5月5日" → start_time = "${year}-05-05T09:00:00+08:00"
- "${year}年12月25日" → start_time = "${year}-12-25T09:00:00+08:00"
- 如果用户说"5月5日"，必须输出 "${year}-05-05"，**绝不能**输出 "${year}-05-06"

## 重要注意事项
- DELETE 操作的 match_keyword 是用于查找数据库中匹配事件的核心关键词，例如"出去玩"、"开会"、"吃饭"等。去除"删除"、"删去"、"取消"等动作词和时间词。
- 如果用户只说"删除今天的行程"而没有指定具体事件，match_keyword 可以为空（表示删除当天所有事件）。
- DELETE/UPDATE 操作中，如果用户未指定日期，match_date 默认为 ${today}。
- 如果用户明确包含"删除"/"删去"/"去掉"/"取消"/"移除"等词，必须判定为 delete，不可判定为 create。
- 如果用户明确包含"修改"/"改成"/"改到"/"更新"等词，必须判定为 update。
- 只有当用户完全没有删除或修改意图时，才判定为 create。

## 示例
用户: "明天下午三点开会"
输出: {"action":"create","title":"开会","start_time":"${getTomorrow()}T15:00:00+08:00","end_time":"${getTomorrow()}T16:00:00+08:00","is_all_day":false}

用户: "把今天出去玩的行程删去"
输出: {"action":"delete","title":"出去玩","match_keyword":"出去玩","match_date":"${today}","start_time":"${today}T00:00:00+08:00","end_time":"${today}T23:59:00+08:00","is_all_day":false}

用户: "把明天的会议改到后天"
输出: {"action":"update","title":"会议","match_keyword":"会议","match_date":"${getTomorrow()}","start_time":"${getDayAfterTomorrow()}T09:00:00+08:00","end_time":"${getDayAfterTomorrow()}T10:00:00+08:00","is_all_day":false}

用户: "下周二全天团建"
输出: {"action":"create","title":"团建","start_time":"${getNextWeekday(2)}T00:00:00+08:00","end_time":"${getNextWeekday(2)}T23:59:00+08:00","is_all_day":true}`;
}

function getTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

function getDayAfterTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().split("T")[0];
}

function getNextWeekday(targetDay: number): string {
  // targetDay: 0=Sun, 1=Mon, ..., 6=Sat
  const d = new Date();
  const currentDay = d.getDay();
  const daysUntil = (targetDay - currentDay + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntil);
  return d.toISOString().split("T")[0];
}

/**
 * 兜底纠正：如果原文明确包含删除/修改关键词但 LLM 返回了错误的 action，
 * 则用关键词检测结果覆盖 LLM 的判断。
 */
function correctAction(
  llmAction: string,
  rawText: string,
  _parsed: Record<string, unknown>
): LlmAction {
  const deleteKeywords = /删[除去掉]|去掉|取消|移除|不要了|删除/;
  const updateKeywords = /修改|改成?|改到|改一下|更新|变更/;

  const hasDelete = deleteKeywords.test(rawText);
  const hasUpdate = updateKeywords.test(rawText);

  if (hasDelete && llmAction !== "delete") {
    console.warn(`[LLM] ⚠️ 原文包含删除关键词但LLM返回 action="${llmAction}"，强制修正为 delete`);
    return "delete";
  }
  if (hasUpdate && llmAction !== "update" && !hasDelete) {
    console.warn(`[LLM] ⚠️ 原文包含修改关键词但LLM返回 action="${llmAction}"，强制修正为 update`);
    return "update";
  }
  return llmAction as LlmAction;
}

/**
 * 兜底纠正日期：从原文提取"X月X日"格式的明确日期，
 * 如果 LLM 返回的日期与之不符，强制修正。
 */
function correctDate(
  rawText: string,
  parsed: Record<string, unknown>
): { start_time: string; end_time: string; match_date?: string } {
  let month = 0;
  let day = 0;

  // 1) 先匹配阿拉伯数字：6月1日、12月25号
  let md = rawText.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/);
  if (md) {
    month = parseInt(md[1]);
    day = parseInt(md[2]);
  } else {
    // 2) 不匹配则尝试中文数字：六月一日、十二月二十五号
    const cnDigits: Record<string, number> = {
      一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,
      十一:11,十二:12,十三:13,十四:14,十五:15,十六:16,十七:17,十八:18,十九:19,
      二十:20,二十一:21,二十二:22,二十三:23,二十四:24,二十五:25,二十六:26,二十七:27,二十八:28,二十九:29,
      三十:30,三十一:31,
    };
    // 月份：一到十二 月
    md = rawText.match(/(一|二|三|四|五|六|七|八|九|十|十一|十二)月\s*(一|二|三|四|五|六|七|八|九|十|十一|十二|十三|十四|十五|十六|十七|十八|十九|二十|二十一|二十二|二十三|二十四|二十五|二十六|二十七|二十八|二十九|三十|三十一)[日号]/);
    if (md) {
      month = cnDigits[md[1]] || 0;
      day = cnDigits[md[2]] || 0;
    }
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return { start_time: parsed.start_time as string, end_time: parsed.end_time as string, match_date: parsed.match_date as string | undefined };

  const now = new Date();
  const year = now.getFullYear();
  const expectedDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const llmDate = String(parsed.start_time || "").split("T")[0];

  if (llmDate !== expectedDate) {
    console.warn(`[LLM] ⚠️ 日期纠正: 原文"${md![0]}"→期望 ${expectedDate}，LLM返回 ${llmDate}，强制修正`);

    // 保留 LLM 返回的时间部分，只替换日期
    const startTime = String(parsed.start_time || "");
    const endTime = String(parsed.end_time || "");
    const timePart = startTime.includes("T") ? startTime.split("T")[1] : "09:00:00+08:00";
    const endTimePart = endTime.includes("T") ? endTime.split("T")[1] : "23:59:00+08:00";

    return {
      start_time: `${expectedDate}T${timePart}`,
      end_time: `${expectedDate}T${endTimePart}`,
      match_date: expectedDate,
    };
  }

  return { start_time: parsed.start_time as string, end_time: parsed.end_time as string, match_date: parsed.match_date as string | undefined };
}

export async function parseVoiceCommand(text: string): Promise<ParsedEvent | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[LLM] DEEPSEEK_API_KEY not set, using fallback parser");
    return fallbackParser(text);
  }

  try {
    const response = await axios.post(
      `${DEEPSEEK_BASE_URL}/chat/completions`,
      {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: text },
        ],
        temperature: 0.1,
        max_tokens: 500,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const content = response.data.choices?.[0]?.message?.content || "";
    console.log("[LLM] Raw response:", content);

    // Extract JSON from response (may be wrapped in markdown code block)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    // ── 兜底纠正：如果原文明确包含删除/修改关键词，强制修正 action ──
    const action = correctAction(parsed.action || "create", text, parsed);

    // ── 兜底纠正日期：如果原文有"X月X日"但LLM日期不对，强制修正 ──
    const corrected = correctDate(text, parsed);

    return {
      action,
      title: parsed.title || "未命名事件",
      start_time: corrected.start_time || parsed.start_time || new Date().toISOString(),
      end_time: corrected.end_time || parsed.end_time || new Date(Date.now() + 3600000).toISOString(),
      is_all_day: parsed.is_all_day || false,
      match_keyword: parsed.match_keyword || undefined,
      match_date: corrected.match_date || parsed.match_date || undefined,
    };
  } catch (error: any) {
    console.error("[LLM] DeepSeek API error:", error.message);
    // Fallback to simple parser
    return fallbackParser(text);
  }
}

/** 简易回退解析器（不需要 API Key） */
function fallbackParser(text: string): ParsedEvent {
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  // ── 检测操作意图 ──
  const deleteKeywords = /删[除去掉]|去掉|取消|移除|不要了|删除/;
  const updateKeywords = /修改|改成?|改到|改一下|更新|变更/;
  let action: LlmAction = "create";

  if (deleteKeywords.test(text)) {
    action = "delete";
  } else if (updateKeywords.test(text)) {
    action = "update";
  }

  // ── 提取日期 ──
  let targetDate = today;
  if (text.includes("明天")) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    targetDate = d.toISOString().split("T")[0];
  } else if (text.includes("后天")) {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    targetDate = d.toISOString().split("T")[0];
  } else if (text.includes("大后天")) {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    targetDate = d.toISOString().split("T")[0];
  } else {
    // 明确日期：6月1日、六月一日、12月25号
    const year = now.getFullYear();
    // 阿拉伯数字
    let md = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/);
    if (md) {
      const m = parseInt(md[1]), d = parseInt(md[2]);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        targetDate = `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    } else {
      // 中文数字
      const cn: Record<string, number> = {
        一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,十一:11,十二:12,
        十三:13,十四:14,十五:15,十六:16,十七:17,十八:18,十九:19,
        二十:20,二十一:21,二十二:22,二十三:23,二十四:24,二十五:25,二十六:26,二十七:27,二十八:28,二十九:29,
        三十:30,三十一:31,
      };
      md = text.match(/(一|二|三|四|五|六|七|八|九|十|十一|十二)月\s*(一|二|三|四|五|六|七|八|九|十|十一|十二|十三|十四|十五|十六|十七|十八|十九|二十|二十一|二十二|二十三|二十四|二十五|二十六|二十七|二十八|二十九|三十|三十一)[日号]/);
      if (md) {
        const m = cn[md[1]], d = cn[md[2]];
        if (m && d) targetDate = `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }
  }

  // ── 提取时间 ──
  let hour = 9;
  let isAllDay = false;
  if (text.includes("全天") || text.includes("一整天")) {
    isAllDay = true;
  }
  const timeMatch = text.match(/(上午|下午|晚上)?\s*(\d{1,2})点(半|(\d+)分)?/);
  if (timeMatch) {
    const period = timeMatch[1] || "上午";
    hour = parseInt(timeMatch[2]);
    if (period === "下午" && hour < 12) hour += 12;
    if (period === "晚上" && hour < 18) hour += 12;
  }

  // ── 提取标题 / 匹配关键词 ──
  const actionWords = /删[除去掉]|去掉|取消|移除|不要了|删除|修改|改成?|改到|改一下|更新|变更/;
  let title = text
    .replace(/今天|明天|后天|大后天/g, "")
    .replace(/上午|下午|晚上/g, "")
    .replace(/\d{1,2}点(半|(\d+)分)?/g, "")
    .replace(/帮我记一下|提醒我|安排|行程/g, "")
    .replace(actionWords, "")
    .replace(/把|的|了/g, "")
    .replace(/^\s*[,，。.\s]+/, "")
    .trim();

  if (!title || title.length < 2) {
    title = action === "delete" ? "" : "未命名日程";
  }

  const startTime = `${targetDate}T${String(hour).padStart(2, "0")}:00:00+08:00`;
  const endHour = isAllDay ? 23 : hour + 1;
  const endTime = `${targetDate}T${String(endHour).padStart(2, "0")}:${isAllDay ? "59" : "00"}:00+08:00`;

  return {
    action,
    title,
    start_time: startTime,
    end_time: endTime,
    is_all_day: isAllDay,
    match_keyword: action !== "create" ? title : undefined,
    match_date: action !== "create" ? targetDate : undefined,
  };
}
