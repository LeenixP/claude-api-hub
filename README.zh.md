# Claude API Hub

本地 API 网关，让 Claude Code 通过模型别名（haiku / sonnet / opus）无缝路由到任意 LLM 厂商。

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

Claude Code 发出的请求始终是 Anthropic Messages API 格式。网关拦截后：

1. 根据别名映射（haiku/sonnet/opus → 目标模型）解析实际模型
2. 根据模型名前缀路由到对应 Provider
3. 对非 Claude 厂商自动完成 Anthropic ↔ OpenAI 协议转换

## 核心特性

- **别名映射**：将 haiku / sonnet / opus 映射到任意厂商的任意模型
- **通用 Provider**：支持任意 OpenAI 兼容 API，配置即用
- **协议自动转换**：Anthropic Messages API ↔ OpenAI Chat Completions API
- **流式支持**：完整的 SSE 事件流转发和转换
- **Claude 透传**：Claude 模型零开销直接转发
- **零运行时依赖**：网关核心使用 Node.js 原生 `http` 模块

## 快速开始

### 安装

```bash
# npm 全局安装
npm install -g claude-api-hub

# 或从源码
git clone https://github.com/LeenixP/claude-api-hub.git
cd claude-api-hub
npm install && npm run build
```

### 配置

配置文件位置：`~/.claude-api-hub/providers.json`

```json
{
  "port": 9800,
  "host": "0.0.0.0",
  "defaultProvider": "claude",
  "aliases": {
    "haiku": "kimi-k2.6",
    "sonnet": "MiniMax-M2.7",
    "opus": "claude-opus-4-6"
  },
  "providers": {
    "claude": {
      "name": "Claude (Anthropic)",
      "baseUrl": "https://api.anthropic.com",
      "apiKey": "${ANTHROPIC_AUTH_TOKEN}",
      "models": ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"],
      "defaultModel": "claude-sonnet-4-6",
      "enabled": true,
      "prefix": "claude-",
      "passthrough": true
    },
    "kimi": {
      "name": "Kimi (Moonshot AI)",
      "baseUrl": "https://api.moonshot.cn/v1",
      "apiKey": "${MOONSHOT_API_KEY}",
      "models": ["kimi-k2.6", "kimi-k2.5", "kimi-k2"],
      "defaultModel": "kimi-k2.6",
      "enabled": true,
      "prefix": "kimi-"
    },
    "minimax": {
      "name": "MiniMax",
      "baseUrl": "https://api.minimaxi.com/v1",
      "apiKey": "${MINIMAX_API_KEY}",
      "models": ["MiniMax-M2.7", "MiniMax-M2.5", "MiniMax-M2.1"],
      "defaultModel": "MiniMax-M2.7",
      "enabled": true,
      "prefix": ["minimax-", "MiniMax-"]
    },
    "glm": {
      "name": "GLM (Zhipu AI)",
      "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
      "apiKey": "${ZHIPUAI_API_KEY}",
      "models": ["glm-4-plus", "glm-4", "glm-4-air", "glm-4-flash"],
      "defaultModel": "glm-4-plus",
      "enabled": true,
      "prefix": "glm-"
    }
  }
}
```

### 配置说明

| 字段 | 说明 |
|------|------|
| `aliases` | 别名映射，key 为 haiku/sonnet/opus，value 为目标模型全名 |
| `apiKey` | 支持 `${ENV_VAR}` 语法引用环境变量 |
| `prefix` | 模型路由匹配前缀，支持字符串或字符串数组 |
| `passthrough` | 设为 `true` 表示直接转发 Anthropic 格式（仅 Claude 需要） |
| `enabled` | 设为 `false` 可临时禁用某个 Provider |

### 设置环境变量

```bash
# ~/.bashrc 或 ~/.zshrc
export ANTHROPIC_AUTH_TOKEN="your-anthropic-key"
export MOONSHOT_API_KEY="your-kimi-key"
export MINIMAX_API_KEY="your-minimax-key"
export ZHIPUAI_API_KEY="your-glm-key"
```

### 启动

```bash
claude-api-hub
```

### 配置 Claude Code

修改 `~/.claude/settings.json`：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:9800"
  }
}
```

## 别名映射

这是本项目的核心功能。通过 `aliases` 配置，你可以将 Claude Code 中的三个模型层级映射到任意厂商的任意模型：

```json
{
  "aliases": {
    "haiku": "glm-4-flash",
    "sonnet": "kimi-k2.6",
    "opus": "claude-opus-4-6"
  }
}
```

映射规则：当请求的模型名包含 `haiku`、`sonnet` 或 `opus` 关键字时，自动替换为对应的目标模型。

例如上面的配置下：
- `claude-haiku-4-5` → 实际调用 `glm-4-flash`（智谱 AI）
- `claude-sonnet-4-6` → 实际调用 `kimi-k2.6`（月之暗面）
- `claude-opus-4-6` → 实际调用 `claude-opus-4-6`（Anthropic 原生）

这样你可以在不改变 Claude Code 使用习惯的前提下，灵活切换底层模型。

## 添加自定义 Provider

任何 OpenAI 兼容的 API 都可以接入，在配置文件的 `providers` 中添加即可：

```json
"deepseek": {
  "name": "DeepSeek",
  "baseUrl": "https://api.deepseek.com/v1",
  "apiKey": "${DEEPSEEK_API_KEY}",
  "models": ["deepseek-chat", "deepseek-coder"],
  "defaultModel": "deepseek-chat",
  "enabled": true,
  "prefix": "deepseek-"
}
```

然后在 `aliases` 中映射即可使用：

```json
{
  "aliases": {
    "sonnet": "deepseek-chat"
  }
}
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/v1/messages` | POST | Anthropic Messages API 代理（主端点） |
| `/v1/models` | GET | 列出所有可用模型 |
| `/health` | GET | 健康检查 |

## 路由规则

1. 检查别名：请求模型名包含 haiku/sonnet/opus → 替换为 aliases 中的目标模型
2. 前缀匹配：根据 Provider 的 `prefix` 配置匹配
3. 精确匹配：检查 Provider 的 `models` 列表
4. 兜底：使用 `defaultProvider`

## 开发

```bash
npm run dev      # 开发模式（热重载）
npm run build    # 编译
npm test         # 测试
```

## License

MIT
