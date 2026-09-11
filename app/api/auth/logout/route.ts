import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/auth-server';
import { sameOrigin } from '@/lib/auth-policy.mjs';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem inválida.' }, { status: 403, headers });
  try {
    const client = await createServerSupabase();
    const { error } = await client.auth.signOut({ scope: 'local' });
    return NextResponse.json(error ? { error: 'Não foi possível encerrar a sessão.' } : { ok: true }, { status: error ? 503 : 200, headers });
  } catch { return NextResponse.json({ error: 'Não foi possível encerrar a sessão.' }, { status: 503, headers }); }
}
