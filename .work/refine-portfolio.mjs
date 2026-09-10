import { readFile, writeFile } from 'node:fs/promises';
function once(text, from, to) { if (text.split(from).length !== 2) throw new Error(`Source drift: ${from.slice(0,80)}`); return text.replace(from,to); }
let text = await readFile('lib/portfolio-communication.mjs', 'utf8');
if (!text.includes('export { buildEmailFile }')) {
  const start = text.indexOf('const base64 = (value) => {');
  if (start < 0 || !text.slice(start).includes('export function buildEmailFile')) throw new Error('Missing MIME implementation');
  text = text.slice(0,start) + 'export { buildEmailFile } from "./email-export.mjs";\n';
  text = once(text, 'if (!Array.isArray(entries) || entries.length > 100)', 'if (!Array.isArray(entries) || entries.length > 1000)');
  text = once(text, '  return [...new Set(emails)];', '  const unique = [...new Set(emails)];\n  if (unique.length > 100) throw new Error("Informe até 100 e-mails nesta comunicação.");\n  return unique;');
  text = once(text, '  let digits = raw.replace(/\\D/g, "");', '  let digits = raw.replace(/\\D/g, "");\n  if (!raw.startsWith("+") && digits.length < 10) throw new Error("Informe o DDD e o número do WhatsApp.");');
  await writeFile('lib/portfolio-communication.mjs', text);
}
console.log('Reviewed MIME folding and recipient/phone guards integrated.');
