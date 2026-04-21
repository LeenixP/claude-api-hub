# Claude API Hub Plugin

This plugin connects Claude Code to the claude-api-hub gateway, which routes
requests to multiple AI providers: Claude (Anthropic), Kimi (Moonshot), MiniMax,
and GLM (Zhipu).

## What it does

The gateway runs locally at `http://127.0.0.1:9800` and acts as a drop-in
replacement for the Anthropic API. Claude Code sends requests there, and the
gateway routes them to the correct provider based on the model name prefix.

## Available models

| Prefix | Provider | Example models |
|--------|----------|----------------|
| `claude-*` | Anthropic (Claude) | claude-opus-4-5, claude-sonnet-4-5 |
| `kimi-*` | Moonshot (Kimi) | kimi-k1-5, kimi-k1-5-8k |
| `minimax-*` / `MiniMax-*` | MiniMax | MiniMax-Text-01, minimax-01 |
| `glm-*` | Zhipu (GLM) | glm-4-flash, glm-4-air |

## MCP tools

### hub_list_models
Lists all models available across all configured providers.

```
Use hub_list_models to see what models are available.
```

### hub_status
Returns the health status of the gateway and each provider.

```
Use hub_status to check if the gateway is running and which providers are reachable.
```

### hub_set_default
Sets the default model for requests that don't specify one.

```
Use hub_set_default with model="glm-4-flash" to switch the default to GLM.
```

## Switching models

Use the `/switch-model` skill:

```
/switch-model kimi:kimi-k1-5
/switch-model glm:glm-4-flash
```

Or call `hub_set_default` directly with the full model name.

## Setup

Run `plugin/install.sh` to configure API keys and register the gateway URL.
The gateway must be started separately with `npm start` from the project root.
