# Claude API Hub - API 文档

## 概述

本文档描述 Claude API Hub 的所有 HTTP 端点。端点按功能分为以下几类：

| 分类 | 前缀 | 说明 |
|------|------|------|
| 公共端点 | `/`, `/health`, `/v1/models` 等 | 无需认证即可访问 |
| 认证端点 | `/api/auth/*` | 登录、登出、检查认证状态 |
| 管理端点 | `/api/*` | 需要管理员认证（session token 或 admin token） |
| 代理端点 | `/v1/messages` | 转发到上游 LLM 提供商，支持可选的 IP 速率限制 |
| Prometheus 指标 | `/metrics` | 需要管理员认证 |
| SSE 事件流 | `/api/events` | 需要管理员认证，实时事件推送 |

---

## 认证

管理端点（`/api/*` 和 `/metrics`）需要以下三种认证方式之一：

### 1. 无密码模式

如果配置中未设置 `password` 且未设置 `adminToken`（或环境变量 `ADMIN_TOKEN`），则所有管理端点无需认证即可访问。生产环境强烈建议配置认证。

### 2. Session Token

通过登录接口获取的临时会话令牌，有效期为 24 小时。

```bash
curl -X POST http://localhost:3456/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password": "your-password"}'
```

响应：
```json
{
  "success": true,
  "token": "550e8400-e29b-41d4-a716-446655440000"
}
```

使用方式：
```bash
curl -H "Authorization: Bearer <token>" http://localhost:3456/api/config
```

### 3. Admin Token

在配置文件中设置 `adminToken` 或通过环境变量 `ADMIN_TOKEN` 设置固定令牌。

```bash
curl -H "x-admin-token: your-admin-token" http://localhost:3456/api/config
```

---

## 公共端点

### GET /

返回 Web 管理仪表板的 HTML 页面。支持 ETag 缓存和 gzip/deflate 压缩。

- **认证**: 不需要
- **响应**: `text/html; charset=utf-8`

```bash
curl -H "Accept-Encoding: gzip" http://localhost:3456/
```

---

### GET /health

健康检查端点。

- **认证**: 不需要
- **响应**:
```json
{
  "status": "ok",
  "timestamp": "2026-04-26T12:00:00.000Z"
}
```

```bash
curl http://localhost:3456/health
```

---

### GET /icon.png

返回仪表板图标（如果已配置）。

- **认证**: 不需要
- **响应**: `image/png`

```bash
curl http://localhost:3456/icon.png -o icon.png
```

---

### GET /api/auth/check

检查管理界面是否需要密码认证。

- **认证**: 不需要
- **响应**:
```json
{
  "required": true
}
```

```bash
curl http://localhost:3456/api/auth/check
```

---

### POST /api/auth/login

管理员登录。如果未配置密码，直接返回空 token。

- **认证**: 不需要
- **请求体**:
```json
{
  "password": "your-password"
}
```
- **响应**:
```json
{
  "success": true,
  "token": "550e8400-e29b-41d4-a716-446655440000"
}
```
- **错误**: 401（密码错误）、429（登录过于频繁或账户被锁定）

```bash
curl -X POST http://localhost:3456/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password": "your-password"}'
```

---

### POST /api/auth/logout

撤销当前 session token。

- **认证**: 不需要（但需提供 token 才能撤销）
- **请求头**: `Authorization: Bearer <token>` 或 `x-admin-token: <token>`
- **响应**:
```json
{
  "ok": true
}
```

```bash
curl -X POST http://localhost:3456/api/auth/logout \
  -H "Authorization: Bearer <token>"
```

---

### GET /v1/models

列出所有可用的模型，格式兼容 OpenAI `/v1/models`。

- **认证**: 不需要
- **响应**:
```json
{
  "object": "list",
  "data": [
    {
      "id": "claude-sonnet-4-6",
      "object": "model",
      "owned_by": "provider-name"
    }
  ]
}
```

```bash
curl http://localhost:3456/v1/models
```

---

### GET /api/events

SSE（Server-Sent Events）事件流，实时推送系统事件。

- **认证**: 需要（session token 或 admin token）
- **响应**: `text/event-stream`

```bash
curl -N -H "Authorization: Bearer <token>" http://localhost:3456/api/events
```

