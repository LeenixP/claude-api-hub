import { describe, it, expect } from 'vitest';
import { translateRequest } from '../src/translator/anthropic-to-openai.js';
import {
  translateResponse,
  translateStreamChunk,
  createStreamState,
} from '../src/translator/openai-to-anthropic.js';
import type {
  AnthropicRequest,
  OpenAIResponse,
  OpenAIStreamChunk,
} from '../src/providers/types.js';

// ─── Anthropic → OpenAI ───

describe('translateRequest', () => {
  it('converts a simple text message', () => {
    const req: AnthropicRequest = {
      model: 'kimi-latest',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 100,
    };
    const result = translateRequest(req, 'moonshot-v1-8k');
    expect(result.model).toBe('moonshot-v1-8k');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toEqual({ role: 'user', content: 'Hello' });
    expect(result.max_tokens).toBe(100);
  });

  it('converts system prompt string to system message', () => {
    const req: AnthropicRequest = {
      model: 'kimi-latest',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 50,
      system: 'You are a helpful assistant.',
    };
    const result = translateRequest(req, 'moonshot-v1-8k');
    expect(result.messages[0]).toEqual({ role: 'system', content: 'You are a helpful assistant.' });
    expect(result.messages[1]).toEqual({ role: 'user', content: 'Hi' });
  });

  it('converts system prompt array to joined string', () => {
    const req: AnthropicRequest = {
      model: 'kimi-latest',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 50,
      system: [
        { type: 'text', text: 'Part one.' },
        { type: 'text', text: 'Part two.' },
      ],
    };
    const result = translateRequest(req, 'moonshot-v1-8k');
    expect(result.messages[0].content).toBe('Part one.\nPart two.');
  });

  it('passes is_error from tool_result as [ERROR] prefix', () => {
    const req: AnthropicRequest = {
      model: 'test',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call_1',
            content: 'Something went wrong',
            is_error: true,
          },
        ],
      }],
      max_tokens: 100,
    };
    const result = translateRequest(req, 'test-model');
    const toolMsg = result.messages.find(m => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg!.content).toBe('[ERROR] Something went wrong');
  });

  it('converts tool_use block to OpenAI function calling', () => {
    const req: AnthropicRequest = {
      model: 'kimi-latest',
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'call_1',
              name: 'get_weather',
              input: { city: 'Beijing' },
            },
          ],
        },
      ],
      max_tokens: 100,
    };
    const result = translateRequest(req, 'moonshot-v1-8k');
    const assistantMsg = result.messages[0];
    expect(assistantMsg.tool_calls).toHaveLength(1);
    expect(assistantMsg.tool_calls![0].id).toBe('call_1');
    expect(assistantMsg.tool_calls![0].function.name).toBe('get_weather');
    expect(JSON.parse(assistantMsg.tool_calls![0].function.arguments)).toEqual({ city: 'Beijing' });
  });

  it('converts image content block to image_url', () => {
    const req: AnthropicRequest = {
      model: 'kimi-latest',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: 'abc123' },
            },
            { type: 'text', text: 'What is this?' },
          ],
        },
      ],
      max_tokens: 100,
    };
    const result = translateRequest(req, 'moonshot-v1-8k');
    const userMsg = result.messages[0];
    expect(Array.isArray(userMsg.content)).toBe(true);
    const parts = userMsg.content as Array<{ type: string; image_url?: { url: string } }>;
    const imgPart = parts.find((p) => p.type === 'image_url');
    expect(imgPart?.image_url?.url).toBe('data:image/png;base64,abc123');
  });

  it('converts Anthropic tools to OpenAI function format', () => {
    const req: AnthropicRequest = {
      model: 'kimi-latest',
      messages: [{ role: 'user', content: 'Use the tool' }],
      max_tokens: 100,
      tools: [
        {
          name: 'search',
          description: 'Search the web',
          input_schema: { type: 'object', properties: { query: { type: 'string' } } },
        },
      ],
    };
    const result = translateRequest(req, 'moonshot-v1-8k');
    expect(result.tools).toHaveLength(1);
    expect(result.tools![0].type).toBe('function');
    expect(result.tools![0].function.name).toBe('search');
    expect(result.tools![0].function.description).toBe('Search the web');
  });
});

