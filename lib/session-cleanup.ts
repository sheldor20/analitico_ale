import { getPublicAuthConfig } from './auth-policy.mjs';
/** Clear only this project's auth cookies, including SSR chunks, on every logout outcome. */
export function clearLocalAuth() {
  const config = getPublicAuthConfig();
  if (!config || typeof document === 'undefined') return;
  const prefix = `sb-${new URL(config.url).hostname.split('.')[0]}-auth-token`;
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0].trim();
    if (name === prefix || name.startsWith(`${prefix}.`) || name === `${prefix}-code-verifier`) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    }
  }
  try { localStorage.removeItem(prefix); } catch { /* Private/blocked storage. */ }
}
