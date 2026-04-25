import crypto from 'crypto';
import type {
  AnthropicResponse,
  AnthropicContentBlock,
  AnthropicStreamEvent,
} from './types.js';

const THINKING_START = '<thinking>';
const THINKING_END = '</thinking>';

// ─── AWS Event Stream Parser ───

interface ParsedEvent {
  type: 'content' | 'toolUse' | 'toolUseInput' | 'toolUseStop' | 'contextUsage';
  data: unknown;
}

function parseAwsEvents(raw: string): { events: ParsedEvent[]; remaining: string } {
  const events: ParsedEvent[] = [];
  const patterns = ['{"content":', '{"name":', '{"input":', '{"stop":', '{"followupPrompt":'];
  let pos = 0;

  while (pos < raw.length) {
    const positions = patterns.map((p) => raw.indexOf(p, pos)).filter((p) => p >= 0);
    if (positions.length === 0) break;
    const jsonStart = Math.min(...positions);

    let braceCount = 0;
    let jsonEnd = -1;
    let inStr = false;
    let esc = false;
    for (let i = jsonStart; i < raw.length; i++) {
      const ch = raw[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\' && inStr) { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (!inStr) {
        if (ch === '{') braceCount++;
        else if (ch === '}' && --braceCount === 0) { jsonEnd = i; break; }
      }
    }

    if (jsonEnd < 0) return { events, remaining: raw.substring(jsonStart) };

    try {
      const parsed = JSON.parse(raw.substring(jsonStart, jsonEnd + 1));
      if (parsed.content !== undefined && !parsed.followupPrompt) {
        events.push({ type: 'content', data: parsed.content });
      } else if (parsed.name && parsed.toolUseId) {
        events.push({ type: 'toolUse', data: { name: parsed.name, toolUseId: parsed.toolUseId, input: parsed.input || '', stop: !!parsed.stop } });
      } else if (parsed.input !== undefined && !parsed.name) {
        events.push({ type: 'toolUseInput', data: { input: parsed.input } });
      } else if (parsed.stop !== undefined && parsed.contextUsagePercentage === undefined) {
        events.push({ type: 'toolUseStop', data: null });
      } else if (parsed.contextUsagePercentage !== undefined) {
        events.push({ type: 'contextUsage', data: { percentage: parsed.contextUsagePercentage } });
      }
    } catch { /* skip malformed JSON in stream */ }

    pos = jsonEnd + 1;
  }

  return { events, remaining: pos > 0 ? raw.substring(pos) : raw };
}

// ─── Thinking Extraction ───

function extractThinking(text: string): { thinking: string; rest: string } {
  const start = text.indexOf(THINKING_START);
  if (start === -1) return { thinking: '', rest: text };

  let inner = text.substring(start + THINKING_START.length);
  if (inner.startsWith('\n')) inner = inner.substring(1);

  const end = inner.indexOf(THINKING_END);
  if (end === -1) return { thinking: inner, rest: text.substring(0, start) };

  const thinking = inner.substring(0, end);
  let after = inner.substring(end + THINKING_END.length);
  if (after.startsWith('\n\n')) after = after.substring(2);

  const before = text.substring(0, start);
  const rest = (before + after).trim();
  return { thinking, rest };
}

// ─── Non-Streaming Response ───

