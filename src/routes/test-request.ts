import type { AnthropicRequest, GatewayConfig } from '../providers/types.js';

/**
 * Build a test request that closely mimics a real Claude Code session.
 * Many providers detect coding agent patterns and reject requests that
 * don't match (e.g., "Coding Plan is only for Coding Agents").
 *
 * Key indicators providers check:
 * 1. System prompt with coding instructions
 * 2. Multiple realistic tools (file read/write, shell execution)
 * 3. tool_choice set to auto
 * 4. anthropic-beta headers with coding features
 * 5. metadata field
 * 6. ?beta=true query parameter (SDK uses beta.messages namespace)
 */
export function buildTestRequest(model: string): AnthropicRequest {
  return {
    model,
    max_tokens: 64,
    system: [
      { type: 'text', text: 'You are Claude, a coding assistant. You help users with software engineering tasks. Be concise and respond with just "ok" to this health check.' },
    ],
    messages: [
      { role: 'user', content: 'Respond with just the word "ok".' },
    ],
    tools: [
      {
        name: 'Read',
        description: 'Reads a file from the local filesystem.',
        input_schema: {
          type: 'object' as const,
          properties: {
            file_path: { type: 'string', description: 'The absolute path to the file to read' },
            offset: { type: 'integer', description: 'Line offset to start reading' },
            limit: { type: 'integer', description: 'Number of lines to read' },
          },
          required: ['file_path'],
        },
      },
      {
        name: 'Write',
        description: 'Writes a file to the local filesystem.',
        input_schema: {
          type: 'object' as const,
          properties: {
            file_path: { type: 'string', description: 'The absolute path to write to' },
            content: { type: 'string', description: 'The content to write' },
          },
          required: ['file_path', 'content'],
        },
      },
      {
        name: 'Bash',
        description: 'Executes a bash command in a persistent shell session.',
        input_schema: {
          type: 'object' as const,
          properties: {
            command: { type: 'string', description: 'The bash command to run' },
            timeout: { type: 'integer', description: 'Timeout in milliseconds' },
          },
          required: ['command'],
        },
      },
    ],
    tool_choice: { type: 'auto' },
    metadata: { user_id: 'test-health-check' },
    stream: false,
  };
}

const DEFAULT_BETA = 'prompt-caching-2024-07-31,output-128k-2025-02-19,interleaved-thinking-2025-05-14,code-execution-2025-05-22';
let capturedBeta: string | null = null;

/** Capture anthropic-beta from real Claude Code requests for reuse in test probes. */
export function captureBetaHeader(value: string): void {
  capturedBeta = value;
}

/**
 * Get the anthropic-beta header value for test probes.
 * Priority: config override > captured from real traffic > default.
 */
export function getBetaHeaderValue(config?: GatewayConfig): string {
  if (config?.codingAgentBetas) return config.codingAgentBetas;
  return capturedBeta || DEFAULT_BETA;
}

/**
 * Build a minimal test request without coding agent indicators.
 * Used as fallback when providers reject coding-agent-style probes.
 */
export function buildSimpleTestRequest(model: string): AnthropicRequest {
  return {
    model,
    max_tokens: 16,
    messages: [
      { role: 'user', content: 'Say "ok".' },
    ],
    stream: false,
  };
}

/**
 * Get extra headers that Claude Code typically sends.
 * Uses the latest anthropic-beta captured from real requests when available.
 */
export function getCodingAgentHeaders(passthrough: boolean, config?: GatewayConfig): Record<string, string> {
  if (!passthrough) return {};
  return { 'anthropic-beta': getBetaHeaderValue(config) };
}

/**
 * Append ?beta=true to the URL for passthrough providers,
 * matching the Anthropic SDK's beta.messages namespace behavior.
 */
export function withBetaQueryParam(url: string, passthrough: boolean): string {
  if (!passthrough) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}beta=true`;
}
