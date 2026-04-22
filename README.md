# Claude API Hub

A local API gateway that lets Claude Code route requests to any LLM provider via model aliases (haiku / sonnet / opus).

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

- **Alias mapping**: Map haiku / sonnet / opus to any provider's model
- **Generic providers**: Any OpenAI-compatible API works out of the box
- **Protocol translation**: Anthropic Messages API ↔ OpenAI Chat Completions API
- **Streaming**: Full SSE event stream forwarding and translation
- **Claude passthrough**: Zero-overhead direct forwarding for Claude models
- **Zero runtime deps**: Built on Node.js native `http` module

## Quick Start

```bash
npm install -g claude-api-hub
claude-api-hub
```

Configure `~/.claude-api-hub/providers.json`:

```json
{
  "port": 9800,
  "host": "0.0.0.0",
  "defaultProvider": "claude",
  "aliases": {
    "haiku": "glm-4-flash",
    "sonnet": "kimi-k2.6",
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
      "models": ["kimi-k2.6"],
      "defaultModel": "kimi-k2.6",
      "enabled": true,
      "prefix": "kimi-"
    }
  }
}
```

Point Claude Code at the gateway in `~/.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:9800"
  }
}
```

## Alias Mapping

The core feature. Map Claude Code's three model tiers to any provider's model:

```json
{
  "aliases": {
    "haiku": "glm-4-flash",
    "sonnet": "kimi-k2.6",
    "opus": "claude-opus-4-6"
  }
}
```

When a request model contains `haiku`, `sonnet`, or `opus`, it's replaced with the alias target. The gateway then routes by prefix to the correct provider.

## Adding Providers

Any OpenAI-compatible API — just add to `providers` in config:

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

Config notes:
- `apiKey` supports `${ENV_VAR}` syntax
- `prefix` can be a string or array of strings
- `passthrough: true` skips protocol translation (Claude only)

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/messages` | POST | Anthropic Messages API proxy |
| `/v1/models` | GET | List all available models |
| `/health` | GET | Health check |

## Development

```bash
npm run dev      # Dev mode (hot reload)
npm run build    # Compile TypeScript
npm test         # Run tests
```

## License

MIT
