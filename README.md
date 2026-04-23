<div align="center">

# Claude API Hub

**Route Claude Code to any LLM provider with a single config change.**

[![npm version](https://img.shields.io/npm/v/claude-api-hub.svg)](https://www.npmjs.com/package/claude-api-hub)
[![CI](https://github.com/LeenixP/claude-api-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/LeenixP/claude-api-hub/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/node/v/claude-api-hub)](package.json)

[English](README.md) | [中文](README.zh.md)

</div>

A local API gateway that lets Claude Code route requests to any LLM provider via model aliases (haiku / sonnet / opus). Manage everything from a Web dashboard — no config files needed.

## Why Claude API Hub?

- **Use any LLM with Claude Code** — Route Sonnet requests to Kimi, GLM, MiniMax, DeepSeek, or any OpenAI-compatible API
- **Zero config switching** — Change model routing from the web dashboard, no restart needed
- **Zero runtime dependencies** — Built on Node.js native `http` module, ~50KB installed

## Table of Contents

- [How It Works](#how-it-works)
- [Quick Start](#quick-start)
- [Web Dashboard](#web-dashboard)
- [Supported Providers](#supported-providers)
- [Alias Mapping](#alias-mapping)
- [Adding Providers](#adding-providers)
- [Kiro Provider](#kiro-provider)
- [API Endpoints](#api-endpoints)
- [Security](#security)
- [Logging](#logging)
- [Routing Rules](#routing-rules)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## How It Works

```
Claude Code ──► ANTHROPIC_BASE_URL=http://127.0.0.1:9800
                        │
                  API Gateway
                        │ aliases: sonnet → kimi-k2.6
          ┌─────────────┼─────────────┬──────────────┐
          ▼             ▼             ▼              ▼
       Claude         Kimi        MiniMax          GLM
    (passthrough)  (translate)  (translate)    (translate)
```

The gateway intercepts Anthropic Messages API requests from Claude Code, resolves model aliases, routes to the matching provider, and auto-translates between Anthropic and OpenAI protocols as needed.

## Features

- **Web Dashboard**: Split-panel layout — providers & aliases on the left, live request logs on the right
- **Alias Mapping**: Map haiku / sonnet / opus to any provider's model via combo dropdown with auto-detection from provider APIs
- **Protocol Toggle**: Switch between Anthropic (passthrough) and OpenAI (auto-translate) per provider with one click
- **Provider Health Check**: Test each provider with real `/v1/messages` requests, shows response text and latency
- **Model Management**: Tag-based model editor — add, remove, or fetch models from provider APIs
- **Request Logging**: Live auto-refreshing logs with tier detection (Haiku/Sonnet/Opus), expandable details, and filter by status
- **File Logging**: Optional detailed logging to `~/.claude-api-hub/logs/` with 4096 file limit and auto-cleanup
- **Hot Reload**: Add/edit/delete providers and aliases without restarting the gateway
- **Streaming**: Full SSE event stream forwarding and translation
- **Zero Runtime Deps**: Built on Node.js native `http` module — no Express, no Axios, no dependencies
- **Security**: Admin token auth, per-IP rate limiting, CORS restriction, timing-safe comparison

## Supported Providers

| Provider | Protocol | Status |
|----------|----------|--------|
| Claude (Anthropic) | Passthrough | Verified |
| Kiro (AWS Q / CodeWhisperer) | Kiro OAuth → AWS Q API | Verified |
| Kimi (Moonshot AI) | OpenAI Compatible | Verified |
| MiniMax | OpenAI Compatible | Verified |
| GLM (Zhipu AI) | OpenAI Compatible | Verified |
| DeepSeek | OpenAI Compatible | Verified |
| Any OpenAI-compatible API | Auto-translate | Supported |

## Quick Start

### Prerequisites

- Node.js >= 22

### Install & Run

```bash
npm install -g claude-api-hub
claude-api-hub
# ✓ api-hub listening on http://0.0.0.0:9800
# ✓ Open http://localhost:9800 for the web dashboard
```

Open `http://localhost:9800` to access the Web dashboard.

Point Claude Code at the gateway in `~/.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:9800"
  }
}
```

Restart Claude Code and all requests will route through the gateway.

### Verify

```bash
curl http://localhost:9800/health
# {"status":"ok","timestamp":"..."}
```

### Example Request

```bash
curl -X POST http://localhost:9800/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-key" \
  -d '{"model":"claude-sonnet-4-6","max_tokens":100,"messages":[{"role":"user","content":"Hello"}]}'
```

If `sonnet` is aliased to `kimi-k2.6`, the request is auto-routed to Kimi with protocol translation.

## Web Dashboard

Access `http://localhost:9800` — split into two panels:

**Left Panel:**
- **Quick Start**: 3-step setup guide with copyable config snippet
- **Alias Mapping**: Map haiku/sonnet/opus to any model. Combo dropdown auto-detects models from provider APIs, also accepts custom model names
- **Providers**: Cards showing name, protocol badge (click to toggle Anthropic/OpenAI), models (merged from API + config), prefix, default model, key status. Test/Edit/Delete buttons on each card

**Right Panel:**
- **Request Logs**: Auto-refreshes every 2s, preserves expanded state. Filter by All/OK/Errors. Each entry shows `claudeModel → resolvedModel → provider` with duration. Click to expand details (request ID, target URL, error info, log file path)
- **File Log Toggle**: Enable/disable detailed file logging to disk

## Alias Mapping

Map Claude Code's three model tiers to any provider's model:

```json
{
  "aliases": {
    "haiku": "glm-4-flash",
    "sonnet": "kimi-k2.6",
    "opus": "claude-opus-4-6"
  }
}
```

When a request model contains `haiku`, `sonnet`, or `opus`, it's replaced with the alias target. Logs show the tier name (Haiku/Sonnet/Opus) alongside the resolved model for easy debugging.

## Adding Providers

Via the Web dashboard (recommended) or config file at `~/.claude-api-hub/providers.json`:

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

### Provider Config Fields

| Field | Description |
|-------|-------------|
| `name` | Display name |
| `baseUrl` | API endpoint base URL |
| `apiKey` | API key (supports `${ENV_VAR}` syntax) |
| `models` | List of available model IDs |
| `defaultModel` | Default model for this provider |
| `prefix` | Routing prefix (string or array), e.g. `"kimi-"` |
| `passthrough` | `true` = Anthropic Messages API (direct forward), `false` = OpenAI Chat Completions API (auto-translate) |
| `enabled` | `true` / `false` to enable/disable |

### Protocol Selection

Each provider can use either protocol — toggle via the badge on the provider card:

- **Anthropic API** (passthrough): Request forwarded as-is via `x-api-key`. Use for Anthropic official API or compatible proxies (e.g. MiniMax Anthropic endpoint)
- **OpenAI Compatible** (auto-translate): Request auto-translated from Anthropic to OpenAI format. Auth via `Bearer` token. Use for Kimi, GLM, DeepSeek, and any OpenAI-compatible API
- **Kiro** (AWS Q): Uses Kiro OAuth credentials to call Claude models via AWS Q `generateAssistantResponse` endpoint. Requires a Kiro OAuth credentials file (see below)

## Kiro Provider

The Kiro provider routes requests through AWS Q (CodeWhisperer), allowing you to use Claude models with Kiro OAuth credentials instead of an Anthropic API key.

### Setup

1. Obtain Kiro OAuth credentials (via Kiro IDE login or AWS Builder ID)
2. Save the credentials JSON file (containing `accessToken`, `refreshToken`, etc.)
3. Add the provider in the dashboard or config:

```json
"kiro": {
  "name": "Kiro",
  "baseUrl": "https://q.us-east-1.amazonaws.com",
  "apiKey": "/path/to/kiro-credentials.json",
  "models": ["claude-sonnet-4-6", "claude-haiku-4-5"],
  "defaultModel": "claude-sonnet-4-6",
  "enabled": true,
  "prefix": "kiro-",
  "passthrough": true
}
```

### Credentials Format

**Social Auth** (Google/GitHub):
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

**Builder ID**:
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

Tokens are automatically refreshed when expired.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Web dashboard |
| `/v1/messages` | POST | Anthropic Messages API proxy (main endpoint) |
| `/v1/models` | GET | List all available models |
| `/health` | GET | Gateway health check |
| `/api/config` | GET | Current config (API keys masked) |
| `/api/config/providers` | POST | Add provider (hot-reloads router) |
| `/api/config/providers/:name` | PUT/DELETE | Update or delete provider (hot-reloads router) |
| `/api/config/reload` | POST | Reload config from disk |
| `/api/aliases` | GET/PUT | Get or update alias mapping |
| `/api/fetch-models` | GET | Fetch real model lists from provider APIs |
| `/api/health/providers` | GET | Test connectivity to all providers |
| `/api/logs` | GET | Request logs (last 200, lightweight) |
| `/api/logs/clear` | POST | Clear log buffer |
| `/api/logs/file-status` | GET | File logging status and file count |
| `/api/auth/login` | POST | Password login (returns auth token) |
| `/api/logs/file-toggle` | PUT | Toggle file logging on/off |

## Logging

Two-tier logging system:

- **Memory logs** (always on): Lightweight summaries in RAM, shown in dashboard. Last 200 entries with claudeModel tier, resolvedModel, provider, status, duration, error message
- **File logs** (opt-in): Detailed JSON files at `~/.claude-api-hub/logs/` including original request body, translated request body, forwarded headers, upstream response. Toggle via dashboard. Auto-cleans at 4096 files

## Routing Rules

1. **Alias resolution**: Model name containing haiku/sonnet/opus → replaced with alias target
2. **Prefix match**: Route by provider's `prefix` config
3. **Model list match**: Check provider's `models` array
4. **Fallback**: Use `defaultProvider`

## Security

- **Password Login Portal**: The dashboard shows a login page when `adminToken` is configured. Enter the admin password to authenticate — credentials are stored in localStorage and sent as `x-admin-token` header on subsequent requests
- **Admin Auth**: Set `adminToken` in config or `ADMIN_TOKEN` env var to protect management API endpoints
- **Per-IP Rate Limiting**: Configure `rateLimitRpm` to limit requests per minute per IP
- **CORS Restriction**: Defaults to localhost; configure `corsOrigins` for specific origins
- **Timing-Safe Comparison**: Admin token uses `crypto.timingSafeEqual` to prevent timing attacks
- **Env Var Whitelist**: Only `ANTHROPIC_*`, `MOONSHOT_*`, `MINIMAX_*`, `ZHIPUAI_*`, `OPENAI_*`, `DEEPSEEK_*` prefixes are interpolated
- **API Key Masking**: Keys are masked in all API responses and logs

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Development

```bash
npm run dev      # Dev mode (hot reload)
npm run build    # Compile TypeScript
npm test         # Run tests (77 tests)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and PR guidelines.

## License

MIT
