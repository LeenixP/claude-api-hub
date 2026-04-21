# Claude API Hub

一个本地 API 网关，让 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 能够同时使用多家 LLM 厂商的模型。通过模型名称自动路由到对应的 API 后端，在同一个会话中无缝切换不同厂商的模型。

## 工作原理

```
Claude Code ──► ANTHROPIC_BASE_URL=http://127.0.0.1:9800
                        │
                  API 网关 (本项目)
                        │ 根据 model 字段路由
          ┌─────────────┼─────────────┬──────────────┐
          ▼             ▼             ▼              ▼
       Claude         Kimi        MiniMax          GLM
     (Anthropic)   (Moonshot)    (MiniMax)      (智谱 AI)
      直接透传      协议转换       协议转换       协议转换
```

网关接收 Anthropic Messages API 格式的请求，检查 `model` 字段，路由到对应后端。对于非 Claude 厂商，自动完成 Anthropic ↔ OpenAI 协议转换。

## 特性

- **通用 Provider 系统**：支持任意 OpenAI 兼容的 API，在配置文件中添加即可，无需改代码
- **Web 管理面板**：可视化管理 Provider、测试模型、查看请求日志
- **协议自动转换**：Anthropic Messages API ↔ OpenAI Chat Completions API
- **流式支持**：完整的 SSE 事件流转发和转换
- **Claude 透传**：Claude 模型零开销直接转发
- **零运行时依赖**：网关核心使用 Node.js 原生 `http` 模块

## 快速开始

### 方式一：npm 全局安装

```bash
npm install -g claude-api-hub
```

### 方式二：从源码安装

```bash
git clone https://github.com/LeenixP/claude-api-hub.git
cd claude-api-hub
npm install
npm run build
```

### 配置 API Key

在 shell 配置文件（`~/.bashrc` 或 `~/.zshrc`）中添加：

```bash
# Claude (Anthropic 官方或中转)
export ANTHROPIC_AUTH_TOKEN="your-anthropic-key"

# Kimi (月之暗面)
export MOONSHOT_API_KEY="your-kimi-key"

# MiniMax
export MINIMAX_API_KEY="your-minimax-key"

# GLM (智谱 AI)
export ZHIPUAI_API_KEY="your-glm-key"
```

### 配置 Provider

配置文件位置：`~/.claude-api-hub/providers.json`

首次运行会使用内置默认配置。你也可以手动创建：

```json
{
  "port": 9800,
  "host": "0.0.0.0",
  "logLevel": "info",
  "defaultProvider": "claude",
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
      "name": "GLM (智谱 AI)",
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

配置说明：
- `apiKey` 支持 `${ENV_VAR}` 语法引用环境变量
- `prefix` 用于模型路由匹配，支持字符串或字符串数组
- `passthrough: true` 表示直接转发 Anthropic 格式（仅 Claude 需要）
- `enabled: false` 可临时禁用某个 Provider

### 启动网关

```bash
# npm 全局安装后
claude-api-hub

# 或使用管理脚本
chmod +x bin/hub.sh
bin/hub.sh start     # 后台启动
bin/hub.sh status    # 查看状态
bin/hub.sh stop      # 停止
bin/hub.sh restart   # 重启
bin/hub.sh logs      # 查看日志
```

网关默认监听 `http://0.0.0.0:9800`。

### 配置 Claude Code

修改 `~/.claude/settings.json`：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:9800"
  }
}
```

局域网内其他设备使用：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://192.168.x.x:9800"
  }
}
```

### 使用不同模型

```bash
# 使用 Kimi
claude --model kimi-k2.6 -p "你好"

# 使用 MiniMax
claude --model MiniMax-M2.7 -p "你好"

# 使用 GLM
claude --model glm-4-plus -p "你好"

# Claude 照常使用
claude --model claude-sonnet-4-6 -p "你好"
```

## 添加自定义 Provider

任何 OpenAI 兼容的 API 都可以接入，无需修改代码。

### 方式一：编辑配置文件

在 `~/.claude-api-hub/providers.json` 的 `providers` 中添加：

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

重启网关后即可使用 `claude --model deepseek-chat`。

### 方式二：通过 Web 管理面板

打开 `http://localhost:9800`，在 Provider Management 区域点击 "Add Provider"，填写表单后保存。

### 方式三：通过 API

```bash
curl -X POST http://localhost:9800/api/config/providers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "DeepSeek",
    "baseUrl": "https://api.deepseek.com/v1",
    "apiKey": "your-key",
    "models": ["deepseek-chat", "deepseek-coder"],
    "defaultModel": "deepseek-chat",
    "enabled": true,
    "prefix": "deepseek-"
  }'
```

## Web 管理面板

访问 `http://localhost:9800` 打开管理面板，功能包括：

- 查看所有 Provider 状态和健康检查
- 在线测试任意模型（发送消息、查看响应和 token 用量）
- 请求日志（最近 50 条）
- 增删改 Provider（无需重启）
- 一键复制配置命令

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | GET | Web 管理面板 |
| `/v1/messages` | POST | Anthropic Messages API（主代理端点） |
| `/v1/models` | GET | 列出所有可用模型 |
| `/health` | GET | 健康检查 |
| `/api/config` | GET | 获取当前配置（API Key 已脱敏） |
| `/api/config/providers` | POST | 添加 Provider |
| `/api/config/providers/:name` | PUT | 更新 Provider |
| `/api/config/providers/:name` | DELETE | 删除 Provider |
| `/api/config/reload` | POST | 重新加载配置文件 |

## 路由规则

网关根据请求中的 `model` 字段匹配 Provider：

1. 检查每个 Provider 配置的 `prefix`，匹配则路由到该 Provider
2. 检查每个 Provider 的 `models` 列表，精确匹配则路由
3. 都不匹配则使用 `defaultProvider`

## Claude Code 插件

`plugin/` 目录包含一个 Claude Code 插件：

- MCP 工具：`hub_list_models`（列出模型）、`hub_status`（健康检查）、`hub_set_default`（设置默认模型）
- Skill：`/switch-model` 快速切换模型
- 安装脚本：`plugin/install.sh`

## 开发

```bash
npm run dev      # 开发模式（热重载）
npm run build    # 编译 TypeScript
npm test         # 运行测试
```

## License

MIT
