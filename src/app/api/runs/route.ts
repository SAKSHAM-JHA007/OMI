import { NextRequest, NextResponse } from 'next/server';
import { db, DEFAULT_USER_ID } from '@/lib/db';
import { startRunBackground } from '@/lib/agent/runManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, status: 'ready' });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, conversationId: existingConvId } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const userId = DEFAULT_USER_ID;
    const conversationId = existingConvId || `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Create conversation record if new
    if (!existingConvId) {
      const title = message.trim().slice(0, 40) + (message.length > 40 ? '...' : '');
      db.prepare(`
        INSERT INTO conversations (id, user_id, title)
        VALUES (?, ?, ?)
      `).run(conversationId, userId, title);
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Start agent loop in background
    startRunBackground(runId, conversationId, message.trim(), userId).catch((err) => {
      console.error(`Run ${runId} failed:`, err);
    });

    return NextResponse.json({
      runId,
      conversationId,
      status: 'queued',
    });
  } catch (err: any) {
    console.error('API /api/runs error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
