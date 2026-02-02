# NanoClaw 开发概述

## 当前版本: v1.2.1

## 版本历史

### v1.2.1 - OAuth Token 同步优化 (2026-02-02)

修复 OAuth 授权完成后 token 不能立即使用的问题。

#### 问题描述

用户完成 OAuth 授权后，立即询问日程仍提示需要授权。原因是 token 只在容器启动前同步，OAuth 完成时没有立即同步到文件。

#### 解决方案

在 OAuth 完成时增加立即同步 token 的逻辑：

| 文件 | 修改内容 |
|------|----------|
| `src/nango-client.ts` | 新增 `syncTokenToFile()` 函数 |
| `src/web-server.ts` | `/api/auth/complete` 端点调用 `syncTokenToFile()` |

#### Token 同步触发点

1. **OAuth 完成时** (`web-server.ts`) - 确保授权后立即可用
2. **容器启动前** (`container-runner.ts`) - 确保每次运行时 token 最新

详见：[OAuth Token 同步机制](./oauth-token-sync.md)

---

### v1.2.0 - Nango OAuth 完整实现 (2026-02-02)

完成 Nango OAuth 集成，实现 Google Calendar 授权流程。

#### 新增功能

**1. Nango OAuth 服务部署**
- `docker-compose.yml` - Nango + PostgreSQL 容器编排
- 自动生成 UUID 格式密钥
- 支持 HTTPS 回调 (https://chat.moltbots.app/oauth/callback)

**2. OAuth API 端点**
- `GET /api/auth/nango-config` - 获取 Nango 公钥和地址
- `GET /api/auth/status/:provider` - 检查 provider 连接状态
- `GET /api/auth/connect/:provider` - 获取 OAuth 授权 URL
- `POST /api/auth/complete` - 通知授权完成
- `GET /api/auth/connections` - 列出所有连接
- `DELETE /api/auth/disconnect/:provider` - 断开连接

**3. 前端 OAuth 弹窗**
- `AuthModal.tsx` - OAuth 授权弹窗组件
- WebSocket 支持 `auth_required` 事件
- 自动检测需要授权并弹窗

**4. Token 传递到容器**
- 容器启动前自动从 Nango 同步 token
- Token 写入 `/workspace/tokens/` 目录
- 支持 `AUTH_REQUIRED` 输出检测

#### 新增/修改文件

| 文件 | 说明 |
|------|------|
| `docker-compose.yml` | Nango + PostgreSQL 部署配置 |
| `src/nango-client.ts` | Nango API 客户端（完整实现） |
| `src/web-server.ts` | 添加 OAuth API 端点 |
| `src/container-runner.ts` | 添加 token 同步和 AUTH_REQUIRED 检测 |
| `web/src/components/AuthModal.tsx` | OAuth 授权弹窗组件 |
| `web/src/hooks/useWebSocket.ts` | 支持 auth_required 事件 |
| `web/src/App.tsx` | 集成 AuthModal |

#### 配置说明

**.env 配置项：**
```bash
NANGO_SECRET_KEY=<UUID>     # Nango 生成的密钥
NANGO_PUBLIC_KEY=<UUID>     # Nango 生成的公钥
NANGO_HOST=http://localhost:3003
NANGO_CALLBACK_URL=https://chat.moltbots.app/oauth/callback
NANGO_SERVER_URL=https://chat.moltbots.app
```

**Nginx 配置：**
添加 `/oauth/` 路由转发到 Nango (端口 3003)

#### 使用流程

1. 用户在 Web UI 发送日历相关请求
2. Cindy 调用 google-calendar.py，发现无 token
3. 输出 `AUTH_REQUIRED:google-calendar`
4. Web UI 弹出 Google OAuth 授权窗口
5. 用户完成授权，token 保存到 Nango
6. 下次调用时自动携带 token

---

### v1.1.2 - Nginx 配置 + 启动优化 (2026-02-02)

- 添加 Nginx 反向代理配置 `docs/nginx/chat.moltbots.app.conf`
- 添加 dotenv 支持自动加载 `.env` 文件
- 修复 WhatsApp 认证失败时进程退出问题（现在 Web UI 可独立运行）
- 修复 Fastify 装饰器重复添加错误

**访问地址：** https://chat.moltbots.app

---

### v1.1.1 - Docker 支持 (2026-02-02)

添加 Docker 支持，使项目可以在 Linux 服务器上运行。

#### 修改内容

- `container/build.sh` - 自动检测容器运行时（Apple Container 或 Docker）
- `src/container-runner.ts` - 支持 Docker 作为容器运行时
- 创建 `.env` 配置文件

---

### v1.1.0 - Web UI + Google Calendar 集成 (2026-02-02)

为 NanoClaw 添加了 Web 界面和 Google Calendar 集成功能。

#### 新增功能

**1. Web 服务器 (Fastify)**
- REST API 支持 JWT 认证
- WebSocket 实时消息推送
- 与 WhatsApp main group 共享对话

**2. Nango OAuth 集成**
- Docker Compose 部署 Nango + PostgreSQL
- OAuth token 管理和缓存
- 支持 Google Calendar 等第三方服务授权

**3. Google Calendar 技能**
- Python CLI 工具，支持日历和事件管理
- 自动检测 AUTH_REQUIRED 并触发 OAuth 流程
- 支持相对日期解析（tomorrow, next monday 等）

**4. React 前端**
- 密码登录 + JWT 会话
- 实时消息同步（WebSocket）
- 类 iMessage 的气泡式界面
- 显示消息来源（WhatsApp/Web）

#### 新增文件

| 文件 | 说明 |
|------|------|
| `src/web-server.ts` | Fastify API + WebSocket 服务 |
| `src/nango-client.ts` | Nango OAuth 客户端 |
| `nango/docker-compose.yml` | Nango 部署配置 |
| `container/skills/google-calendar.py` | Google Calendar CLI |
| `container/skills/google-calendar.md` | 技能文档 |
| `web/` | React 前端项目 |
| `.env.example` | 环境变量模板 |

#### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/index.ts` | 集成 Web 服务、AUTH_REQUIRED 处理、消息广播 |
| `src/container-runner.ts` | 添加 tokens 目录挂载 |
| `container/Dockerfile` | 添加 Python 环境和 skills 目录 |
| `package.json` | 添加 Fastify 等依赖 |
| `CLAUDE.md` | 添加开发规范 |

#### 启用方式

1. 在 `.env` 中配置：
   ```bash
   WEB_PASSWORD=your-password
   WEB_JWT_SECRET=random-32-char-string
   ```

2. 重新构建容器：
   ```bash
   ./container/build.sh
   ```

3. 启动后访问 `http://localhost:3000`

---

### v1.0.0 - 初始版本

- WhatsApp 消息路由
- Apple Container 隔离执行
- 多群组支持，独立文件系统和会话
- 定时任务调度
- IPC 通信机制

## 架构图

```
Web 前端 (React) ←→ Fastify API (:3000) ←→ NanoClaw 主进程 ←→ Agent 容器
                         ↓                        ↓
                    Nango (Docker)          data/tokens/*.json
                         ↓                        ↓
                    OAuth 授权    ─────────→   /workspace/tokens/
                                  token sync     (容器挂载)
```

## 文档索引

| 文档 | 说明 |
|------|------|
| [REQUIREMENTS.md](./REQUIREMENTS.md) | 架构决策和设计原则 |
| [oauth-token-sync.md](./oauth-token-sync.md) | OAuth Token 同步机制 |
| [nginx/](./nginx/) | Nginx 反向代理配置 |

## 待办事项

- [x] Google Calendar OAuth 集成
- [ ] 添加更多 OAuth 集成（Gmail、Google Drive 等）
- [ ] Web UI 支持查看 WhatsApp 群组列表
- [ ] 消息搜索功能
- [ ] 移动端适配优化
- [ ] 多用户支持（独立 OAuth 连接）
