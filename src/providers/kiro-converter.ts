import crypto from 'node:crypto';
import type {
  AnthropicMessage,
  AnthropicContentBlock,
  AnthropicTool,
  AnthropicSystemBlock,
} from './types.js';

interface KiroToolSpec {
  toolSpecification: {
    name: string;
    description: string;
    inputSchema: { json: Record<string, unknown> };
  };
}

interface KiroToolResult {
  content: { text: string }[];
  status: string;
  toolUseId: string;
}

interface KiroToolUse {
  input: Record<string, unknown>;
  name: string;
  toolUseId: string;
}

interface KiroUserInputMessage {
  content: string;
  modelId: string;
  origin: string;
  images?: { format: string; source: { bytes: string } }[];
  userInputMessageContext?: {
    tools?: KiroToolSpec[];
    toolResults?: KiroToolResult[];
  };
}

interface KiroAssistantResponseMessage {
  content: string;
  toolUses?: KiroToolUse[];
}

type KiroHistoryItem =
  | { userInputMessage: KiroUserInputMessage }
  | { assistantResponseMessage: KiroAssistantResponseMessage };

export interface KiroRequest {
  conversationState: {
    agentTaskType: string;
    chatTriggerType: string;
    conversationId: string;
    currentMessage: { userInputMessage: KiroUserInputMessage };
    history?: KiroHistoryItem[];
  };
  profileArn?: string;
}

const ORIGIN = 'AI_EDITOR';
const MAX_DESCRIPTION_LENGTH = 9216;

export function mapModelId(model: string): string {
  const lastDash = model.lastIndexOf('-');
  if (lastDash === -1) return model;
  return model.substring(0, lastDash) + '.' + model.substring(lastDash + 1);
}

function getContentText(content: string | AnthropicContentBlock[] | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map(b => b.text)
    .join('');
}

function buildThinkingPrefix(thinking?: { type: string; budget_tokens?: number }): string | null {
  if (!thinking || typeof thinking !== 'object') return null;
  if (thinking.type === 'enabled') {
    const budget = Math.max(1024, Math.min(24576, Math.floor(thinking.budget_tokens ?? 20000)));
    return `<thinking_mode>enabled</thinking_mode><max_thinking_length>${budget}</max_thinking_length>`;
  }
  return null;
}

function buildSystemPrompt(
  system: string | AnthropicSystemBlock[] | undefined,
  thinking?: { type: string; budget_tokens?: number },
): string {
  let text = '';
  if (typeof system === 'string') {
    text = system;
  } else if (Array.isArray(system)) {
    text = system.map(b => b.text).join('\n');
  }
  const thinkingPrefix = buildThinkingPrefix(thinking);
  if (thinkingPrefix) {
    text = text ? `${thinkingPrefix}\n${text}` : thinkingPrefix;
  }
  return text;
}

function convertTools(tools?: AnthropicTool[]): KiroToolSpec[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  const filtered = tools.filter(t => {
    const name = (t.name || '').toLowerCase();
    return name !== 'web_search' && name !== 'websearch' && (t.description?.trim() ?? '') !== '';
  });
  if (filtered.length === 0) return undefined;
  return filtered.map(t => {
    let desc = t.description || '';
    if (desc.length > MAX_DESCRIPTION_LENGTH) {
      desc = desc.substring(0, MAX_DESCRIPTION_LENGTH) + '...';
    }
    return {
      toolSpecification: {
        name: t.name,
        description: desc,
        inputSchema: { json: t.input_schema || {} },
      },
    };
  });
}

function processUserMessage(msg: AnthropicMessage, modelId: string): {
  userInput: KiroUserInputMessage;
  toolResults: KiroToolResult[];
} {
  const userInput: KiroUserInputMessage = { content: '', modelId, origin: ORIGIN };
  const toolResults: KiroToolResult[] = [];
  const images: { format: string; source: { bytes: string } }[] = [];

  if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if (part.type === 'text') {
        userInput.content += part.text;
      } else if (part.type === 'tool_result') {
        const text = typeof part.content === 'string' ? part.content : getContentText(part.content);
        toolResults.push({ content: [{ text }], status: 'success', toolUseId: part.tool_use_id });
      } else if (part.type === 'image') {
        images.push({ format: part.source.media_type.split('/')[1], source: { bytes: part.source.data } });
      }
    }
  } else {
    userInput.content = typeof msg.content === 'string' ? msg.content : '';
  }

  if (images.length > 0) userInput.images = images;
  return { userInput, toolResults };
}

