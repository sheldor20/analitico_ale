import { readFile, writeFile, rename, rm, access } from 'node:fs/promises';
const path = 'components/dashboard.tsx';
let text = await readFile(path, 'utf8');
const from = '              onClick={() => (user ? logout() : setShowLogin(true))}';
const to = '              aria-label={user ? "Sair" : "Entrar"}\n' + from;
if (!text.includes(to)) {
  if (text.split(from).length !== 2) throw new Error('Source drift in login button');
  text = text.replace(from, to);
  await writeFile(path, text);
}
const previous = 'supabase/migrations/20260910132506_portfolio_communication_drafts.sql';
const applied = 'supabase/migrations/20260910134016_portfolio_communication_drafts.sql';
try { await access(previous); await rename(previous, applied); }
catch (error) { if (error.code !== 'ENOENT') throw error; await access(applied); }
await rm('.work', { recursive: true });
await rm('.github/workflows/assemble-portfolio.yml');
console.log('Mobile accessible login, applied migration version and temporary integration cleanup complete.');
