import { normalizeRecipients } from './portfolio-communication.mjs';
const base64 = (value) => {
  let binary = '';
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
};
const mimeBody = (value) => base64(value).match(/.{1,76}/g)?.join('\r\n') || '';
function encodedSubject(value) {
  const subject = String(value ?? '').trim();
  if (!subject || subject.length > 300 || /[\r\n]/.test(subject)) throw new Error('Informe um assunto com até 300 caracteres e sem quebras de linha.');
  const words = [];
  let chunk = '';
  for (const character of subject) {
    if (new TextEncoder().encode(chunk + character).length > 42) { words.push(chunk); chunk = ''; }
    chunk += character;
  }
  if (chunk) words.push(chunk);
  return words.map((word) => `=?UTF-8?B?${base64(word)}?=`).join('\r\n ');
}
/** RFC 2047 encoded words and RFC 5322 folded headers; no external send is performed. */
export function buildEmailFile({ recipients = [], subject, text, html }) {
  const boundary = 'portfolio_alternative_v1';
  return ['X-Unsent: 1', `To: ${normalizeRecipients(recipients).join(',\r\n ')}`, `Subject: ${encodedSubject(subject)}`, 'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${boundary}"`, '', `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', mimeBody(text), `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', mimeBody(html), `--${boundary}--`, ''].join('\r\n');
}
