import { describe, it, expect } from 'vitest';
import {
  anthropicRequestToInternal,
  internalResponseToAnthropic,
  internalStreamEventToAnthropic,
  internalMessagesToAnthropic,
} from '../src/adapter/anthropic-adapter.js';
import {
  internalRequestToOpenAI,
  openaiResponseToInternal,
  openaiChunkToInternal,
  createStreamState,
} from '../src/adapter/openai-adapter.js';
import type {
  AnthropicRequest,
  InternalRequest,
  InternalResponse,
  InternalMessage,
  OpenAIResponse,
  OpenAIStreamChunk,
} from '../src/providers/types.js';

// ─── Anthropic Adapter Tests ───

describe('anthropicRequestToInternal', () => {
  it('converts basic user message', () => {
    const req: AnthropicRequest = {
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 100,
    };
    const result = anthropicRequestToInternal(req);
    expect(result.model).toBe('claude-sonnet-4-6');
    expect(result.max_tokens).toBe(100);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content).toBe('Hello');
  });

  it('converts string system prompt to system message', () => {
    const req: AnthropicRequest = {
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 100,
      system: 'You are helpful',
    };
    const result = anthropicRequestToInternal(req);
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[0].content).toBe('You are helpful');
    expect(result.messages[1].role).toBe('user');
  });

  it('converts array system prompt by joining text blocks', () => {
    const req: AnthropicRequest = {
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 100,
      system: [
        { type: 'text', text: 'Part A' },
        { type: 'text', text: 'Part B' },
      ],
    };
    const result = anthropicRequestToInternal(req);
    expect(result.messages[0].content).toBe('Part A\nPart B');
  });

  it('converts assistant message with text content blocks', () => {
    const req: AnthropicRequest = {
      model: 'claude-sonnet-4-6',
      messages: [
        { role: 'assistant', content: [{ type: 'text', text: 'Answer' }] },
        { role: 'user', content: 'Thanks' },
      ],
      max_tokens: 100,
    };
    const result = anthropicRequestToInternal(req);
    const assistantMsg = result.messages.find(m => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(Array.isArray(assistantMsg!.content)).toBe(true);
  });

  it('converts tool_use blocks in assistant message', () => {
    const req: AnthropicRequest = {
      model: 'claude-sonnet-4-6',
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'call_1', name: 'search', input: { q: 'cats' } }],
        },
        { role: 'user', content: 'ok' },
      ],
      max_tokens: 100,
    };
    const result = anthropicRequestToInternal(req);
    const assistantMsg = result.messages.find(m => m.role === 'assistant');
    expect(assistantMsg!.tool_calls).toHaveLength(1);
    expect(assistantMsg!.tool_calls![0].function.name).toBe('search');
    expect(assistantMsg!.tool_calls![0].id).toBe('call_1');
    const args = JSON.parse(assistantMsg!.tool_calls![0].function.arguments);
    expect(args.q).toBe('cats');
  });

  it('converts tool_result blocks in user message to tool role messages', () => {
    const req: AnthropicRequest = {
      model: 'claude-sonnet-4-6',
      messages: [
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'Result text' }],
        },
      ],
      max_tokens: 100,
    };
    const result = anthropicRequestToInternal(req);
    const toolMsg = result.messages.find(m => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg!.tool_call_id).toBe('call_1');
    expect(toolMsg!.content).toBe('Result text');
  });

  it('marks error tool_result with [ERROR] prefix', () => {
    const req: AnthropicRequest = {
      model: 'claude-sonnet-4-6',
      messages: [
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'failed', is_error: true }],
        },
      ],
      max_tokens: 100,
    };
    const result = anthropicRequestToInternal(req);
    const toolMsg = result.messages.find(m => m.role === 'tool');
    expect(toolMsg!.content).toBe('[ERROR] failed');
  });

  it('converts image content blocks', () => {
    const req: AnthropicRequest = {
      model: 'claude-sonnet-4-6',
      messages: [
        {
          role: 'user',
          content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc123' } }],
        },
      ],
      max_tokens: 100,
    };
    const result = anthropicRequestToInternal(req);
    const userMsg = result.messages.find(m => m.role === 'user');
    expect(Array.isArray(userMsg!.content)).toBe(true);
    const parts = userMsg!.content as { type: string; media_type?: string; data?: string }[];
    const imgPart = parts.find(p => p.type === 'image');
    expect(imgPart).toBeDefined();
    expect(imgPart!.media_type).toBe('image/png');
    expect(imgPart!.data).toBe('abc123');
  });

  it('passes through optional fields', () => {
    const req: AnthropicRequest = {
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
      temperature: 0.7,
      top_p: 0.9,
      stream: true,
      stop_sequences: ['STOP'],
    };
    const result = anthropicRequestToInternal(req);
    expect(result.temperature).toBe(0.7);
    expect(result.top_p).toBe(0.9);
    expect(result.stream).toBe(true);
    expect(result.stop_sequences).toEqual(['STOP']);
  });

  it('converts tools array', () => {
    const req: AnthropicRequest = {
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
      tools: [{ name: 'calc', description: 'Calculate', input_schema: { type: 'object' } }],
    };
    const result = anthropicRequestToInternal(req);
    expect(result.tools).toHaveLength(1);
    expect(result.tools![0].name).toBe('calc');
  });
});

