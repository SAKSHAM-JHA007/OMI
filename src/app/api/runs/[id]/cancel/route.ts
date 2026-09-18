import { NextRequest, NextResponse } from 'next/server';
import { cancelRun } from '@/lib/agent/runManager';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const runId = params.id;
  cancelRun(runId);
  return NextResponse.json({ success: true, runId });
}
