# Voice Calendar — 语音日历 PRD v3.0 (精简版)

> 版本：v3.0 | 日期：2026-05-31 | 范围：1 天 MVP

## 一句话描述

**对着日历说话 → 自动识别 → 日程写入日历。**

## MVP 范围

```
✅ 做                           ❌ 不做
─────────────────────────       ─────────────────────
• 月视图日历（react-calendar）   • TTS 语音播报
• 按住说话 / 唤醒词触发录音       • 冲突检测
• 阿里云 ASR 语音→文本            • UPDATE / DELETE 指令
• DeepSeek LLM 文本→日程 JSON    • 周/日视图
• SQLite 存储日程                 • 用户登录
• Porcupine 离线唤醒词            • 提醒推送
• 文字反馈（不用 TTS）            • iOS / Android
```

## 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 前端 | React 18 + Vite | 轻量，30 秒脚手架 |
| 日历 | react-calendar | 成熟组件，开箱即用 |
| 后端 | Express + ws | 极简，单文件可启动 |
| 数据库 | SQLite (sql.js) | 零配置，纯 JS/WASM |
| ASR | 阿里云 NLS API | 中文识别准确 |
| LLM | DeepSeek API | 中文理解强，便宜 |
| 唤醒 | @picovoice/porcupine-web | WASM，本地运行 |

## 核心流程

```
用户按住说话 → 录音 → WebSocket → 后端
  → 阿里云 ASR (语音→文本)
  → DeepSeek LLM (文本→结构化日程)
  → 存入 SQLite
  → 日历自动刷新，高亮新日程
```

## 项目结构

```
voice-calendar/
├── client/       # React + Vite 前端
│   └── src/
│       ├── App.tsx
│       ├── components/  (Calendar, RecordButton, EventList, WakeIndicator)
│       └── hooks/       (useRecorder, useWebSocket, usePorcupine)
├── server/       # Express 后端
│   ├── index.ts  (Express + WebSocket)
│   ├── asr.ts    (阿里云 ASR)
│   ├── llm.ts    (DeepSeek LLM)
│   └── db.ts     (SQLite)
└── .env          (API Keys)
```

## 启动方式

```bash
# 1. 配置 API Keys
cp .env.example .env   # 填入阿里云 + DeepSeek 密钥

# 2. 安装依赖
npm run install:all

# 3. 启动（前后端同时）
npm run dev

# 前端: http://localhost:5173
# 后端: http://localhost:3001
```

## 环境变量

- `ALIBABA_CLOUD_ACCESS_KEY_ID` — 阿里云 AccessKey
- `ALIBABA_CLOUD_ACCESS_KEY_SECRET` — 阿里云 SecretKey
- `ALIBABA_NLS_APP_KEY` — 阿里云 NLS 项目 AppKey
- `DEEPSEEK_API_KEY` — DeepSeek API Key

未配置时使用 Mock 模式（内置演示数据），可先体验完整链路。

## 备注

- 原始完整 PRD 见 `Voice-Calendar-产品需求文档.md`
- Porcupine 唤醒词需在 Picovoice Console 生成 `.ppn` 文件放入 `client/src/wake/`
- 无 .ppn 文件时自动降级为手动点击录音，不影响核心功能
