# NanoClaw Web UI + Google Calendar 集成设计

## 概述

为 NanoClaw 添加 Web 界面，支持通过浏览器与 Agent 对话，并集成 Google Calendar。使用 Nango 自托管管理 OAuth。

## 需求

- Web 界面与 WhatsApp 并存，共享 main group
- 气泡对话风格，面向普通用户
- 简单密码保护，单用户，公网可访问
- 先集成 Google Calendar，后续可扩展其他平台
- 使用 Skill + Python 脚本实现集成，而非 MCP

## 架构

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              服务器                                       │
│                                                                          │
│  ┌──────────────┐  WebSocket  ┌──────────────────────────────────────┐  │
│  │   Web 前端    │◄──────────►│         NanoClaw 主进程               │  │
│  │  (React)     │             │                                      │  │
│  │  :3000       │             │  • WhatsApp 连接                      │  │
│  └──────┬───────┘             │  • Web API (:3001)                   │  │
│         │                     │  • 调用 Agent 容器                    │  │
│         │ OAuth 弹窗          │  • Token 管理                         │  │
│         ▼                     └──────────────┬───────────────────────┘  │
│  ┌──────────────┐                            │                           │
│  │    Nango     │◄───────────────────────────┘                           │
│  │   (Docker)   │             获取 Token                                 │
│  │   :3003      │                                                        │
│  └──────────────┘                            │                           │
│         │                                    ▼                           │
│         │                     ┌──────────────────────────────────────┐  │
│         │                     │      Agent 容器 (main group)          │  │
│         │                     │                                      │  │
│         │                     │  /workspace/group/ ← groups/main/    │  │
│         │                     │  /workspace/tokens/                  │  │
│         │                     │  /app/skills/                        │  │
│         │                     └──────────────────────────────────────┘  │
└─────────┼────────────────────────────────────────────────────────────────┘
          │ OAuth
          ▼
   ┌─────────────┐
   │   Google    │
   └─────────────┘
```

## 核心流程

### 消息处理与 OAuth

```
用户: "帮我明天下午3点加个会议"
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Web 前端发送消息到 NanoClaw API                           │
│ 2. NanoClaw 检查 Nango 是否有 google-calendar token         │
│ 3. 有 token → 写入 /workspace/tokens/google-calendar.json   │
│ 4. 调用 Agent 容器                                          │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ Agent 容器内:                                                │
│ 1. Claude 根据 Skill 调用 Python 脚本                        │
│ 2. 脚本读取 /workspace/tokens/google-calendar.json          │
│ 3a. 有 token → 调用 Google API → 返回成功                    │
│ 3b. 无 token → 输出 "AUTH_REQUIRED:google-calendar"         │
└─────────────────────────────────────────────────────────────┘
         │
         ▼ (如果需要授权)
┌─────────────────────────────────────────────────────────────┐
│ 1. 主进程检测到 AUTH_REQUIRED                                │
│ 2. 通过 WebSocket 通知前端需要授权                           │
│ 3. 前端弹出 Nango OAuth 窗口                                 │
│ 4. 用户完成 Google 授权                                      │
│ 5. 前端通知主进程授权完成                                     │
│ 6. 主进程重新调用 Agent（这次有 token）                       │
│ 7. 返回成功结果给用户                                        │
└─────────────────────────────────────────────────────────────┘
```

## 文件结构

```
nanoclaw/
├── src/
│   ├── index.ts                 # 现有，新增启动 web-server
│   ├── web-server.ts            # 新增：Web API + WebSocket
│   ├── nango-client.ts          # 新增：Nango 交互
│   └── auth.ts                  # 新增：密码认证 + JWT
├── container/
│   ├── Dockerfile               # 修改：添加 Python 环境
│   ├── agent-runner/
│   │   └── src/...
│   └── skills/                  # 新增：容器内置 skills
│       └── google-calendar/
│           ├── SKILL.md
│           └── scripts/
│               ├── calendar.py
│               └── requirements.txt
├── web/                         # 新增：前端项目
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── pages/
│       │   ├── Login.tsx
│       │   └── Chat.tsx
│       ├── components/
│       │   ├── MessageList.tsx
│       │   ├── MessageInput.tsx
│       │   └── AuthModal.tsx
│       ├── hooks/
│       │   ├── useChat.ts
│       │   └── useAuth.ts
│       └── lib/
│           └── nango.ts
├── docker-compose.yml           # 新增：Nango 部署
└── .env                         # 新增配置项
```

## API 设计

### Web Server API

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/login` | 密码登录，返回 JWT |
| `POST` | `/api/chat` | 发送消息，需要 JWT |
| `GET` | `/api/auth/status/:provider` | 检查某个 provider 是否已授权 |
| `GET` | `/api/auth/connect/:provider` | 获取 Nango OAuth 链接 |
| `POST` | `/api/auth/complete` | 前端通知授权完成 |
| `WS` | `/ws` | WebSocket 连接，推送实时消息 |