事件格式：
```
id: 1
event: log
data: {"message": "..."}

id: 2
event: stats
data: {"rpm": 10, "tps": 50}
```

---

## 代理端点

### POST /v1/messages

代理 Claude API 消息请求到上游 LLM 提供商。这是核心代理端点，兼容 Anthropic Messages API 格式。

- **认证**: 不需要
- **速率限制**: 如果配置了 `rateLimitRpm`，按客户端 IP 限制
- **请求体**（Anthropic Messages API 格式）:
```json
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 1024,
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "stream": false
}
```
- **响应头**:
  - `X-Request-Id`: 请求追踪 ID
  - `X-RateLimit-Remaining`: 剩余请求数（如果启用速率限制）
  - `X-RateLimit-Limit`: 每分钟限制数
- **响应**: 上游提供商的标准响应（流式或非流式）

非流式请求：
```bash
curl -X POST http://localhost:3456/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

流式请求：
```bash
curl -X POST http://localhost:3456/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

---

## 配置管理端点

### GET /api/config

获取当前网关配置。API Key 会被脱敏显示。

- **认证**: 需要
- **响应**: 完整的 `GatewayConfig` JSON，其中 `providers[].apiKey` 被替换为 `前4位***后4位`

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3456/api/config
```

---

### POST /api/config

### POST /api/config/import

导入完整配置。两者行为相同。

- **认证**: 需要
- **请求体**: 完整的 `GatewayConfig` JSON
- **响应**:
```json
{
  "imported": true
}
```

```bash
curl -X POST http://localhost:3456/api/config \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d @config.json
```

---

### POST /api/config/reload

从配置文件重新加载配置。

- **认证**: 需要
- **响应**:
```json
{
  "reloaded": true,
  "config": { ... }
}
```

```bash
curl -X POST http://localhost:3456/api/config/reload \
  -H "Authorization: Bearer <token>"
```

---

### GET /api/fetch-models

从所有已启用的提供商获取可用模型列表。

- **认证**: 需要
- **响应**:
```json
{
  "provider1": ["model-a", "model-b"],
  "provider2": ["model-c"]
}
```

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3456/api/fetch-models
```

---

### POST /api/probe-models

探测指定提供商的模型列表，用于添加新提供商前的验证。

- **认证**: 需要
- **请求体**:
```json
{
  "baseUrl": "https://api.provider.com",
  "apiKey": "your-api-key",
  "passthrough": false
}
```
- **响应**:
```json
{
  "models": ["model-a", "model-b"]
}
```

```bash
curl -X POST http://localhost:3456/api/probe-models \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://api.provider.com",
    "apiKey": "your-api-key",
    "passthrough": false
  }'
```

---

### POST /api/config/providers

添加新的提供商。

- **认证**: 需要
- **请求体**:
```json
{
  "name": "my-provider",
  "baseUrl": "https://api.provider.com/v1",
  "apiKey": "your-api-key",
  "models": ["model-a", "model-b"],
  "defaultModel": "model-a",
  "enabled": true
}
```
- **响应**: 201，返回创建的提供商配置（apiKey 脱敏）
- **错误**: 400（缺少必填字段）、409（提供商已存在）

```bash
curl -X POST http://localhost:3456/api/config/providers \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-provider",
    "baseUrl": "https://api.provider.com/v1",
    "apiKey": "sk-...",
    "models": ["claude-sonnet-4-6"],
    "defaultModel": "claude-sonnet-4-6",
    "enabled": true
  }'
```

---

### PUT /api/config/providers/:name

更新指定提供商的配置。

- **认证**: 需要
- **路径参数**: `name` — 提供商名称
- **请求体**: 部分 `ProviderConfig` 字段
- **响应**: 更新后的提供商配置（apiKey 脱敏）

注意：如果请求中的 `apiKey` 包含 `***`，系统会保留原有的真实 API Key 而不被覆盖。

```bash
curl -X PUT http://localhost:3456/api/config/providers/my-provider \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": false,
    "models": ["model-a", "model-b", "model-c"]
  }'
```

---

### DELETE /api/config/providers/:name

删除指定提供商。

- **认证**: 需要
- **路径参数**: `name` — 提供商名称
- **响应**:
```json
{
  "deleted": "my-provider"
}
```