// ─── OpenAI → Anthropic ───

describe('translateResponse', () => {
  it('converts a simple text response', () => {
    const res: OpenAIResponse = {
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 1700000000,
      model: 'moonshot-v1-8k',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello there!' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
    const result = translateResponse(res, 'kimi-latest');
    expect(result.id).toBe('chatcmpl-1');
    expect(result.model).toBe('kimi-latest');
    expect(result.role).toBe('assistant');
    expect(result.stop_reason).toBe('end_turn');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: 'text', text: 'Hello there!' });
    expect(result.usage.input_tokens).toBe(10);
    expect(result.usage.output_tokens).toBe(5);
  });

  it('converts tool_calls to tool_use blocks', () => {
    const res: OpenAIResponse = {
      id: 'chatcmpl-2',
      object: 'chat.completion',
      created: 1700000000,
      model: 'moonshot-v1-8k',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_abc',
                type: 'function',
                function: { name: 'get_weather', arguments: '{"city":"Shanghai"}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    };
    const result = translateResponse(res, 'kimi-latest');
    expect(result.stop_reason).toBe('tool_use');
    const toolBlock = result.content.find((b) => b.type === 'tool_use') as {
      type: 'tool_use';
      id: string;
      name: string;
      input: Record<string, unknown>;
    };
    expect(toolBlock).toBeDefined();
    expect(toolBlock.id).toBe('call_abc');
    expect(toolBlock.name).toBe('get_weather');
    expect(toolBlock.input).toEqual({ city: 'Shanghai' });
  });
});

// ─── Edge Cases ───

describe('translateResponse edge cases', () => {
  it('handles empty choices array', () => {
    const res = {
      id: 'chatcmpl-empty',
      object: 'chat.completion' as const,
      created: 1700000000,
      model: 'test',
      choices: [],
      usage: { prompt_tokens: 5, completion_tokens: 0, total_tokens: 5 },
    };
    const result = translateResponse(res, 'test-model');
    expect(result.type).toBe('message');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: 'text', text: '' });
    expect(result.stop_reason).toBe('end_turn');
  });

  it('handles undefined usage', () => {
    const res = {
      id: 'chatcmpl-nousage',
      object: 'chat.completion' as const,
      created: 1700000000,
      model: 'test',
      choices: [{
        index: 0,
        message: { role: 'assistant' as const, content: 'Hi' },
        finish_reason: 'stop' as const,
      }],
      usage: undefined as any,
    };
    const result = translateResponse(res, 'test-model');
    expect(result.usage.input_tokens).toBe(0);
    expect(result.usage.output_tokens).toBe(0);
  });

  it('maps content_filter finish reason', () => {
    const res: OpenAIResponse = {
      id: 'chatcmpl-filter',
      object: 'chat.completion',
      created: 1700000000,
      model: 'test',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: '' },
        finish_reason: 'content_filter',
      }],
      usage: { prompt_tokens: 5, completion_tokens: 0, total_tokens: 5 },
    };
    const result = translateResponse(res, 'test-model');
    expect(result.stop_reason).toBe('end_turn');
  });

  it('maps length finish reason to max_tokens', () => {
    const res: OpenAIResponse = {
      id: 'chatcmpl-len',
      object: 'chat.completion',
      created: 1700000000,
      model: 'test',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'truncated' },
        finish_reason: 'length',
      }],
      usage: { prompt_tokens: 5, completion_tokens: 100, total_tokens: 105 },
    };
    const result = translateResponse(res, 'test-model');
    expect(result.stop_reason).toBe('max_tokens');
  });
});