### 请求/响应示例

**登录：**
```json
// POST /api/login
{ "password": "your-secret" }

// 返回
{ "token": "eyJhbGciOiJIUzI1NiIs..." }
```

**发送消息：**
```json
// POST /api/chat (Header: Authorization: Bearer <token>)
{ "message": "帮我在明天下午3点加个会议" }

// 返回（正常）
{ "type": "message", "content": "好的，已创建会议..." }

// 返回（需要授权）
{ "type": "auth_required", "provider": "google-calendar", "message": "需要授权 Google 日历才能继续" }
```

## 认证机制

```
简单密码认证:
1. 密码存在 .env: WEB_PASSWORD=xxx
2. 登录时验证密码，签发 JWT (有效期 7 天)
3. 后续请求携带 JWT
4. JWT 密钥存在 .env: JWT_SECRET=xxx
```

## Nango 配置

### Docker Compose

```yaml
version: '3.8'
services:
  nango:
    image: nangohq/nango:hosted
    ports:
      - "3003:3003"
    environment:
      - NANGO_SECRET_KEY=${NANGO_SECRET_KEY}
      - NANGO_PUBLIC_KEY=${NANGO_PUBLIC_KEY}
      - NANGO_CALLBACK_URL=http://your-domain:3003/oauth/callback
      - NANGO_DB_HOST=postgres
      - NANGO_DB_PORT=5432
      - NANGO_DB_NAME=nango
      - NANGO_DB_USER=nango
      - NANGO_DB_PASSWORD=nango
    depends_on:
      - postgres

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=nango
      - POSTGRES_USER=nango
      - POSTGRES_PASSWORD=nango
    volumes:
      - nango_data:/var/lib/postgresql/data

volumes:
  nango_data:
```

### Google Calendar 集成配置

需要在 Nango 配置：
- Provider: google
- Scopes: calendar, calendar.events
- OAuth 凭证从 Google Cloud Console 获取

## Skill 设计

### SKILL.md

```markdown
---
name: google-calendar
description: 操作 Google 日历（创建、查询、删除事件）
---

## 使用方法

当用户需要操作 Google 日历时，使用以下脚本：

### 创建事件
python /app/skills/google-calendar/scripts/calendar.py create \
  --summary "会议标题" \
  --start "2024-01-15T15:00:00" \
  --end "2024-01-15T16:00:00" \
  --description "可选描述"

### 查询事件
python /app/skills/google-calendar/scripts/calendar.py list \
  --start "2024-01-15" \
  --end "2024-01-16"

### 删除事件
python /app/skills/google-calendar/scripts/calendar.py delete \
  --event-id "事件ID"

## 处理授权

如果脚本输出包含 `AUTH_REQUIRED:google-calendar`，说明用户尚未授权。
请告诉用户："需要先授权 Google 日历才能继续，请在网页上完成授权。"
```

### Python 脚本

脚本位置: `container/skills/google-calendar/scripts/calendar.py`

功能:
- 读取 `/workspace/tokens/google-calendar.json` 获取 token
- 无 token 时输出 `AUTH_REQUIRED:google-calendar`
- 支持 create、list、delete 子命令
- 使用 google-api-python-client 库

## 前端技术栈

```
Vite + React + TypeScript
├── @chatscope/chat-ui-kit-react    # 聊天 UI 组件
├── @nangohq/frontend               # Nango OAuth 弹窗
└── socket.io-client                # WebSocket 实时通信
```

## 环境变量

新增 `.env` 配置项：

```bash
# Web 认证
WEB_PASSWORD=your-password
JWT_SECRET=your-jwt-secret

# Nango
NANGO_SECRET_KEY=your-nango-secret
NANGO_PUBLIC_KEY=your-nango-public
NANGO_HOST=http://localhost:3003

# Google OAuth (配置在 Nango)
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
```

## 实现步骤

1. **Nango 部署**: docker-compose 启动 Nango + PostgreSQL
2. **后端 API**: 新增 web-server.ts, nango-client.ts, auth.ts
3. **容器改造**: Dockerfile 添加 Python，添加 skills 目录
4. **Google Calendar Skill**: SKILL.md + calendar.py
5. **前端开发**: Vite + React 聊天界面
6. **集成测试**: 完整流程测试

## 注意事项

- Google Cloud Console 需要配置 OAuth 同意屏幕
- 公网部署需要 HTTPS（Nango OAuth 回调要求）
- Token 刷新逻辑由 Nango 自动处理

