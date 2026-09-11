// Supplemental per-process protection, NOT a distributed/global limit.
// Supabase Auth rate limits and the hosting firewall remain necessary for direct Auth API abuse.
export class LoginLimiter {
  constructor({ windowMs = 60000, limit = 6, maxEntries = 10000 } = {}) {
    this.windowMs = windowMs; this.limit = limit; this.maxEntries = maxEntries; this.entries = new Map();
  }
  consume(key, now = Date.now()) {
    for (const [id, item] of this.entries) if (item.reset <= now) this.entries.delete(id);
    let item = this.entries.get(key);
    if (!item) {
      if (this.entries.size >= this.maxEntries) return { allowed: false, retryAfter: Math.ceil(this.windowMs / 1000) };
      item = { attempts: 0, reset: now + this.windowMs }; this.entries.set(key, item);
    }
    item.attempts++;
    return { allowed: item.attempts <= this.limit, retryAfter: Math.max(1, Math.ceil((item.reset - now) / 1000)) };
  }
}
export async function readLoginBody(request) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw new Error('Invalid body');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Invalid body');
  const chunks = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > 4096) { await reader.cancel(); throw new Error('Invalid body'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
  const body = JSON.parse(new TextDecoder().decode(bytes));
  if (!body || typeof body.email !== 'string' || typeof body.password !== 'string') throw new Error('Invalid body');
  const email = body.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !body.password || body.password.length > 256) throw new Error('Invalid body');
  return { email, password: body.password };
}
