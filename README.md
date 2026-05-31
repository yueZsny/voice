# 🎤 Voice Calendar — 语音日历

说一句话，轻松管理日程。支持 Web 端 + Chrome 扩展。

## 快速开始

### 1. 环境要求

- Node.js >= 18
- 浏览器（Chrome / Edge，需要麦克风权限）

### 2. 安装 & 启动

```bash
# 安装所有依赖
cd server && npm install && cd ../client && npm install && cd ..
npm install

# 启动后端
cd server && npm run dev

# 新终端，启动前端
cd client && npm run dev
```

- 前端: http://localhost:5173
- 后端: http://localhost:3001

### 3. 配置 API Keys（可选）

不配置也能体验完整链路（使用 Mock / 简易解析器）：

```bash
cp .env.example .env  # 编辑填入真实 Keys
```

| 变量 | 说明 | 不配置时 |
|------|------|---------|
| `ALIBABA_CLOUD_ACCESS_KEY_ID` | 阿里云 AccessKey | 使用 Mock 语音识别 |
| `ALIBABA_CLOUD_ACCESS_KEY_SECRET` | 阿里云 SecretKey | 同上 |
| `ALIBABA_NLS_APP_KEY` | 阿里云 NLS AppKey | 同上 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | 使用简易规则解析器 |

### 4. Chrome 扩展

```bash
# 构建扩展
cd extension && npm install && npx vite build --config vite.config.ts

# Chrome 加载
# chrome://extensions → 开发者模式 → 加载已解压 → 选 extension/dist/
```

- 点击工具栏图标 → 侧边栏滑出
- 点录音按钮 → 弹出录音窗口 → 授权麦克风 → 开始说话 → 点停止
- 日程实时同步到侧边栏

## 项目结构

```
voice-calendar/
├── client/                      # React 19 + Vite 8 前端
│   └── src/
│       ├── App.tsx              # 主入口，三栏布局
│       ├── config.ts            # 统一配置（Web / 扩展模式切换）
│       ├── components/
│       │   ├── Calendar.tsx          # 月视图日历 (react-calendar)
│       │   ├── RecordButton.tsx      # 录音按钮
│       │   ├── EventList.tsx         # 日程列表（支持手动删除/编辑）
│       │   └── EventEditModal.tsx    # 日程编辑弹窗
│       └── hooks/
│           ├── useRecorder.ts             # MediaRecorder 封装（Web 模式）
│           ├── useExtensionRecorder.ts    # 扩展模式录音（chrome.runtime）
│           └── useWebSocket.ts            # WebSocket 连接 + 结果处理
├── extension/                   # Chrome 扩展 (Manifest V3)
│   ├── manifest.json            # 扩展配置（侧边栏 + 录音弹窗）
│   ├── service-worker.js        # Service Worker（生命周期 + 消息中继）
│   ├── record.html / record.js  # 独立录音弹窗（直连 WebSocket）
│   ├── vite.config.ts           # 扩展构建配置（base:"./" + VITE_EXTENSION）
│   └── icons/                   # 扩展图标
├── server/                      # Express 后端
│   ├── index.ts                 # 主入口 (Express + WebSocket + REST API)
│   ├── asr.ts                   # 阿里云 NLS ASR（Mock 降级）
│   ├── llm.ts                   # DeepSeek LLM（简易解析器降级 + 日期纠正）
│   └── db.ts                    # SQLite (sql.js)
├── .env                         # 环境变量
└── package.json                 # 根脚本（dev / build:extension）
```

## 技术栈

| 层 | 技术 |
|---|------|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 8 |
| 日历组件 | react-calendar |
| 录音 | MediaRecorder API + AudioContext（WebM → WAV） |
| 后端框架 | Express + ws (WebSocket) |
| 数据库 | SQLite (sql.js WASM) |
| ASR | 阿里云 NLS 一句话识别 |
| LLM | DeepSeek API（chat/completions） |
| 扩展框架 | Chrome Extension Manifest V3（Side Panel + Popup Window） |

## 核心链路

```
Web 端：
  点击录音 → getUserMedia → MediaRecorder
    → WebSocket 分块发送音频 → Express 后端
    → ffmpeg WebM→WAV（如需要）
    → 阿里云 ASR（语音 → 文本）
    → DeepSeek LLM（文本 → 结构化日程 + 操作判断）
    → SQLite CRUD
    → WebSocket 返回结果 → 前端实时更新

扩展端：
  侧边栏点录音 → Service Worker → 打开录音弹窗
    → 弹窗 getUserMedia（权限弹窗可见）
    → 弹窗直连 WebSocket → 发送音频 → 后端处理
    → 后端结果通过 WS 返回弹窗
    → 弹窗 chrome.runtime 转发 → 侧边栏实时更新
```

## LLM 支持的语音指令

| 类型 | 示例 |
|------|------|
| 创建日程 | "明天下午三点开会"、"下周二全天团建" |
| 删除日程 | "把今天出去玩的行程删去"、"取消明天的会议" |
| 修改日程 | "把明天的会议改到后天" |

LLM 自动解析日期：今天/明天/后天/大后天/下周X/X月X日，支持阿拉伯数字和中文数字。

## 数据库表

```sql
CREATE TABLE events (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  start_time  TEXT NOT NULL,   -- ISO 8601
  end_time    TEXT NOT NULL,
  is_all_day  INTEGER DEFAULT 0,
  asr_text    TEXT DEFAULT '',  -- 原始语音识别文本
  created_at  TEXT DEFAULT (datetime('now', 'localtime'))
);
```

## REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/events?date=YYYY-MM-DD` | 按日期查询日程 |
| GET | `/api/events?year=YYYY&month=MM` | 按月份查询日程 |
| DELETE | `/api/events/:id` | 删除日程 |
| PUT | `/api/events/:id` | 更新日程 |

