import { z } from 'zod';

// PRD §6: Tool contract
export type RiskLevel = 'read' | 'write' | 'external';
export type TrustLevel = 'trusted' | 'untrusted';

export type ToolResult =
  | { ok: true; data: any; trust: TrustLevel }
  | { ok: false; error: ErrorCode; message: string };

export interface ToolExecutionContext {
  runId: string;
  userId: string;
  isTainted: boolean;
  allowedUrls: Set<string>; // Outbound allowlist §7.3
}

export interface AgentTool {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  risk: RiskLevel;
  returnsTrust: TrustLevel;
  timeoutMs: number;
  idempotent: boolean;
  execute(args: any, ctx: ToolExecutionContext): Promise<ToolResult>;
}

// PRD §13: Error Taxonomy
export type ErrorCode =
  | 'AUTH_EXPIRED'
  | 'AUTH_REVOKED'
  | 'TOOL_TIMEOUT'
  | 'TOOL_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'NO_RESULTS'
  | 'CAP_REACHED'
  | 'AMBIGUOUS'
  | 'INJECTION_BLOCKED'
  | 'BUDGET_EXCEEDED'
  | 'REFUSED';

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  AUTH_EXPIRED: 'Your email connection expired. Reconnect and I’ll pick up where I left off.',
  AUTH_REVOKED: 'Email access was revoked. Reconnect to continue.',
  TOOL_TIMEOUT: 'That page took too long. I’ll work with what I have.',
  TOOL_UNAVAILABLE: 'Search is down right now. Try again in a minute.',
  RATE_LIMITED: 'Hit a rate limit. Wait about a minute.',
  NO_RESULTS: 'I couldn’t find anything on that. Want me to try different terms?',
  CAP_REACHED: 'I stopped before finishing because the task reached the iteration or cost cap.',
  AMBIGUOUS: 'Could you clarify what you’d like me to focus on?',
  INJECTION_BLOCKED: 'A page or content I read tried to issue instructions. I ignored it and halted that step.',
  BUDGET_EXCEEDED: 'You’ve hit today’s usage limit. Resets at midnight.',
  REFUSED: 'I cannot fulfill this request as it violates security boundaries.'
};

// PRD §14: Citations & Grounding
export type CitationType = 'sourced' | 'inferred' | 'unverified';

export interface Citation {
  url?: string;
  title?: string;
  type: CitationType;
  claim?: string;
}

// PRD §11 & §18: Agent Events for SSE
export type AgentEvent =
  | { type: 'status'; message: string }
  | { type: 'token'; delta: string }
  | { type: 'tool_call'; id: string; seq: number; name: string; args: any }
  | { type: 'tool_result'; id: string; ok: boolean; summary: string; trust: TrustLevel; data?: any; error?: string }
  | { type: 'tainted'; isTainted: boolean }
  | { type: 'citation'; citation: Citation }
  | { type: 'done'; text: string; citations: Citation[]; costCents: number; durationMs: number }
  | { type: 'error'; code: ErrorCode; message: string; partialText?: string }
  | { type: 'cancelled' };