export function parseKiroResponse(responseBody: string, originalModel: string): AnthropicResponse {
  const { events } = parseAwsEvents(responseBody);

  let fullContent = '';
  const toolCalls: Array<{ id: string; name: string; input: unknown }> = [];
  let curTool: { id: string; name: string; input: string } | null = null;
  let contextUsagePct = 0;

  const finishTool = () => {
    if (!curTool) return;
    let parsed: unknown;
    try { parsed = JSON.parse(curTool.input); } catch { parsed = {}; }
    toolCalls.push({ id: curTool.id, name: curTool.name, input: parsed });
    curTool = null;
  };

  for (const ev of events) {
    if (ev.type === 'content') {
      fullContent += ev.data as string;
    } else if (ev.type === 'toolUse') {
      const d = ev.data as { name: string; toolUseId: string; input: string; stop: boolean };
      if (curTool && curTool.id !== d.toolUseId) finishTool();
      if (!curTool) curTool = { id: d.toolUseId, name: d.name, input: '' };
      curTool.input += d.input;
      if (d.stop) finishTool();
    } else if (ev.type === 'toolUseInput' && curTool) {
      curTool.input += (ev.data as { input: string }).input || '';
    } else if (ev.type === 'toolUseStop') {
      finishTool();
    } else if (ev.type === 'contextUsage') {
      contextUsagePct = (ev.data as { percentage: number }).percentage;
    }
  }
  finishTool();

  const content: AnthropicContentBlock[] = [];
  const { thinking, rest } = extractThinking(fullContent);
  if (thinking) content.push({ type: 'thinking', thinking });
  if (rest) content.push({ type: 'text', text: rest });
  if (!thinking && !rest && toolCalls.length === 0) content.push({ type: 'text', text: '' });

  for (const tc of toolCalls) {
    content.push({
      type: 'tool_use',
      id: tc.id || crypto.randomUUID(),
      name: tc.name,
      input: (typeof tc.input === 'object' && tc.input !== null ? tc.input : {}) as Record<string, unknown>,
    });
  }

  const outputTokens = Math.ceil((fullContent.length + toolCalls.reduce((s, t) => s + JSON.stringify(t.input).length, 0)) / 4);
  let inputTokens = 0;
  if (contextUsagePct > 0) {
    const contextWindow = 200000;
    const totalTokens = Math.round(contextWindow * contextUsagePct / 100);
    inputTokens = Math.max(0, totalTokens - outputTokens);
  }

  return {
    id: `msg_${crypto.randomUUID()}`,
    type: 'message',
    role: 'assistant',
    content,
    model: originalModel,
    stop_reason: toolCalls.length > 0 ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

// ─── Streaming ───

export interface KiroStreamState {
  initialized: boolean;
  buffer: string;
  nextBlockIndex: number;
  textBlockIndex: number | null;
  thinkingBlockIndex: number | null;
  stoppedBlocks: Set<number>;
  currentToolCall: { id: string; name: string; input: string } | null;
  toolUseBlockIndexes: Map<string, number>;
  originalModel: string;
  [key: string]: unknown;
}

export function createKiroStreamState(originalModel = ''): KiroStreamState {
  return {
    initialized: true,
    buffer: '',
    nextBlockIndex: 0,
    textBlockIndex: null,
    thinkingBlockIndex: null,
    stoppedBlocks: new Set(),
    currentToolCall: null,
    toolUseBlockIndexes: new Map(),
    originalModel,
  };
}

export function parseKiroStreamChunk(chunk: string, state: KiroStreamState): AnthropicStreamEvent[] {
  state.buffer += chunk;
  const { events, remaining } = parseAwsEvents(state.buffer);
  state.buffer = remaining;

  const result: AnthropicStreamEvent[] = [];

  const startBlock = (type: 'thinking' | 'text' | 'tool_use', id?: string, name?: string): void => {
    if (type === 'thinking' && state.thinkingBlockIndex != null) return; // eslint-disable-line eqeqeq
    if (type === 'text' && state.textBlockIndex != null) return; // eslint-disable-line eqeqeq
    const idx = state.nextBlockIndex++;
    const block: AnthropicContentBlock =
      type === 'thinking' ? { type: 'thinking', thinking: '' }
      : type === 'tool_use' ? { type: 'tool_use', id: id || crypto.randomUUID(), name: name || '', input: {} as Record<string, unknown> }
      : { type: 'text', text: '' };
    result.push({ type: 'content_block_start', index: idx, content_block: block });
    if (type === 'thinking') state.thinkingBlockIndex = idx;
    else if (type === 'text') state.textBlockIndex = idx;
    else if (type === 'tool_use' && id) state.toolUseBlockIndexes.set(id, idx);
  };

  const stopBlock = (idx: number | null): void => {
    if (idx === null || state.stoppedBlocks.has(idx)) return;
    state.stoppedBlocks.add(idx);
    result.push({ type: 'content_block_stop', index: idx });
  };

  for (const ev of events) {
    if (ev.type === 'content') {
      const text = ev.data as string;
      startBlock('text');
      result.push({ type: 'content_block_delta', index: state.textBlockIndex!, delta: { type: 'text_delta', text } });
    } else if (ev.type === 'toolUse') {
      const d = ev.data as { name: string; toolUseId: string; input: string; stop: boolean };
      stopBlock(state.textBlockIndex);
      if (state.currentToolCall && state.currentToolCall.id !== d.toolUseId) {
        const prevIdx = state.toolUseBlockIndexes.get(state.currentToolCall.id);
        stopBlock(prevIdx ?? null);
      }
      if (!state.currentToolCall || state.currentToolCall.id !== d.toolUseId) {
        startBlock('tool_use', d.toolUseId, d.name);
        state.currentToolCall = { id: d.toolUseId, name: d.name, input: '' };
      }
      state.currentToolCall!.input += d.input;
      if (d.input) {
        const idx = state.toolUseBlockIndexes.get(d.toolUseId);
        if (idx != null) result.push({ type: 'content_block_delta', index: idx, delta: { type: 'input_json_delta', partial_json: d.input } }); // eslint-disable-line eqeqeq
      }
      if (d.stop) {
        const idx = state.toolUseBlockIndexes.get(d.toolUseId);
        stopBlock(idx ?? null);
        state.currentToolCall = null;
      }
    } else if (ev.type === 'toolUseInput' && state.currentToolCall) {
      const input = (ev.data as { input: string }).input || '';
      state.currentToolCall.input += input;
      if (input) {
        const idx = state.toolUseBlockIndexes.get(state.currentToolCall.id);
        if (idx != null) result.push({ type: 'content_block_delta', index: idx, delta: { type: 'input_json_delta', partial_json: input } }); // eslint-disable-line eqeqeq
      }
    } else if (ev.type === 'toolUseStop' && state.currentToolCall) {
      const idx = state.toolUseBlockIndexes.get(state.currentToolCall.id);
      stopBlock(idx ?? null);
      state.currentToolCall = null;
    }
  }

  return result;
}
