# Claude API Hub

A local API gateway that lets Claude Code route requests to any LLM provider via model aliases (haiku / sonnet / opus). Manage everything from a Web dashboard — no config files needed.

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

The gateway intercepts Anthropic Messages API requests from Claude Code, resolves model aliases, routes to the matching provider, and auto-translates between Anthropic and OpenAI protocols for non-Claude providers.

## Features

- **Web Dashboard**: Manage providers, aliases, and monitor requests — no config editing needed
- **Alias Mapping**: Map haiku / sonnet / opus to any provider's model, with auto-detection from provider APIs
- **Protocol Selection**: Choose Anthropic (passthrough) or OpenAI (auto-translate) per provider
- **Provider Health Check**: Test connectivity to each provider from the dashboard
- **Request Logging**: Detailed logs with request ID, routing chain, timing, and full error details
- **Hot Reload**: Add/edit/delete providers and aliases without restarting
- **Streaming**: Full SSE event stream forwarding and translation
- **Zero Runtime Deps**: Built on Node.js native `http` module (only `eventsource-parser` for SSE)

## Quick Start

```bash
npm install -g claude-api-hub
claude-api-hub
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

## Web Dashboard

Access `http://localhost:9800` for:

- **Quick Start**: Shows gateway URL and copyable Claude Code config snippet
- **Alias Mapping**: Map haiku/sonnet/opus to any model via combo dropdown (auto-detects models from provider APIs, also accepts custom model names)
- **Providers**: Add/edit/delete providers, view API format/prefix/key status, test connectivity with latency display
- **Request Logs**: Filter byAll/OK/Errors), click to expand details (request ID, target URL, upstream response body)

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

When a request model contains `haiku`, `sonnet`, or `opus`, it's replaced with the alias target and the request body is updated accordingly.

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
  "prefix": "deepseek-"
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
| `prefix` | Routing prefix (string or array),  `"kimi-"` |
| `passthrough` | `true` = Anthropic Messages API (direct forward), `false` = OpenAI Chat Completions API (auto-translate) |
| `enabled` | `true` / `false` to enable/disable |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Web dashboard |
| `/v1/messages` | POST | Anthropic Messages API proxy (main endpoint) |
| `/v1/models` | GET | List all available models |
| `/health` | GET | Gateway health check |
| `/api/config` | GET | Current config (API keys masked) |
| `/api/config/providers` | POST | Add provider |
| `/api/config/providers/:name` | PUT | Update provider |
| `/api/config/providers/:name` | DELETE | Delete provider |
| `/api/config/reload` | POST | Reload config from disk |
| `/api/aliases` | GET/PUT | Get or update alias mapping |
| `/api/fetch-models` | GET | Fetch real model lists from provider APIs |
| `/api/health/providers` | GET | Test connectivity to all providers |
| `/api/logs` | GET | Request logs (last 200) |
| `/api/logs/clear` | POST | Clear log buffer |

## Routing Rules

1. **Alias resolution**: Model name containing haiku/sonnet/opus → replace target
2. **Prefix match**: Route by provider's `prefix` config
3. **Model list match**: Check provider's `models` array
4. **Fallback**: Use `defaultProvider`

## Development

```bash
npm run dev      # Dev mode (hot reload)
npm run build    # Compile TypeScript
npm test         # Run tests (24 tests)
```

## License

MIT
