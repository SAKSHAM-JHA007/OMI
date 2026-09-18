import { AgentTool } from '../types';
import { ModelAdapter, ModelDelta } from './adapter';

export class OpenAIAdapter implements ModelAdapter {
  private apiKey: string;
  private baseUrl: string;
  private modelName: string;

  public readonly pricing = {
    inPerMTok: 0.15, // gpt-4o-mini default
    outPerMTok: 0.60,
  };

  constructor(apiKey: string, modelName = 'gpt-4o-mini', baseUrl = 'https://api.openai.com/v1') {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.baseUrl = baseUrl;
  }

  countTokens(textOrMessages: any): number {
    const str = typeof textOrMessages === 'string' ? textOrMessages : JSON.stringify(textOrMessages);
    return Math.ceil(str.length / 4);
  }

  async *stream(
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string; tool_call_id?: string }>,
    tools: AgentTool[],
    opts?: { signal?: AbortSignal; model?: string }
  ): AsyncIterable<ModelDelta> {
    const model = opts?.model || this.modelName;

    // Convert tools to OpenAI format
    const openAiTools = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object',
          properties: t.name === 'web_search'
            ? { query: { type: 'string', description: 'Search keywords' } }
            : t.name === 'fetch_page'
            ? { url: { type: 'string', description: 'Web page URL' } }
            : t.name === 'write_memory'
            ? { fact: { type: 'string', description: 'Fact to remember' } }
            : {},
          required: t.name === 'web_search' ? ['query'] : t.name === 'fetch_page' ? ['url'] : t.name === 'write_memory' ? ['fact'] : [],
        },
      },
    }));

    const payload: any = {
      model,
      messages: messages.map((m) => {
        if (m.role === 'tool') {
          return { role: 'tool', tool_call_id: m.tool_call_id || 'call_0', content: m.content };
        }
        return { role: m.role, content: m.content };
      }),
      stream: true,
      stream_options: { include_usage: true },
    };

    if (openAiTools.length > 0) {
      payload.tools = openAiTools;
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: opts?.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${errText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('Response body is null');

    const decoder = new TextDecoder();
    let buffer = '';
    let currentToolCall: { id: string; name: string; argsStr: string } | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const dataStr = line.slice(6).trim();
        if (dataStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(dataStr);
          const choice = parsed.choices?.[0];
          const delta = choice?.delta;

          if (delta?.content) {
            yield { type: 'text', text: delta.content };
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.function?.name) {
                if (currentToolCall) {
                  // yield previous tool call
                  try {
                    yield {
                      type: 'tool_call',
                      id: currentToolCall.id,
                      name: currentToolCall.name,
                      args: JSON.parse(currentToolCall.argsStr || '{}'),
                    };
                  } catch {
                    yield { type: 'tool_call', id: currentToolCall.id, name: currentToolCall.name, args: {} };
                  }
                }
                currentToolCall = {
                  id: tc.id || `call_${Date.now()}`,
                  name: tc.function.name,
                  argsStr: tc.function.arguments || '',
                };
              } else if (tc.function?.arguments && currentToolCall) {
                currentToolCall.argsStr += tc.function.arguments;
              }
            }
          }

          if (choice?.finish_reason === 'tool_calls' && currentToolCall) {
            try {
              yield {
                type: 'tool_call',
                id: currentToolCall.id,
                name: currentToolCall.name,
                args: JSON.parse(currentToolCall.argsStr || '{}'),
              };
            } catch {
              yield { type: 'tool_call', id: currentToolCall.id, name: currentToolCall.name, args: {} };
            }
            currentToolCall = null;
          }

          if (parsed.usage) {
            yield {
              type: 'finish',
              usage: {
                tokensIn: parsed.usage.prompt_tokens || 0,
                tokensOut: parsed.usage.completion_tokens || 0,
              },
            };
          }
        } catch {
          // ignore stream parse errors
        }
      }
    }
  }
}
