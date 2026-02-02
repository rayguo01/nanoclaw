# OAuth Token 同步机制

## 概述

NanoClaw 使用 Nango 管理 OAuth 授权，但容器内的 skill 脚本无法直接访问 Nango。因此需要将 token 同步到本地文件，供容器挂载使用。

## 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         Host Process                             │
│                                                                  │
│  ┌──────────────┐      ┌──────────────┐      ┌───────────────┐  │
│  │  Nango       │ ───► │ Token Sync   │ ───► │ data/tokens/  │  │
│  │  (OAuth DB)  │      │              │      │ *.json        │  │
│  └──────────────┘      └──────────────┘      └───────────────┘  │
│                                                      │           │
└──────────────────────────────────────────────────────┼───────────┘
                                                       │ mount
                                                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                         Container                                 │
│                                                                   │
│  ┌───────────────────┐      ┌──────────────────────────────────┐ │
│  │ /workspace/tokens │ ───► │ skills/google-calendar.py        │ │
│  │ (read-only)       │      │ 读取 token，调用 Google API      │ │
│  └───────────────────┘      └──────────────────────────────────┘ │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Token 同步触发点

### 1. OAuth 完成时 (`web-server.ts`)

用户在网页端完成授权后，前端调用 `/api/auth/complete`，立即同步 token：

```typescript
// src/web-server.ts
fastify.post('/api/auth/complete', async (request, reply) => {
  const { provider } = request.body;

  // 验证连接存在
  const hasConn = await nango.hasConnection(provider);
  if (!hasConn) {
    return reply.status(400).send({ error: 'Connection not found' });
  }

  // 立即同步 token 到文件
  await nango.syncTokenToFile(provider);

  return { success: true, provider };
});
```

**作用**：确保用户授权后立即可用，无需等待下次容器运行。

### 2. 容器启动前 (`container-runner.ts`)

每次启动容器前刷新 token：

```typescript
// src/container-runner.ts
export async function runAgentContainer(input: ContainerInput): Promise<ContainerOutput> {
  // 同步 OAuth tokens
  await syncOAuthTokens();

  // 启动容器...
}
```

**作用**：确保每次运行时 token 是最新的（Nango 可能自动刷新了过期 token）。

## 文件结构

```
data/
└── tokens/
    └── google-calendar.json    # Google Calendar OAuth token
```

Token 文件格式：
```json
{
  "access_token": "ya29.xxx...",
  "refresh_token": "1//xxx...",
  "expires_at": "2026-02-02T19:45:17.579Z"
}
```

## 容器挂载

`container-runner.ts` 将 tokens 目录挂载到容器：

```typescript
const tokensDir = path.join(DATA_DIR, 'tokens');
mounts.push({
  hostPath: tokensDir,
  containerPath: '/workspace/tokens',
  readonly: true  // 容器只读，不能修改 token
});
```

## Skill 脚本使用 Token

以 `google-calendar.py` 为例：

```python
TOKEN_PATH = "/workspace/tokens/google-calendar.json"

def load_credentials():
    if not os.path.exists(TOKEN_PATH):
        # 没有 token，请求授权
        print("AUTH_REQUIRED:google-calendar:calendar,calendar.events")
        sys.exit(0)

    with open(TOKEN_PATH) as f:
        token_data = json.load(f)

    return Credentials(
        token=token_data["access_token"],
        refresh_token=token_data.get("refresh_token"),
        expiry=token_data.get("expires_at")
    )
```

## AUTH_REQUIRED 流程

当 skill 检测到没有 token 或 token 过期时：

1. Skill 输出 `AUTH_REQUIRED:google-calendar:calendar,calendar.events`
2. `container-runner.ts` 检测到这个输出
3. `index.ts` 向网页端广播 `auth_required` 事件
4. 网页端弹出授权窗口
5. 用户完成授权
6. `/api/auth/complete` 同步 token 到文件
7. 用户再次询问时，skill 可以正常读取 token

## 添加新的 OAuth Provider

1. 在 Nango 配置 provider（通过 API 或 docker-compose）
2. 在 `container-runner.ts` 的 `OAUTH_PROVIDERS` 数组添加 provider 名称
3. 创建对应的 skill 脚本，读取 `/workspace/tokens/{provider}.json`
4. 在 `web-server.ts` 的 `defaultScopes` 添加默认 scopes（可选）
