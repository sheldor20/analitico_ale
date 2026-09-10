// One-time branch preparation; remove with its write-enabled workflow before review.
import { readFile,writeFile,readdir } from 'node:fs/promises';
function once(text,from,to){if(text.includes(to))return text;if(!text.includes(from))throw new Error(`Expected fixture text missing: ${from.slice(0,80)}`);return text.replace(from,to);}
const browser='tests/browser/portfolio.spec.mjs';
let b=await readFile(browser,'utf8');
b=b.replaceAll('https://portfolio-test.supabase.co','http://127.0.0.1:4600');
b=once(b,"  await page.getByRole('button', { name: 'Entrar', exact: true }).click();\n  const login = page.getByRole('dialog', { name: 'Entrar na conta' });","  const login = page.getByRole('form', { name: 'Entrar na conta' });");
// Auth traffic must reach the synthetic provider so server-side verification cannot be bypassed by a UI mock.
b=once(b,"    const url = new URL(request.url());","    const url = new URL(request.url());\n    if (url.pathname.startsWith('/auth/') || url.pathname === '/rest/v1/rpc/commercial_session_allowed') return route.continue();");
await writeFile(browser,b);
for(const file of ['tests/database.test.mjs','tests/workspace-database.test.mjs','tests/portfolio-database.test.mjs']){
  let s=await readFile(file,'utf8');
  if(!s.includes("from './auth-db-fixture.mjs'"))s="import { installAuthFixture } from './auth-db-fixture.mjs';\n"+s;
  if(!s.includes('await installAuthFixture(db);')){
    const match=s.match(/(^[ \t]*)(?:const (?:migrationDirectory|directory|dir)\s*=\s*new URL\([^\n]*supabase\/migrations[^\n]*)/m);
    if(!match)throw new Error(`Migration bootstrap not found in ${file}`);
    s=s.slice(0,match.index)+match[1]+'await installAuthFixture(db);\n'+s.slice(match.index);
  }
  await writeFile(file,s);
}
