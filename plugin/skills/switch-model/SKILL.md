---
name: switch-model
description: Switch the active model for API requests
argument-hint: "<provider>:<model>"
---

# switch-model

Switch the active model used by the claude-api-hub gateway.

## Usage

```
/switch-model <provider>:<model>
```

## Examples

```
/switch-model kimi:kimi-k1-5
/switch-model glm:glm-4-flash
/switch-model minimax:MiniMax-Text-01
/switch-model claude:claude-opus-4-5
```

## How it works

This skill calls `hub_set_default` with the specified model name. The gateway
will route all subsequent requests to the chosen provider until changed again.

Use `hub_list_models` to see all available models, or `hub_status` to verify
the current gateway state.
