// Translate OpenAI API responses to Anthropic format.
import type {
  OpenAIResponse,
  OpenAIStreamChunk,
  OpenAIToolCall,
  AnthropicResponse,
  AnthropicContentBlock,
  AnthropicToolUseBlock,
  AnthropicStreamEvent,
  AnthropicUsage,
} from '../providers/types.js';

// ─── StreamState ───

export interface StreamState {
  messageId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  // Current text block index
  textBlockIndex: number;
  textStarted: boolean;
  // Tool call accumulation: index → partial tool call
  toolCalls: Map<number, {
    id: string;
    name: string;
    argumentsJson: string;
    blockIndex: number;
  }>;
  // Next content block index to assign
  nextBlockIndex: number;
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
    toolCalls: new Map(),
    nextBlockIndex: 0,
    finished: false,
  };
}

// ─── Non-streaming response translation ───

function mapFinishReason(
  reason: string | null
): AnthropicResponse['stop_reason'] {
  if (reason === 'stop') return 'end_turn';
  if (reason === 'length') return 'max_tokens';
  if (reason === 'tool_calls') return 'tool_use';
  return 'end_turn';
}

export function translateResponse(
  res: OpenAIResponse,
  originalModel: string
): AnthropicResponse {
  const choice = res.choices[0];
  const content: AnthropicContentBlock[] = [];

  if (choice.message.content) {
    content.push({ type: 'text', text: choice.message.content });
  }

  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(tc.function.arguments);
      } catch {
        // leave as empty object if parse fails
      }
      const block: AnthropicToolUseBlock = {
        type: 'tool_use',
        id: tc.id,
        name: tc.function.name,
        input,
      };
      content.push(block);
    }
  }

  const usage: AnthropicUsage = {
    input_tokens: res.usage.prompt_tokens,
    output_tokens: res.usage.completion_tokens,
  };

  return {
    id: res.id,
    type: 'message',
    role: 'assistant',
    content,
    model: originalModel,
    stop_reason: mapFinishReason(choice.finish_reason),
    stop_sequence: null,
    usage,
  };
}

// ─── Streaming response translation ───

export function translateStreamChunk(
  chunk: OpenAIStreamChunk,
  originalModel: string,
  state: StreamState
): AnthropicStreamEvent[] {
  const events: AnthropicStreamEvent[] = [];

  // Update state model/id on first chunk
  if (state.messageId === `msg_${state.inputTokens}` || state.nextBlockIndex === 0) {
    state.messageId = chunk.id;
    state.model = originalModel;
  }

  const choice = chunk.choices[0];

  // First chunk: emit message_start
  if (state.nextBlockIndex === 0 && !state.textStarted && state.toolCalls.size === 0) {
    const stubMessage: AnthropicResponse = {
      id: chunk.id,
      type: 'message',
      role: 'assistant',
      content: [],
      model: originalModel,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    };
    events.push({ type: 'message_start', message: stubMessage });
    events.push({ type: 'ping' });
  }

  if (!choice) {
    // usage-only chunk
    if (chunk.usage) {
      state.inputTokens = chunk.usage.prompt_tokens;
      state.outputTokens = chunk.usage.completion_tokens;
    }
    return events;
  }

  const delta = choice.delta;

  // Text content delta
  if (delta.content != null && delta.content !== '') {
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

  // Tool call deltas
  if (delta.tool_calls) {
    for (const tc of delta.tool_calls as (Partial<OpenAIToolCall> & { index?: number })[]) {
      if (tc.index === undefined) continue;
      const idx = tc.index;

      if (!state.toolCalls.has(idx)) {
        // New tool call — open a new content block
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
          content_block: {
            type: 'tool_use',
            id: tc.id ?? `call_${idx}`,
            name: tc.function?.name ?? '',
            input: {},
          },
        });
      }

      const entry = state.toolCalls.get(idx)!;

      // Update id/name if provided in later chunks
      if (tc.id) entry.id = tc.id;
      if (tc.function?.name) entry.name += tc.function.name;

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

  // Finish
  if (choice.finish_reason && !state.finished) {
    state.finished = true;

    // Close text block if open
    if (state.textStarted) {
      events.push({ type: 'content_block_stop', index: state.textBlockIndex });
    }

    // Close tool call blocks
    for (const [, entry] of state.toolCalls) {
      events.push({ type: 'content_block_stop', index: entry.blockIndex });
    }

    if (chunk.usage) {
      state.inputTokens = chunk.usage.prompt_tokens;
      state.outputTokens = chunk.usage.completion_tokens;
    }

    events.push({
      type: 'message_delta',
      delta: {
        stop_reason: mapFinishReason(choice.finish_reason),
        stop_sequence: null,
      },
      usage: { output_tokens: state.outputTokens },
    });

    events.push({ type: 'message_stop' });
  }

  return events;
}
