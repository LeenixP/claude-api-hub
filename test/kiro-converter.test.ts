import { describe, it, expect } from 'vitest';
import { convertToCodeWhisperer, mapModelId } from '../src/providers/kiro-converter.js';
import type { AnthropicMessage, AnthropicTool, AnthropicSystemBlock } from '../src/providers/types.js';

describe('mapModelId', () => {
  it('replaces last dash with dot', () => {
    // mapModelId replaces the LAST dash with a dot
    expect(mapModelId('claude-sonnet-4-6')).toBe('claude-sonnet-4.6');
    expect(mapModelId('model-v1')).toBe('model.v1');
  });

  it('returns as-is when no dash', () => {
    expect(mapModelId('model')).toBe('model');
  });
});

describe('convertToCodeWhisperer', () => {
  it('converts basic request with single user message', () => {
    const messages: AnthropicMessage[] = [{ role: 'user', content: 'Hello' }];
    const result = convertToCodeWhisperer(messages, 'claude-sonnet-4-6');
    expect(result.conversationState.currentMessage.userInputMessage.content).toBe('Hello');
    expect(result.conversationState.currentMessage.userInputMessage.origin).toBe('AI_EDITOR');
    expect(result.conversationState.agentTaskType).toBe('vibe');
    expect(result.conversationState.chatTriggerType).toBe('MANUAL');
  });

  it('converts system prompt into first history message', () => {
    const messages: AnthropicMessage[] = [{ role: 'user', content: 'Hello' }];
    const result = convertToCodeWhisperer(messages, 'claude-sonnet-4-6', 'Be helpful');
    expect(result.conversationState.history).toBeDefined();
    expect(result.conversationState.history!.length).toBeGreaterThan(0);
    const first = result.conversationState.history![0];
    expect('userInputMessage' in first).toBe(true);
    expect((first as { userInputMessage: { content: string } }).userInputMessage.content).toContain('Be helpful');
  });

  it('converts tools to Kiro tool specifications', () => {
    const tools: AnthropicTool[] = [
      { name: 'search', description: 'Search the web', input_schema: { type: 'object' } },
    ];
    const messages: AnthropicMessage[] = [{ role: 'user', content: 'Search for cats' }];
    const result = convertToCodeWhisperer(messages, 'claude-sonnet-4-6', undefined, tools);
    const ctx = result.conversationState.currentMessage.userInputMessage.userInputMessageContext;
    expect(ctx).toBeDefined();
    expect(ctx!.tools).toHaveLength(1);
    expect(ctx!.tools![0].toolSpecification.name).toBe('search');
  });

  it('filters out web_search tools', () => {
    const tools: AnthropicTool[] = [
      { name: 'web_search', description: 'Search', input_schema: {} },
      { name: 'calc', description: 'Calculate', input_schema: {} },
    ];
    const messages: AnthropicMessage[] = [{ role: 'user', content: 'Calc 1+1' }];
    const result = convertToCodeWhisperer(messages, 'claude-sonnet-4-6', undefined, tools);
    const ctx = result.conversationState.currentMessage.userInputMessage.userInputMessageContext;
    expect(ctx).toBeDefined();
    expect(ctx!.tools).toHaveLength(1);
    expect(ctx!.tools![0].toolSpecification.name).toBe('calc');
  });

  it('adds thinking prefix when thinking is enabled', () => {
    const messages: AnthropicMessage[] = [{ role: 'user', content: 'Hello' }];
    const result = convertToCodeWhisperer(messages, 'claude-sonnet-4-6', undefined, undefined, { type: 'enabled', budget_tokens: 4096 });
    const firstHistory = result.conversationState.history![0];
    const content = (firstHistory as { userInputMessage: { content: string } }).userInputMessage.content;
    expect(content).toContain('<thinking_mode>enabled</thinking_mode>');
    expect(content).toContain('<max_thinking_length>');
  });

  it('handles assistant messages with thinking blocks', () => {
    const messages: AnthropicMessage[] = [
      { role: 'assistant', content: [{ type: 'thinking', thinking: 'Let me think...' }, { type: 'text', text: 'Answer' }] },
      { role: 'user', content: 'Thanks' },
    ];
    const result = convertToCodeWhisperer(messages, 'claude-sonnet-4-6');
    const history = result.conversationState.history!;
    const assistantEntry = history.find(h => 'assistantResponseMessage' in h);
    expect(assistantEntry).toBeDefined();
    const content = (assistantEntry as { assistantResponseMessage: { content: string } }).assistantResponseMessage.content;
    expect(content).toContain('<thinking>Let me think...</thinking>');
    expect(content).toContain('Answer');
  });

  it('handles assistant tool_use blocks', () => {
    const messages: AnthropicMessage[] = [
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tool_1', name: 'calc', input: { expr: '1+1' } }],
      },
      { role: 'user', content: 'Thanks' },
    ];
    const result = convertToCodeWhisperer(messages, 'claude-sonnet-4-6');
    const history = result.conversationState.history!;
    const assistantEntry = history.find(h => 'assistantResponseMessage' in h);
    expect(assistantEntry).toBeDefined();
    const toolUses = (assistantEntry as { assistantResponseMessage: { toolUses?: { name: string }[] } }).assistantResponseMessage.toolUses;
    expect(toolUses).toBeDefined();
    expect(toolUses![0].name).toBe('calc');
  });

  it('handles user messages with tool_result blocks', () => {
    const messages: AnthropicMessage[] = [
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tool_1', content: 'Result: 2' }],
      },
    ];
    const result = convertToCodeWhisperer(messages, 'claude-sonnet-4-6');
    const ctx = result.conversationState.currentMessage.userInputMessage.userInputMessageContext;
    expect(ctx).toBeDefined();
    expect(ctx!.toolResults).toHaveLength(1);
    expect(ctx!.toolResults![0].toolUseId).toBe('tool_1');
    expect(ctx!.toolResults![0].content[0].text).toBe('Result: 2');
  });

  it('handles user messages with image blocks', () => {
    const messages: AnthropicMessage[] = [
      {
        role: 'user',
        content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc123' } }],
      },
    ];
    const result = convertToCodeWhisperer(messages, 'claude-sonnet-4-6');
    const images = result.conversationState.currentMessage.userInputMessage.images;
    expect(images).toBeDefined();
    expect(images![0].format).toBe('png');
    expect(images![0].source.bytes).toBe('abc123');
  });

  it('handles empty messages array gracefully', () => {
    // convertToCodeWhisperer expects at least one message; empty array causes undefined access.
    // This test documents the current behavior — the function does not guard against empty arrays.
    expect(() => convertToCodeWhisperer([], 'claude-sonnet-4-6')).toThrow();
  });

  it('handles messages with missing content fields', () => {
    const messages: AnthropicMessage[] = [
      { role: 'user', content: undefined as unknown as string },
    ];
    const result = convertToCodeWhisperer(messages, 'claude-sonnet-4-6');
    expect(result.conversationState.currentMessage.userInputMessage.content).toBe('Continue');
  });

  it('deduplicates tool results by toolUseId', () => {
    const messages: AnthropicMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tool_1', content: 'A' },
          { type: 'tool_result', tool_use_id: 'tool_1', content: 'B' },
        ],
      },
    ];
    const result = convertToCodeWhisperer(messages, 'claude-sonnet-4-6');
    const ctx = result.conversationState.currentMessage.userInputMessage.userInputMessageContext;
    expect(ctx!.toolResults).toHaveLength(1);
  });

  it('converts system array to joined text', () => {
    const system: AnthropicSystemBlock[] = [
      { type: 'text', text: 'Part A' },
      { type: 'text', text: 'Part B' },
    ];
    const messages: AnthropicMessage[] = [{ role: 'user', content: 'Hello' }];
    const result = convertToCodeWhisperer(messages, 'claude-sonnet-4-6', system);
    const firstHistory = result.conversationState.history![0];
    const content = (firstHistory as { userInputMessage: { content: string } }).userInputMessage.content;
    expect(content).toContain('Part A');
    expect(content).toContain('Part B');
  });
});
