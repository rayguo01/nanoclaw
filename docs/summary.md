# NanoClaw 开发概述

## 当前版本: v1.1.2

## 版本历史

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
                         ↓
                    Nango (Docker) ← OAuth → Google Calendar
```

## 待办事项

- [ ] 添加更多 OAuth 集成（Gmail、Google Drive 等）
- [ ] Web UI 支持查看 WhatsApp 群组列表
- [ ] 消息搜索功能
- [ ] 移动端适配优化
