import { createBrowserClient } from '@supabase/ssr';
import { getPublicAuthConfig } from '@/lib/auth-policy.mjs';
const config = getPublicAuthConfig();
// The previous optional login used localStorage. Do not reuse its session on shared devices.
if (typeof window !== 'undefined' && config) {
  try { localStorage.removeItem(`sb-${new URL(config.url).hostname.split('.')[0]}-auth-token`); } catch { /* Storage can be disabled. */ }
}
// SSR's official browser client uses cookies, not a second localStorage session.
// These cookies are JS-readable by design for browser Supabase calls; CSP is enforced server-side.
export const supabase = config ? createBrowserClient(config.url, config.key, {
  cookieOptions: { path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
}) : null;