describe('internalResponseToAnthropic', () => {
  it('converts basic text response', () => {
    const resp: InternalResponse = {
      id: 'msg_123',
      content: [{ type: 'text', text: 'Hello' }],
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    const result = internalResponseToAnthropic(resp, 'claude-sonnet-4-6');
    expect(result.id).toBe('msg_123');
    expect(result.type).toBe('message');
    expect(result.role).toBe('assistant');
    expect(result.model).toBe('claude-sonnet-4-6');
    expect(result.content[0]).toEqual({ type: 'text', text: 'Hello' });
    expect(result.usage.input_tokens).toBe(10);
    expect(result.usage.output_tokens).toBe(5);
  });

  it('converts tool_use content block', () => {
    const resp: InternalResponse = {
      id: 'msg_456',
      content: [{ type: 'tool_use', id: 'call_1', name: 'search', input: { q: 'cats' } }],
      model: 'claude-sonnet-4-6',
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 5, output_tokens: 3 },
    };
    const result = internalResponseToAnthropic(resp, 'claude-sonnet-4-6');
    expect(result.content[0].type).toBe('tool_use');
    const block = result.content[0] as { type: 'tool_use'; id: string; name: string; input: unknown };
    expect(block.id).toBe('call_1');
    expect(block.name).toBe('search');
  });

  it('uses originalModel for model field', () => {
    const resp: InternalResponse = {
      id: 'msg_789',
      content: [{ type: 'text', text: 'hi' }],
      model: 'internal-model',
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    const result = internalResponseToAnthropic(resp, 'claude-opus-4-7');
    expect(result.model).toBe('claude-opus-4-7');
  });
});

describe('internalMessagesToAnthropic', () => {
  it('extracts system message as system field', () => {
    const messages: InternalMessage[] = [
      { role: 'system', content: 'Be helpful' },
      { role: 'user', content: 'Hi' },
    ];
    const { anthropicMessages, system } = internalMessagesToAnthropic(messages);
    expect(system).toBe('Be helpful');
    expect(anthropicMessages).toHaveLength(1);
    expect(anthropicMessages[0].role).toBe('user');
  });

  it('converts tool role messages to user tool_result blocks', () => {
    const messages: InternalMessage[] = [
      { role: 'tool', content: 'Result', tool_call_id: 'call_1' },
    ];
    const { anthropicMessages } = internalMessagesToAnthropic(messages);
    expect(anthropicMessages[0].role).toBe('user');
    const content = anthropicMessages[0].content as { type: string; tool_use_id: string }[];
    expect(content[0].type).toBe('tool_result');
    expect(content[0].tool_use_id).toBe('call_1');
  });

  it('converts assistant tool_calls to tool_use blocks', () => {
    const messages: InternalMessage[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search', arguments: '{"q":"cats"}' } }],
      },
    ];
    const { anthropicMessages } = internalMessagesToAnthropic(messages);
    const blocks = anthropicMessages[0].content as { type: string; name?: string }[];
    const toolUse = blocks.find(b => b.type === 'tool_use');
    expect(toolUse).toBeDefined();
    expect(toolUse!.name).toBe('search');
  });

  it('converts user message with image parts to image blocks', () => {
    const messages: InternalMessage[] = [
      {
        role: 'user',
        content: [{ type: 'image', media_type: 'image/jpeg', data: 'xyz789' }],
      },
    ];
    const { anthropicMessages } = internalMessagesToAnthropic(messages);
    const blocks = anthropicMessages[0].content as { type: string; source?: { data: string } }[];
    const imgBlock = blocks.find(b => b.type === 'image');
    expect(imgBlock).toBeDefined();
    expect(imgBlock!.source!.data).toBe('xyz789');
  });
});