describe('translateStreamChunk edge cases', () => {
  it('tool call name overwrites instead of appending', () => {
    const state = createStreamState('test');
    // First chunk with tool call name
    const chunk1: OpenAIStreamChunk = {
      id: 'c1', object: 'chat.completion.chunk', created: 123, model: 'test',
      choices: [{
        index: 0,
        delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function' as const, function: { name: 'get_weather', arguments: '' } }] },
        finish_reason: null,
      }],
    };
    translateStreamChunk(chunk1, 'test', state);

    // Second chunk repeating the name (some APIs do this)
    const chunk2: OpenAIStreamChunk = {
      id: 'c1', object: 'chat.completion.chunk', created: 123, model: 'test',
      choices: [{
        index: 0,
        delta: { tool_calls: [{ index: 0, type: 'function' as const, function: { name: 'get_weather', arguments: '{"city"' } }] },
        finish_reason: null,
      }],
    };
    translateStreamChunk(chunk2, 'test', state);

    const entry = state.toolCalls.get(0)!;
    // Should be 'get_weather', NOT 'get_weatherget_weather'
    expect(entry.name).toBe('get_weather');
  });

  it('state persists across multiple chunks', () => {
    const state = createStreamState('test');

    const chunk1: OpenAIStreamChunk = {
      id: 'c1', object: 'chat.completion.chunk', created: 123, model: 'test',
      choices: [{ index: 0, delta: { role: 'assistant', content: 'Hello' }, finish_reason: null }],
    };
    const events1 = translateStreamChunk(chunk1, 'test', state);
    expect(events1.some(e => e.type === 'message_start')).toBe(true);
    expect(state.textStarted).toBe(true);
    expect(state.nextBlockIndex).toBe(1);

    const chunk2: OpenAIStreamChunk = {
      id: 'c1', object: 'chat.completion.chunk', created: 123, model: 'test',
      choices: [{ index: 0, delta: { content: ' world' }, finish_reason: null }],
    };
    const events2 = translateStreamChunk(chunk2, 'test', state);
    // No duplicate message_start
    expect(events2.some(e => e.type === 'message_start')).toBe(false);
    expect(events2.some(e => e.type === 'content_block_delta')).toBe(true);
  });

  it('handles usage-only chunk without choices', () => {
    const state = createStreamState('test');
    // First emit message_start
    const chunk1: OpenAIStreamChunk = {
      id: 'c1', object: 'chat.completion.chunk', created: 123, model: 'test',
      choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: null }],
    };
    translateStreamChunk(chunk1, 'test', state);

    const usageChunk: OpenAIStreamChunk = {
      id: 'c1', object: 'chat.completion.chunk', created: 123, model: 'test',
      choices: [],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
    const events = translateStreamChunk(usageChunk, 'test', state);
    // Should not crash, may return empty or just update state
    expect(state.inputTokens).toBe(10);
    expect(state.outputTokens).toBe(5);
  });
});

// ─── Streaming ───

describe('translateStreamChunk', () => {
  it('emits message_start and ping on first text chunk', () => {
    const state = createStreamState('kimi-latest');
    const chunk: OpenAIStreamChunk = {
      id: 'chatcmpl-3',
      object: 'chat.completion.chunk',
      created: 1700000000,
      model: 'moonshot-v1-8k',
      choices: [{ index: 0, delta: { role: 'assistant', content: 'Hi' }, finish_reason: null }],
    };
    const events = translateStreamChunk(chunk, 'kimi-latest', state);
    const types = events.map((e) => e.type);
    expect(types).toContain('message_start');
    expect(types).toContain('ping');
    expect(types).toContain('content_block_start');
    expect(types).toContain('content_block_delta');
  });

  it('emits message_stop on finish chunk', () => {
    const state = createStreamState('kimi-latest');
    const first: OpenAIStreamChunk = {
      id: 'chatcmpl-4',
      object: 'chat.completion.chunk',
      created: 1700000000,
      model: 'moonshot-v1-8k',
      choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
    };
    translateStreamChunk(first, 'kimi-latest', state);

    const last: OpenAIStreamChunk = {
      id: 'chatcmpl-4',
      object: 'chat.completion.chunk',
      created: 1700000000,
      model: 'moonshot-v1-8k',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    };
    const events = translateStreamChunk(last, 'kimi-latest', state);
    const types = events.map((e) => e.type);
    expect(types).toContain('content_block_stop');
    expect(types).toContain('message_delta');
    expect(types).toContain('message_stop');
  });
});