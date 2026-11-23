# TalentFlow SCRM for LinkedIn

面向 LinkedIn 招聘人员的 SCRM（社交客户关系管理）工具：通过 Chrome 扩展自动采集 LinkedIn 聊天消息与候选人资料，配合管道看板、跟进任务、外联序列与 AI 消息生成，帮助 recruiter 系统化跟进候选人。

项目分两部分：

- **Java 后端**（`com.scrm`）：Spring Boot 3.3.5 / Java 21 / MyBatis + MySQL，提供 REST API、AI 消息生成、支付订阅
- **Chrome MV3 扩展**（`extension/`）：注入 linkedin.com，采集聊天消息并同步到后端，popup 提供管理界面

## 架构与数据流

```
LinkedIn 页面（聊天/Profile）
      │  content.js 注入，监听聊天 DOM 变化，提取候选人姓名与收发消息
      ▼
chrome.runtime.sendMessage({type: "CHAT_MESSAGE"})
      │  background.js（Service Worker）携带 X-User-Id（本地 UUID）
      ▼
POST /api/v1/chat-messages ──► 按 UUID 找/建用户，按名字找/建候选人（进入 unclaimed 暂存池）──► MySQL
      │
      ▼
popup（管理界面）/ 根目录 HTML 原型
```

- 用户标识：扩展首次运行时生成 UUID 存 `chrome.storage.local`，后续所有请求通过 `X-User-Id` 头传递，可再绑定邮箱+密码
- 管道阶段（`PipelineStageEnum`）：`unclaimed`（暂存池）→ `new` → `messaged` → `talking` → `done`，外加 `delete`；前四级展示在看板
- AI 消息生成（`service/ai/`）：「策略分析 → 生成 → 审校优化」三段式 pipeline，prompt 模板在 `src/main/resources/prompts/`，通过 Spring AI 以 OpenAI 兼容协议调用阿里云百炼 qwen-plus

## 目录结构

```
extension/            Chrome MV3 扩展（manifest v3，版本 2.0.1）
  content.js          注入 LinkedIn 页面：聊天消息抓取、Profile 解析、shadow DOM 穿透
  background.js       Service Worker：消息中转，向后端 POST 聊天消息/候选人，上报埋点
  api.js              popup 的 API 客户端（前后端字段互转、资源封装）
  db.js               chrome.storage.local 封装，ensureUserId() 生成本地 UUID
  popup.html/js       扩展主界面：候选人列表、管道看板、跟进任务、序列、AI 生成、订阅
src/main/java/com/scrm/
  controller/         REST 接口（/api/v1 前缀）
  service/            业务逻辑（含 service/ai/ 三段式 AI pipeline）
  service/PaddleApiService、PaddleWebhookVerifier   Paddle 支付与 webhook 签名校验
  dao/                MyBatis Mapper 接口
  entity/             MyBatis Generator 生成的实体与 Example 查询类
src/main/resources/
  application.yml     本地配置（MySQL、AI、Paddle、Resend）
  application-prod.yml 生产配置
  static/             后端托管页面：checkout.html、payment/、ai.html、refund.html
tables.sql            建库建表（12 张表）+ 预置订阅套餐
migrations/           预留迁移目录（当前为空）
接口.md               API 文档（13 章）
index.html            Tailwind 静态交互原型（Dashboard/Candidates/Pipeline/Sequences）
message.html、profile.html   LinkedIn 页面 HTML 快照（content.js 选择器开发用 fixture）
build-extension.js    扩展打包脚本（test/prod 环境）
start-linkedin-scrm.sh  启动脚本（nohup mvn spring-boot:run，日志写 app.log）
```

## 数据库（MySQL，共 12 张表）

| 表 | 用途 |
|---|---|
| `users` | 用户（浏览器 UUID 唯一标识），邮箱登录、时区、每日 AI 用量计数 |
| `subscription_plans` | 订阅套餐：free / pro_monthly($29/月) / pro_yearly($290/年) / pro_beta（赠送体验版） |
| `subscriptions` / `orders` | 用户订阅（Paddle + Stripe 双兼容字段）与订单 |
| `candidates` / `candidate_notes` / `candidate_history` | 候选人、笔记、历史记录 |
| `sequences` / `sequence_steps` / `candidate_sequences` | 外联序列（多步跟进自动化）及候选人入列状态 |
| `events` | 扩展埋点（如 `candidate_imported_chat`） |
| `email_verifications` | 邮箱验证码 |

## 主要 API（均 `/api/v1` 前缀）

- `CandidateController` `/candidates`：CRUD、`by-linkedin-id`、今日跟进任务、管道阶段流转、跟进设置
- `ChatMessageController` `/chat-messages`：扩展自动同步聊天消息
- `SequenceController` `/sequences`：序列 CRUD、`/candidate-sequences/{id}/advance` 推进候选人
- `AiMessageController` `POST /candidates/{id}/ai-messages`：AI 生成消息
- `OverviewController` `/overview`：候选人 360 概览
- `UserController` `/user`：`/me`、发送验证码、绑定邮箱（Resend 发信）
- `SubscriptionController` `/subscription`：套餐/当前订阅/结账/取消；`WebhookController` `/webhooks/paddle`：Paddle 支付回调
- `EventController` `/events`：埋点

## 构建与运行

前置：Java 21、Maven、MySQL、Node.js（扩展打包用）。

```bash
# 1. 建库
mysql -u root -p < tables.sql

# 2. 启动后端（默认 127.0.0.1:8080，库名 admin）
mvn spring-boot:run
# 或用启动脚本（含 API key 环境变量注入，见下方安全提醒）
./start-linkedin-scrm.sh

# 3. 打包扩展
node build-extension.js test   # → extension-test.zip，指向 localhost:8080
node build-extension.js prod   # → extension-prod.zip，指向 api.hrscrm.net
```

浏览器加载 `chrome://extensions` 解压对应 zip 后，在 linkedin.com 打开聊天窗口即可自动同步消息。

## 安全提醒

`start-linkedin-scrm.sh` 内含 DASHSCOPE / Paddle / Resend 的 API 密钥明文，请勿将其提交到公开仓库，建议改为从环境变量或本地未跟踪文件注入。
