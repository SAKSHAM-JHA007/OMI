import { z } from 'zod';
import { AgentTool, ToolExecutionContext, ToolResult } from '../types';
import { db } from '../../db';

export const readMemoryTool: AgentTool = {
  name: 'read_memory',
  description: 'Read the user-authored facts and stored preferences (max 30 items).',
  schema: z.object({}),
  risk: 'read',
  returnsTrust: 'trusted',
  timeoutMs: 3000,
  idempotent: true,
  async execute(_args: any, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const stmt = db.prepare('SELECT id, text, created_at FROM memory_facts WHERE user_id = ? ORDER BY created_at ASC LIMIT 30');
      const facts = stmt.all(ctx.userId) as Array<{ id: string; text: string; created_at: string }>;

      return {
        ok: true,
        data: facts,
        trust: 'trusted',
      };
    } catch (err: any) {
      return { ok: false, error: 'TOOL_UNAVAILABLE', message: err.message };
    }
  },
};

export const writeMemoryTool: AgentTool = {
  name: 'write_memory',
  description: 'Store an explicit preference or fact requested by the user ("remember that...", "from now on...").',
  schema: z.object({
    fact: z.string().min(3).max(300).describe('The concise fact or user preference to remember'),
  }),
  risk: 'write',
  returnsTrust: 'trusted',
  timeoutMs: 3000,
  idempotent: false,
  async execute(args: { fact: string }, ctx: ToolExecutionContext): Promise<ToolResult> {
    // PRD §7.3 Taint Tracking:
    // Once tainted, write_memory is unavailable to prevent memory pollution from untrusted web/email content.
    if (ctx.isTainted) {
      return {
        ok: false,
        error: 'REFUSED',
        message: 'Security policy: write_memory is disabled because this run has ingested untrusted external content.',
      };
    }

    try {
      // Check count cap (≤30 facts per PRD §9)
      const countStmt = db.prepare('SELECT COUNT(*) as count FROM memory_facts WHERE user_id = ?');
      const res = countStmt.get(ctx.userId) as { count: number };
      if (res && res.count >= 30) {
        return {
          ok: false,
          error: 'CAP_REACHED',
          message: 'Memory storage limit reached (30 facts maximum). Please manage facts in settings.',
        };
      }

      const id = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const insertStmt = db.prepare('INSERT INTO memory_facts (id, user_id, text) VALUES (?, ?, ?)');
      insertStmt.run(id, ctx.userId, args.fact.trim());

      return {
        ok: true,
        data: { id, fact: args.fact.trim() },
        trust: 'trusted',
      };
    } catch (err: any) {
      return { ok: false, error: 'TOOL_UNAVAILABLE', message: err.message };
    }
  },
};
