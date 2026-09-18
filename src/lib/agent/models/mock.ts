import { AgentTool } from '../types';
import { ModelAdapter, ModelDelta } from './adapter';

export class MockAdapter implements ModelAdapter {
  public readonly pricing = {
    inPerMTok: 0.05,
    outPerMTok: 0.15,
  };

  countTokens(textOrMessages: any): number {
    const str = typeof textOrMessages === 'string' ? textOrMessages : JSON.stringify(textOrMessages);
    return Math.ceil(str.length / 4);
  }

  async *stream(
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string; tool_call_id?: string }>,
    tools: AgentTool[],
    opts?: { signal?: AbortSignal; model?: string }
  ): AsyncIterable<ModelDelta> {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const hasToolResult = messages.some((m) => m.role === 'tool');

    // If no tool result yet, check if the query benefits from web search or memory
    if (!hasToolResult) {
      const lower = lastUserMsg.toLowerCase();

      // Check if user is asking to remember something
      if (lower.startsWith('remember that') || lower.includes('remember:') || lower.startsWith('from now on')) {
        yield {
          type: 'tool_call',
          id: `call_${Date.now()}`,
          name: 'write_memory',
          args: { fact: lastUserMsg.replace(/^(remember that|from now on,?\s*)/i, '').trim() },
        };
        return;
      }

      // If user asks for comparison, search, or research
      if (
        lower.includes('compare') ||
        lower.includes('search') ||
        lower.includes('vs') ||
        lower.includes('what is') ||
        lower.includes('who is') ||
        lower.includes('how to') ||
        lower.includes('tell me about') ||
        lower.length > 15
      ) {
        // Issue web_search tool call
        const query = lastUserMsg.replace(/^(search for|research|tell me about|compare)\s+/i, '').slice(0, 60);
        yield {
          type: 'tool_call',
          id: `call_${Date.now()}`,
          name: 'web_search',
          args: { query: query || 'Fastify vs Express vs Hono REST API benchmark' },
        };
        return;
      }
    }

    // If we have tool results or general conversation, stream a grounded response
    const searchToolResult = messages.find((m) => m.role === 'tool' && m.name === 'web_search');
    let citedUrl = 'https://fastify.dev/docs/latest/Guides/Benchmarking/';

    if (searchToolResult) {
      try {
        const parsed = JSON.parse(searchToolResult.content);
        if (Array.isArray(parsed) && parsed[0]?.url) {
          citedUrl = parsed[0].url;
        }
      } catch {
        // ignore parse error
      }
    }

    // Synthesize response with grounding & citations per PRD §14
    const responseParagraphs = [
      `I analyzed the information regarding: "${lastUserMsg.slice(0, 80)}".\n\n`,
      `### Key Findings\n`,
      `- **Performance & Architecture**: High-throughput Node.js runtimes benefit significantly from minimal overhead. Frameworks like Fastify and Hono minimize abstraction penalties compared to legacy stacks. [Sourced: ${citedUrl}]\n`,
      `- **Developer Ergonomics**: Express remains widely compatible, whereas modern TypeScript-first frameworks provide end-to-end type safety and schema validation built-in. [Sourced: ${citedUrl}]\n\n`,
      `### Assessment\n`,
      `Based on the architectural specifications and benchmarks examined, my read is that Hono is optimal for edge runtimes, while Fastify excels in high-volume enterprise services. [Inferred]\n`,
    ];

    for (const paragraph of responseParagraphs) {
      if (opts?.signal?.aborted) return;
      const words = paragraph.split(' ');
      for (const word of words) {
        if (opts?.signal?.aborted) return;
        yield { type: 'text', text: word + ' ' };
        await new Promise((r) => setTimeout(r, 6)); // High-speed stream (~160 tok/sec)
      }
    }

    yield {
      type: 'finish',
      usage: { tokensIn: 450, tokensOut: 220 },
    };
  }
}
