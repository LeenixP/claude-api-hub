import { describe, it, expect } from 'vitest';
import {
  parseKiroResponse,
  createKiroStreamState,
  parseKiroStreamChunk,
} from '../src/providers/kiro-parser.js';

describe('parseKiroResponse', () => {
  it('parses simple content event', () => {
    const raw = '{"content":"Hello world"}';
    const result = parseKiroResponse(raw, 'claude-sonnet-4-6');
    expect(result.role).toBe('assistant');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: 'text', text: 'Hello world' });
    expect(result.stop_reason).toBe('end_turn');
  });

  it('parses multiple content events into single text', () => {
    const raw = '{"content":"Hello"}{"content":" world"}';
    const result = parseKiroResponse(raw, 'claude-sonnet-4-6');
    expect(result.content[0]).toEqual({ type: 'text', text: 'Hello world' });
  });

  it('extracts thinking tags into thinking block', () => {
    const raw = '{"content":"<thinking>Let me think...</thinking>\\n\\nHere is the answer."}';
    const result = parseKiroResponse(raw, 'claude-sonnet-4-6');
    expect(result.content).toHaveLength(2);
    expect(result.content[0]).toEqual({ type: 'thinking', thinking: 'Let me think...' });
    expect(result.content[1]).toEqual({ type: 'text', text: 'Here is the answer.' });
  });

  it('parses tool_use events', () => {
    const raw = '{"name":"calc","toolUseId":"tool_1","input":"{}","stop":true}';
    const result = parseKiroResponse(raw, 'claude-sonnet-4-6');
    expect(result.stop_reason).toBe('tool_use');
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('tool_use');
    expect((result.content[0] as { name: string }).name).toBe('calc');
  });

  it('assembles tool input from multiple events', () => {
    // The input field contains escaped JSON; in a real stream it arrives as literal backslash-quote.
    // In a JS string literal we need double escaping.
    const raw = '{"name":"calc","toolUseId":"tool_1","input":"{\\"a\\":","stop":false}{"input":"1}"}';
    const result = parseKiroResponse(raw, 'claude-sonnet-4-6');
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('tool_use');
    expect((result.content[0] as { input: Record<string, unknown> }).input).toEqual({ a: 1 });
  });

  it('handles empty response body', () => {
    const result = parseKiroResponse('', 'claude-sonnet-4-6');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: 'text', text: '' });
  });

  it('ignores malformed JSON in stream', () => {
    const raw = '{"content":"Hello"}not-json{"content":" world"}';
    const result = parseKiroResponse(raw, 'claude-sonnet-4-6');
    expect(result.content[0]).toEqual({ type: 'text', text: 'Hello world' });
  });

  it('handles partial tool input without stop', () => {
    const raw = '{"name":"calc","toolUseId":"tool_1","input":"partial","stop":false}';
    const result = parseKiroResponse(raw, 'claude-sonnet-4-6');
    expect(result.content[0].type).toBe('tool_use');
  });

  it('returns empty text when only thinking tags with no content', () => {
    const raw = '{"content":"<thinking>Deep thought</thinking>"}';
    const result = parseKiroResponse(raw, 'claude-sonnet-4-6');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: 'thinking', thinking: 'Deep thought' });
  });
});

describe('parseKiroStreamChunk', () => {
  it('emits content_block_start and delta for text content', () => {
    const state = createKiroStreamState('claude-sonnet-4-6');
    const events = parseKiroStreamChunk('{"content":"Hello"}', state);
    expect(events.some(e => e.type === 'content_block_start')).toBe(true);
    expect(events.some(e => e.type === 'content_block_delta')).toBe(true);
    const delta = events.find(e => e.type === 'content_block_delta');
    expect(delta).toBeDefined();
    expect((delta as { delta: { text: string } }).delta.text).toBe('Hello');
  });

  it('emits tool_use blocks for tool events', () => {
    const state = createKiroStreamState('claude-sonnet-4-6');
    const events = parseKiroStreamChunk('{"name":"search","toolUseId":"t1","input":"{}","stop":true}', state);
    expect(events.some(e => e.type === 'content_block_start')).toBe(true);
    expect(events.some(e => e.type === 'content_block_stop')).toBe(true);
  });

  it('accumulates tool input across multiple chunks', () => {
    const state = createKiroStreamState('claude-sonnet-4-6');
    // First chunk starts a tool call
    parseKiroStreamChunk('{"name":"calc","toolUseId":"t1","input":"{\\"x\\":","stop":false}', state);
    // Second chunk provides more input and signals stop via toolUse event with stop:true
    const events = parseKiroStreamChunk('{"name":"calc","toolUseId":"t1","input":"1}","stop":true}', state);
    expect(state.currentToolCall).toBeNull();
    expect(events.some(e => e.type === 'content_block_stop')).toBe(true);
  });

  it('handles toolUseInput events', () => {
    const state = createKiroStreamState('claude-sonnet-4-6');
    parseKiroStreamChunk('{"name":"calc","toolUseId":"t1","input":"","stop":false}', state);
    const events = parseKiroStreamChunk('{"input":"abc"}', state);
    expect(events.some(e => e.type === 'content_block_delta')).toBe(true);
  });

  it('handles toolUseStop events', () => {
    const state = createKiroStreamState('claude-sonnet-4-6');
    parseKiroStreamChunk('{"name":"calc","toolUseId":"t1","input":"{}","stop":false}', state);
    const events = parseKiroStreamChunk('{"stop":true}', state);
    expect(events.some(e => e.type === 'content_block_stop')).toBe(true);
    expect(state.currentToolCall).toBeNull();
  });

  it('buffers incomplete JSON across chunks', () => {
    const state = createKiroStreamState('claude-sonnet-4-6');
    const events1 = parseKiroStreamChunk('{"content":"Hel', state);
    expect(events1).toHaveLength(0);
    const events2 = parseKiroStreamChunk('lo"}', state);
    expect(events2.length).toBeGreaterThan(0);
    expect(state.buffer).toBe('');
  });

  it('does not re-emit stopped blocks', () => {
    const state = createKiroStreamState('claude-sonnet-4-6');
    parseKiroStreamChunk('{"content":"A"}', state);
    const events = parseKiroStreamChunk('{"content":"B"}', state);
    const starts = events.filter(e => e.type === 'content_block_start');
    expect(starts).toHaveLength(0); // text block already started
  });
});
