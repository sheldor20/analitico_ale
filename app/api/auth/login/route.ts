import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/auth-server';
import { sameOrigin } from '@/lib/auth-policy.mjs';
import { LoginLimiter, readLoginBody } from '@/lib/login-limiter.mjs';
export const dynamic = 'force-dynamic';
const attempts = new LoginLimiter();
const failure = (status = 401, retryAfter?: number) => NextResponse.json(
  { error: status === 429 ? 'Muitas tentativas. Aguarde um minuto e tente novamente.' : 'Não foi possível entrar. Confira suas credenciais ou procure o administrador.' },
  { status, headers: { 'Cache-Control': 'private, no-store', ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}) } },
);
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return failure(403);
  let credentials;
  try { credentials = await readLoginBody(request); } catch { return failure(400); }
  const key = createHash('sha256').update(credentials.email).digest('hex');
  const rate = attempts.consume(key);
  if (!rate.allowed) return failure(429, rate.retryAfter);
  try {
    const client = await createServerSupabase();
    const { data, error } = await client.auth.signInWithPassword(credentials);
    if (error || !data.user || data.user.is_anonymous) return failure(error?.status === 429 ? 429 : 401, error?.status === 429 ? 60 : undefined);
    const access = await client.rpc('commercial_session_allowed');
    if (access.error || access.data !== true) { await client.auth.signOut({ scope: 'local' }); return failure(); }
    attempts.entries.delete(key); // A successful login resets consecutive failures.
    // Session cookies are set by the official SSR adapter. No token is returned in JSON.
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return failure(503); }
}