function processAssistantMessage(msg: AnthropicMessage): KiroAssistantResponseMessage {
  const result: KiroAssistantResponseMessage = { content: '' };
  const toolUses: KiroToolUse[] = [];
  let thinkingText = '';

  if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if (part.type === 'text') {
        result.content += part.text;
      } else if (part.type === 'thinking') {
        thinkingText += part.thinking ?? '';
      } else if (part.type === 'tool_use') {
        toolUses.push({ input: part.input, name: part.name, toolUseId: part.id });
      }
    }
  } else {
    result.content = typeof msg.content === 'string' ? msg.content : '';
  }

  if (thinkingText) {
    result.content = result.content
      ? `<thinking>${thinkingText}</thinking>\n\n${result.content}`
      : `<thinking>${thinkingText}</thinking>`;
  }
  if (toolUses.length > 0) result.toolUses = toolUses;
  return result;
}

function dedupeToolResults(results: KiroToolResult[]): KiroToolResult[] {
  const seen = new Set<string>();
  return results.filter(r => {
    if (seen.has(r.toolUseId)) return false;
    seen.add(r.toolUseId);
    return true;
  });
}

export function convertToCodeWhisperer(
  messages: AnthropicMessage[],
  model: string,
  system?: string | AnthropicSystemBlock[],
  tools?: AnthropicTool[],
  thinking?: { type: string; budget_tokens?: number },
): KiroRequest {
  const modelId = mapModelId(model);
  const systemPrompt = buildSystemPrompt(system, thinking);
  const kiroTools = convertTools(tools);
  const conversationId = crypto.randomUUID();

  const history: KiroHistoryItem[] = [];
  let startIndex = 0;

  if (systemPrompt) {
    if (messages.length > 0 && messages[0].role === 'user') {
      const firstText = getContentText(messages[0].content as AnthropicContentBlock[]);
      history.push({
        userInputMessage: { content: `${systemPrompt}\n\n${firstText}`, modelId, origin: ORIGIN },
      });
      startIndex = 1;
    } else {
      history.push({
        userInputMessage: { content: systemPrompt, modelId, origin: ORIGIN },
      });
    }
  }

  for (let i = startIndex; i < messages.length - 1; i++) {
    const msg = messages[i];
    if (msg.role === 'user') {
      const { userInput, toolResults } = processUserMessage(msg, modelId);
      if (toolResults.length > 0) {
        userInput.userInputMessageContext = { toolResults: dedupeToolResults(toolResults) };
      }
      history.push({ userInputMessage: userInput });
    } else {
      history.push({ assistantResponseMessage: processAssistantMessage(msg) });
    }
  }

  const lastMsg = messages[messages.length - 1];
  let currentContent = '';
  const currentToolResults: KiroToolResult[] = [];
  const currentImages: { format: string; source: { bytes: string } }[] = [];

  if (lastMsg.role === 'assistant') {
    history.push({ assistantResponseMessage: processAssistantMessage(lastMsg) });
    currentContent = 'Continue';
  } else {
    if (history.length > 0) {
      const last = history[history.length - 1];
      if (!('assistantResponseMessage' in last)) {
        history.push({ assistantResponseMessage: { content: 'Continue' } });
      }
    }

    if (Array.isArray(lastMsg.content)) {
      for (const part of lastMsg.content) {
        if (part.type === 'text') {
          currentContent += part.text;
        } else if (part.type === 'tool_result') {
          const text = typeof part.content === 'string' ? part.content : getContentText(part.content);
          currentToolResults.push({ content: [{ text }], status: 'success', toolUseId: part.tool_use_id });
        } else if (part.type === 'image') {
          currentImages.push({ format: part.source.media_type.split('/')[1], source: { bytes: part.source.data } });
        }
      }
    } else {
      currentContent = typeof lastMsg.content === 'string' ? lastMsg.content : '';
    }

    if (!currentContent) {
      currentContent = currentToolResults.length > 0 ? 'Tool results provided.' : 'Continue';
    }
  }

  const userInputMessage: KiroUserInputMessage = { content: currentContent, modelId, origin: ORIGIN };
  if (currentImages.length > 0) userInputMessage.images = currentImages;

  const ctx: Record<string, unknown> = {};
  if (currentToolResults.length > 0) ctx.toolResults = dedupeToolResults(currentToolResults);
  if (kiroTools) ctx.tools = kiroTools;
  if (Object.keys(ctx).length > 0) {
    userInputMessage.userInputMessageContext = ctx as KiroUserInputMessage['userInputMessageContext'];
  }

  const request: KiroRequest = {
    conversationState: {
      agentTaskType: 'vibe',
      chatTriggerType: 'MANUAL',
      conversationId,
      currentMessage: { userInputMessage },
    },
  };

  if (history.length > 0) request.conversationState.history = history;
  return request;
}
