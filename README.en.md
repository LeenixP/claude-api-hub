<div align="center">

# Claude API Hub

**A gateway that routes Claude Code to any LLM provider**

[![npm version](https://img.shields.io/npm/v/claude-api-hub.svg)](https://www.npmjs.com/package/claude-api-hub)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/node/v/claude-api-hub)](package.json)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](./coverage/)
[![CI](https://github.com/LeenixP/claude-api-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/LeenixP/claude-api-hub/actions/workflows/ci.yml)

[中文](README.md) | [English](README.en.md)

</div>

<div align="center">
  <img src="docs/images/head.jpg" alt="Claude API Hub — Request Routing Flow" width="800">
</div>

A local API gateway that routes Claude Code requests to any LLM provider through model aliases (haiku / sonnet / opus). Manage everything from the web dashboard — no config file editing required.

## What's New

See [CHANGELOG.md](CHANGELOG.md) for the latest updates.

## Why Claude API Hub?

- **Use any LLM inside Claude Code** — route Sonnet requests to Kimi, GLM, MiniMax, DeepSeek, or any OpenAI-compatible API
- **Zero-config switching** — change model routing from the web dashboard without restart
- **Zero runtime dependencies** — built on Node.js native `http` module, ~50KB install size

---

## 30-Second Quick Start

```bash
# 1. Install (or run directly with npx)
npm install -g claude-api-hub

# 2. Start the gateway
claude-api-hub
# ✓ api-hub listening on http://0.0.0.0:9800

# 3. Configure Claude Code
echo '{"env":{"ANTHROPIC_BASE_URL":"http://127.0.0.1:9800"}}' > ~/.claude/settings.json

# 4. Done! Claude Code now routes through the gateway
```

> **Security note:** Binds to `0.0.0.0:9800` by default with no password. Set `password` in production.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Claude API Hub                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐ │
│  │   Dashboard  │    │  API Router  │    │   Protocol Bridge   │ │
│  │  (Web UI)    │    │              │    │                      │ │
│  │  :9800       │    │  /v1/messages│    │  Anthropic ↔ OpenAI │ │
│  │              │    │              │    │                      │ │
│  └──────────────┘    └──────┬───────┘    └──────────┬───────────┘ │
│                              │                        │             │
│                              │                        │             │
│                              ▼                        ▼             │
│                     ┌─────────────────┐       ┌────────────┐      │
│                     │  Alias Resolver │       │  Provider  │      │
│                     │  haiku → model   │       │   Pool     │      │
│                     │  sonnet → model  │       │            │      │
│                     │  opus → model    │       │ Key Health │      │
│                     └─────────────────┘       │ Fallbacks   │      │
│                                                └──────┬─────┘      │
└────────────────────────────────────────────────────────┼────────────┘
                                                         │
    ┌─────────────────────────────────────────────────────┼──────────┐
    │                       Providers                      │          │
    │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐       │
    │  │  Kimi     │ │  GLM     │ │ MiniMax   │ │   Kiro     │       │
    │  │ OpenAI    │ │  OpenAI  │ │  OpenAI   │ │  OAuth     │       │
    │  │ Compatible│ │ Compatible│ │ Compatible│ │ (AWS Q)    │       │
    │  └──────────┘ └──────────┘ └──────────┘ └────────────┘       │
    │         │           │           │              │               │
    └─────────┴───────────┴───────────┴──────────────┴───────────────┘
              │           │           │              │
              ▼           ▼           ▼              ▼
         ┌─────────────────────────────────────────────┐
         │            External LLM Providers            │
         │                                             │
         │   ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ │
         │   │ Moonshot│ │ Zhipu │ │ MiniMax│ │  AWS  │ │
         │   │  AI    │ │  AI   │ │  AI   │ │  Q    │ │
         │   └───────┘ └───────┘ └───────┘ └───────┘ │
         └─────────────────────────────────────────────┘
```

---

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Features](#features)
- [Web Dashboard](#web-dashboard)
- [Dashboard Screenshots](#dashboard-screenshots)
- [Supported Providers](#supported-providers)
- [Alias Mapping](#alias-mapping)
- [Adding Providers](#adding-providers)
- [Kiro Provider](#kiro-provider)
- [Multi-Key Configuration](#multi-key-configuration)
- [Fallback Chain](#fallback-chain)
- [API Endpoints](#api-endpoints)
- [Security](#security)
- [Logging](#logging)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### Core
- Multi-provider API gateway with model aliases (haiku/sonnet/opus → any model)
- Automatic protocol conversion (Anthropic ↔ OpenAI)
- Zero runtime dependencies — built on Node.js native modules
- Hot-reload configuration without restart

### Dashboard & Monitoring
- Real-time SSE dashboard with request monitoring
- Token usage charts, request trend graphs, and usage heatmap
- Model details table with search, sort, and pagination
- Quick start guide with copy-paste config snippets
- Provider health monitoring

### Routing & Reliability
- Fallback chain with automatic provider failover
- Multi-key pool with round-robin rotation and auto-recovery
- Per-tier timeout configuration (haiku/sonnet/opus)
- Seamless model alias mapping for provider switching

### Security
- Timing-safe authentication (constant-time comparison)
- IP-based rate limiting with standard response headers
- Session-based admin authentication
- Security headers (CSP, X-Frame-Options, etc.)

### Advanced
- Kiro OAuth integration (Google/GitHub/AWS Builder ID)
- File-based request logging with rotation
- CORS configuration
- Environment variable interpolation in config

---

## Web Dashboard

Visit `http://localhost:9800` — a Traefik-inspired dashboard with sidebar navigation, built with Preact components:

**Left Panel:**
- **Quick Start**: 3-step setup guide with copy-paste config snippets
- **Alias Mapping**: Map haiku/sonnet/opus to any model. Dropdown auto-detects models from provider APIs, or enter custom model names. Per-tier timeout configuration
- **Providers**: Cards showing name, protocol badge (Anthropic/OpenAI/Kiro), models (merged from API + config), prefix, default model, key health. Each card has test/edit/delete actions

**Right Panel:**
- **Request Logs**: Real-time SSE updates, preserves expanded state. Filter by all/ok/error. Each entry shows `claudeModel → resolvedModel → provider` with duration. Click to expand details (request ID, target URL, error message, log file path)
- **File Log Toggle**: Enable/disable detailed disk logging

**Config Page (dual mode):**
- **UI Mode**: Structured form with cards for general, security, token refresh, stream/timeout, CORS settings
- **JSON Mode**: Raw JSON editor with validation, import/export, and reset

---

## Dashboard Screenshots

<div align="center">
  <img src="docs/images/dashboard-overview.jpg" alt="Dashboard Overview" width="800">
  <p><em>Dashboard Overview — Sidebar navigation, provider cards, alias mapping, and real-time request logs</em></p>
</div>

<div align="center">
  <img src="docs/images/provider-management.jpg" alt="Provider Management" width="600">
  <p><em>Provider Management — Health status, model lists, key pool status, and action buttons</em></p>
</div>

<div align="center">
  <img src="docs/images/alias-mapping.jpg" alt="Alias Mapping" width="600">
  <p><em>Alias Mapping — Map haiku/sonnet/opus to any provider model with per-tier timeouts</em></p>
</div>

<div align="center">
  <img src="docs/images/request-logs.jpg" alt="Request Logs" width="700">
  <p><em>Request Logs — Real-time SSE updates with filtering and expandable details</em></p>
</div>

<div align="center">
  <img src="docs/images/config-editor.jpg" alt="Config Editor" width="700">
  <p><em>Config Editor — Dual mode: structured form UI and raw JSON editing</em></p>
</div>

> Run `npx claude-api-hub` and visit http://localhost:9800 to explore the dashboard.

---

## Supported Providers

| Provider | Protocol | Status |
|----------|----------|--------|
| Claude (Anthropic) | Anthropic Passthrough | Verified |
| Kiro (AWS Q / CodeWhisperer) | Kiro OAuth → AWS Q API | Verified |
| Kimi (Moonshot AI) | Anthropic Passthrough | Verified |
| MiniMax | Anthropic Passthrough | Verified |
| GLM (Zhipu AI) | Anthropic Passthrough | Verified |
| DeepSeek | Anthropic Passthrough | Verified |
| Any OpenAI-compatible API | Auto-convert (Anthropic ↔ OpenAI) | Supported |

---

## Quick Start

### Prerequisites

- Node.js >= 22

### Option 1: Run with npx (no install)

```bash
npx claude-api-hub
# ✓ api-hub listening on http://0.0.0.0:9800
# ✓ Open http://localhost:9800 for the web dashboard
```

> **Security note:** By default, the gateway binds to `0.0.0.0:9800` without a password. For production, set `password` in `providers.json` and consider binding to `127.0.0.1`.

### Option 2: Global Install

```bash
npm install -g claude-api-hub
claude-api-hub
# ✓ api-hub listening on http://0.0.0.0:9800
# ✓ Open http://localhost:9800 for the web dashboard
```

### Option 3: Docker

```bash
git clone https://github.com/LeenixP/claude-api-hub.git
cd claude-api-hub
# Edit docker-compose.yml to add your API keys
docker compose up -d
```

Dashboard: http://localhost:9800

Point Claude Code to the gateway in `~/.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:9800"
  }
}
```

Restart Claude Code — all requests now route through the gateway.

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

If `sonnet` is aliased to `kimi-k2.6`, the request is automatically routed to Kimi with protocol conversion.

---

## Alias Mapping

Map Claude Code's three model tiers to any provider's models:

```json
{
  "aliases": {
    "haiku": "glm-4-flash",
    "sonnet": "kimi-k2.6",
    "opus": "claude-opus-4-6"
  }
}
```

When a requested model contains `haiku`, `sonnet`, or `opus`, it is replaced with the alias target. Logs show both the tier name (Haiku/Sonnet/Opus) and the resolved model for easy debugging.

---

## Adding Providers

Via the web dashboard (recommended) or config file `~/.claude-api-hub/providers.json`:

```json
"deepseek": {
  "name": "DeepSeek",
  "baseUrl": "https://api.deepseek.com/anthropic",
  "apiKey": "${DEEPSEEK_API_KEY}",
  "models": ["deepseek-chat", "deepseek-reasoner"],
  "defaultModel": "deepseek-chat",
  "enabled": true,
  "prefix": "deepseek-",
  "passthrough": true
}
```

### Provider Configuration Fields

| Field | Description |
|-------|-------------|
| `name` | Display name |
| `baseUrl` | API endpoint base URL |
| `apiKey` | API key (supports `${ENV_VAR}` syntax). Not needed for Kiro OAuth providers |
| `models` | List of available model IDs |
| `defaultModel` | Default model for this provider |
| `prefix` | Routing prefix (string or array), e.g. `"kimi-"` |
| `passthrough` | `true` = Anthropic Messages API (forward as-is), `false` = OpenAI Chat Completions API (auto-convert) |
| `enabled` | `true` / `false` to enable/disable |
| `providerType` | `"standard"` (default) or `"kiro"` for Kiro OAuth providers |
| `authMode` | `"apikey"` (default) or `"oauth"` for OAuth-based auth |
| `kiroRegion` | AWS region for Kiro providers (default: `us-east-1`) |
| `kiroCredsPath` | Kiro OAuth credentials file path |
| `kiroStartUrl` | Custom AWS SSO start URL for Builder ID auth |

### Protocol Selection

Each provider can use one of three protocols — select in the provider modal form:

- **Anthropic API** (passthrough): Requests forwarded as-is via `x-api-key`. For the official Anthropic API or compatible proxies (e.g. MiniMax Anthropic endpoint)
- **OpenAI Compatible** (auto-convert): Requests auto-converted from Anthropic to OpenAI format. Auth via `Bearer` token. For Kimi, GLM, DeepSeek, and any OpenAI-compatible API
- **Kiro** (AWS Q): Select "Kiro" as provider type. Uses OAuth credentials to call Claude models via the AWS Q `generateAssistantResponse` endpoint. Authorize directly from the web UI

---

## Kiro Provider

The Kiro provider routes requests through AWS Q (CodeWhisperer), allowing you to use Claude models with Kiro OAuth credentials instead of Anthropic API keys.

### Web UI Authorization (Recommended)

1. Open the web dashboard → click **Add Provider** → select **Kiro** as provider type
2. In the **Kiro Authorization** section, choose an auth method:
   - **Sign in with Google** — one-click login, easiest option
   - **Sign in with GitHub** — one-click login, easiest option
   - **AWS Builder ID** — use your AWS developer account (requires verification code)
3. Optionally set **Region** and **Start URL** (for custom AWS SSO endpoints)
4. Click the auth button — a popup window opens for authorization
5. After authorization completes, status updates automatically
6. Click **Fetch** to load available models, then **Save**

Credentials are saved to `~/.kiro/oauth_creds.json` and auto-refreshed in the background (configurable interval, default 30 minutes).

### Manual Configuration

Alternatively, add the provider directly in the config file:

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

### Token Auto-Refresh

OAuth tokens are automatically refreshed by a background service before expiry. Configure the interval in the config page or config file:

```json
{
  "tokenRefreshMinutes": 30
}
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Web dashboard |
| `/v1/messages` | POST | Anthropic Messages API proxy (main endpoint) |
| `/v1/models` | GET | List all available models |
| `/health` | GET | Gateway health check |
| `/api/events` | GET | SSE real-time event stream |
| `/api/stats` | GET | Rate tracking stats (QPS, RPM, TPS) |
| `/api/auth/login` | POST | Password login (returns auth token) |
| `/api/config` | GET | Current config (API keys masked) |
| `/api/config/providers` | POST | Add provider (hot-reloads routes) |
| `/api/config/providers/:name` | PUT/DELETE | Update or delete provider (hot-reloads routes) |
| `/api/config/import` | POST | Import full config (replaces and reloads) |
| `/api/config/reload` | POST | Reload config from disk |
| `/api/tier-timeouts` | GET/PUT | Get or update per-tier timeout config |
| `/api/aliases` | GET/PUT | Get or update alias mappings |
| `/api/fetch-models` | GET | Fetch real model list from provider APIs |
| `/api/health/providers` | GET | Test connectivity for all providers |
| `/api/test-provider/:key` | POST | Test provider with full request flow (bypasses aliases) |
| `/api/oauth/kiro/*` | Various | Kiro OAuth flow endpoints |
| `/api/logs` | GET | Request logs (latest 200, lightweight) |
| `/api/logs/clear` | POST | Clear log buffer |
| `/api/logs/file-status` | GET | File logging status and file count |
| `/api/logs/file-toggle` | PUT | Toggle file logging on/off |

---

## Multi-Key Configuration

Each provider supports multiple API keys via the `apiKey` field. Separate keys with commas:

```json
"deepseek": {
  "apiKey": "${DEEPSEEK_KEY_1},${DEEPSEEK_KEY_2},${DEEPSEEK_KEY_3}",
  ...
}
```

The gateway manages keys through `KeyPool`:
- **Round-robin rotation**: requests distributed evenly across healthy keys
- **Auto-disable**: after 5 consecutive errors, a key is marked unhealthy and skipped
- **Auto-recovery**: unhealthy keys are re-enabled after 60 seconds
- **Success reset**: a successful request immediately resets the error counter

Key health status is visible on provider cards in the dashboard.

---

## Fallback Chain

Configure automatic failover between providers when the primary is unhealthy:

```json
{
  "fallbackChain": {
    "kimi": "deepseek",
    "deepseek": "glm"
  }
}
```

When a provider is unhealthy (all keys exhausted), routing follows the fallback chain to find a healthy alternative. Cycle detection prevents infinite loops.

---

## Routing Rules

1. **Alias resolution**: model name contains haiku/sonnet/opus → replaced with alias target
2. **Prefix match**: route by provider's `prefix` config
3. **Model list match**: check provider's `models` array
4. **Auto-select**: use first healthy enabled provider

---

## Logging

Dual-layer logging system:

- **In-memory logs** (always on): Lightweight summaries in RAM, displayed in the dashboard. Latest 200 entries with claudeModel tier, resolvedModel, provider, status, duration, error message
- **File logs** (optional): Detailed JSON files in `~/.claude-api-hub/logs/` with raw request body, converted request body, forwarding headers, upstream response. Toggle from dashboard. Auto-cleanup at 4096 files

---

## Security

- **Password login portal**: When `adminToken` is configured, the dashboard shows a login page. Authenticate with the admin password — credentials stored in localStorage, subsequent requests sent with `x-admin-token` header
- **Admin authentication**: Set `adminToken` in config or `ADMIN_TOKEN` env var to protect admin API endpoints
- **IP-based rate limiting**: Configure `rateLimitRpm` to limit requests per IP per minute
- **CORS restrictions**: Default localhost; configure `corsOrigins` for specific origins
- **Timing-safe comparison**: Admin token uses `crypto.timingSafeEqual` to prevent timing attacks
- **Env var whitelist**: Only `ANTHROPIC_*`, `MOONSHOT_*`, `MINIMAX_*`, `ZHIPUAI_*`, `OPENAI_*`, `DEEPSEEK_*` prefixes are interpolated
- **API key masking**: Keys are masked in all API responses and logs

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

---

## Troubleshooting

### Connection Refused (ECONNREFUSED)

**Symptom:** Claude Code cannot connect to the gateway.

**Solution:**
1. Verify the gateway is running: `curl http://127.0.0.1:9800/health`
2. Check `~/.claude/settings.json` is configured correctly:
   ```json
   { "env": { "ANTHROPIC_BASE_URL": "http://127.0.0.1:9800" } }
   ```
3. If using Docker, ensure port mapping: `-p 9800:9800`
4. Check firewall settings allow local connections

### 401 Unauthorized

**Symptom:** Requests return 401 errors.

**Solution:**
1. Verify API key is set correctly in providers.json
2. Check key format matches provider requirements (Bearer vs x-api-key)
3. For Kiro: ensure OAuth credentials are valid and not expired
4. Run `/api/health/providers` to test connectivity

### Model Not Found

**Symptom:** Error message indicates model not found.

**Solution:**
1. Check alias mapping is configured: `/api/aliases`
2. Verify provider is enabled: `/api/health/providers`
3. Ensure model exists in provider's model list
4. Try fetching latest models: `/api/fetch-models`

### Request Timeout

**Symptom:** Requests hang or time out.

**Solution:**
1. Check provider API status
2. Adjust timeouts in config: `streamTimeout` or `requestTimeout`
3. Check network/firewall settings
4. Try a different provider as fallback

### SSRF (Server-Side Request Forgery) Warning

**Symptom:** Suspicious internal requests are blocked.

**This is intentional security behavior.** The gateway blocks requests to:
- Private IP ranges (10.x, 172.16.x, 192.168.x, 127.x)
- Localhost addresses
- Internal cloud metadata endpoints

If you need to access internal resources, ensure the provider baseUrl uses a public endpoint.

### Docker: Cannot Access Gateway from Host

**Solution:**
1. Use `host: "0.0.0.0"` in config (not `127.0.0.1`)
2. Ensure Docker port mapping: `-p 9800:9800`
3. Run `docker compose up` for proper networking

### Port 9800 Already in Use

**Solution:**
1. Find and stop the conflicting process: `lsof -i :9800`
2. Change port in config: `API_HUB_PORT=9801`
3. Kill the existing process if safe: `kill <PID>`

---

## Roadmap

Planned features and enhancements (not yet implemented):

### In Progress
- Nothing currently in progress

### Planned
- **Gemini Support** — add Google Gemini as a routing target
- **Plugin System** — extensible architecture for custom providers and transforms
- **Webhook Integration** — real-time notifications for request events
- **Prometheus Metrics** — export metrics for Prometheus/Grafana monitoring
- **Request Replay** — replay historical requests for debugging

### Backlog
- Per-model rate limiting
- Cost tracking and budgets
- Batch request support
- Multi-region provider selection
- API key auto-rotation

---

## Development

```bash
npm run dev         # Dev mode (hot reload)
npm run dev:ui      # Frontend watch mode
npm run build       # Compile TypeScript + build UI
npm run build:ui    # Production frontend build
npm test            # Run tests (100+ tests)
npm run test:coverage # Run tests with coverage report
npm run lint        # Run ESLint
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and PR guidelines.

---

## License

MIT License — see [LICENSE](LICENSE).
