import { NextResponse } from 'next/server';
import { getVerifiedUser } from '@/lib/auth-server';
export const dynamic = 'force-dynamic';
export async function GET() {
  if (!await getVerifiedUser()) return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
}
