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
- [Kiro Provider](#kiro-provider)
- [多 Key 配置](#多-key-配置)
- [Fallback 链](#fallback-链)
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
- **导航标签页**：Dashboard、配置编辑器、使用指南三个标签页
- **SSE 实时推送**：通过 `/api/events` 端点实时推送事件，驱动面板实时更新
- **多 Key 池**：Round-Robin 轮询分配请求，自动健康检测与恢复
- **Fallback 链**：主 Provider 不健康时自动路由到备用 Provider，支持循环检测
- **速率追踪**：通过 `/api/stats` 端点实时查看 QPS/RPM/TPS 指标
- **配置编辑器**：双模式配置编辑器 — 结构化 UI 表单或原始 JSON 编辑器，支持校验、导入/导出
- **使用指南**：管理面板内置交互式使用指南
- **别名映射**：将 haiku / sonnet / opus 映射到任意厂商模型，下拉框自动从 Provider API 检测可用模型，也支持自定义输入
- **协议选择**：在 Provider 编辑弹窗内选择 Anthropic（透传）或 OpenAI（自动翻译）协议
- **Kiro OAuth 授权**：在 Web 面板一键完成 Kiro OAuth 授权（Google、GitHub 或 AWS Builder ID），无需手动管理凭据文件
- **Token 自动刷新**：后台服务在 Token 过期前自动刷新 OAuth 凭据（可配置间隔，默认 30 分钟）
- **Provider 测试**：通过完整的 Claude Code 请求流程测试每个 Provider，绕过别名路由直接验证连通性
- **健康检查**：通过真实请求测试各 Provider，显示响应内容和延迟
- **模型标签管理**：标签式模型编辑器 — 添加、删除、或从 Provider API 一键拉取模型列表。Kiro 模型从内置列表获取
- **请求日志**：SSE 实时更新，展开状态保持不丢失，支持 All/OK/Errors 过滤，显示 Claude 请求层级（Haiku/Sonnet/Opus）
- **文件日志**：可选的详细日志记录到 `~/.claude-api-hub/logs/`，4096 文件上限自动清理
- **热重载**：增删改 Provider 和别名无需重启网关
- **流式支持**：完整的 SSE 事件流转发和转换
- **分层超时**：按模型层级（haiku/sonnet/opus）配置超时/流超时/空闲超时
- **零运行时依赖**：基于 Node.js 原生 `http` 模块 — 无 Express、无 Axios、无任何依赖
- **安全防护**：密码登录门户、Admin Token 认证、Per-IP 速率限制、CORS 限制、时序安全比较

## 支持的厂商

| 厂商 | 协议 | 状态 |
|------|------|------|
| Claude (Anthropic) | 直接透传 | 已验证 |
| Kiro (AWS Q / CodeWhisperer) | Kiro OAuth → AWS Q API | 已验证 |
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
- **Alias Mapping**：将 haiku/sonnet/opus 映射到任意模型。下拉框自动检测 Provider API 的可用模型，也支持手动输入。支持分层超时配置
- **Providers**：卡片显示名称、协议 badge（Anthropic/OpenAI/Kiro）、模型列表（API 拉取 + 配置合并）、前缀、默认模型、Key 状态。每张卡片有 Test/Edit/Del 按钮

**右栏：**
- **Request Logs**：SSE 实时更新，展开详情不会被刷新重置。按 All/OK/Errors 过滤。每条显示 `claudeModel → resolvedModel → provider` 和耗时。点击展开查看 Request ID、目标 URL、错误信息、日志文件路径
- **File Log 开关**：启用/禁用详细文件日志

**配置页面（双模式）：**
- **UI 模式**：结构化表单，包含通用设置、安全、Token 刷新、流超时、CORS 等配置卡片
- **JSON 模式**：原始 JSON 编辑器，支持校验、导入/导出、重置

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
| `apiKey` | API Key，支持 `${ENV_VAR}` 语法引用环境变量。Kiro OAuth 模式不需要 |
| `models` | 可用模型 ID 列表 |
| `defaultModel` | 默认模型 |
| `prefix` | 路由匹配前缀，支持字符串或字符串数组 |
| `passthrough` | `true` = Anthropic Messages API（直接转发），`false` = OpenAI Chat Completions API（自动翻译） |
| `enabled` | `true` / `false` 启用或禁用 |
| `providerType` | `"standard"`（默认）或 `"kiro"` 用于 Kiro OAuth |
| `authMode` | `"apikey"`（默认）或 `"oauth"` 用于 OAuth 认证 |
| `kiroRegion` | Kiro Provider 的 AWS 区域（默认 `us-east-1`） |
| `kiroCredsPath` | Kiro OAuth 凭据文件路径 |
| `kiroStartUrl` | 自定义 AWS SSO 登录页面链接（Builder ID 认证用） |

### 协议选择

每个 Provider 可选择以下协议之一 — 在 Provider 编辑弹窗内选择：

- **Anthropic API**（透传）：请求原样转发，使用 `x-api-key` 认证。适用于 Anthropic 官方 API 或兼容代理（如 MiniMax Anthropic 端点）
- **OpenAI Compatible**（自动翻译）：请求自动从 Anthropic 格式转换为 OpenAI 格式，使用 `Bearer` 认证。适用于 Kimi、GLM、DeepSeek 等 OpenAI 兼容 API
- **Kiro**（AWS Q）：选择 "Kiro" 作为 Provider 类型。使用 OAuth 凭据通过 AWS Q `generateAssistantResponse` 端点调用 Claude 模型。可直接在 Web 面板完成授权

## Kiro Provider

Kiro Provider 通过 AWS Q（CodeWhisperer）路由请求，让你使用 Kiro OAuth 凭据而非 Anthropic API Key 来调用 Claude 模型。

### Web UI 授权（推荐）

1. 打开 Web 面板 → 点击 **Add Provider** → Provider Type 选择 **Kiro**
2. 在 **Kiro Authorization** 区域选择认证方式：
   - **Sign in with Google** — 一键登录，最简单
   - **Sign in with GitHub** — 一键登录，最简单
   - **AWS Builder ID** — 使用 AWS 开发者账号（需要输入验证码）
3. 可选设置 **Region** 和 **Start URL**（自定义 AWS SSO 登录页面）
4. 点击认证按钮 — 弹窗打开进行授权
5. 授权完成后状态自动更新
6. 点击 **Fetch** 加载可用模型，然后 **Save**

凭据保存到 `~/.kiro/oauth_creds.json`，后台自动刷新（可配置间隔，默认 30 分钟）。

### 手动配置

也可以直接在配置文件中添加：

```json
"kiro": {
  "name": "Kiro",
  "baseUrl": "https://q.us-east-1.amazonaws.com",
  "apiKey": "",
  "models": ["claude-sonnet-4-6", "claude-haiku-4-5"],
  "defaultModel": "claude-sonnet-4-6",
  "enabled": true,
  "providerType": "kiro",
  "authMode": "oauth",
  "kiroRegion": "us-east-1",
  "kiroCredsPath": "~/.kiro/oauth_creds.json"
}
```

### 凭据格式

**Social Auth**（Google/GitHub）：
```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "profileArn": "arn:aws:...",
  "expiresAt": "2025-01-01T00:00:00.000Z",
  "authMethod": "social",
  "region": "us-east-1"
}
```

**Builder ID**：
```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "clientId": "...",
  "clientSecret": "...",
  "authMethod": "builder-id",
  "idcRegion": "us-east-1"
}
```

### Token 自动刷新

OAuth Token 由后台服务在过期前自动刷新。在配置页面或配置文件中设置刷新间隔：

```json
{
  "tokenRefreshMinutes": 30
}
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | GET | Web 管理面板 |
| `/v1/messages` | POST | Anthropic Messages API 代理（主端点） |
| `/v1/models` | GET | 列出所有可用模型 |
| `/health` | GET | 网关健康检查 |
| `/api/events` | GET | SSE 实时事件流 |
| `/api/stats` | GET | 速率追踪统计（QPS、RPM、TPS） |
| `/api/auth/login` | POST | 密码登录（返回认证 token） |
| `/api/config` | GET | 当前配置（API Key 已脱敏） |
| `/api/config/providers` | POST | 添加 Provider（热重载路由） |
| `/api/config/providers/:name` | PUT/DELETE | 更新或删除 Provider（热重载路由） |
| `/api/config/import` | POST | 导入完整配置（替换并重载） |
| `/api/config/reload` | POST | 从磁盘重载配置 |
| `/api/tier-timeouts` | GET/PUT | 获取或更新分层超时配置 |
| `/api/aliases` | GET/PUT | 获取或更新别名映射 |
| `/api/fetch-models` | GET | 从各 Provider API 拉取真实模型列表 |
| `/api/health/providers` | GET | 测试所有 Provider 连通性 |
| `/api/test-provider/:key` | POST | 测试指定 Provider 的完整请求流程（绕过别名） |
| `/api/oauth/kiro/auth-url` | POST | 启动 Kiro OAuth 流程（返回授权 URL） |
| `/api/oauth/kiro/result` | GET | 轮询 OAuth 授权结果 |
| `/api/oauth/kiro/status` | GET | 检查 Kiro 凭据状态 |
| `/api/oauth/kiro/refresh` | POST | 手动刷新 Kiro 凭据 |
| `/api/oauth/kiro/cancel` | POST | 取消进行中的 OAuth 流程 |
| `/api/oauth/kiro/import` | POST | 导入 AWS SSO 凭据 |
| `/api/oauth/kiro/models` | GET | 列出可用的 Kiro 模型 |
| `/api/logs` | GET | 请求日志（最近 200 条，轻量级） |
| `/api/logs/clear` | POST | 清除日志 |
| `/api/logs/file-status` | GET | 文件日志状态和文件数量 |
| `/api/logs/file-toggle` | PUT | 开启/关闭文件日志 |

## 日志系统

两层日志架构：

- **内存日志**（始终开启）：轻量级摘要存储在内存中，显示在面板。最近 200 条，包含 claudeModel 层级、resolvedModel、provider、状态码、耗时、错误信息
- **文件日志**（可选）：详细 JSON 文件存储在 `~/.claude-api-hub/logs/`，包含原始请求体、转换后请求体、转发头、上游响应体。通过面板开关控制。达到 4096 个文件时自动清空

## 多 Key 配置

每个 Provider 支持多个 API Key，用逗号分隔：

```json
"deepseek": {
  "apiKey": "${DEEPSEEK_KEY_1},${DEEPSEEK_KEY_2},${DEEPSEEK_KEY_3}",
  ...
}
```

网关通过 `KeyPool` 管理多 Key：
- **Round-Robin 轮询**：请求均匀分配到健康的 Key
- **自动禁用**：连续 5 次错误后，Key 被标记为不健康并跳过
- **自动恢复**：不健康的 Key 在 60 秒后自动重新启用
- **成功重置**：一次成功请求立即重置错误计数

Key 健康状态可在面板的 Provider 卡片中查看。

## Fallback 链

配置 Provider 之间的自动故障转移：

```json
{
  "fallbackChain": {
    "kimi": "deepseek",
    "deepseek": "glm"
  }
}
```

当 Provider 不健康（所有 Key 耗尽）时，路由器沿 Fallback 链查找健康的替代 Provider。内置循环检测防止无限循环。

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
npm test         # 测试（100+ 个测试用例）
```

## 贡献

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

MIT
