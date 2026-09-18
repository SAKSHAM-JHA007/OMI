import { AgentEvent } from './types';
import { db } from '../db';
import { executeAgentLoop } from './loop';

interface ActiveRunState {
  runId: string;
  abortController: AbortController;
  listeners: Set<(data: string) => void>;
  eventLog: AgentEvent[];
}

const activeRuns = new Map<string, ActiveRunState>();

export function getOrCreateRunManager(runId: string) {
  let active = activeRuns.get(runId);
  if (!active) {
    active = {
      runId,
      abortController: new AbortController(),
      listeners: new Set(),
      eventLog: [],
    };
    activeRuns.set(runId, active);
  }
  return active;
}

export function subscribeToRun(runId: string, listener: (data: string) => void): () => void {
  const active = getOrCreateRunManager(runId);
  active.listeners.add(listener);

  // Replay in-memory events to newly connected client
  for (const ev of active.eventLog) {
    listener(`data: ${JSON.stringify(ev)}\n\n`);
  }

  return () => {
    active.listeners.delete(listener);
    if (active.listeners.size === 0 && active.eventLog.some((e) => e.type === 'done' || e.type === 'error' || e.type === 'cancelled')) {
      activeRuns.delete(runId);
    }
  };
}

export function broadcastRunEvent(runId: string, event: AgentEvent) {
  const active = getOrCreateRunManager(runId);
  active.eventLog.push(event);

  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const listener of active.listeners) {
    try {
      listener(payload);
    } catch {
      // ignore broken connection
    }
  }
}

export function cancelRun(runId: string): boolean {
  const active = activeRuns.get(runId);
  if (active) {
    active.abortController.abort();
  }
  db.prepare("UPDATE runs SET status = 'cancelled', ended_at = datetime('now') WHERE id = ?").run(runId);
  broadcastRunEvent(runId, { type: 'cancelled' });
  return true;
}

export async function startRunBackground(runId: string, conversationId: string, userMessage: string, userId: string) {
  const active = getOrCreateRunManager(runId);

  await executeAgentLoop({
    runId,
    conversationId,
    userMessage,
    userId,
    abortSignal: active.abortController.signal,
    onEvent: (event) => {
      broadcastRunEvent(runId, event);
    },
  });
}
