// Translate Anthropic API requests to OpenAI format.
import type {
  AnthropicRequest,
  AnthropicMessage,
  AnthropicContentBlock,
  AnthropicToolResultBlock,
  OpenAIRequest,
  OpenAIMessage,
  OpenAIContentPart,
  OpenAITool,
  OpenAIToolChoice,
} from '../providers/types.js';

function convertContentBlocks(
  blocks: AnthropicContentBlock[]
): { messages: OpenAIMessage[]; toolCallMessages: OpenAIMessage[] } {
  const contentParts: OpenAIContentPart[] = [];
  const toolCalls: NonNullable<OpenAIMessage['tool_calls']> = [];
  const toolResultMessages: OpenAIMessage[] = [];

  for (const block of blocks) {
    if (block.type === 'text') {
      contentParts.push({ type: 'text', text: block.text });
    } else if (block.type === 'image') {
      const url = `data:${block.source.media_type};base64,${block.source.data}`;
      contentParts.push({ type: 'image_url', image_url: { url } });
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
    } else if (block.type === 'tool_result') {
      const resultBlock = block as AnthropicToolResultBlock;
      let content: string;
      if (typeof resultBlock.content === 'string') {
        content = resultBlock.content;
      } else {
        content = resultBlock.content
          .filter((b) => b.type === 'text')
          .map((b) => (b as { type: 'text'; text: string }).text)
          .join('\n');
      }
      toolResultMessages.push({
        role: 'tool',
        content,
        tool_call_id: resultBlock.tool_use_id,
      });
    }
    // thinking blocks are stripped (not supported in OpenAI)
  }

  const messages: OpenAIMessage[] = [];

  if (toolCalls.length > 0) {
    // assistant message with tool_calls; include any text content too
    const textContent = contentParts
      .filter((p) => p.type === 'text')
      .map((p) => (p as { type: 'text'; text: string }).text)
      .join('\n');
    messages.push({
      role: 'assistant',
      content: textContent || null,
      tool_calls: toolCalls,
    });
  } else if (contentParts.length === 1 && contentParts[0].type === 'text') {
    messages.push({
      role: 'assistant',
      content: (contentParts[0] as { type: 'text'; text: string }).text,
    });
  } else if (contentParts.length > 0) {
    messages.push({ role: 'assistant', content: contentParts });
  }

  return { messages, toolCallMessages: toolResultMessages };
}

function convertMessage(msg: AnthropicMessage): OpenAIMessage[] {
  if (typeof msg.content === 'string') {
    return [{ role: msg.role, content: msg.content }];
  }

  if (msg.role === 'user') {
    // user messages may contain tool_result blocks which become separate tool messages
    const toolResultMessages: OpenAIMessage[] = [];
    const contentParts: OpenAIContentPart[] = [];

    for (const block of msg.content) {
      if (block.type === 'text') {
        contentParts.push({ type: 'text', text: block.text });
      } else if (block.type === 'image') {
        const url = `data:${block.source.media_type};base64,${block.source.data}`;
        contentParts.push({ type: 'image_url', image_url: { url } });
      } else if (block.type === 'tool_result') {
        const resultBlock = block as AnthropicToolResultBlock;
        let content: string;
        if (typeof resultBlock.content === 'string') {
          content = resultBlock.content;
        } else {
          content = resultBlock.content
            .filter((b) => b.type === 'text')
            .map((b) => (b as { type: 'text'; text: string }).text)
            .join('\n');
        }
        if (resultBlock.is_error) {
          content = `[ERROR] ${content}`;
        }
        toolResultMessages.push({
          role: 'tool',
          content,
          tool_call_id: resultBlock.tool_use_id,
        });
      }
      // thinking blocks stripped
    }

    const result: OpenAIMessage[] = [];
    if (contentParts.length > 0) {
      if (contentParts.length === 1 && contentParts[0].type === 'text') {
        result.push({
          role: 'user',
          content: (contentParts[0] as { type: 'text'; text: string }).text,
        });
      } else {
        result.push({ role: 'user', content: contentParts });
      }
    }
    result.push(...toolResultMessages);
    return result;
  }

  // assistant role
  const { messages, toolCallMessages } = convertContentBlocks(msg.content);
  return [...messages, ...toolCallMessages];
}

function convertTools(tools: AnthropicRequest['tools']): OpenAITool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

function convertToolChoice(
  choice: AnthropicRequest['tool_choice']
): OpenAIToolChoice | undefined {
  if (!choice) return undefined;
  if (choice.type === 'auto') return 'auto';
  if (choice.type === 'any') return 'required';
  if (choice.type === 'tool') return { type: 'function', function: { name: choice.name } };
  return undefined;
}

export function translateRequest(req: AnthropicRequest, targetModel: string): OpenAIRequest {
  const messages: OpenAIMessage[] = [];

  // Convert system field to system message
  if (req.system) {
    let systemText: string;
    if (typeof req.system === 'string') {
      systemText = req.system;
    } else {
      systemText = req.system.map((b) => b.text).join('\n');
    }
    messages.push({ role: 'system', content: systemText });
  }
 // Convert each Anthropic message
  for (const msg of req.messages) {
    messages.push(...convertMessage(msg));
  }

  const result: OpenAIRequest = {
    model: targetModel,
    messages,
    max_tokens: req.max_tokens,
  };

  if (req.temperature !== undefined) result.temperature = req.temperature;
  if (req.top_p !== undefined) result.top_p = req.top_p;
  if (req.stream !== undefined) result.stream = req.stream;
  if (req.stop_sequences && req.stop_sequences.length > 0) {
    result.stop = req.stop_sequences;
  }

  const tools = convertTools(req.tools);
  if (tools) result.tools = tools;

  const toolChoice = convertToolChoice(req.tool_choice);
  if (toolChoice !== undefined) result.tool_choice = toolChoice;

  return result;
}