```bash
curl -X DELETE http://localhost:3456/api/config/providers/my-provider \
  -H "Authorization: Bearer <token>"
```

---

### GET /api/aliases

获取模型别名映射。

- **认证**: 需要
- **响应**:
```json
{
  "haiku": "claude-haiku-4-5",
  "sonnet": "claude-sonnet-4-6",
  "opus": "claude-opus-4-6"
}
```

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3456/api/aliases
```

---

### PUT /api/aliases

更新模型别名映射。只允许 `haiku`、`sonnet`、`opus` 三个键。

- **认证**: 需要
- **请求体**:
```json
{
  "haiku": "claude-haiku-4-5",
  "sonnet": "claude-sonnet-4-6",
  "opus": "claude-opus-4-6"
}
```
- **错误**: 400（包含无效的别名键）

```bash
curl -X PUT http://localhost:3456/api/aliases \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "haiku": "claude-haiku-4-5",
    "sonnet": "claude-sonnet-4-6",
    "opus": "claude-opus-4-6"
  }'
```

---

### GET /api/tier-timeouts

获取按模型层级（tier）配置的超时时间。

- **认证**: 需要
- **响应**:
```json
{
  "haiku": {
    "timeoutMs": 60000,
    "streamTimeoutMs": 30000,
    "streamIdleTimeoutMs": 30000
  },
  "sonnet": {
    "timeoutMs": 120000,
    "streamTimeoutMs": 60000,
    "streamIdleTimeoutMs": 60000
  }
}
```

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3456/api/tier-timeouts
```

---

### PUT /api/tier-timeouts

更新按模型层级的超时配置。只允许 `haiku`、`sonnet`、`opus` 三个键。

- **认证**: 需要
- **请求体**:
```json
{
  "haiku": {
    "timeoutMs": 60000,
    "streamTimeoutMs": 30000,
    "streamIdleTimeoutMs": 30000
  }
}
```

```bash
curl -X PUT http://localhost:3456/api/tier-timeouts \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "sonnet": {
      "timeoutMs": 300000,
      "streamTimeoutMs": 120000,
      "streamIdleTimeoutMs": 120000
    }
  }'
```

---

## 日志管理端点

### GET /api/logs

获取请求日志列表。

- **认证**: 需要
- **查询参数**:
  - `limit` — 返回条数，默认 200，最大 500
  - `offset` — 偏移量，默认 0
  - `provider` — 按提供商名称过滤
  - `status` — 按 HTTP 状态码过滤
- **响应**:
```json
{
  "total": 1000,
  "logs": [
    {
      "time": "2026-04-26T12:00:00.000Z",
      "requestId": "req_xxx",
      "claudeModel": "Sonnet",
      "resolvedModel": "claude-sonnet-4-6",
      "provider": "provider-name",
      "protocol": "OpenAI",
      "targetUrl": "https://api.provider.com/v1/chat/completions",
      "stream": false,
      "status": 200,
      "durationMs": 1234,
      "inputTokens": 10,
      "outputTokens": 50
    }
  ]
}
```

```bash
curl "http://localhost:3456/api/logs?limit=50&offset=0&provider=my-provider" \
  -H "Authorization: Bearer <token>"
```

---

### POST /api/logs/clear

清空所有日志。

- **认证**: 需要
- **响应**:
```json
{
  "cleared": true
}
```

```bash
curl -X POST http://localhost:3456/api/logs/clear \
  -H "Authorization: Bearer <token>"
```

---

### GET /api/logs/file-status

获取文件日志状态。

- **认证**: 需要
- **响应**:
```json
{
  "enabled": true,
  "fileCount": 5,
  "maxFiles": 10,
  "logDir": "/path/to/logs"
}
```

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3456/api/logs/file-status
```

---

### PUT /api/logs/file-toggle

切换文件日志的启用/禁用状态。

- **认证**: 需要
- **响应**:
```json
{
  "enabled": false
}
```

```bash
curl -X PUT http://localhost:3456/api/logs/file-toggle \
  -H "Authorization: Bearer <token>"
```

---

## 统计与健康端点

### GET /api/stats

获取请求速率统计（RPM、TPS 等）。

- **认证**: 需要
- **响应**: 速率追踪器统计对象

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3456/api/stats
```

