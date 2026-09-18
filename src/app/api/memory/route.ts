import { NextRequest, NextResponse } from 'next/server';
import { db, DEFAULT_USER_ID } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const userId = DEFAULT_USER_ID;
  const facts = db.prepare('SELECT id, text, created_at FROM memory_facts WHERE user_id = ? ORDER BY created_at DESC LIMIT 30').all(userId);
  return NextResponse.json({ facts });
}

export async function DELETE(req: NextRequest) {
  const userId = DEFAULT_USER_ID;
  const { searchParams } = new URL(req.url);
  const factId = searchParams.get('id');

  if (factId === 'all') {
    db.prepare('DELETE FROM memory_facts WHERE user_id = ?').run(userId);
    return NextResponse.json({ success: true, deleted: 'all' });
  }

  if (factId) {
    db.prepare('DELETE FROM memory_facts WHERE id = ? AND user_id = ?').run(factId, userId);
    return NextResponse.json({ success: true, deleted: factId });
  }

  return NextResponse.json({ error: 'Missing fact id' }, { status: 400 });
}
