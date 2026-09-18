import { AgentTool } from '../types';

export type ModelDelta =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: any }
  | { type: 'finish'; usage?: { tokensIn: number; tokensOut: number } };

export interface ModelAdapter {
  stream(
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string; tool_call_id?: string }>,
    tools: AgentTool[],
    opts?: { signal?: AbortSignal; model?: string }
  ): AsyncIterable<ModelDelta>;
  countTokens(textOrMessages: any): number;
  readonly pricing: { inPerMTok: number; outPerMTok: number };
}
