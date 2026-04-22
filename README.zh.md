# Claude API Hub

本地 API 网关，让 Claude Code 通过模型别名（haiku / sonnet / opus）无缝路由到任意 LLM 厂商。通过 Web 面板管理一切，无需手写配置。

## 工作原理

```
Claude Code ──► ANTHROPIC_BASE_URL=http://127.0.0.1:9800
                        │
                  API Gateway
                        │ aliases: sonnet → kimi-k2.6
          ┌─────────────┼─────────────┬──────────────┐
          ▼             ▼             ▼              ▼
       Claude         Kimi        MiniMax          GLM
     (直接透传)    (协议转换)    (协议转换)     (协议转换)
```

网关拦截 Claude Code 发出的 Anthropic Messages API 请求，解析别名映射，路由到对应 Provider，对非 Anthropic 格式的厂商自动完成协议转换。

## 核心特性

- **Web 管理面板**：Provider 管理、别名映射、请求监控，全部可视化操作
- **别名映射**：将 haiku / sonnet / opus 映射到任意厂商的任意模型，支持从 Provider API 自动检测模型列表
- **协议自选**：每个 Provider 可选 Anthropic（直接透传）或 OpenAI（自动翻译）格式
- **健康检查**：在面板中一键测试各 Provider 连通性和延迟
- **请求日志**：详细日志含 Request ID、路由链路、耗时、完整错误信息
- **热重载**：增删改 Provider 和别名无需重启网关
- **流式支持**：完整的 SSE 事件流转发和转换
- **零运行时依赖**：网关核心使用 Node.js 原生 `http` 模块

## 快速开始

```bash
npm install -g claude-api-hub
claude-api-hub
```

打开 `http://localhost:9800` 访问 Web 管理面板。

配置 Claude Code，修改 `~/.claude/settings.json`：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:9800"
  }
}
```

## Web 管理面板

访问 `http://localhost:9800`，功能包括：

- **Quick Start**：显示网关地址和可复制的 Claude Code 配置片段
- **Alias Mapping**：通过下拉框将 haiku/sonnet/opus 映射到任意模型（自动从 Provider API 检测可用模型，也支持手动输入自定义模型名）
- **Providers**：增删改 Provider，显示 API 格式/路由前缀/Key 状态，一键测试连通性和延迟
- **Request Logs**：按状态过滤（All/OK/Errors），点击展开详情（Request ID、目标 URL、上游响应体）

## 别名映射

将 Claude Code 的三个模型层级映射到任意厂商模型：

```json
{
  "aliases": {
    "haiku": "glm-4-flash",
    "sonnet": "kimi-k2.6",
    "opus": "claude-opus-4-6"
  }
}
```

当请求模型名包含 `haiku`、`sonnet` 或 `opus` 时，自动替换为目标模型，请求体中的 model 字段同步更新。

## 添加 Provider

推荐通过 Web 面板操作，也可编辑配置文件 `~/.claude-api-hub/providers.json`：

```json
"deepseek": {
  "name": "DeepSeek",
  "baseUrl": "https://api.deepseek.com/v1",
  "apiKey": "${DEEPSEEK_API_KEY}",
  "models": ["deepseek-chat"],
  "defaultModel": "deepseek-chat",
  "enabled": true,
  "prefix": "deepseek-"
}
```

### 配置字段说明

| 字段 | 说明 |
|------|------|
| `name` | 显示名称 |
| `baseUrl` | API 端点地址 |
| `apiKey` | API Key，支持 `${ENV_VAR}` 语法引用环境变量 |
| `models` | 可用模型 ID 列表 |
| `defaultModel` | 默认模型 |
| `prefix` | 路由匹配前缀，支持字符串或字符串数组 |
| `passthrough` | `true` = Anthropic Messages API（直接转发），`false` = OpenAI Chat Completions API（自动翻译） |
| `enabled` | `true` / `false` 启用或禁用 |

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | GET | Web 管理面板 |
| `/v1/messages` | POST | Anthropic Messages API 代理（主端点） |
| `/v1/models` | GET | 列出所有可用模型 |
| `/health` | GET | 网关健康检查 |
| `/api/config` | GET | 当前配置（API Key 已脱敏） |
| `/api/config/providers` | POST | 添加 Provider |
| `/api/config/providers/:name` | PUT | 更新 Provider |
| `/api/config/providers/:name` | DELETE | 删除 Provider |
| `/api/config/reload` | POST | 从磁盘重载配置 |
| `/api/aliases` | GET/PUT | 获取或更新别名映射 |
| `/api/fetch-models` | GET | 从各 Provider API 拉取真实模型列表 |
| `/api/health/providers` | GET | 测试所有 Provider 连通性 |
| `/api/logs` | GET | 请求日志（最近 200 条） |
| `/api/logs/clear` | POST | 清除日志 |

## 路由规则

1. **别名解析**：模型名包含 haiku/sonnet/opus → 替换为别名目标
2. **前缀匹配**：根据 Provider 的 `prefix` 配置匹配
3. **模型列表匹配**：检查 Provider 的 `models` 数组
4. **兜底**：使用 `defaultProvider`

## 开发

```bash
npm run dev      # 开发模式（热重载）
npm run build    # 编译
npm test         # 测试（24 个测试用例）
```

## License

MIT
