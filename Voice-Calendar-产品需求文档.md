# Voice Calendar — 语音日历产品需求文档 (PRD)

> 版本：v2.0  
> 日期：2026-05-30  
> 状态：初稿  
> 开发策略：**Web 优先，移动端后续** — 先以 Expo Web 在 PC 端打通语音→日历完整链路，验证核心体验后再移植到 iOS/Android
> 本期范围：**核心 MVP（语音录入 + 日历展示 + 离线 Porcupine 唤醒词）**

---

## 目录

1. [产品概述](#一产品概述)
2. [核心痛点与目标](#二核心痛点与目标)
3. [产品架构设计](#三产品架构设计)
4. [核心功能流程](#四核心功能流程)
5. [功能详细设计](#五功能详细设计)
6. [技术栈选型](#六技术栈选型)
7. [关键技术实现方案](#七关键技术实现方案)
8. [UI/UX 设计规范](#八uiux-设计规范)
9. [数据模型设计](#九数据模型设计)
10. [开发计划：1 天冲刺](#十开发计划1-天冲刺web-mvp)

---

## 一、产品概述

### 1.1 产品定位

**Voice Calendar（语音日历）** 是一款以语音交互为核心的日历工具，核心价值在于 **"解放双手"** 与 **"零门槛输入"**。用户无需在一层层 UI 界面中点击、切换、打字，只需一句话即可完成复杂的日程管理。

### 1.2 产品愿景

让日程管理像说话一样自然。用户在任何场景下（开车、做饭、走路、工作），都能通过语音快速完成日程的创建、查询、修改和删除，真正做到"听得懂、记得准、提醒及时"。

### 1.3 目标用户

| 用户类型 | 典型场景 | 核心需求 |
|---------|---------|---------|
| 白领 / 职场人士 | 会议安排、项目节点管理 | 快速记录、冲突检测、提醒 |
| 司机 / 外勤人员 | 驾驶中处理日程 | 纯语音交互、免提操作 |
| 家庭主妇 / 忙碌人群 | 做菜、带孩子时记录事项 | 模糊表达识别、极简操作 |
| 视障人士 | 无障碍使用日历 | 完全语音驱动、高反馈质量 |

---

## 二、核心痛点与目标

### 2.1 传统日历的四大痛点

| 痛点 | 描述 | 严重程度 |
|------|------|---------|
| **输入效率低** | 新建日程需手动输入标题、选择日期、设置起止时间、设置提醒，步骤繁琐 | ⭐⭐⭐⭐⭐ |
| **场景受限** | 开车、做饭、走路时无法安全方便地操作手机 | ⭐⭐⭐⭐ |
| **模糊表达难处理** | "下周三下午"、"明晚大后天"需手动换算为具体公历日期 | ⭐⭐⭐⭐ |
| **语音交互链路长** | 现有语音助手识别不准、交互笨拙、成功率低 | ⭐⭐⭐ |

### 2.2 核心目标

> **将用户的自然语言（语音），精准、快速地转化为结构化的日历事件。**

- **准确率目标**：标准普通话场景下，意图识别准确率 ≥ 95%
- **延迟目标**：从用户说完话到日程生效，端到端耗时 ≤ 1.5 秒
- **覆盖场景**：覆盖日程 CRUD（创建/查询/更新/删除）全流程

---

## 三、产品架构设计

### 3.1 整体架构图（完整版）

```
┌──────────────────────────────────────────────────────────────────────┐
│                    前端 (React Native / Expo Web)                     │
│  ┌──────────────┐  ┌───────────┐  ┌──────────┐  ┌───────────────┐   │
│  │ 语音采集      │  │ 日历视图   │  │ 事件预览  │  │ 设置/个性化   │   │
│  │ (MediaRecorder)│  │ (月/周/日) │  │ (卡片)    │  │ (提醒/语种)   │   │
│  └──────┬───────┘  └───────────┘  └──────────┘  └───────────────┘   │
│         │                                                             │
│  ┌──────▼───────┐                                                    │
│  │ 离线监听引擎  │  ← Porcupine (WASM)                               │
│  │ (唤醒词检测)  │    检测到"日历助手"后触发录音                     │
│  └──────────────┘                                                    │
│         │ 音频流 (WebSocket) / 文本 (WebSocket)                       │
└─────────┼────────────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     后端 (NestJS 单服务)                              │
│                                                                      │
│  ┌────────────┐    ┌────────────────┐    ┌──────────────────────┐   │
│  │ WebSocket  │    │ 阿里云 ASR      │    │ DeepSeek LLM         │   │
│  │ @nestjs/ws  │───→│ (@alicloud/nls) │───→│ (HTTP API)           │   │
│  │ 接收音频流  │    │ 语音 → 文本     │    │ 文本 → 结构化 JSON   │   │
│  └────────────┘    └────────────────┘    └──────────┬───────────┘   │
│                                                      │               │
│                                                      ▼               │
│  ┌────────────┐    ┌────────────────┐    ┌──────────────────────┐   │
│  │ 日历业务    │←───│ 冲突检测 / CRUD │←───│ 结构化 JSON          │   │
│  │ (TypeORM +  │    │                │    │                      │   │
│  │  SQLite)    │    │                │    │                      │   │
│  └────────────┘    └────────────────┘    └──────────────────────┘   │
│                                                      │               │
│                                                      ▼               │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │ 阿里云 TTS (@alicloud/nls) — 文本 → 语音播报                  │   │
│  └───────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 MVP 架构图（1 天版）

```
┌── 前端 (Expo Web) ───────────────────────────────────┐
│  ┌──────────┐   ┌──────────┐   ┌───────────────────┐ │
│  │ 录音按钮  │   │ 日历视图  │   │ 日程列表          │ │
│  │ (点击触发)│   │ (月视图)  │   │ (当天事件展示)    │ │
│  └────┬─────┘   └──────────┘   └───────────────────┘ │
│       │                                               │
│  ┌────▼─────┐  ← Porcupine WASM 离线监听              │
│  │ 唤醒词检测  │  "日历助手" → 自动触发录音              │
│  └──────────┘                                         │
│       │ 点击录音 / Porcupine 唤醒 → WebSocket 音频流    │
└───────┼──────────────────────────────────────────────┘
        │
        ▼
┌── NestJS 单服务 ─────────────────────────────────────┐
│  WS接收 → 阿里云 ASR → DeepSeek LLM → 写SQLite → TTS │
└──────────────────────────────────────────────────────┘
```

### 3.3 分层职责

| 层级 | 技术选型 | 核心职责 |
|------|---------|---------|
| **前端展示与交互层** | React Native (Expo) + Porcupine | 语音采集、离线唤醒、日历渲染、用户交互 |
| **后端服务层** | NestJS (Node.js，单服务) | WebSocket、ASR/LLM/TTS 编排、CRUD、冲突检测 |
| **数据层** | SQLite (通过 TypeORM) | 日程数据持久化（MVP 无需独立数据库服务） |

---

## 四、核心功能流程

### 4.1 添加日程 — 完整时序

```
用户                   前端                    后端 (NestJS)              阿里云/DeepSeek
 │                      │                          │                        │
 │  "录音按钮触发"       │                          │                        │
 │ ───────────────────> │                          │                        │
 │                      │ 音频流 (WebSocket)        │                        │
 │                      │ ───────────────────────> │                        │
 │                      │                          │ 阿里云 ASR API          │
 │                      │                          │ ──────────────────────> │
 │                      │                          │ <── "下周二下午两点到   │
 │                      │                          │      四点和张总开会"    │
 │                      │                          │                        │
 │                      │                          │ DeepSeek API            │
 │                      │                          │ ──────────────────────> │
 │                      │                          │ <── 结构化 JSON ─────── │
 │                      │                          │                        │
 │                      │                          │ 写 SQLite              │
 │                      │                          │ (无冲突，直接写入)      │
 │                      │                          │                        │
 │                      │  TTS音频 + 事件数据        │                        │
 │                      │ <─────────────────────── │                        │
 │                      │                          │                        │
 │  "好的，已为您安排好   │                          │                        │
 │   下周二下午两点和     │                          │                        │
 │   张总的会议。"        │                          │                        │
 │ <─────────────────────│                          │                        │
 │                      │                          │                        │
 │  日历视图刷新         │                          │                        │
 │  高亮新日程           │                          │                        │
```

### 4.2 日程查询流程

```
用户："我今天下午有什么安排？"

    ┌──────────────┐
    │ DeepSeek 解析 │
    │ action: QUERY │
    │ time: 今天    │
    │       下午    │
    └──────┬───────┘
           ▼
    ┌─────────────────┐
    │ SQLite 查询      │
    │ SELECT * FROM   │
    │ events WHERE    │
    │ start_time      │
    │ BETWEEN ? AND ? │
    └────────┬────────┘
             ▼
    ┌─────────────────┐
    │ TTS 播报日程列表  │
    │ 前端列表滚动至   │
    │ 对应位置         │
    └─────────────────┘
```

### 4.3 删除/修改日程流程（含确认机制）

```
用户："把明天下午的会取消掉"

    ┌─────────────────┐
    │ DeepSeek 解析    │
    │ action: DELETE   │
    │ time: 明天下午   │
    │ 模糊 → 需确认    │
    └────────┬────────┘
             ▼
    ┌─────────────────┐
    │ SQLite 查询      │
    │ 明天下午有几场？ │
    └────────┬────────┘
             ▼
    ┌──────────────────────────────────┐
    │ 多场 → 反问用户确认具体事件       │
    │ "明天下午有两场会，要取消         │
    │  三点的项目会还是四点的复盘会？"  │
    └──────────────────────────────────┘
             │
             ▼
    ┌──────────────────────────────────┐
    │ 用户确认 → 二次确认               │
    │ "即将删除'三点项目会'，确认吗？"  │
    │ 用户："确认"                     │
    └──────────────────────────────────┘
             │
             ▼
    ┌─────────────────┐
    │ SQLite DELETE    │
    │ TTS + UI 反馈    │
    └─────────────────┘
```

### 4.4 离线唤醒 — 完整时序

```
系统启动
  │
  ▼
Porcupine 引擎初始化 (WASM，本地加载唤醒词模型)
  │
  ▼
┌────────────────────────────────────────────┐
│ 始终监听麦克风 (纯本地，不上传任何音频)      │
│ CPU 占用 ~1-5%，无网络请求                  │
└────────────────────────────────────────────┘
  │
  │ 用户说："日历助手"
  ▼
检测到唤醒词
  │
  ├─ 播放提示音 (本地，无需网络)
  ├─ 震动反馈 (手机) / 闪烁 (Web)
  │
  ▼
启动录音 → WebSocket 发送音频流 → 云端 ASR/LLM 处理
  │
  ▼
播报结果后 → 回到 Porcupine 继续监听
```

---

## 五、功能详细设计

### 5.1 语音指令 CRUD 全覆盖

#### 5.1.1 创建 (CREATE)

| 用户指令示例 | LLM 解析结果 |
|-------------|-------------|
| "帮我记一下，下周二下午两点到四点和张总开会，提前15分钟提醒我" | `{action: CREATE, title: "和张总开会", start: "2026-06-02 14:00", end: "2026-06-02 16:00", reminder: {enable: true, offset: 15}}` |
| "明天早上九点去做核酸" | `{action: CREATE, title: "做核酸", start: "2026-05-31 09:00", end: "2026-05-31 10:00", reminder: {enable: false}}` |
| "大后天全天有个团建" | `{action: CREATE, title: "团建", start: "2026-06-01 00:00", end: "2026-06-01 23:59", is_all_day: true}` |

#### 5.1.2 查询 (QUERY)

| 用户指令示例 | LLM 解析结果 |
|-------------|-------------|
| "我今天下午有什么安排？" | `{action: QUERY, time_range: ["2026-05-30 12:00", "2026-05-30 23:59"]}` |
| "这周五有什么会？" | `{action: QUERY, time_range: ["2026-06-04 00:00", "2026-06-04 23:59"], keyword: "会"}` |
| "我下周一忙不忙？" | `{action: QUERY, time_range: ["2026-06-01 00:00", "2026-06-01 23:59"], need_summary: true}` |

#### 5.1.3 修改 (UPDATE)

| 用户指令示例 | LLM 解析结果 |
|-------------|-------------|
| "把明天下午三点的会改成四点" | `{action: UPDATE, query: {time: "明天下午3点"}, changes: {start_time: "2026-05-31 16:00"}}` |
| "后天的会议推迟一小时" | `{action: UPDATE, query: {date: "后天"}, changes: {delay_minutes: 60}}` |
| "把下周一的全天会议取消提醒" | `{action: UPDATE, query: {date: "下周一", is_all_day: true}, changes: {reminder: {enable: false}}}` |

#### 5.1.4 删除 (DELETE)

| 用户指令示例 | LLM 解析结果 |
|-------------|-------------|
| "把明天下午的会取消掉" | `{action: DELETE, time: "明天下午"}`（需确认具体事件） |
| "帮我删掉下周三的午餐约会" | `{action: DELETE, time: "下周三", keyword: "午餐"}` |

### 5.2 离线唤醒 — Porcupine

#### 5.2.1 为什么选择 Porcupine

| 对比项 | Porcupine | Vosk | Snowboy | 自研 TFLite |
|--------|-----------|------|---------|------------|
| **Web 支持** | ✅ WASM | ❌ 不支持 | ❌ 停维护 | 需自研 |
| **RN 支持** | ✅ npm 包 | ✅ 但复杂 | ❌ | 需自研 |
| **模型大小** | ~100KB | ~50MB+ | ❌ | 不定 |
| **中文唤醒词** | ✅ 可自训练 | ✅ | ❌ | 需数据 |
| **CPU 占用** | ~1-5% | ~10-20% | ❌ | 不定 |
| **免费** | ✅ 开源版 | ✅ | ❌ | ✅ |
| **集成难度** | 低，5 行代码 | 中 | ❌ | 高 |

#### 5.2.2 架构位置

```
前端层 (离线，持续运行)
┌──────────────────────────────────────────┐
│  Porcupine WASM 引擎                      │
│  ├─ 加载唤醒词模型 (.ppn 文件)             │
│  ├─ 访问麦克风 (getUserMedia)              │
│  ├─ 音频帧 → 推断 → 匹配唤醒词             │
│  └─ 触发回调 → 开始录音                    │
│                                           │
│  唤醒词：自定义中文"日历助手"               │
│  灵敏度：0.5 (可调 0-1)                   │
│  模型来源：Picovoice Console 自录制生成     │
└──────────────────────────────────────────┘
```

#### 5.2.3 唤醒后的流程

```
Porcupine 触发
  │
  ▼
┌─────────────────────┐
│ 播放"叮"提示音       │
│ (本地 audio 元素)    │
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ 打开 WebSocket 连接  │
│ 启动 MediaRecorder   │
│ 开始流式传输音频      │
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ 等待 ASR 返回结果    │
│ → LLM 解析          │
│ → 业务逻辑 → TTS    │
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ TTS 播报完成后       │
│ 关闭 WebSocket      │
│ 回到 Porcupine 监听  │
└─────────────────────┘
```

#### 5.2.4 唤醒词训练

Porcupine 提供两种方式：
1. **内置唤醒词**：免费，如 "Hey Google"、"Alexa"、"Porcupine"（英文）
2. **自定义唤醒词**：在 Picovoice Console 录制 3 段语音样本，生成 `.ppn` 文件，免费额度足够

### 5.3 会话状态机管理 (Session)

```
状态定义：
- IDLE: 空闲状态，等待新指令（或 Porcupine 监听中）
- AWAITING_CONFIRMATION: 等待用户确认（删除/修改前）
- AWAITING_DISAMBIGUATION: 等待用户消歧（多个匹配项）
- AWAITING_FOLLOWUP: 等待用户补充信息

状态转换图：

IDLE ──(收到指令)──> 解析指令
  │                      │
  │                      ├── 信息完整 → 执行业务逻辑
  │                      ├── 需确认 → AWAITING_CONFIRMATION
  │                      ├── 多匹配 → AWAITING_DISAMBIGUATION
  │                      └── 缺信息 → AWAITING_FOLLOWUP
  │
  └──(用户超时/取消)──> IDLE
```

### 5.4 交互闭环与容错机制

#### 5.4.1 双向确认机制

```
用户："把明天的会删掉"
系统："找到明天下午三点的'项目评审会'，确认删除吗？"
用户："确认"
系统："已删除'项目评审会'"
```

#### 5.4.2 兜底 UI 编辑

当 ASR 识别错误或 LLM 解析偏差时，用户可：
1. 在日历视图中点击事件卡片
2. 进入编辑模式进行键盘微调
3. 保存修改
4. **无需**重新语音输入

#### 5.4.3 错误处理策略

| 错误类型 | 处理策略 |
|---------|---------|
| ASR 识别置信度低 | 提示用户重说，或展示识别文本让用户确认 |
| LLM 无法解析意图 | "抱歉，我没有理解您的意思，请换个说法试试" |
| 时间解析超出范围 | "您说的时间超出了可预约范围（未来6个月），请重新确认" |
| 网络错误 | 本地缓存指令，网络恢复后自动重试 |

### 5.5 智能提醒系统（后续 Phase）

#### 5.5.1 多渠道触达

| 渠道 | 触发条件 | 实现方式 |
|------|---------|---------|
| 应用内弹窗 | 应用在前台 | WebSocket 实时推送 |
| 系统通知 | 应用在后台 | APNs (iOS) / FCM (Android) |
| 短信提醒 | 重要日程（用户预设） | 短信网关 API |
| 语音电话 | 超高优先级（如面试、就医） | 语音外呼 API |

#### 5.5.2 提醒时间策略

```
默认提醒：提前 15 分钟
会议类：  提前 15 分钟 + 提前 1 小时
全天事件：提前 1 天（早上 9:00）
自定义：  用户语音指定（"提前半小时提醒我"）
```

---

## 六、技术栈选型

### 6.1 前端 (Client)

| 技术 | 选型 | 理由 |
|------|------|------|
| 跨平台框架 | React Native (Expo) | Web / iOS / Android 三端一套代码 |
| 开发模式 | Expo Web 优先 | 一天内可见效果，hot reload 效率高 |
| 导航 | React Navigation | RN 社区主流方案 |
| 日历组件 | react-native-calendars | 社区主流 RN 日历库，月视图 + 日期标记 + 事件点开箱即用，Expo Web 兼容 |
| 录音 | 浏览器 MediaRecorder API | Web 端原生支持，无需第三方库 |
| 音频播放 | HTML5 `<audio>` 元素 | TTS 播报，浏览器原生支持 |
| 离线唤醒 | Porcupine (WASM) | 本地运行，模型小 ~100KB，支持自定义中文唤醒词 |
| 状态管理 | Zustand | 轻量、适合中型应用 |
| 本地存储 | localStorage / IndexedDB | 离线缓存、用户偏好 |
| WebSocket | 原生 WebSocket API / Socket.IO | 实时音频流传输 |
| UI 组件库 | react-native-paper (Material Design 3) | 成熟组件库，Button/Card/FAB/Dialog 全场景覆盖，官方支持 Expo Web |
| 动画 | CSS 过渡 / animation | Web 端可靠，性能好 |

### 6.2 后端 (Backend) — NestJS 单服务

| 技术 | 选型 | 理由 |
|------|------|------|
| 框架 | NestJS (Node.js) | 装饰器模式优雅，WebSocket 原生支持，社区成熟，TypeScript 强类型保障 |
| WebSocket | @nestjs/websockets + @nestjs/platform-socket.io | 双向实时音频流，天然支持房间/命名空间管理 |
| ASR SDK | @alicloud/nls-sdk | 阿里云官方 Node.js SDK，支持流式识别和 VAD |
| LLM API | DeepSeek-V3 (通过 axios/fetch) | 中文理解强，¥1/百万 token，HTTP 调用极简 |
| TTS SDK | @alicloud/nls-sdk | 统一 SDK，与 ASR 同一套鉴权和配置 |
| ORM | TypeORM | NestJS 官方推荐，支持 SQLite 驱动 |
| 数据库 | SQLite (better-sqlite3) | 零安装零配置，文件数据库，1 天 MVP 足够用 |
| 数据校验 | class-validator + class-transformer | NestJS 原生 Pipe，入参校验统一 |
| API 文档 | Swagger (@nestjs/swagger) | 自动生成文档，调试方便 |

### 6.3 为什么不需要 FastAPI（Python）

| 担心 | 实际情况 |
|------|---------|
| 阿里云 ASR 只有 Python SDK？ | ❌ `@alicloud/nls-sdk` 是官方 Node.js 包，ASR/TTS 全支持 |
| DeepSeek 需要 Python 才能调？ | ❌ 只是 HTTPS 请求，`axios` 一行的事 |
| LLM Prompt 管理需要 LangChain？ | ❌ 日历场景只需一次 Prompt 调用，LangChain 是过度设计 |
| Node.js 处理音频性能不行？ | ✅ NestJS 异步非阻塞，音频流转发到阿里云是网络 I/O 密集型，不是 CPU 密集型，Node.js 完全胜任 |

结论：NestJS 一个服务就能搞定 WebSocket + ASR + LLM + TTS + CRUD，不需要引入第二种语言增加运维成本。

---

## 七、关键技术实现方案

### 7.1 低延迟语音流方案

目标：端到端延迟 ≤ 1.5 秒

```
策略一：流式 ASR (Streaming ASR)
  前端 → (分片音频) → WebSocket → 阿里云 ASR 实时返回中间结果
  用户还在说话时，系统已开始识别

策略二：LLM 流式解析
  ASR 输出完整句子后，DeepSeek 开始解析
  流式输出 JSON，前端逐步渲染

策略三：预加载 + 缓存
  TTS 音频缓存（常见回复预合成）
  LLM Prompt 缓存（减少 API 调用）
```

### 7.2 LLM Prompt 设计

> MVP 阶段只启用 CREATE + QUERY，避免 LLM 输出不支持的 action

```system
你是一个专业的日历助手。你需要将用户的自然语言指令解析为结构化的 JSON 数据。

## 当前时间
{current_time} （时区：Asia/Shanghai）

## 支持的动作类型（MVP）
- CREATE: 创建新日程
- QUERY: 查询日程

## 输出格式（严格 JSON）
{
  "action": "CREATE" | "QUERY",
  "event_title": "事件标题（提取关键词）",
  "start_time": "ISO 8601 格式开始时间",
  "end_time": "ISO 8601 格式结束时间（可推算）",
  "is_all_day": false,
  "reminder": {
    "enable": true,
    "offset_minutes": 15
  },
  "needs_confirmation": false,
  "ambiguity": false
}

## 时间解析规则
1. "今天" = {today}
2. "明天" = {today + 1}
3. "后天" = {today + 2}
4. "大后天" = {today + 3}
5. "下周X" = 下个星期X
6. "X点" = X:00, "X点半" = X:30, "X点Y分" = X:Y
7. 如果没有结束时间，默认开始后 1 小时
8. 如果没有提醒，默认不开启
9. 如果没有年份，默认当前年份
10. "上午" = 08:00-12:00, "下午" = 12:00-18:00, "晚上" = 18:00-24:00
```

### 7.3 冲突检测算法

```
输入：用户ID, 新事件开始时间 S, 结束时间 E
输出：冲突事件列表

查询：
  SELECT * FROM events
  WHERE user_id = ?
    AND status = 'active'
    AND start_time < E
    AND end_time > S

结果为空 → 无冲突，直接添加
结果非空 → 返回冲突列表，由 LLM 生成冲突提示
```

### 7.4 会话上下文管理

```typescript
// NestJS 内存管理，MVP 阶段不持久化
interface SessionContext {
  sessionId: string;
  userId: string;
  state: 'IDLE' | 'AWAITING_CONFIRMATION' | 'AWAITING_DISAMBIGUATION' | 'AWAITING_FOLLOWUP';
  lastIntent?: Record<string, any>;
  pendingAction?: Record<string, any>;
  contextHistory: Array<{ role: string; message: string; timestamp: number }>;
  createdAt: number;
  expiresAt: number;
}

// 用 Map 存储在 NestJS Service 中
@Injectable()
export class SessionService {
  private sessions = new Map<string, SessionContext>();
  // ... CRUD 方法
}
```

### 7.5 Porcupine 离线唤醒集成

```
前端代码结构：

src/
  wake/
    porcupine.ts       # Porcupine WASM 引擎封装
    wakeword.ppn       # 自定义唤醒词模型文件
    keywords.txt       # 唤醒词列表
  audio/
    recorder.ts        # MediaRecorder 封装
    player.ts          # TTS 音频播放封装
  ws/
    websocket.ts       # WebSocket 客户端封装
  App.tsx              # 主入口

Porcupine 初始化 (porcupine.ts)：

import { PorcupineWorker } from "@picovoice/porcupine-web";

let porcupine: PorcupineWorker | null = null;

export async function initWakeWord(onWake: () => void) {
  porcupine = await PorcupineWorker.create({
    keyword: { custom: "/wake/wakeword.ppn", sensitivity: 0.5 },
  });
  await porcupine.start((keywordIndex) => {
    onWake();  // 触发录音 + ASR 流程
  });
}

export function stopWakeWord() {
  porcupine?.stop();
  porcupine?.release();
}
```

---

## 八、UI/UX 设计规范

### 8.1 页面结构

> 日历组件基于 react-native-calendars，通过 CalendarList 组件实现月视图，配置 markedDates 展示事件标记。搭配 react-native-paper 组件库实现统一 Material Design 3 风格。

```
┌─────────────────────────────────────┐
│  [状态栏 + 离线监听状态指示灯]         │
├─────────────────────────────────────┤
│  日历头部                            │
│  < 2026年5月 >                      │
│  日  一  二  三  四  五  六          │
├─────────────────────────────────────┤
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌───┐    │
│  │  1  │ │  2  │ │  3  │ │ 4 │    │
│  │ 劳动 │ │  ●  │ │     │ │   │    │
│  │ 节   │ │ 项目│ │     │ │   │    │
│  └─────┘ └─────┘ └─────┘ └───┘    │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌───┐    │
│  │  5  │ │  6  │ │  7  │ │ 8 │    │
│  │     │ │     │ │     │ │   │    │
│  └─────┘ └─────┘ └─────┘ └───┘    │
│  ...                               │
├─────────────────────────────────────┤
│  今日日程 (3项)                     │
│  ┌─────────────────────────────┐   │
│  │ 14:00 项目评审会             │   │
│  │ 15:30 与王总一对一           │   │
│  │ 19:00 健身                  │   │
│  └─────────────────────────────┘   │
├─────────────────────────────────────┤
│  [底部录音按钮 - 点击说话]           │
│  [离线监听指示灯 - 绿色:监听中]       │
└─────────────────────────────────────┘
```

### 8.2 语音交互 UI 状态

| 状态 | 按钮表现 | 辅助提示 | 离线监听状态 |
|------|---------|---------|------------|
| 空闲 (IDLE) | 麦克风图标，静态 | — | 🟢 监听中 |
| 录音中 (RECORDING) | 麦克风脉冲动画 | "正在聆听..." | 🔴 暂停 |
| 识别中 (PROCESSING) | 加载动画 | "正在识别..." | 🔴 暂停 |
| 确认中 (CONFIRMING) | 按钮可点击 | "请确认：..." | 🔴 暂停 |
| 反馈中 (FEEDBACK) | 播放动画 | TTS 播报 + 文字展示 | 🔴 暂停 |
| 错误 (ERROR) | 红色状态 | "抱歉，请重说" | 🔴 暂停（3秒后恢复）|

### 8.3 日历视图类型

| 视图 | 适用场景 | 交互方式 |
|------|---------|---------|
| 月视图 | 纵览全局 | 滚动手势，点击日期 |
| 周视图 | 查看周安排 | 左右滑动切换周 |
| 日视图 | 查看详细日程 | 上下滚动，时间轴 |
| 列表视图 | 快速浏览 | 垂直滚动列表 |

---

## 九、数据模型设计

### 9.1 用户表 (users)

```sql
CREATE TABLE users (
    id              TEXT PRIMARY KEY,
    phone           TEXT UNIQUE NOT NULL,
    nickname        TEXT DEFAULT '',
    avatar_url      TEXT DEFAULT '',
    timezone        TEXT DEFAULT 'Asia/Shanghai',
    language        TEXT DEFAULT 'zh-CN',
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);
```

### 9.2 日程表 (events)

```sql
CREATE TABLE events (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id),
    title           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    start_time      TEXT NOT NULL,    -- ISO 8601
    end_time        TEXT NOT NULL,    -- ISO 8601
    is_all_day      INTEGER DEFAULT 0, -- 0/1
    status          TEXT DEFAULT 'active',  -- active, cancelled, completed
    location        TEXT DEFAULT '',
    reminder_config TEXT DEFAULT '{}',     -- JSON string
    metadata        TEXT DEFAULT '{}',     -- JSON string，ASR原文/LLM解析结果
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_events_user_time ON events(user_id, start_time, end_time);
CREATE INDEX idx_events_status ON events(status);
```

### 9.3 提醒记录表 (reminders) — 后续 Phase

```sql
CREATE TABLE reminders (
    id              TEXT PRIMARY KEY,
    event_id        TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES users(id),
    remind_at       TEXT NOT NULL,
    channel         TEXT DEFAULT 'push',   -- push, sms, phone
    status          TEXT DEFAULT 'pending', -- pending, sent, failed
    sent_at         TEXT,
    fail_reason     TEXT DEFAULT '',
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_reminders_remind_at ON reminders(remind_at, status);
```

### 9.4 会话表 (sessions) — NestJS 内存

```typescript
// 用 NestJS Service + Map 管理，MVP 阶段不持久化

@Injectable()
export class SessionService {
  private sessions = new Map<string, SessionContext>();

  get(sessionId: string): SessionContext | undefined {
    return this.sessions.get(sessionId);
  }

  set(sessionId: string, ctx: SessionContext): void {
    this.sessions.set(sessionId, ctx);
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

interface SessionContext {
  sessionId: string;
  userId: string;
  state: 'IDLE' | 'AWAITING_CONFIRMATION' | 'AWAITING_DISAMBIGUATION' | 'AWAITING_FOLLOWUP';
  lastIntent?: Record<string, any>;
  pendingAction?: Record<string, any>;
  contextHistory: Array<{ role: string; message: string; timestamp: number }>;
  createdAt: number;
  expiresAt: number;
}
```

---

## 十、开发计划：1 天冲刺（Web MVP）

> 目标：用 RN (Expo Web) 在 PC 浏览器上跑通语音→日历的核心链路。

### 第 1 步：项目初始化 + UI 组件集成 + 日历组件 + 离线唤醒（3 小时）

| 任务 | 交付物 |
|------|--------|
| `npx create-expo-app voice-calendar` 初始化，安装 `react-native-paper` + `react-native-calendars` + `@picovoice/porcupine-web` | 浏览器 `localhost:8081` 可访问，Paper 主题生效 |
| 基于 CalendarList 搭建月视图，配置 markedDates 事件标记和 onDayPress | 月视图正常渲染，可切换月份，事件日有圆点标记 |
| 搭建日程列表 + 事件卡片（使用 Paper Card + List） | 选中日期后展示该日事件卡片列表 |
| 搭建底部录音 FAB + 语音状态指示器（使用 Paper FAB + IconButton） | 点击录音、松开停止，状态切换动画 |
| 集成 Porcupine 离线唤醒：初始化 WASM 引擎 + 加载唤醒词模型 + 音频流回调 | 唤醒词"日历助手"触发录音启动，状态指示灯切换 |

> 日历基于 react-native-calendars 的 CalendarList 组件，通过 markedDates prop 标记事件日。Porcupine 使用 @picovoice/porcupine-web 的 PorcupineWorker（WASM 线程），初始化约 200ms，运行时 CPU 占用 ~1-5%。

### 第 2 步：NestJS 后端（3 小时）

| 任务 | 交付物 |
|------|--------|
| `nest new voice-calendar-server` 初始化，安装 WebSocket + TypeORM + SQLite 依赖 | `npm run start:dev` 可启动 |
| 实现 WebSocket Gateway，接收音频 → 返回 JSON + TTS | 前后端链路打通 |
| 集成阿里云 @alicloud/nls-sdk (ASR) + DeepSeek API (axios) | 语音 → 文本 → 结构化 JSON |
| 定义 Event Entity，TypeORM 同步 SQLite 建表 | 数据可持久化 |
| 集成阿里云 @alicloud/nls-sdk (TTS) | 返回 TTS 音频 |

### 第 3 步：端到端联调（2 小时）

| 任务 | 说明 |
|------|------|
| 前端录音→WS→ASR→LLM→SQLite→TTS→播放 | 完整的"帮我记一下明天下午三点开会"闭环 |
| ASR 识别文本展示 | 前端展示 ASR 原文，用户可确认/修改 |
| 日程列表刷新 | 新日程写入后前端自动刷新 |

### 第 4 步：打磨（剩余时间）

| 任务 | 说明 |
|------|------|
| 语音状态可视化 | 空闲/录音中/识别中/反馈中 状态切换 |
| 错误处理 | ASR/LLM 超时、网络断开 |
| README | 启动方式、环境变量配置、演示步骤 |

### 非本次范围

- iOS / Android 原生端适配
- 通知推送（APNs / FCM）
- UPDATE / DELETE 语音指令
- 用户登录鉴权
- 提醒系统
- 日历多视图（周/日视图）

---

## 附录

### A. 关键术语表

| 术语 | 说明 |
|------|------|
| ASR | Automatic Speech Recognition，自动语音识别 |
| TTS | Text-to-Speech，文本转语音 |
| VAD | Voice Activity Detection，语音活动检测 |
| LLM | Large Language Model，大语言模型 |
| NLU | Natural Language Understanding，自然语言理解 |
| WASM | WebAssembly，浏览器端高性能二进制执行环境 |
| Porcupine | Picovoice 推出的离线唤醒词引擎，支持 WASM/RN |

### B. 参考资源

- [React Native (Expo) 官方文档](https://reactnative.dev/)
- [NestJS 官方文档](https://docs.nestjs.com/)
- [@alicloud/nls-sdk (阿里云 ASR / TTS Node.js SDK)](https://help.aliyun.com/document_detail/452185.html)
- [DeepSeek 官方文档](https://platform.deepseek.com/)
- [TypeORM 官方文档](https://typeorm.io/)
- [Porcupine React Native SDK](https://github.com/Picovoice/porcupine/tree/master/binding/react-native)
- [Picovoice Console (自定义唤醒词训练)](https://console.picovoice.ai/)
