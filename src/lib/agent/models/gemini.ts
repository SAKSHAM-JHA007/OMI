import { AgentTool } from '../types';
import { ModelAdapter, ModelDelta } from './adapter';

export class GeminiAdapter implements ModelAdapter {
  private apiKey: string;
  private modelName: string;

  public readonly pricing = {
    inPerMTok: 0.075, // Gemini 1.5 Flash pricing
    outPerMTok: 0.30,
  };

  constructor(apiKey: string, modelName = 'gemini-3.5-flash') {
    this.apiKey = apiKey;
    this.modelName = modelName;
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
    const primaryModel = opts?.model || this.modelName;
    const fallbackModel = 'gemini-3.5-flash-lite';

    try {
      yield* this.streamFromModel(primaryModel, messages, tools, opts?.signal);
    } catch (err: any) {
      // If primary (e.g. gemini-1.5-pro) hits quota or rate limit, automatically failover to flash
      if (primaryModel !== fallbackModel) {
        console.warn(`Gemini ${primaryModel} error: ${err.message}. Retrying with ${fallbackModel}...`);
        yield* this.streamFromModel(fallbackModel, messages, tools, opts?.signal);
      } else {
        throw err;
      }
    }
  }

  private async *streamFromModel(
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string; tool_call_id?: string }>,
    tools: AgentTool[],
    signal?: AbortSignal
  ): AsyncIterable<ModelDelta> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

    // Convert messages to Gemini format
    let systemInstruction: string | undefined;
    const contents: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = msg.content;
      } else if (msg.role === 'tool') {
        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: msg.name || 'tool',
                response: { result: msg.content },
              },
            },
          ],
        });
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    // Convert tools to Gemini function declarations
    const functionDeclarations = tools.map((t) => {
      // Basic schema representation
      return {
        name: t.name,
        description: t.description,
        parameters: {
          type: 'OBJECT',
          properties: t.name === 'web_search'
            ? { query: { type: 'STRING', description: 'Search keywords' } }
            : t.name === 'fetch_page'
            ? { url: { type: 'STRING', description: 'Page URL' } }
            : t.name === 'write_memory'
            ? { fact: { type: 'STRING', description: 'Fact to remember' } }
            : {},
        },
      };
    });

    const payload: any = {
      contents,
    };

    if (systemInstruction) {
      payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    if (functionDeclarations.length > 0) {
      payload.tools = [{ functionDeclarations }];
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('Response body is null');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const dataStr = line.slice(6).trim();
        if (!dataStr || dataStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(dataStr);
          const candidate = parsed.candidates?.[0];
          if (candidate?.content?.parts && Array.isArray(candidate.content.parts)) {
            for (const part of candidate.content.parts) {
              if (part.text) {
                yield { type: 'text', text: part.text };
              } else if (part.functionCall) {
                yield {
                  type: 'tool_call',
                  id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                  name: part.functionCall.name,
                  args: part.functionCall.args || {},
                };
              }
            }
          }

          if (parsed.usageMetadata) {
            yield {
              type: 'finish',
              usage: {
                tokensIn: parsed.usageMetadata.promptTokenCount || 0,
                tokensOut: parsed.usageMetadata.candidatesTokenCount || 0,
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
