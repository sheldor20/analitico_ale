// Keep this list exact: a file extension is never an authentication exemption.
export const PUBLIC_ASSETS = new Set([
  '/favicon.ico', '/robots.txt', '/brand/sicoob-logo.svg',
  '/brand/sicoob-logo-light.svg', '/brand/sicoob-sans.woff2',
]);
export function isPublicRequest(pathname, method = 'GET') {
  if (['GET', 'HEAD'].includes(method)) {
    return pathname === '/login' || PUBLIC_ASSETS.has(pathname) ||
      /^\/_next\/static\/[A-Za-z0-9_./%~-]+$/.test(pathname) && !/(?:\.\.|%2e|%2f|%5c)/i.test(pathname);
  }
  return pathname === '/api/auth/login' && method === 'POST';
}
export function sameOrigin(request) {
  try {
    const origin = request.headers.get('origin');
    const site = request.headers.get('sec-fetch-site');
    return Boolean(origin) && origin === new URL(request.url).origin && (!site || site === 'same-origin');
  } catch { return false; }
}
export function securityHeaders(nonce, supabaseUrl = '', production = true) {
  let remote = '';
  try { const url = new URL(supabaseUrl); remote = `${url.origin} ${url.origin.replace(/^http/, 'ws')}`; } catch { /* Fail closed to same origin. */ }
  return {
    'Content-Security-Policy': [
      "default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${production ? '' : " 'unsafe-eval'"}`,
      "script-src-attr 'none'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
      "font-src 'self'", `connect-src 'self' ${remote}${production ? '' : ' ws://localhost:* ws://127.0.0.1:*'}`,
      "frame-src 'self' blob:", "worker-src 'self' blob:", "frame-ancestors 'none'",
      "base-uri 'none'", "object-src 'none'", "form-action 'self'",
      ...(production && supabaseUrl.startsWith('https://') ? ['upgrade-insecure-requests'] : []),
    ].join('; '),
    'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
    'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store',
    'Pragma': 'no-cache', 'Expires': '0',
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  };
}
export function getPublicAuthConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || key.startsWith('sb_secret_')) return null;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password || parsed.pathname !== '/' && parsed.pathname !== '') return null;
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) return null;
    if (key.startsWith('eyJ')) {
      const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role !== 'anon') return null;
    }
    return { url: parsed.origin, key };
  } catch { return null; }
}
