// Internal ↔ OpenAI Chat Completions message type conversion
import type {
  OpenAIRequest,
  OpenAIMessage,
  OpenAIContentPart,
  OpenAITool,
  OpenAIToolChoice,
  OpenAIResponse,
  OpenAIStreamChunk,
  OpenAIToolCall,
  InternalRequest,
  InternalMessage,
  InternalContentPart,
  InternalTool,
  InternalToolChoice,
  InternalResponse,
  InternalContentBlock,
  InternalStreamEvent,
  InternalUsage,
  InternalDelta,
} from '../providers/types.js';

// ─── Request: Internal → OpenAI ───

function convertToolResultContent(resultContent: string | InternalContentPart[]): string {
  if (typeof resultContent === 'string') return resultContent;
  return resultContent
    .filter((p): p is { type: 'text'; text: string } & InternalContentPart => p.type === 'text')
    .map(p => p.text)
    .join('\n');
}

export function internalRequestToOpenAI(req: InternalRequest, targetModel: string): OpenAIRequest {
  const messages: OpenAIMessage[] = [];

  for (const msg of req.messages) {
    if (msg.role === 'system') {
      messages.push({ role: 'system', content: typeof msg.content === 'string' ? msg.content : convertToolResultContent(msg.content) });
      continue;
    }

    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        messages.push({ role: 'user', content: msg.content });
      } else {
        const parts: OpenAIContentPart[] = [];
        for (const p of msg.content) {
          if (p.type === 'text') parts.push({ type: 'text', text: p.text });
          else if (p.type === 'image') parts.push({ type: 'image_url', image_url: { url: `data:${p.media_type};base64,${p.data}` } });
        }
        messages.push({ role: 'user', content: parts });
      }
      continue;
    }

    if (msg.role === 'assistant') {
      const textContent = typeof msg.content === 'string' ? msg.content : '';
      let textFromParts = '';
      if (typeof msg.content !== 'string') {
        textFromParts = msg.content.filter((p): p is { type: 'text'; text: string } & InternalContentPart => p.type === 'text').map(p => p.text).join('\n');
      }
      messages.push({
        role: 'assistant',
        content: textContent || textFromParts || null,
        tool_calls: msg.tool_calls,
      });
      continue;
    }

    if (msg.role === 'tool') {
      messages.push({
        role: 'tool',
        tool_call_id: msg.tool_call_id ?? '',
        content: typeof msg.content === 'string' ? msg.content : convertToolResultContent(msg.content),
      });
    }
  }

  const result: OpenAIRequest = { model: targetModel, messages, max_tokens: req.max_tokens };

  if (req.temperature !== undefined) result.temperature = req.temperature;
  if (req.top_p !== undefined) result.top_p = req.top_p;
  if (req.top_k !== undefined) (result as unknown as Record<string, unknown>).top_k = req.top_k;
  if (req.stream !== undefined) {
    result.stream = req.stream;
    if (req.stream) (result as unknown as Record<string, unknown>).stream_options = { include_usage: true };
  }
  if (req.stop_sequences?.length) result.stop = req.stop_sequences;
  if (req.thinking?.type === 'enabled') {
    (result as unknown as Record<string, unknown>).reasoning_effort = 'high';
    const MAX_COMPLETION_TOKENS = 200000;
    result.max_completion_tokens = Math.min(
      req.thinking.budget_tokens + (req.max_tokens || 4096),
      MAX_COMPLETION_TOKENS,
    );
    delete result.max_tokens;
  }

  if (req.tools?.length) {
    result.tools = req.tools.map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));
  }
  if (req.tool_choice) {
    if (req.tool_choice.type === 'auto') result.tool_choice = 'auto';
    else if (req.tool_choice.type === 'any') result.tool_choice = 'required';
    else if (req.tool_choice.type === 'tool') result.tool_choice = { type: 'function', function: { name: req.tool_choice.name } };
  }

  return result;
}

// ─── Response: OpenAI → Internal (non-streaming) ───

function mapFinishReason(reason: string | null): InternalResponse['stop_reason'] {
  if (reason === 'stop') return 'end_turn';
  if (reason === 'length') return 'max_tokens';
  if (reason === 'tool_calls') return 'tool_use';
  if (reason === 'content_filter') return 'end_turn';
  return 'end_turn';
}

export function openaiResponseToInternal(res: OpenAIResponse, originalModel: string): InternalResponse {
  if (!res.choices?.length) {
    return {
      id: res.id,
      content: [{ type: 'text', text: '' }],
      model: originalModel,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: res.usage?.prompt_tokens ?? 0, output_tokens: res.usage?.completion_tokens ?? 0 },
    };
  }

  const choice = res.choices[0];
  const content: InternalContentBlock[] = [];

  const msg = choice.message as Record<string, unknown>;
  if (msg.reasoning_content && typeof msg.reasoning_content === 'string') {
    content.push({ type: 'thinking', thinking: msg.reasoning_content as string });
  }

  if (choice.message.content) {
    content.push({ type: 'text', text: choice.message.content });
  }

  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tc.function.arguments); } catch { /* leave empty */ }
      content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
    }
  }

  return {
    id: res.id,
    content,
    model: originalModel,
    stop_reason: mapFinishReason(choice.finish_reason),
    stop_sequence: null,
    usage: { input_tokens: res.usage?.prompt_tokens ?? 0, output_tokens: res.usage?.completion_tokens ?? 0 },
  };
}