---

### GET /api/token-stats

获取 Token 使用统计。

- **认证**: 需要
- **响应**: Token 统计对象

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3456/api/token-stats
```

---

### GET /api/health/providers

对所有已启用的提供商执行健康探测。

- **认证**: 需要
- **响应**:
```json
{
  "provider1": {
    "status": "ok",
    "latencyMs": 1234
  },
  "provider2": {
    "status": "error",
    "latencyMs": 5000,
    "error": "timeout"
  }
}
```

状态值：`ok`、`disabled`、`no_key`、`init_failed`、`no_model`、`error`、`timeout`

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3456/api/health/providers
```

---

### POST /api/test-provider/:name

对指定提供商执行单点测试。

- **认证**: 需要
- **路径参数**: `name` — 提供商名称
- **响应**:
```json
{
  "success": true,
  "latencyMs": 1234,
  "model": "claude-sonnet-4-6",
  "provider": "my-provider"
}
```

```bash
curl -X POST http://localhost:3456/api/test-provider/my-provider \
  -H "Authorization: Bearer <token>"
```

---

## 系统信息端点

### GET /api/system-info

获取服务器系统信息。

- **认证**: 需要
- **响应**:
```json
{
  "localVersion": "1.2.3",
  "uptime": 3600,
  "nodeVersion": "v20.10.0",
  "platform": "linux 6.1.0",
  "memoryUsage": {
    "rss": 52428800,
    "heapTotal": 33554432,
    "heapUsed": 16777216
  },
  "cpuUsage": {
    "user": 1000000,
    "system": 500000
  },
  "processPid": 12345,
  "serverTime": "2026-04-26T12:00:00.000Z",
  "installMethod": "global"
}
```

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3456/api/system-info
```

---

### GET /api/check-update

检查是否有新版本可用（从 npm registry 查询）。

- **认证**: 需要
- **响应**:
```json
{
  "localVersion": "1.2.3",
  "latestVersion": "1.3.0",
  "hasUpdate": true
}
```

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3456/api/check-update
```

---

### POST /api/update

通过 npm 更新到最新版本。

- **认证**: 需要
- **响应**:
```json
{
  "success": true,
  "oldVersion": "1.2.3",
  "newVersion": "1.3.0",
  "output": "..."
}
```
- **错误**: 409（更新正在进行中）

```bash
curl -X POST http://localhost:3456/api/update \
  -H "Authorization: Bearer <token>"
```

---

### POST /api/restart

重启服务进程。

- **认证**: 需要
- **响应**:
```json
{
  "restarting": true
}
```

注意：响应发送后，服务会在 500ms 延迟后重启。

```bash
curl -X POST http://localhost:3456/api/restart \
  -H "Authorization: Bearer <token>"
```

---

## OAuth 端点（Kiro）

### POST /api/oauth/kiro/auth-url

获取 Kiro OAuth 授权 URL。

- **认证**: 需要
- **请求体**:
```json
{
  "method": "google",
  "region": "us-east-1",
  "startUrl": "https://my-start-url.awsapps.com/start"
}
```
- **响应**:
```json
{
  "authUrl": "https://...",
  "authInfo": { ... }
}
```

`method` 可选值：`google`、`github`、`builder-id`

```bash
curl -X POST http://localhost:3456/api/oauth/kiro/auth-url \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "google",
    "region": "us-east-1"
  }'
```

---

### POST /api/oauth/kiro/import

导入 AWS 凭证。

- **认证**: 需要
- **请求体**:
```json
{
  "clientId": "...",
  "clientSecret": "...",
  "accessToken": "...",
  "refreshToken": "...",
  "region": "us-east-1",
  "authMethod": "google"
}
```

```bash
curl -X POST http://localhost:3456/api/oauth/kiro/import \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "...",
    "clientSecret": "...",
    "accessToken": "...",
    "refreshToken": "..."
  }'
```

---

### GET /api/oauth/kiro/status

检查凭证状态。

- **认证**: 需要
- **查询参数**: `credsPath` — 凭证文件路径（可选）
- **响应**: 凭证状态对象

```bash
curl "http://localhost:3456/api/oauth/kiro/status?credsPath=/path/to/creds" \
  -H "Authorization: Bearer <token>"
```

