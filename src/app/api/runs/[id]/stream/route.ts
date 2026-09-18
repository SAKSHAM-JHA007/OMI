import { NextRequest } from 'next/server';
import { subscribeToRun } from '@/lib/agent/runManager';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const runId = params.id;

  // Check if run exists in DB
  const runRecord = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as any;

  const stream = new ReadableStream({
    start(controller) {
      // Immediately flush initial SSE connection ping so client receives HTTP 200 headers instantly
      controller.enqueue(new TextEncoder().encode(': connected\n\n'));

      // Replay from DB if run is already finished
      if (runRecord && (runRecord.status === 'done' || runRecord.status === 'capped' || runRecord.status === 'cancelled' || runRecord.status === 'failed')) {
        const toolCalls = db.prepare('SELECT * FROM tool_calls WHERE run_id = ? ORDER BY seq ASC').all(runId) as any[];
        for (const tc of toolCalls) {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
            type: 'tool_call',
            id: tc.id,
            seq: tc.seq,
            name: tc.tool_name,
            args: JSON.parse(tc.args_json || '{}'),
          })}\n\n`));

          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
            type: 'tool_result',
            id: tc.id,
            ok: tc.ok === 1,
            summary: tc.ok === 1 ? 'Completed' : tc.error_code,
            trust: tc.trust,
            error: tc.ok === 1 ? undefined : tc.error_code,
          })}\n\n`));
        }

        const assistantMsg = db.prepare("SELECT content FROM messages WHERE conversation_id = ? AND role = 'assistant' ORDER BY created_at DESC LIMIT 1").get(runRecord.conversation_id) as any;
        const fullText = assistantMsg?.content || '';

        if (fullText) {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'token', delta: fullText })}\n\n`));
        }

        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
          type: 'done',
          text: fullText,
          citations: [],
          costCents: runRecord.cost_cents,
          durationMs: 0,
        })}\n\n`));

        queueMicrotask(() => {
          try { controller.close(); } catch {}
        });
        return;
      }

      // Live subscription to ongoing run
      const unsubscribe = subscribeToRun(runId, (data) => {
        try {
          controller.enqueue(new TextEncoder().encode(data));
          if (data.includes('"type":"done"') || data.includes('"type":"cancelled"') || data.includes('"type":"error"')) {
            unsubscribe();
            queueMicrotask(() => {
              try { controller.close(); } catch {}
            });
          }
        } catch {
          unsubscribe();
        }
      });
    },
    cancel() {
      // Stream canceled by client
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
