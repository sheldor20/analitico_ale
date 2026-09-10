import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPublicAuthConfig } from '@/lib/auth-policy.mjs';

export async function createServerSupabase() {
  const config = getPublicAuthConfig();
  if (!config) throw new Error('Authentication unavailable');
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: { path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: init?.signal ?? AbortSignal.timeout(8000) }) },
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try { values.forEach(({ name, value, options }) => store.set(name, value, options)); }
        catch { /* Server Components cannot write cookies. Proxy refreshes them before rendering. */ }
      },
    },
  });
}
// Never authorize from getSession(), user_metadata, a submitted owner_id, or a client header.
export async function getVerifiedUser() {
  try {
    const client = await createServerSupabase();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user || data.user.is_anonymous) return null;
    const allowed = await client.rpc('commercial_session_allowed');
    return !allowed.error && allowed.data === true ? data.user : null;
  } catch { return null; }
}
export async function requireUser() {
  const user = await getVerifiedUser();
  if (!user) redirect('/login');
  return user;
}