---

### POST /api/oauth/kiro/refresh

刷新 AWS 凭证。

- **认证**: 需要
- **请求体**:
```json
{
  "credsPath": "/path/to/creds"
}
```
- **响应**:
```json
{
  "success": true,
  "expiresAt": "2026-04-26T18:00:00.000Z"
}
```

```bash
curl -X POST http://localhost:3456/api/oauth/kiro/refresh \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"credsPath": "/path/to/creds"}'
```

---

### GET /api/oauth/kiro/result

获取最近一次 OAuth 结果。

- **认证**: 需要
- **响应**: OAuth 结果对象

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3456/api/oauth/kiro/result
```

---

### POST /api/oauth/kiro/cancel

取消正在进行的 OAuth 流程。

- **认证**: 需要
- **响应**:
```json
{
  "cancelled": true
}
```

```bash
curl -X POST http://localhost:3456/api/oauth/kiro/cancel \
  -H "Authorization: Bearer <token>"
```

---

### GET /api/oauth/kiro/models

获取 Kiro 支持的模型列表。

- **认证**: 需要
- **响应**:
```json
{
  "models": [
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
    "claude-opus-4-6"
  ]
}
```

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3456/api/oauth/kiro/models
```

---

## Prometheus 指标

### GET /metrics

返回 Prometheus 格式的指标数据。

- **认证**: 需要
- **响应**: `text/plain; charset=utf-8`

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3456/metrics
```

指标包括：

| 指标名 | 类型 | 说明 |
|--------|------|------|
| `process_resident_memory_bytes` | gauge | 进程常驻内存（字节） |
| `process_heap_bytes` | gauge | 堆内存总量（字节） |
| `process_heap_used_bytes` | gauge | 已使用堆内存（字节） |
| `process_cpu_user_seconds_total` | counter | 用户态 CPU 时间（秒） |
| `process_cpu_system_seconds_total` | counter | 内核态 CPU 时间（秒） |
| `process_uptime_seconds` | counter | 进程运行时间（秒） |
| `api_hub_requests_per_minute` | gauge | 每分钟请求数 |
| `api_hub_tokens_per_second` | gauge | 每秒 Token 数 |
| `api_hub_provider_up` | gauge | 提供商健康状态（1=正常, 0=异常） |
| `api_hub_active_connections` | gauge | 活跃 HTTP 连接数 |

---

## 错误响应格式

所有端点使用统一的错误响应格式：

```json
{
  "type": "error",
  "error": {
    "type": "error_type",
    "message": "Human-readable error description"
  }
}
```

### 常见错误类型

| HTTP 状态码 | `error.type` | 说明 |
|-------------|--------------|------|
| 400 | `invalid_request_error` | 请求参数无效或缺少必填字段 |
| 401 | `authentication_error` | 认证失败或缺少认证信息 |
| 404 | `not_found_error` | 端点或资源不存在 |
| 409 | `conflict_error` | 资源冲突（如提供商已存在） |
| 429 | `rate_limit_error` | 请求过于频繁 |
| 500 | `internal_error` | 服务器内部错误 |
| 502 | `api_error` | 上游提供商请求失败 |

### 速率限制响应头

当启用 IP 速率限制时，以下响应头会包含在 `/v1/messages` 的响应中：

- `X-RateLimit-Remaining`: 当前窗口剩余请求数
- `X-RateLimit-Limit`: 每分钟请求上限
- `Retry-After`: 达到限制后需等待的秒数（仅 429 响应）

---

## SSE 事件类型

`/api/events` 端点推送的事件类型取决于 `EventBus` 的使用场景。常见事件包括：

| 事件类型 | 说明 | 数据示例 |
|----------|------|----------|
| `log` | 新请求日志 | `{"requestId": "req_xxx", "status": 200}` |
| `stats` | 速率统计更新 | `{"rpm": 10, "tps": 50}` |
| `provider_health` | 提供商健康状态变化 | `{"provider": "name", "up": true}` |

事件格式遵循 SSE 规范：

```
id: <sequence-number>
event: <event-type>
data: <json-payload>

```

客户端通过 `EventSource` 或 `curl -N` 连接后，服务器会先发送一个注释行（`:\n\n`）以保持连接活跃。
