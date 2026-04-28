// Shared type definitions for all providers and the translation layer.
// Workers: import from this file for all shared interfaces.

// ─── Provider Configuration ───

/**
 * Configuration for a single provider instance.
 * Defines the endpoint, credentials, models, and routing behavior.
 */
export interface ProviderConfig {
  key?: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  defaultModel: string;
  enabled: boolean;
  apiKeys?: string[];
  prefix?: string | string[];
  /** @deprecated Derived from authMode='anthropic' — set authMode instead */
  passthrough?: boolean;
  authMode?: 'apikey' | 'oauth' | 'anthropic';
  providerType?: 'kiro';
  options?: Record<string, unknown>;
  sanitize?: string[];
}

export interface TierTimeout {
  timeoutMs: number;
  streamTimeoutMs?: number;
  streamIdleTimeoutMs?: number;
}

export interface GatewayConfig {
  port: number;
  host: string;
  providers: Record<string, ProviderConfig>;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  aliases?: Record<string, string>;
  tierTimeouts?: Record<string, TierTimeout>;
  version?: string;
  adminToken?: string;
  corsOrigins?: string[];
  rateLimitRpm?: number;
  streamTimeoutMs?: number;
  streamIdleTimeoutMs?: number;
  maxResponseBytes?: number;
  trustProxy?: boolean;
  fallbackChain?: Record<string, string>;
  password?: string;
  tokenRefreshMinutes?: number;
  /** Override the anthropic-beta header for provider test probes. Auto-captured from real traffic if not set. */
  codingAgentBetas?: string;
}

// ─── Anthropic API Types (incoming from Claude Code) ───

export interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  system?: string | AnthropicSystemBlock[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stream?: boolean;
  stop_sequences?: string[];
  tools?: AnthropicTool[];
  tool_choice?: AnthropicToolChoice;
  metadata?: Record<string, unknown>;
  thinking?: { type: 'enabled'; budget_tokens: number };
}

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock
  | AnthropicThinkingBlock;

export interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

export interface AnthropicImageBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | AnthropicContentBlock[];
  is_error?: boolean;
}

export interface AnthropicThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export interface AnthropicSystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export type AnthropicToolChoice =
  | { type: 'auto' }
  | { type: 'any' }
  | { type: 'tool'; name: string };

export interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
  stop_sequence: string | null;
  usage: AnthropicUsage;
}

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

// Anthropic streaming event types
export type AnthropicStreamEvent =
  | { type: 'message_start'; message: AnthropicResponse }
  | { type: 'content_block_start'; index: number; content_block: AnthropicContentBlock }
  | { type: 'content_block_delta'; index: number; delta: AnthropicDelta }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason: string | null; stop_sequence: string | null }; usage: { output_tokens: number } }
  | { type: 'message_stop' }
  | { type: 'ping' }
  | { type: 'error'; error: { type: string; message: string } };

export type AnthropicDelta =
  | { type: 'text_delta'; text: string }
  | { type: 'input_json_delta'; partial_json: string }
  | { type: 'thinking_delta'; thinking: string };

// ─── OpenAI API Types (outgoing to Kimi/MiniMax/GLM) ───

export interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  stop?: string | string[];
  tools?: OpenAITool[];
  tool_choice?: OpenAIToolChoice;
  response_format?: { type: 'text' | 'json_object' };
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | OpenAIContentPart[] | null;
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

export type OpenAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type OpenAIToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } };

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: OpenAIUsage;
}

export interface OpenAIChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: OpenAIToolCall[];
  };
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenAIStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: OpenAIStreamChoice[];
  usage?: OpenAIUsage | null;
}

export interface OpenAIStreamChoice {
  index: number;
  delta: {
    role?: 'assistant';
    content?: string | null;
    tool_calls?: Partial<OpenAIToolCall>[];
  };
  finish_reason: string | null;
}

// ─── Internal (Provider-Agnostic) Message Types ───
// These types are the core abstraction — providers only deal with these.
// Adapters convert between these and wire-protocol-specific types (Anthropic, OpenAI, etc.).

export interface InternalRequest {
  model: string;
  messages: InternalMessage[];
  max_tokens?: number;
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  tools?: InternalTool[];
  tool_choice?: InternalToolChoice;
  thinking?: { type: 'enabled'; budget_tokens: number };
  metadata?: Record<string, unknown>;
}

export interface InternalMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | InternalContentPart[];
  name?: string;
  tool_calls?: InternalToolCall[];
  tool_call_id?: string;
}

export type InternalContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; media_type: string; data: string }
  | { type: 'thinking'; thinking: string };

export interface InternalToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface InternalTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export type InternalToolChoice =
  | { type: 'auto' }
  | { type: 'any' }
  | { type: 'tool'; name: string };

export interface InternalUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface InternalContentBlock {
  type: 'text' | 'tool_use' | 'thinking';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  thinking?: string;
  signature?: string;
}

export interface InternalResponse {
  id: string;
  content: InternalContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
  stop_sequence: string | null;
  usage: InternalUsage;
}

export type InternalStreamEvent =
  | { type: 'message_start'; message: InternalResponse }
  | { type: 'content_block_start'; index: number; content_block: InternalContentBlock }
  | { type: 'content_block_delta'; index: number; delta: InternalDelta }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason: string | null; stop_sequence: string | null }; usage: { output_tokens: number } }
  | { type: 'message_stop' }
  | { type: 'ping' }
  | { type: 'error'; error: { type: string; message: string } };

export type InternalDelta =
  | { type: 'text_delta'; text: string }
  | { type: 'input_json_delta'; partial_json: string }
  | { type: 'thinking_delta'; thinking: string };

// ─── Provider Interface ───

export interface StreamContext {
  initialized: boolean;
  [key: string]: unknown;
}

/**
 * Provider interface that all provider implementations must satisfy.
 * Handles model matching, request building, and response/stream parsing.
 *
 * All providers operate on Internal* types — protocol-specific conversion
 * (Anthropic ↔ Internal, OpenAI ↔ Internal) is handled by the adapter layer.
 */
export interface Provider {
  name: string;
  config: ProviderConfig;

  matchModel(model: string): boolean;
  resolveModel(model: string): string;

  /**
   * Build the upstream HTTP request from an Anthropic-format request.
   * @param req - The original Anthropic request from the client
   * @returns URL, headers, and JSON body for the upstream API call
   */
  buildRequest(req: AnthropicRequest): { url: string; headers: Record<string, string>; body: string; usedKey: string };

  /**
   * Parse the upstream response into Anthropic format.
   * @param raw - The raw upstream response body (OpenAI format for translated providers, Anthropic for passthrough)
   * @param originalModel - The original model name from the client request
   * @returns An Anthropic-format response
   */
  parseResponse(raw: OpenAIResponse, originalModel: string): AnthropicResponse;

  createStreamContext?(originalModel: string): StreamContext;
  parseStreamChunk?(chunk: OpenAIStreamChunk | string, originalModel: string, ctx: StreamContext): AnthropicStreamEvent[];

  reportSuccess?(key?: string): void;
  reportError?(key?: string): void;
}

// ─── Router Types ───

export interface RouteResult {
  provider: Provider;
  resolvedModel: string;
  originalModel: string;
}