// ─── Response: OpenAI → Internal (streaming) ───

export interface StreamState {
  messageId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  textBlockIndex: number;
  textStarted: boolean;
  thinkingBlockIndex: number;
  thinkingStarted: boolean;
  toolCalls: Map<number, { id: string; name: string; argumentsJson: string; blockIndex: number }>;
  nextBlockIndex: number;
  initialized: boolean;
  finished: boolean;
}

export function createStreamState(model: string): StreamState {
  return {
    messageId: `msg_${Date.now()}`,
    model,
    inputTokens: 0,
    outputTokens: 0,
    textBlockIndex: -1,
    textStarted: false,
    thinkingBlockIndex: -1,
    thinkingStarted: false,
    toolCalls: new Map(),
    nextBlockIndex: 0,
    initialized: false,
    finished: false,
  };
}

export function openaiChunkToInternal(
  chunk: OpenAIStreamChunk,
  originalModel: string,
  state: StreamState,
): InternalStreamEvent[] {
  const events: InternalStreamEvent[] = [];

  if (!state.initialized) {
    state.initialized = true;
    state.messageId = chunk.id;
    state.model = originalModel;
  }

  const choice = chunk.choices?.[0];

  if (state.nextBlockIndex === 0 && !state.textStarted && state.toolCalls.size === 0) {
    events.push({
      type: 'message_start',
      message: {
        id: chunk.id,
        content: [],
        model: originalModel,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    });
    events.push({ type: 'ping' });
  }

  if (!choice) {
    if (chunk.usage) {
      state.inputTokens = chunk.usage.prompt_tokens;
      state.outputTokens = chunk.usage.completion_tokens;
    }
    return events;
  }

  const delta = choice.delta;
  const deltaRaw = delta as Record<string, unknown>;

  if (deltaRaw.reasoning_content) {
    if (!state.thinkingStarted) {
      state.thinkingBlockIndex = state.nextBlockIndex++;
      state.thinkingStarted = true;
      events.push({
        type: 'content_block_start',
        index: state.thinkingBlockIndex,
        content_block: { type: 'thinking', thinking: '' },
      });
    }
    events.push({
      type: 'content_block_delta',
      index: state.thinkingBlockIndex,
      delta: { type: 'thinking_delta', thinking: deltaRaw.reasoning_content as string },
    });
  }

  if (delta.content) {
    if (!state.textStarted) {
      state.textBlockIndex = state.nextBlockIndex++;
      state.textStarted = true;
      events.push({
        type: 'content_block_start',
        index: state.textBlockIndex,
        content_block: { type: 'text', text: '' },
      });
    }
    events.push({
      type: 'content_block_delta',
      index: state.textBlockIndex,
      delta: { type: 'text_delta', text: delta.content },
    });
  }

  if (delta.tool_calls) {
    for (const tc of delta.tool_calls as (Partial<OpenAIToolCall> & { index?: number })[]) {
      if (tc.index === undefined) continue;
      const idx = tc.index;

      if (!state.toolCalls.has(idx)) {
        const blockIndex = state.nextBlockIndex++;
        state.toolCalls.set(idx, {
          id: tc.id ?? `call_${idx}`,
          name: tc.function?.name ?? '',
          argumentsJson: '',
          blockIndex,
        });
        events.push({
          type: 'content_block_start',
          index: blockIndex,
          content_block: { type: 'tool_use', id: tc.id ?? `call_${idx}`, name: tc.function?.name ?? '', input: {} },
        });
      }

      const entry = state.toolCalls.get(idx)!;
      if (tc.id) entry.id = tc.id;
      if (tc.function?.name) entry.name = tc.function.name;
      if (tc.function?.arguments) {
        entry.argumentsJson += tc.function.arguments;
        events.push({
          type: 'content_block_delta',
          index: entry.blockIndex,
          delta: { type: 'input_json_delta', partial_json: tc.function.arguments },
        });
      }
    }
  }

  if (choice.finish_reason && !state.finished) {
    state.finished = true;

    if (state.thinkingStarted) events.push({ type: 'content_block_stop', index: state.thinkingBlockIndex });
    if (state.textStarted) events.push({ type: 'content_block_stop', index: state.textBlockIndex });
    for (const [, entry] of state.toolCalls) events.push({ type: 'content_block_stop', index: entry.blockIndex });

    if (chunk.usage) {
      state.inputTokens = chunk.usage.prompt_tokens;
      state.outputTokens = chunk.usage.completion_tokens;
    }

    events.push({
      type: 'message_delta',
      delta: { stop_reason: mapFinishReason(choice.finish_reason), stop_sequence: null },
      usage: { output_tokens: state.outputTokens },
    });
    events.push({ type: 'message_stop' });
  }

  return events;
}
