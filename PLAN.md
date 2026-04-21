# Claude API Hub - Implementation Plan

## Architecture

A local API gateway that accepts Anthropic API format requests from Claude Code,
routes them to the correct backend provider based on model ID, and translates
between Anthropic and OpenAI API formats.

```
Claude Code → ANTHROPIC_BASE_URL=http://127.0.0.1:9800
                    ↓
              API Gateway (this project)
                    ↓ (route by model prefix)
    ┌───────────────┼───────────────┬──────────────┐
    ↓               ↓               ↓              ↓
  Claude          Kimi           MiniMax          GLM
  (Anthropic) (Moonshot)      (MiniMax)       (Zhipu)
  Anthropic    OpenAI          OpenAI         OpenAI
  format       compat          compat         compat
```

## Routing Rules

- `claude-*` → Claude provider (passthrough, keep Anthropic format)
- `kimi-*` → Kimi provider (translate to OpenAI format)
- `minimax-*`, `MiniMax-*` → MiniMax provider (translate to OpenAI format)
- `glm-*` → GLM provider (translate to OpenAI format)
- Unknown model → default provider (Claude)

## File Assignments (5 Workers)

### Worker 1: Gateway Core
Files: `src/server.ts`, `src/index.ts`, `src/config.ts`, `src/router.ts`
- HTTP server using Node.js native `http` module (zero deps)
- Config loading from `config/providers.json` with env var interpolation
- Model-based routing logic
- Request/response pipeline: receive → route → translate → forward → translate back → respond
- Streaming SSE relay
- Health check endpoint: GET /health
- Model list endpoint: GET /v1/models

### Worker 2: Anthropic ↔ OpenAI Protocol Translation
Files: `src/translator/anthropic-to-openai.ts`, `src/translator/openai-to-anthropic.ts`
- Convert Anthropic messages format to OpenAI messages format
  - system field → system message
  - content blocks (text, image, tool_use, tool_result) → OpenAI equivalents
  - thinking blocks → strip or pass as metadata
- Convert Anthropic tools → OpenAI function calling format
- Convert OpenAI response → Anthropic response format
  - choices[0].message → content blocks
  - tool_calls → tool_use blocks
  - usage mapping
- Streaming: convert OpenAI SSE chunks → Anthropic SSE events
  - message_start, content_block_start, content_block_delta, content_block_stop, message_delta, message_stop

### Worker 3: Provider Implementations
Files: `src/providers/claude.ts`, `src/providers/kimi.ts`, `src/providers/minimax.ts`, `src/providers/glm.ts`
- Each provider implements the `Provider` interface fromsrc/providers/types.ts`
- Claude provider: passthrough (no translation needed, forward Anthropic format directly)
- Kimi provider: use translator, endpoint = baseUrl + '/chat/completions'
- MiniMax provider: use translator, endpoint = baseUrl + '/chat/completions'
- GLM provider: use translator, endpoint = baseUrl + '/chat/completions'
- Each provider handles its own model name resolution (strip prefix)
- Each provider builds correct auth headers

### Worker 4: Claude Code Plugin
Files: `plugin/.claude-plugin/plugin.json`, `plugin/.mcp.json`, `plugin/CLAUDE.md`, `plugin/skills/switch-model/SKILL.md`, `plugin/install.sh`
- Plugin manifest (plugin.json)
- MCP server that provides tools:
  - `hub_list_models` - list all available models across providers
  - `hub_status` - gateway health check
  - `hub_set_default` - change default provider/model
- Skill: /switch-model for quick model switching
- CLAUDE.md with usage instructions
- install.sh script to set up ANTHROPIC_BASE_URL

### Worker 5: Utils, Tests, and CLI
Files: `src/utils/logger.ts`, `src/utils/health.ts`, `test/translator.test.ts`, `test/router.test.ts`, `bin/hub.sh`
- Logger utility (structured JSON logging)
- Health check utility (ping all providers)
- Unit tests for translator (Anthropic ↔ OpenAIrsion)
- Unit tests for router (model → provider matching)
- CLI management script (start/stop/status/logs)

## Shared Contract

All workers MUST import types from `src/providers/types.ts` (already created).
Do NOT modify `src/providers/types.ts` or `config/providers.json`.
Do NOT modify `package.json` or `tsconfig.json`.

## Key Design Decisions

1. Zero runtime dependencies for the gateway core (use Node.js native http/https)
2. Only `eventsource-parser` for SSE parsing (already in package.json)
3. Claude provider is passthrough - no translation overhead
4. Config supports env var interpolation: `${VAR_NAME}` in apiKey fields
5. All providers use the same Provider interface for consistency