describe('internalStreamEventToAnthropic', () => {
  it('converts message_stop event', () => {
    const result = internalStreamEventToAnthropic({ type: 'message_stop' });
    expect(result.type).toBe('message_stop');
  });

  it('converts ping event', () => {
    const result = internalStreamEventToAnthropic({ type: 'ping' });
    expect(result.type).toBe('ping');
  });

  it('converts content_block_stop event', () => {
    const result = internalStreamEventToAnthropic({ type: 'content_block_stop', index: 0 });
    expect(result.type).toBe('content_block_stop');
    expect((result as { index: number }).index).toBe(0);
  });

  it('converts content_block_delta event', () => {
    const result = internalStreamEventToAnthropic({
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'text_delta', text: 'hello' },
    });
    expect(result.type).toBe('content_block_delta');
    expect((result as { index: number }).index).toBe(1);
  });
});

// ─── OpenAI Adapter Tests ───

describe('internalRequestToOpenAI', () => {
  it('converts basic user message', () => {
    const req: InternalRequest = {
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 100,
    };
    const result = internalRequestToOpenAI(req, 'gpt-4o');
    expect(result.model).toBe('gpt-4o');
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content).toBe('Hello');
  });

  it('converts system message', () => {
    const req: InternalRequest = {
      model: 'claude-sonnet-4-6',
      messages: [
        { role: 'system', content: 'Be helpful' },
        { role: 'user', content: 'Hi' },
      ],
      max_tokens: 100,
    };
    const result = internalRequestToOpenAI(req, 'gpt-4o');
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[0].content).toBe('Be helpful');
  });

  it('converts user message with image parts to image_url format', () => {
    const req: InternalRequest = {
      model: 'claude-sonnet-4-6',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is this?' },
            { type: 'image', media_type: 'image/png', data: 'abc123' },
          ],
        },
      ],
      max_tokens: 100,
    };
    const result = internalRequestToOpenAI(req, 'gpt-4o');
    const parts = result.messages[0].content as { type: string; image_url?: { url: string } }[];
    const imgPart = parts.find(p => p.type === 'image_url');
    expect(imgPart).toBeDefined();
    expect(imgPart!.image_url!.url).toBe('data:image/png;base64,abc123');
  });

  it('converts tool role messages', () => {
    const req: InternalRequest = {
      model: 'claude-sonnet-4-6',
      messages: [
        { role: 'tool', content: 'Result', tool_call_id: 'call_1' },
      ],
      max_tokens: 100,
    };
    const result = internalRequestToOpenAI(req, 'gpt-4o');
    expect(result.messages[0].role).toBe('tool');
    expect((result.messages[0] as { tool_call_id: string }).tool_call_id).toBe('call_1');
  });

  it('converts tools to OpenAI function format', () => {
    const req: InternalRequest = {
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
      tools: [{ name: 'calc', description: 'Calculate', input_schema: { type: 'object' } }],
    };
    const result = internalRequestToOpenAI(req, 'gpt-4o');
    expect(result.tools).toHaveLength(1);
    expect(result.tools![0].type).toBe('function');
    expect(result.tools![0].function.name).toBe('calc');
  });

  it('maps tool_choice auto', () => {
    const req: InternalRequest = {
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
      tool_choice: { type: 'auto' },
    };
    const result = internalRequestToOpenAI(req, 'gpt-4o');
    expect(result.tool_choice).toBe('auto');
  });

  it('maps tool_choice any to required', () => {
    const req: InternalRequest = {
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
      tool_choice: { type: 'any' },
    };
    const result = internalRequestToOpenAI(req, 'gpt-4o');
    expect(result.tool_choice).toBe('required');
  });

  it('maps tool_choice tool to function object', () => {
    const req: InternalRequest = {
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
      tool_choice: { type: 'tool', name: 'calc' },
    };
    const result = internalRequestToOpenAI(req, 'gpt-4o');
    expect(result.tool_choice).toEqual({ type: 'function', function: { name: 'calc' } });
  });

  it('passes through temperature and top_p', () => {
    const req: InternalRequest = {
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
      temperature: 0.5,
      top_p: 0.8,
    };
    const result = internalRequestToOpenAI(req, 'gpt-4o');
    expect(result.temperature).toBe(0.5);
    expect(result.top_p).toBe(0.8);
  });

  it('maps stop_sequences to stop', () => {
    const req: InternalRequest = {
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
      stop_sequences: ['END', 'STOP'],
    };
    const result = internalRequestToOpenAI(req, 'gpt-4o');
    expect(result.stop).toEqual(['END', 'STOP']);
  });

  it('adds stream_options when stream is true', () => {
    const req: InternalRequest = {
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
      stream: true,
    };
    const result = internalRequestToOpenAI(req, 'gpt-4o') as Record<string, unknown>;
    expect(result.stream).toBe(true);
    expect(result.stream_options).toEqual({ include_usage: true });
  });
});

