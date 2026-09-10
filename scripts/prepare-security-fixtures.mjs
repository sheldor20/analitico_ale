// One-time branch preparation; remove with its write-enabled workflow before review.
import { readFile,writeFile,readdir } from 'node:fs/promises';
function once(text,from,to){if(text.includes(to))return text;if(!text.includes(from))throw new Error(`Expected fixture text missing: ${from.slice(0,80)}`);return text.replace(from,to);}
const browser='tests/browser/portfolio.spec.mjs';
let b=await readFile(browser,'utf8');
b=b.replaceAll('https://portfolio-test.supabase.co','http://127.0.0.1:4600');
b=once(b,"  await page.getByRole('button', { name: 'Entrar', exact: true }).click();\n  const login = page.getByRole('dialog', { name: 'Entrar na conta' });","  const login = page.getByRole('form', { name: 'Entrar na conta' });");
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
let importer=await readFile('lib/importer.mjs','utf8');
if(!importer.includes('from "./xlsx-safety.mjs"'))importer='import { assertSafeXlsx } from "./xlsx-safety.mjs";\n'+importer;
importer=once(importer,'  const book = new ExcelJS.Workbook();','  await assertSafeXlsx(buffer);\n  const book = new ExcelJS.Workbook();');
await writeFile('lib/importer.mjs',importer);
for(const name of await readdir('components')){
  if(!name.endsWith('.tsx'))continue;
  const path='components/'+name;let s=await readFile(path,'utf8');
  if(!/await [a-zA-Z_$][\w$]*\.arrayBuffer\(\)/.test(s))continue;
  s=s.replace(/await ([a-zA-Z_$][\w$]*)\.arrayBuffer\(\)/g,'await readWorkbookFile($1)');
  s=s.replace('"use client";','"use client";\nimport { readWorkbookFile } from "@/lib/xlsx-safety.mjs";');
  await writeFile(path,s);
}
const ratePath='app/api/auth/login/route.ts';
let rate=await readFile(ratePath,'utf8');
rate=once(rate,'    // Session cookies are set','    attempts.entries.delete(key); // A successful login resets consecutive failures.\n    // Session cookies are set');
await writeFile(ratePath,rate);
