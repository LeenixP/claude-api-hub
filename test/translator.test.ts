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
