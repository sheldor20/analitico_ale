const EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function normalizeContactEmails(values) {
  if (!Array.isArray(values)) throw new Error("A lista de e-mails é inválida.");
  if (values.length > 10) throw new Error("Cada responsável pode ter no máximo 10 e-mails.");
  const normalized = [];
  const seen = new Set();
  for (const raw of values) {
    const email = String(raw ?? "").trim().toLowerCase();
    if (!email) continue;
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) throw new Error(`E-mail inválido: ${String(raw ?? "").trim()}`);
    if (seen.has(email)) continue;
    seen.add(email);
    normalized.push(email);
  }
  return normalized;
}

export function normalizeWhatsapp(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.length > 40) throw new Error("WhatsApp deve ter no máximo 40 caracteres.");
  return raw;
}
