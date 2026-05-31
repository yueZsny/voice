# 🎤 Voice Calendar — 语音日历

说一句话，轻松管理日程。

## 快速开始

### 1. 环境要求

- Node.js >= 18
- 浏览器（Chrome / Edge 推荐，需要麦克风权限）

### 2. 安装 & 启动

```bash
# 安装所有依赖
cd server && npm install && cd ../client && npm install && cd ..
npm install

# 同时启动前后端
npm run dev
```

- 前端: http://localhost:5173
- 后端: http://localhost:3001

### 3. 配置 API Keys（可选）

不配置也能体验完整链路（使用 Mock 模式）：

```bash
cp .env.example .env  # 编辑填入真实 Keys
```

| 变量 | 说明 | 不配置时 |
|------|------|---------|
| `ALIBABA_CLOUD_ACCESS_KEY_ID` | 阿里云 AccessKey | 使用 Mock 语音识别 |
| `ALIBABA_CLOUD_ACCESS_KEY_SECRET` | 阿里云 SecretKey | 同上 |
| `ALIBABA_NLS_APP_KEY` | 阿里云 NLS AppKey | 同上 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | 使用简易规则解析器 |

### 4. 使用方式

1. **按住说话**: 按住录音按钮 → 说出日程 → 松开 → 自动识别并写入日历
2. **唤醒词**（可选）: 开启唤醒功能 → 说"Porcupine" → 自动开始录音

## 项目结构

```
voice-calendar/
├── client/                  # React + Vite 前端
│   └── src/
│       ├── App.tsx          # 主入口，组装全部组件
│       ├── components/      # UI 组件
│       │   ├── Calendar.tsx      # 月视图日历
│       │   ├── RecordButton.tsx  # 录音按钮
│       │   ├── EventList.tsx     # 日程列表
│       │   └── WakeIndicator.tsx # 唤醒状态指示灯
│       └── hooks/           # 自定义 Hooks
│           ├── useRecorder.ts    # MediaRecorder 封装
│           ├── useWebSocket.ts   # WebSocket 连接管理
│           └── usePorcupine.ts   # Porcupine 离线唤醒
├── server/                  # Express 后端
│   ├── index.ts             # 主入口 (Express + WebSocket)
│   ├── asr.ts               # 阿里云 ASR（Mock 降级）
│   ├── llm.ts               # DeepSeek LLM（简易解析器降级）
│   └── db.ts                # SQLite (sql.js)
├── .env                     # 环境变量
└── Voice-Calendar-产品需求文档-v3.md  # 精简版 PRD
```

## 技术栈

| 层 | 技术 |
|---|------|
| 前端框架 | React 18 + Vite |
| 日历组件 | react-calendar |
| 录音 | MediaRecorder API |
| 离线唤醒 | @picovoice/porcupine-web (WASM) |
| 后端框架 | Express + ws |
| 数据库 | SQLite (sql.js) |
| ASR | 阿里云 NLS (HTTP API) |
| LLM | DeepSeek API |

## 核心链路

```
按住说话 → 录音 (MediaRecorder)
  → WebSocket 发送音频 → Express 后端
  → 阿里云 ASR (语音→文本)
  → DeepSeek LLM (文本→结构化日程)
  → 存入 SQLite
  → WebSocket 返回结果 → 日历自动刷新
```

## License

MIT
