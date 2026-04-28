// Anthropic SDK ↔ Internal message type conversion
import type {
  AnthropicRequest,
  AnthropicResponse,
  AnthropicMessage,
  AnthropicContentBlock,
  AnthropicStreamEvent,
  AnthropicDelta,
  AnthropicUsage,
  AnthropicTool,
  AnthropicToolChoice,
  AnthropicSystemBlock,
  InternalRequest,
  InternalMessage,
  InternalContentPart,
  InternalTool,
  InternalToolChoice,
  InternalUsage,
  InternalToolCall,
  InternalResponse,
  InternalContentBlock,
  InternalStreamEvent,
  InternalDelta,
} from '../providers/types.js';

// ─── Request: Anthropic → Internal ───

function convertContentBlocksToInternal(
  blocks: AnthropicContentBlock[],
): { parts: InternalContentPart[]; toolCalls: InternalMessage['tool_calls']; toolResultMessages: InternalMessage[] } {
  const parts: InternalContentPart[] = [];
  const toolCalls: InternalToolCall[] = [];
  const toolResultMessages: InternalMessage[] = [];

  for (const block of blocks) {
    if (block.type === 'text') {
      parts.push({ type: 'text', text: block.text });
    } else if (block.type === 'image') {
      parts.push({ type: 'image', media_type: block.source.media_type, data: block.source.data });
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: { name: block.name, arguments: JSON.stringify(block.input) },
      });
    } else if (block.type === 'tool_result') {
      let resultText = typeof block.content === 'string' ? block.content : '';
      if (typeof block.content !== 'string') {
        resultText = block.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map(b => b.text)
          .join('\n');
      }
      if (block.is_error) resultText = `[ERROR] ${resultText}`;
      toolResultMessages.push({
        role: 'tool',
        content: resultText,
        tool_call_id: block.tool_use_id,
      });
    }
    // thinking blocks extracted to content_parts for assistant messages
  }

  return { parts, toolCalls, toolResultMessages };
}

function convertAnthropicMessage(msg: AnthropicMessage): InternalMessage[] {
  if (typeof msg.content === 'string') {
    return [{ role: msg.role, content: msg.content }];
  }

  const results: InternalMessage[] = [];
  const userParts: InternalContentPart[] = [];
  let toolResultMessages: InternalMessage[] = [];

  if (msg.role === 'user') {
    for (const block of msg.content) {
      if (block.type === 'text') {
        userParts.push({ type: 'text', text: block.text });
      } else if (block.type === 'image') {
        userParts.push({ type: 'image', media_type: block.source.media_type, data: block.source.data });
      } else if (block.type === 'tool_result') {
        let resultText = typeof block.content === 'string' ? block.content : '';
        if (typeof block.content !== 'string') {
          resultText = block.content
            .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
            .map(b => b.text)
            .join('\n');
        }
        if (block.is_error) resultText = `[ERROR] ${resultText}`;
        toolResultMessages.push({
          role: 'tool',
          content: resultText,
          tool_call_id: block.tool_use_id,
        });
      }
    }
  }

  if (msg.role === 'assistant') {
    const { parts, toolCalls, toolResultMessages } = convertContentBlocksToInternal(msg.content);
    if (toolCalls && toolCalls.length > 0) {
      const textContent = parts.filter(p => p.type === 'text').map(p => (p as { type: 'text'; text: string }).text).join('\n');
      results.push({ role: 'assistant', content: textContent || '', tool_calls: toolCalls });
    } else if (parts.length > 0) {
      results.push({ role: 'assistant', content: parts });
    }
    return results;
  }

  if (userParts.length > 0) {
    if (userParts.length === 1 && userParts[0].type === 'text') {
      results.push({ role: 'user', content: (userParts[0] as { type: 'text'; text: string }).text });
    } else {
      results.push({ role: 'user', content: userParts });
    }
  }
  results.push(...toolResultMessages);
  return results;
}

/**
 * Convert InternalMessage[] back to AnthropicMessage[] + system prompt.
 * Needed for providers that directly consume Anthropic-format messages (e.g. Kiro).
 */