describe('openaiResponseToInternal', () => {
  it('converts basic text response', () => {
    const res: OpenAIResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-4o',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'Hello' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
    const result = openaiResponseToInternal(res, 'claude-sonnet-4-6');
    expect(result.id).toBe('chatcmpl-123');
    expect(result.model).toBe('claude-sonnet-4-6');
    expect(result.stop_reason).toBe('end_turn');
    expect(result.content[0]).toEqual({ type: 'text', text: 'Hello' });
    expect(result.usage.input_tokens).toBe(10);
    expect(result.usage.output_tokens).toBe(5);
  });

  it('maps finish_reason length to max_tokens', () => {
    const res: OpenAIResponse = {
      id: 'chatcmpl-456',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-4o',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'truncated' },
        finish_reason: 'length',
      }],
      usage: { prompt_tokens: 5, completion_tokens: 100, total_tokens: 105 },
    };
    const result = openaiResponseToInternal(res, 'claude-sonnet-4-6');
    expect(result.stop_reason).toBe('max_tokens');
  });

  it('maps finish_reason tool_calls to tool_use and extracts tool blocks', () => {
    const res: OpenAIResponse = {
      id: 'chatcmpl-789',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-4o',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search', arguments: '{"q":"cats"}' } }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
    };
    const result = openaiResponseToInternal(res, 'claude-sonnet-4-6');
    expect(result.stop_reason).toBe('tool_use');
    const toolBlock = result.content.find(b => b.type === 'tool_use');
    expect(toolBlock).toBeDefined();
    expect((toolBlock as { name: string }).name).toBe('search');
  });

  it('handles empty choices array', () => {
    const res: OpenAIResponse = {
      id: 'chatcmpl-empty',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-4o',
      choices: [],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
    const result = openaiResponseToInternal(res, 'claude-sonnet-4-6');
    expect(result.stop_reason).toBe('end_turn');
    expect(result.content[0]).toEqual({ type: 'text', text: '' });
  });
});

describe('openaiChunkToInternal', () => {
  it('emits message_start and ping on first chunk with content', () => {
    const state = createStreamState('claude-sonnet-4-6');
    const chunk: OpenAIStreamChunk = {
      id: 'chatcmpl-stream-1',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'gpt-4o',
      choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
    };
    const events = openaiChunkToInternal(chunk, 'claude-sonnet-4-6', state);
    const types = events.map(e => e.type);
    expect(types).toContain('message_start');
    expect(types).toContain('ping');
    expect(types).toContain('content_block_start');
    expect(types).toContain('content_block_delta');
  });

  it('emits message_stop on finish_reason stop', () => {
    const state = createStreamState('claude-sonnet-4-6');
    openaiChunkToInternal({
      id: 'chatcmpl-s1',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'gpt-4o',
      choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: null }],
    }, 'claude-sonnet-4-6', state);

    const finalChunk: OpenAIStreamChunk = {
      id: 'chatcmpl-s1',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'gpt-4o',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
    };
    const events = openaiChunkToInternal(finalChunk, 'claude-sonnet-4-6', state);
    const types = events.map(e => e.type);
    expect(types).toContain('content_block_stop');
    expect(types).toContain('message_delta');
    expect(types).toContain('message_stop');
  });

  it('handles tool_calls delta and emits tool_use block_start', () => {
    const state = createStreamState('claude-sonnet-4-6');
    const chunk: OpenAIStreamChunk = {
      id: 'chatcmpl-tc',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'gpt-4o',
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'search', arguments: '{"q"' } }],
        },
        finish_reason: null,
      }],
    };
    const events = openaiChunkToInternal(chunk, 'claude-sonnet-4-6', state);
    const blockStart = events.find(e => e.type === 'content_block_start');
    expect(blockStart).toBeDefined();
    const block = (blockStart as { content_block: { type: string } }).content_block;
    expect(block.type).toBe('tool_use');
  });

  it('accumulates tool argument deltas', () => {
    const state = createStreamState('claude-sonnet-4-6');
    const chunk1: OpenAIStreamChunk = {
      id: 'chatcmpl-tc',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'gpt-4o',
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'search', arguments: '{"q":' } }],
        },
        finish_reason: null,
      }],
    };
    const chunk2: OpenAIStreamChunk = {
      id: 'chatcmpl-tc',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'gpt-4o',
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{ index: 0, function: { arguments: '"cats"}' } }],
        },
        finish_reason: null,
      }],
    };
    openaiChunkToInternal(chunk1, 'claude-sonnet-4-6', state);
    const events2 = openaiChunkToInternal(chunk2, 'claude-sonnet-4-6', state);
    const deltaEvent = events2.find(e => e.type === 'content_block_delta');
    expect(deltaEvent).toBeDefined();
    const delta = (deltaEvent as { delta: { partial_json: string } }).delta;
    expect(delta.partial_json).toBe('"cats"}');
  });
});
