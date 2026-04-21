# Claude API Hub

A local API gateway that lets [Claude Code](https://docs.anthropic.com/en/docs/claude-code) route requests to multiple LLM providers based on model ID. Use Claude, Kimi, MiniMax, and GLM models side-by-side in the same session.

## How It Works

```
Claude Code ──► ANTHROPIC_BASE_URL=http://127.0.0.1:9800
                        │
                  API Gateway (this project)
                        │ route by model prefix
          ┌─────────────┼─────────────┬──────────────┐
          ▼             ▼             ▼              ▼
       Claude         Kimi        MiniMax          GLM
     (Anthropic)   (Moonshot)    (MiniMax)      (Zhipu AI)
```

The gateway accepts Anthropic Messages API format, inspects the `model` field, and forwards to the right backend — translating between Anthropic and OpenAI formats on the fly.

## Supported Providers

| Provider | Models | Base URL |
|----------|--------|----------|
| Claude (Anthropic) | `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5` | `https://api.anthropic.com` |
| Kimi (Moonshot AI) | `kimi-k2.6`, `kimi-k2.5`, `kimi-k2` | `https://api.moonshot.cn/v1` |
| MiniMax | `MiniMax-M2.7`, `MiniMax-M2.5`, `MiniMax-M2.1`, `MiniMax-M1` | `https://api.minimaxi.com/v1` |
| GLM (Zhipu AI) | `glm-4-plus`, `glm-4`, `glm-4-air`, `glm-4-flash`, `glm-4-long` | `https://open.bigmodel.cn/api/paas/v4` |

## Quick Start

### 1. Install

```bash
git clone https://github.com/lipeng/claude-api-hub.git
cd claude-api-hub
npm install
npm run build
```

### 2. Set API Keys

```bash
export ANTHROPIC_AUTH_TOKEN="your-anthropic-key"
export MOONSHOT_API_KEY="your-kimi-key"
export MINIMAX_API_KEY="your-minimax-key"
export ZHIPUAI_API_KEY="your-glm-key"
```

### 3. Start the Gateway

```bash
# Direct
node dist/index.js

# Or use the CLI
chmod +x bin/hub.sh
bin/hub.sh start
```

The gateway starts on `http://127.0.0.1:9800` by default.

### 4. Configure Claude Code

Update `~/.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:9800"
  }
}
```

### 5. Use Different Models

```bash
# Use Kimi
claude --model kimi-k2.6 -p "Hello from Kimi"

# Use MiniMax
claude --model MiniMax-M2.7 -p "Hello from MiniMax"

# Use GLM
claude --model glm-4-plus -p "Hello from GLM"

# Claude still works as usual
claude --model claude-sonnet-4-6 -p "Hello from Claude"
```

## Routing Rules

| Model prefix | Provider |
|-------------|----------|
| `claude-*` | Anthropic (passthrough, no translation) |
| `kimi-*` | Kimi / Moonshot AI |
| `minimax-*`, `MiniMax-*` | MiniMax |
| `glm-*` | GLM / Zhipu AI |
| Unknown | Falls back to default provider (Claude) |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/messages` | POST | Main proxy — Anthropic Messages API |
| `/v1/models` | GET | List all available models |
| `/health` | GET | Provider health check |

## Configuration

Edit `config/providers.json` to customize providers, models, and endpoints. API keys use `${ENV_VAR}` interpolation.

## Claude Code Plugin

The `plugin/` directory contains a Claude Code plugin with:

- MCP tools: `hub_list_models`, `hub_status`, `hub_set_default`
- Skill: `/switch-model` for quick model switching
- Install script: `plugin/install.sh`

## CLI Management

```bash
bin/hub.sh start    # Start gateway (background)
bin/hub.sh stop     # Stop gateway
bin/hub.sh status   # Check if running
bin/hub.sh restart  # Restart
bin/hub.sh logs     # Tail logs
```

## Development

```bash
npm run dev          # Watch mode with tsx
npm run build        # CompiScript
npm test             # Run tests (vitest)
```

## Architecture

- **Zero runtime dependencies** for the gateway core (Node.js native `http`)
- **Protocol translation**: Anthropic Messages API ↔ OpenAI Chat Completions API
- **Streaming support**: Full SSE relay with event translation
- **Claude passthrough**: No translation overhead for Claude models

## License

MIT
