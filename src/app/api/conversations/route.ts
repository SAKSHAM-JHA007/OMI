import { NextRequest, NextResponse } from 'next/server';
import { db, DEFAULT_USER_ID } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const userId = DEFAULT_USER_ID;
  const { searchParams } = new URL(req.url);
  const convId = searchParams.get('id');

  if (convId) {
    const messages = db.prepare('SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(convId);
    return NextResponse.json({ messages });
  }

  const conversations = db.prepare('SELECT id, title, created_at FROM conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(userId);
  return NextResponse.json({ conversations });
}
