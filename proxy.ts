import { randomBytes } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getPublicAuthConfig, isPublicRequest, securityHeaders, PUBLIC_ASSETS } from '@/lib/auth-policy.mjs';

export async function proxy(request: NextRequest) {
  const config = getPublicAuthConfig();
  const nonce = randomBytes(18).toString('base64');
  const policy = securityHeaders(nonce, config?.url, process.env.NODE_ENV === 'production');
  const forwarded = new Headers(request.headers);
  forwarded.delete('x-middleware-subrequest');
  forwarded.delete('x-user-id');
  forwarded.delete('x-authenticated-user');
  forwarded.set('x-nonce', nonce);
  forwarded.set('Content-Security-Policy', policy['Content-Security-Policy']);
  let response = NextResponse.next({ request: { headers: forwarded } });
  const finish = (result: NextResponse) => {
    for (const [key, value] of Object.entries(policy)) result.headers.set(key, value);
    return result;
  };
  if (isPublicRequest(request.nextUrl.pathname, request.method)) {
    const result = finish(response);
    if (request.nextUrl.pathname.startsWith('/_next/static/') || PUBLIC_ASSETS.has(request.nextUrl.pathname)) {
      result.headers.set('Cache-Control', request.nextUrl.pathname.startsWith('/_next/static/') ? 'public, max-age=31536000, immutable' : 'public, max-age=86400');
      for (const header of ['CDN-Cache-Control', 'Vercel-CDN-Cache-Control', 'Pragma', 'Expires']) result.headers.delete(header);
    }
    return result;
  }
  let authorized = false;
  if (config && request.cookies.getAll().some(({ name }) => name.startsWith('sb-'))) {
    try {
      const client = createServerClient(config.url, config.key, {
        cookieOptions: { path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
        global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: init?.signal ?? AbortSignal.timeout(8000) }) },
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll(values) {
            values.forEach(({ name, value }) => request.cookies.set(name, value));
            forwarded.set('cookie', request.cookies.toString());
            const previous = response.cookies.getAll();
            response = NextResponse.next({ request: { headers: forwarded } });
            previous.forEach((cookie) => response.cookies.set(cookie));
            values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          },
        },
      });
      const { data, error } = await client.auth.getUser();
      if (!error && data.user && !data.user.is_anonymous) {
        const access = await client.rpc('commercial_session_allowed');
        authorized = !access.error && access.data === true;
      }
    } catch { authorized = false; }
  }
  if (!authorized) {
    const denied = request.nextUrl.pathname === '/api' || request.nextUrl.pathname.startsWith('/api/')
      ? NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 })
      : NextResponse.redirect(new URL('/login', request.url));
    response.cookies.getAll().forEach((cookie) => denied.cookies.set(cookie));
    return finish(denied);
  }
  return finish(response);
}
// Default-deny includes unknown routes, exports, RSC requests and filenames with extensions.
export const config = { matcher: ['/:path*'] };
