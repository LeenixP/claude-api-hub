<div align="center">

# Claude API Hub

**一行配置，让 Claude Code 接入任意 LLM 厂商。**

[![npm version](https://img.shields.io/npm/v/claude-api-hub.svg)](https://www.npmjs.com/package/claude-api-hub)
[![CI](https://github.com/LeenixP/claude-api-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/LeenixP/claude-api-hub/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/node/v/claude-api-hub)](package.json)

[English](README.md) | [中文](README.zh.md)

</div>

本地 API 网关，让 Claude Code 通过模型别名（haiku / sonnet / opus）无缝路由到任意 LLM 厂商。通过 Web 面板管理一切，无需手写配置。

## 为什么选择 Claude API Hub？

- **Claude Code 接入任意模型** — 将 Sonnet 请求路由到 Kimi、GLM、MiniMax、DeepSeek 或任何 OpenAI 兼容 API
- **零配置切换** — 在 Web 面板上修改路由，无需重启
- **零运行时依赖** — 基于 Node.js 原生 `http` 模块，安装体积约 50KB

## 目录

- [工作原理](#工作原理)
- [快速开始](#快速开始)
- [Web 管理面板](#web-管理面板)
- [支持的厂商](#支持的厂商)
- [别名映射](#别名映射)
- [添加 Provider](#添加-provider)
- [API 端点](#api-端点)
- [安全性](#安全性)
- [日志系统](#日志系统)
- [路由规则](#路由规则)
- [开发](#开发)
- [贡献](#贡献)
- [许可证](#许可证)

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

- **Web 管理面板**：左右分栏布局 — 左侧 Provider 管理和别名映射，右侧实时请求日志
- **别名映射**：将 haiku / sonnet / opus 映射到任意厂商模型，下拉框自动从 Provider API 检测可用模型，也支持自定义输入
- **协议一键切换**：每个 Provider 卡片上点击 badge 即可切换 Anthropic（透传）或 OpenAI（自动翻译）
- **健康检查**：通过真实的 `/v1/messages` 请求测试各 Provider，显示响应内容和延迟
- **模型标签管理**：标签式模型编辑器 — 添加、删除、或从 Provider API 一键拉取模型列表
- **请求日志**：2 秒自动刷新，展开状态保持不丢失，支持 All/OK/Errors 过滤，显示 Claude 请求层级（Haiku/Sonnet/Opus）
- **文件日志**：可选的详细日志记录到 `~/.claude-api-hub/logs/`，4096 文件上限自动清理
- **热重载**：增删改 Provider 和别名无需重启网关
- **流式支持**：完整的 SSE 事件流转发和转换
- **零运行时依赖**：基于 Node.js 原生 `http` 模块 — 无 Express、无 Axios、无任何依赖
- **安全防护**：Admin Token 认证、Per-IP 速率限制、CORS 限制、时序安全比较

## 支持的厂商

| 厂商 | 协议 | 状态 |
|------|------|------|
| Claude (Anthropic) | 直接透传 | 已验证 |
| Kimi (Moonshot AI) | OpenAI 兼容 | 已验证 |
| MiniMax | OpenAI 兼容 | 已验证 |
| GLM (智谱 AI) | OpenAI 兼容 | 已验证 |
| DeepSeek | OpenAI 兼容 | 已验证 |
| 任何 OpenAI 兼容 API | 自动转换 | 支持 |

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

重启 Claude Code，所有请求将通过网关路由。

## Web 管理面板

访问 `http://localhost:9800`，左右分栏布局：

**左栏：**
- **Quick Start**：3 步引导，可复制的配置片段
- **Alias Mapping**：将 haiku/sonnet/opus 映射到任意模型。下拉框自动检测 Provider API 的可用模型，也支持手动输入
- **Providers**：卡片显示名称、协议 badge（点击切换 Anthropic/OpenAI）、模型列表（API 拉取 + 配置合并）、前缀、默认模型、Key 状态。每张卡片有 Test/Edit/Del 按钮

**右栏：**
- **Request Logs**：2 秒自动刷新，展开详情不会被刷新重置。按 All/OK/Errors 过滤。每条显示 `claudeModel → resolvedModel → provider` 和耗时。点击展开查看 Request ID、目标 URL、错误信息、日志文件路径
- **File Log 开关**：启用/禁用详细文件日志

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

当请求模型名包含 `haiku`、`sonnet` 或 `opus` 时，自动替换为目标模型。日志中显示层级名称（Haiku/Sonnet/Opus）和实际调用模型，方便调试。

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
  "prefix": "deepseek-",
  "passthrough": false
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

### 协议选择

每个 Provider 可选择任一协议 — 在 Provider 卡片上点击 badge 切换：

- **Anthropic API**（透传）：请求原样转发，使用 `x-api-key` 认证。适用于 Anthropic 官方 API 或兼容代理（如 MiniMax Anthropic 端点）
- **OpenAI Compatible**（自动翻译）：请求自动从 Anthropic 格式转换为 OpenAI 格式，使用 `Bearer` 认证。适用于 Kimi、GLM、DeepSeek 等 OpenAI 兼容 API

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | GET | Web 管理面板 |
| `/v1/messages` | POST | Anthropic Messages API 代理（主端点） |
| `/v1/models` | GET | 列出所有可用模型 |
| `/health` | GET | 网关健康检查 |
| `/api/config` | GET | 当前配置（API Key 已脱敏） |
| `/api/config/providers` | POST | 添加 Provider（热重载路由） |
| `/api/config/providers/:name` | PUT/DELETE | 更新或删除 Provider（热重载路由） |
| `/api/config/reload` | POST | 从磁盘重载配置 |
| `/api/aliases` | GET/PUT | 获取或更新别名映射 |
| `/api/fetch-models` | GET | 从各 Provider API 拉取真实模型列表 |
| `/api/health/providers` | GET | 测试所有 Provider 连通性 |
| `/api/logs` | GET | 请求日志（最近 200 条，轻量级） |
| `/api/logs/clear` | POST | 清除日志 |
| `/api/logs/file-status` | GET | 文件日志状态和文件数量 |
| `/api/logs/file-toggle` | PUT | 开启/关闭文件日志 |

## 日志系统

两层日志架构：

- **内存日志**（始终开启）：轻量级摘要存储在内存中，显示在面板。最近 200 条，包含 claudeModel 层级、resolvedModel、provider、状态码、耗时、错误信息
- **文件日志**（可选）：详细 JSON 文件存储在 `~/.claude-api-hub/logs/`，包含原始请求体、转换后请求体、转发头、上游响应体。通过面板开关控制。达到 4096 个文件时自动清空

## 路由规则

1. **别名解析**：模型名包含 haiku/sonnet/opus → 替换为别名目标
2. **前缀匹配**：根据 Provider 的 `prefix` 配置匹配
3. **模型列表匹配**：检查 Provider 的 `models` 数组
4. **兜底**：使用 `defaultProvider`

## 安全性

- **Admin 认证**：在配置中设置 `adminToken` 或环境变量 `ADMIN_TOKEN` 保护管理 API
- **Per-IP 速率限制**：配置 `rateLimitRpm` 限制每 IP 每分钟请求数
- **CORS 限制**：默认只允许 localhost；通过 `corsOrigins` 配置允许的来源
- **时序安全比较**：Admin Token 使用 `crypto.timingSafeEqual` 防止时序攻击
- **环境变量白名单**：仅允许 `ANTHROPIC_*`、`MOONSHOT_*`、`MINIMAX_*`、`ZHIPUAI_*`、`OPENAI_*`、`DEEPSEEK_*` 前缀
- **API Key 脱敏**：所有 API 响应和日志中的 Key 均已脱敏

详见 [SECURITY.md](SECURITY.md)。

## 开发

```bash
npm run dev      # 开发模式（热重载）
npm run build    # 编译
npm test         # 测试（60 个测试用例）
```

## 贡献

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

MIT