export function internalMessagesToAnthropic(
  messages: InternalMessage[],
): { anthropicMessages: AnthropicMessage[]; system?: string } {
  const anthropicMessages: AnthropicMessage[] = [];
  let system: string | undefined;

  for (const msg of messages) {
    if (msg.role === 'system') {
      system = typeof msg.content === 'string' ? msg.content : msg.content.map(p => 'text' in p ? p.text : '').join('\n');
      continue;
    }

    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        anthropicMessages.push({ role: 'user', content: msg.content });
      } else {
        const blocks: AnthropicContentBlock[] = [];
        for (const part of msg.content) {
          if (part.type === 'text') {
            blocks.push({ type: 'text', text: part.text });
          } else if (part.type === 'image') {
            blocks.push({
              type: 'image',
              source: { type: 'base64', media_type: part.media_type, data: part.data },
            });
          }
        }
        anthropicMessages.push({ role: 'user', content: blocks as AnthropicContentBlock[] });
      }
      continue;
    }

    if (msg.role === 'assistant') {
      const blocks: AnthropicContentBlock[] = [];
      if (typeof msg.content === 'string' && msg.content) {
        blocks.push({ type: 'text', text: msg.content });
      } else if (typeof msg.content !== 'string') {
        for (const part of msg.content) {
          if (part.type === 'text') blocks.push({ type: 'text', text: part.text });
        }
      }
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          let input: Record<string, unknown> = {};
          try { input = JSON.parse(tc.function.arguments); } catch { /* ignore */ }
          blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
        }
      }
      anthropicMessages.push({ role: 'assistant', content: blocks as AnthropicContentBlock[] });
      continue;
    }

    // role === 'tool': wrap as user message with tool_result block
    const resultText = typeof msg.content === 'string' ? msg.content : '';
    anthropicMessages.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: msg.tool_call_id ?? '', content: resultText }] as AnthropicContentBlock[],
    });
  }

  return { anthropicMessages, system };
}

export function anthropicRequestToInternal(req: AnthropicRequest): InternalRequest {
  const messages: InternalMessage[] = [];

  if (req.system) {
    let systemText: string;
    if (typeof req.system === 'string') {
      systemText = req.system;
    } else {
      systemText = req.system.map(b => b.text).join('\n');
    }
    messages.push({ role: 'system', content: systemText });
  }

  for (const msg of req.messages) {
    messages.push(...convertAnthropicMessage(msg));
  }

  const result: InternalRequest = { model: req.model, messages, max_tokens: req.max_tokens };

  if (req.temperature !== undefined) result.temperature = req.temperature;
  if (req.top_p !== undefined) result.top_p = req.top_p;
  if (req.top_k !== undefined) result.top_k = req.top_k;
  if (req.stream !== undefined) result.stream = req.stream;
  if (req.stop_sequences?.length) result.stop_sequences = req.stop_sequences;
  if (req.thinking?.type === 'enabled') result.thinking = req.thinking;

  if (req.tools?.length) {
    result.tools = req.tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));
  }
  if (req.tool_choice) {
    result.tool_choice = req.tool_choice as InternalToolChoice;
  }

  return result;
}

// ─── Response: Internal → Anthropic ───

function internalBlockToAnthropic(b: InternalContentBlock): AnthropicContentBlock {
  if (b.type === 'text') {
    return { type: 'text', text: b.text ?? '' };
  }
  if (b.type === 'tool_use') {
    return { type: 'tool_use', id: b.id ?? '', name: b.name ?? '', input: b.input ?? {} };
  }
  if (b.type === 'thinking') {
    return { type: 'thinking', thinking: b.thinking ?? '' };
  }
  return { type: 'text', text: '' };
}

function internalUsageToAnthropic(u: InternalUsage): AnthropicUsage {
  return {
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_creation_input_tokens: u.cache_creation_input_tokens,
    cache_read_input_tokens: u.cache_read_input_tokens,
  };
}

export function internalResponseToAnthropic(resp: InternalResponse, originalModel: string): AnthropicResponse {
  return {
    id: resp.id,
    type: 'message',
    role: 'assistant',
    content: resp.content.map(internalBlockToAnthropic),
    model: originalModel,
    stop_reason: resp.stop_reason,
    stop_sequence: resp.stop_sequence,
    usage: internalUsageToAnthropic(resp.usage),
  };
}

export function internalStreamEventToAnthropic(ev: InternalStreamEvent): AnthropicStreamEvent {
  if (ev.type === 'message_start') {
    return { type: 'message_start', message: internalResponseToAnthropic(ev.message, ev.message.model) };
  }
  if (ev.type === 'content_block_start') {
    return { type: 'content_block_start', index: ev.index, content_block: internalBlockToAnthropic(ev.content_block) };
  }
  if (ev.type === 'content_block_delta') {
    return { type: 'content_block_delta', index: ev.index, delta: ev.delta };
  }
  if (ev.type === 'content_block_stop') {
    return { type: 'content_block_stop', index: ev.index };
  }
  if (ev.type === 'message_delta') {
    return { type: 'message_delta', delta: ev.delta, usage: ev.usage };
  }
  if (ev.type === 'message_stop') return { type: 'message_stop' };
  if (ev.type === 'ping') return { type: 'ping' };
  if (ev.type === 'error') return { type: 'error', error: ev.error };
  return { type: 'ping' };
}
