import { operationalFixture } from './operational-fixture.mjs';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { portfolioFixture } from '../portfolio-fixture.mjs';
import { upsertEntity, upsertPlanRow } from '../../lib/registry.mjs';
const owner = '00000000-0000-0000-0000-000000000001';
const created = '2026-09-10T12:00:00Z';
const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'browser-test@example.com', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: created };
function contact(entity, name, email, index) { return { id: `00000000-0000-0000-0000-${String(100 + index).padStart(12,'0')}`, owner_id: owner, workspace_year: 2026, entity_id: entity.id, entity_kind: entity.kind, central: entity.central, cooperative: entity.cooperative ?? null, pa: entity.pa ?? null, name, job_title: 'Gerente', teams: '', whatsapp: '(71) 99999-9999', emails: [email], created_at: created, updated_at: created }; }
async function setup(page, transform = value => value, relationshipSeed = {}) {
  await page.clock.setFixedTime(new Date("2026-09-10T15:00:00Z"));
  const dataset = transform(portfolioFixture());
  const errors = [];
  const writes = [];
  const drafts = [];
  const templates = new Map();
  const relationshipWrites = [];
  const relationshipReads = [];
  const contactReads = [];
  const contactImports = [];
  const workspaceWrites = [];
  const workspaceRows = relationshipSeed.workspaceMissing ? [] : [{ id: '00000000-0000-0000-0000-000000000010', owner_id: owner, year: 2026, revision: 1, updated_at: created, dataset }];
  const operational=operationalFixture(owner);
  const profileRows = structuredClone(relationshipSeed.profiles || []);
  const appointmentRows = structuredClone(relationshipSeed.appointments || []);
  const goalStateRows = structuredClone(relationshipSeed.goalStates || []).map(row=>({period:'month',...row}));
  const relationshipTables = {
    commercial_entity_profiles: profileRows,
    commercial_entity_appointments: appointmentRows,
    commercial_goal_alert_states: goalStateRows,
  };
  let nextRelationshipId = 300;
  page.on('pageerror', (error) => errors.push(error.message));
  const names = { 'cooperative:1002:3017': ['Ana Teste', 'ana@example.com'], 'cooperative:1002:3025': ['Bruno Teste','bruno@example.com'], 'central:1002': ['Celia Teste','celia@example.com'], 'pa:1002:3017:0': ['Paula Teste','paula@example.com'] };
  const contacts = structuredClone(relationshipSeed.contacts ?? dataset.registry.entities.flatMap((entity, index) => names[entity.id] ? [contact(entity, ...names[entity.id], index)] : []));
  await page.route('http://127.0.0.1:4600/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if(await operational.handle(route))return;
    if (url.pathname.startsWith('/auth/') || url.pathname === '/rest/v1/rpc/commercial_session_allowed') return route.continue();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const answer = (body) => route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/auth/v1/token') {
      const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600, iat: Math.floor(Date.now()/1000) })}.synthetic-test-signature`;
      return answer({ access_token: token, token_type: 'bearer', refresh_token: 'synthetic-refresh', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user });
    }
    if (url.pathname === '/auth/v1/user') return answer(user);
    if (url.pathname === '/auth/v1/logout') return answer({});
    if (url.pathname === '/rest/v1/commercial_workspaces') {
      if (relationshipSeed.workspaceMissing && request.method() === 'GET' && url.searchParams.get('owner_id') !== `eq.${owner}`) errors.push('Workspace: incorrect read owner');
      if ((relationshipSeed.workspaceMissing || relationshipSeed.trackWorkspaceWrites) && ['POST', 'PATCH'].includes(request.method())) {
        const payload = request.postDataJSON();workspaceWrites.push({method:request.method(),payload,filters:Object.fromEntries(url.searchParams)});
        if (request.method() === 'POST') {
          if (payload.owner_id !== owner || payload.revision !== 1) errors.push('Workspace: incorrect initial owner or revision');
          workspaceRows.push({id:'00000000-0000-0000-0000-000000000010',updated_at:created,...payload});
        } else {
          if (url.searchParams.get('owner_id') !== `eq.${owner}`) errors.push('Workspace: incorrect update owner');
          const row=workspaceRows.find(item=>`eq.${item.year}`===url.searchParams.get('year')&&`eq.${item.revision}`===url.searchParams.get('revision'));
          if (!row) return answer(null);
          operational.archive(row,payload.change_reason);Object.assign(row,payload,{updated_at:created});
        }
      }
      const selected=relationshipSeed.workspaceMissing ? workspaceRows.filter(row=>!url.searchParams.has('year')||`eq.${row.year}`===url.searchParams.get('year')) : workspaceRows;
      return answer((request.headers().accept || '').includes('vnd.pgrst.object') ? selected[0] || null : selected);
    }
    if (url.pathname === '/rest/v1/commercial_message_templates') {
      const key = `${url.searchParams.get('entity_kind')}:${url.searchParams.get('metric')}`;
      if (['POST','PATCH'].includes(request.method())) {
        const row = request.postDataJSON(); templates.set(`eq.${row.entity_kind}:eq.${row.metric}`, row); return answer(row);
      }
      return answer(templates.get(key) || null);
    }
    const relationshipTable = url.pathname.slice('/rest/v1/'.length);
    const relationshipRows = relationshipTables[relationshipTable];
    if (relationshipRows) {
      const method = request.method();
      const isState = relationshipTable === 'commercial_goal_alert_states';
      const isWorkspaceAgenda = relationshipTable === 'commercial_entity_appointments' && method === 'GET' && !url.searchParams.has('entity_id');
      const identityColumns = ['owner_id', 'workspace_year', 'entity_id'];
      const matches = (entry) => [...url.searchParams].every(([column, filter]) => filter.startsWith('eq.') ? String(entry[column]) === filter.slice(3) : filter.startsWith('gt.') ? String(entry[column]) > filter.slice(3) : true);
      const response = (rows) => answer((request.headers().accept || '').includes('vnd.pgrst.object') ? rows[0] || null : rows);
      if (method !== 'POST') {
        const required = method === 'HEAD' ? ['owner_id', 'workspace_year', 'central'] : isWorkspaceAgenda ? ['owner_id', 'workspace_year'] : isState ? (method === 'GET' ? ['owner_id', 'workspace_year', 'period', 'month'] : [...identityColumns, 'period', 'month', 'metric']) : identityColumns;
        for (const column of required) if (!url.searchParams.get(column)?.startsWith('eq.')) errors.push(`${relationshipTable}: missing ${column} scope`);
        if (url.searchParams.get('owner_id') !== `eq.${owner}`) errors.push(`${relationshipTable}: incorrect owner scope`);
      }
      if (method === 'HEAD') {
        const count = relationshipRows.filter(matches).length;
        return route.fulfill({ status: 200, headers: { ...headers, 'content-range': `0-${Math.max(0, count - 1)}/${count}`, 'access-control-expose-headers': 'content-range' }, body: '' });
      }
      if (method === 'GET') {
        relationshipReads.push({ table: relationshipTable, filters: Object.fromEntries(url.searchParams) });
        const selected = relationshipRows.filter(matches);
        if (url.searchParams.get('order') === 'id.asc') selected.sort((a, b) => a.id.localeCompare(b.id));
        const limit = Number(url.searchParams.get('limit')) || selected.length;
        return response(selected.slice(0, limit));
      }
      const payload = request.postDataJSON();
      relationshipWrites.push({ table: relationshipTable, method, payload });
      if (method === 'POST') {
        if (payload.owner_id !== owner) errors.push(`${relationshipTable}: incorrect write owner`);
        const unique = isState ? [...identityColumns, 'period', 'month', 'metric'] : identityColumns;
        const previous = relationshipTable === 'commercial_entity_appointments' ? undefined : relationshipRows.find(entry => unique.every(column => entry[column] === payload[column]));
        const saved = { id: `00000000-0000-0000-0000-${String(nextRelationshipId++).padStart(12, '0')}`, created_at: created, updated_at: created, ...(isState ? { read_at: null, notified_at: null } : {}), ...previous, ...payload };
        if (previous) relationshipRows.splice(relationshipRows.indexOf(previous), 1, saved); else relationshipRows.push(saved);
        return response([saved]);
      }
      const selected = relationshipRows.filter(matches);
      if (method === 'PATCH') {
        selected.forEach(entry => Object.assign(entry, payload, { updated_at: created }));
        return response(selected);
      }
      if (method === 'DELETE') {
        selected.forEach(entry => relationshipRows.splice(relationshipRows.indexOf(entry), 1));
        return answer([]);
      }
    }
    if (url.pathname === '/rest/v1/commercial_entity_contacts') {
      contactReads.push(Object.fromEntries(url.searchParams));
      if (request.method() !== 'GET') errors.push(`Unexpected contact request: ${request.method()}`);
      if (url.searchParams.get('owner_id') !== `eq.${owner}`) errors.push('Contacts: incorrect owner scope');
      if (!url.searchParams.get('workspace_year')?.startsWith('eq.')) errors.push('Contacts: missing year scope');
      if (!url.searchParams.has('entity_id') && url.searchParams.get('entity_kind') !== 'eq.cooperative') errors.push('Contacts: annual import list must be limited to cooperatives');
      const rows = contacts.filter(entry => [...url.searchParams].every(([column, filter]) => filter.startsWith('eq.') ? String(entry[column]) === filter.slice(3) : true));
      if (url.searchParams.get('order') === 'id.asc') rows.sort((a, b) => a.id.localeCompare(b.id));
      const offset = Number(url.searchParams.get('offset')) || 0;
      const limit = Math.min(Number(url.searchParams.get('limit')) || rows.length, relationshipSeed.contactPageSize || Number.POSITIVE_INFINITY);
      return answer(rows.slice(offset, offset + limit));
    }
    if (url.pathname === '/rest/v1/rpc/import_commercial_contacts') {
      const payload = request.postDataJSON(); contactImports.push(payload);
      if (payload.p_expected_owner !== owner || payload.p_year !== dataset.year || payload.p_expected_revision !== 1) errors.push('Contact import: incorrect owner, year or saved revision');
      if (typeof relationshipSeed.importContacts !== 'function') {
        errors.push('Unexpected contact import');
        return route.fulfill({ status: 400, headers, contentType: 'application/json', body: JSON.stringify({ message: 'No synthetic import handler configured.' }) });
      }
      const result = await relationshipSeed.importContacts(payload, contacts);
      return route.fulfill({ status: result.status ?? 200, headers, contentType: 'application/json', body: JSON.stringify(result.body) });
    }
    if (url.pathname === '/rest/v1/commercial_communication_drafts') {
      if (request.method() === 'POST') {
        const payload = request.postDataJSON(); writes.push(payload);
        const saved = { ...payload, id: '00000000-0000-0000-0000-000000000099', created_at: created }; drafts.push(saved); return answer(saved);
      }
      if (request.method() === 'DELETE') return answer([]);
      return answer(drafts.filter((entry) => `eq.${entry.entity_id}` === url.searchParams.get('entity_id')));
    }
    if (['/rest/v1/commercial_imports', '/rest/v1/commercial_actions'].includes(url.pathname)) return answer([]);
    errors.push(`Unexpected test request: ${request.method()} ${url.pathname}`); return answer([]);
  });
  await page.goto('/');
  const login = page.getByRole('form', { name: 'Entrar na conta' });
  await login.getByLabel('E-mail', { exact: true }).fill(user.email);
  await login.getByLabel('Senha', { exact: true }).fill('Synthetic-only-password-123!');
  await login.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(login).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Análises', level: 1, exact: true })).toBeVisible();
  if (relationshipSeed.workspaceMissing) await expect(page.getByRole('button', { name: 'Começar pelo cadastro manual', exact: true })).toBeVisible();
  else await expect(page.getByRole('region', { name: 'Resultado do período', exact: true })).toBeVisible();
  // Existing scenario tests start with controls exposed; dedicated UX tests
  // exercise the compact initial state before making this explicit choice.
  if (!relationshipSeed.workspaceMissing && !relationshipSeed.compactPortal) {
    await page.getByRole('tab', {name:'Cooperativas',exact:true}).click();
    const toggle=page.locator('.filter-toggle[aria-expanded="false"]');if(await toggle.count())await toggle.click();
  }

  return { operational, errors, writes, workspaceWrites, workspaceRows, relationshipWrites, relationshipReads, profileRows, appointmentRows, goalStateRows, contactRows: contacts, contactReads, contactImports };
}

for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
 test(`refined workspace ${viewport.width}: navigation and compact controls`,async({page},info)=>{
  await page.setViewportSize(viewport);
  const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
  await setup(page,v=>v,{compactPortal:true});
  for(const name of ['Central','Cooperativas','PAs','Período','Comparar anos','Simulação']){
   await page.getByRole('tab',{name,exact:true}).click();
   await expect(page.getByRole('tab',{name,exact:true})).toHaveAttribute('aria-selected','true');
   await expect(page.getByRole('combobox',{name:'Cooperativa',exact:true}).first()).toBeVisible();
   if(name==='PAs') await expect(page.getByLabel('Indicadores dos PAs',{exact:true})).toBeVisible();
   await page.screenshot({path:info.outputPath(`${name}.png`),fullPage:true});
  }
  await page.getByRole('tab',{name:'Cooperativas',exact:true}).click();
  const selection=page.locator('.export-selection');
  await selection.locator('summary').click();
  await selection.getByLabel('Selecionar todas as unidades filtradas').check();
  await expect(selection.getByRole('button',{name:'Exportar selecionadas',exact:true})).toBeVisible();
  await selection.locator('summary').press('Escape');
  await expect(selection).not.toHaveAttribute('open','');
  const navigation=page.getByRole('navigation',{name:'Navegação principal',exact:true});
  for(const name of ['Agenda','Metas atingidas','Cadastro e metas','Importações','Conferência da base','Plano de ação','Ações CNV']){
   await navigation.getByRole('button',{name,exact:true}).click();
   await expect(page.getByRole('heading',{level:1,name,exact:true})).toBeVisible();
   await page.screenshot({path:info.outputPath(`${name.replaceAll(' ','-')}.png`),fullPage:true});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
   expect(overflow,`${name} has page overflow`).toBe(false);
  }
  expect(pageErrors).toEqual([]);
 });
}

for (const width of [1440,390]) {
 test(`scenario sharing layout ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:1000});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await setup(page,v=>v,{compactPortal:true});
  for(const tabName of ['Cooperativas','PAs']) {
   await page.getByRole('tab',{name:tabName,exact:true}).click();
   await page.getByRole('button',{name:'Compartilhar resultado das unidades',exact:true}).click();
   const dialog=page.getByRole('dialog');
   await expect(dialog.getByRole('list',{name:'Fluxo do compartilhamento'})).toBeVisible();
   await expect(dialog.getByRole('heading',{name:'Mensagem e envio',exact:true})).toBeVisible();
   await expect(dialog.getByRole('img',{name:/Cenário/}).first()).toBeVisible();
   await dialog.getByLabel('Incluir projeção de produção',{exact:true}).check();
   await dialog.getByRole('radio',{name:'E-mail',exact:true}).check();
   await expect(dialog.getByText('Destinatários do e-mail',{exact:true})).toBeVisible();
   await dialog.getByRole('radio',{name:'Painel resumido',exact:true}).check();
   await expect(dialog.getByRole('heading',{name:'Painel resumido',exact:true})).toBeVisible();
   await dialog.getByRole('radio',{name:'WhatsApp',exact:true}).check();
   const download=page.waitForEvent('download');
   await dialog.getByRole('button',{name:'Baixar imagem desta parte',exact:true}).click();
   expect((await download).suggestedFilename()).toMatch(/\.png$/);
   await page.screenshot({path:info.outputPath(`sharing-${tabName}-${width}.png`),fullPage:true});
   expect(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+2)).toBe(false);
   await dialog.getByRole('button',{name:'Fechar',exact:true}).click();
   await expect(dialog).toBeHidden();
  }
  expect(errors).toEqual([]);
 });
}

test('sidebar search, collapsed navigation and mobile fallback',async({page},info)=>{
 await page.setViewportSize({width:1440,height:1000});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await setup(page,v=>v,{compactPortal:true});
 const nav=page.getByRole('navigation',{name:'Navegação principal',exact:true});
 const search=nav.getByRole('searchbox',{name:'Buscar no menu',exact:true});
 await search.fill('conferencia');
 await expect(nav.getByRole('button',{name:'Conferência da base',exact:true})).toBeVisible();
 await expect(nav.getByRole('button')).toHaveCount(2);
 await search.fill('nenhum-destino');
 await expect(nav.getByRole('status')).toHaveText('Nenhum item encontrado.');
 await search.press('Escape');
 await expect(nav.locator('.nav-item')).toHaveCount(9);
 const expandedLeft=await page.locator('.main-shell').evaluate(el=>el.getBoundingClientRect().left);
 await page.getByRole('button',{name:'Recolher menu',exact:true}).click();
 await expect(page.locator('.portal')).toHaveClass(/menu-collapsed/);
 await expect(nav.getByRole('button',{name:'Cadastro e metas',exact:true})).toBeVisible();
 expect(await page.locator('.main-shell').evaluate(el=>el.getBoundingClientRect().left)).toBeLessThan(expandedLeft);
 await nav.getByRole('button',{name:'Agenda',exact:true}).click();
 await expect(page.getByRole('heading',{level:1,name:'Agenda',exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath('menu-collapsed.png'),fullPage:true});
 await page.getByRole('button',{name:'Expandir menu',exact:true}).click();
 await search.fill('metas');
 await page.setViewportSize({width:390,height:844});
 await expect(nav.locator('.nav-item')).toHaveCount(9);
 await expect(page.getByRole('button',{name:'Recolher menu',exact:true})).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2)).toBe(false);
 expect(errors).toEqual([]);
});

for(const width of [1440,390]) test(`global sharing entry ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});
 await setup(page,v=>v,{compactPortal:true});
 await page.getByRole('button',{name:'Compartilhar cenário',exact:true}).first().click();
 const start=page.getByRole('dialog',{name:'Compartilhar cenário',exact:true});
 await expect(start.getByRole('list',{name:'Fluxo do compartilhamento'})).toBeVisible();
 await start.getByRole('radio',{name:'WhatsApp',exact:true}).check();
 await start.getByLabel('Incluir projeção de produção',{exact:true}).check();
 expect(await start.evaluate(el=>el.scrollWidth>el.clientWidth+2)).toBe(false);
 await page.screenshot({path:info.outputPath(`share-entry-${width}.png`),fullPage:true});
 await start.getByRole('button',{name:'Ver prévia',exact:true}).click();
 const preview=page.getByRole('dialog');
 await expect(preview.getByRole('heading',{name:'Mensagem e envio',exact:true})).toBeVisible();
 await expect(preview.getByLabel('Incluir projeção de produção',{exact:true})).toBeChecked();
 await preview.getByRole('button',{name:'Fechar',exact:true}).click();
 await expect(page.locator('body')).not.toHaveCSS('overflow','hidden');
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.setViewportSize({width,height:650});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollHeight-window.innerHeight)).toBeGreaterThan(0);
 await page.mouse.move(width-25,500);
 await page.mouse.wheel(0,500);
 await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(0);
 await page.setViewportSize({width,height:1000});
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.getByRole('button',{name:'Compartilhar cenário',exact:true}).first().click();
 await start.getByRole('button',{name:'Cancelar',exact:true}).click();
 await expect(start).toBeHidden();
 await expect(page.locator('body')).not.toHaveCSS('overflow','hidden');
 for(const channel of ['E-mail','Painel resumido','WhatsApp']){
  await page.getByRole('button',{name:'Compartilhar cenário',exact:true}).first().click();
  await start.getByRole('radio',{name:channel,exact:true}).check();
  await start.getByRole('button',{name:'Ver prévia',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('overflow','hidden');
  await page.getByRole('dialog').getByRole('button',{name:'Fechar',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('overflow','hidden');
 }
});

for(const width of [1440,390]) test(`action plan compact filters ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});
 await setup(page,v=>v,{compactPortal:true});
 await page.getByRole('navigation',{name:'Navegação principal',exact:true}).getByRole('button',{name:'Plano de ação',exact:true}).click();
 const panel=page.getByRole('region',{name:'Filtros da análise',exact:true});
 await expect(panel).toHaveClass(/filter-panel-compact/);
 await expect(panel.getByLabel('Cooperativa',{exact:true})).toHaveCount(1);
 await expect(panel.getByLabel('Cooperativa',{exact:true})).toBeDisabled();
 await panel.getByLabel('Central',{exact:true}).selectOption({index:1});
 await expect(panel.getByLabel('Cooperativa',{exact:true})).toBeEnabled();
 await panel.getByLabel('Cooperativa',{exact:true}).selectOption({index:1});
 await panel.getByLabel('Período',{exact:true}).selectOption('month');
 await panel.getByLabel('Mês de referência',{exact:true}).selectOption('7');
 if(width>1100){
  const period=await panel.getByLabel('Período',{exact:true}).boundingBox();
  const month=await panel.getByLabel('Mês de referência',{exact:true}).boundingBox();
  expect(Math.abs(period.y-month.y)).toBeLessThan(3);
  expect(month.x).toBeGreaterThan(period.x);
 }
 await panel.getByRole('button',{name:/Mais filtros/}).click();
 await panel.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('cadence');
 await expect(panel.getByRole('combobox',{name:'Grupo do PA',exact:true})).toBeVisible();
 await expect(panel.getByLabel('PA',{exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath(`action-filters-${width}.png`),fullPage:true});
 await panel.getByRole('button',{name:'Limpar filtros',exact:true}).click();
 await expect(panel.getByLabel('Central',{exact:true})).toHaveValue('all');
 await expect(panel.getByLabel('Cooperativa',{exact:true})).toHaveValue('all');
 await panel.getByRole('button',{name:/Mais filtros/}).click();
 await expect(panel.getByRole('combobox',{name:'Fonte',exact:true})).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2)).toBe(false);
});

const pastedProduction = [
 ['GRUPO','Nº CENTRAL','CENTRAL','Nº COOP','NOME COOP','Nº PA','CPA','NOME DO PA','MÊS','ANO','REAL JAN','ATINGIU?','REAL FEV','AGO','SET','META PERÍODO','REALIZADO'],
 ['P1','1002','Central Exemplo','3017','Cooperativa Exemplo','0','3017-0','Nome recebido','999,00','11.988,00','1.111,11','SIM','-','','12,50','999.999,00','999.999,00'],
 ['P2','1002','Central Exemplo','3017','Cooperativa Exemplo','7','3017-7','PA novo de teste','600,00','7.200,00','25,00','NÃO','-','','30,00','',''],
].map(row=>row.join('\t')).join('\n');
for(const width of [1440,390]) test(`pasted PA production preview and persisted update ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});
 const state=await setup(page,v=>v,{compactPortal:true,trackWorkspaceWrites:true});
 const original=structuredClone(state.workspaceRows[0].dataset);
 await page.getByRole('button',{name:'Importar base',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Importar base',exact:true});
 await expect(dialog.getByRole('button',{name:'Colar dados',exact:true})).toHaveAttribute('aria-pressed','true');
 const input=dialog.getByRole('textbox',{name:'Dados da Cadência PA',exact:true});
 await input.fill(pastedProduction);
 await dialog.getByLabel('Data de corte da produção colada',{exact:true}).fill('2026-09-10');
 await dialog.getByRole('button',{name:'Conferir prévia',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Atualizar produção',exact:true})).toBeEnabled();
 expect(state.workspaceWrites).toHaveLength(0);
 await page.screenshot({path:info.outputPath(`paste-preview-${width}.png`),fullPage:true});
 expect(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+2)).toBe(false);
 await input.fill(pastedProduction.replace('1.111,11','INVÁLIDO'));
 await expect(dialog.getByRole('button',{name:'Atualizar produção',exact:true})).toHaveCount(0);
 await dialog.getByRole('button',{name:'Conferir prévia',exact:true}).click();
 await expect(dialog.getByRole('alert')).toBeVisible();
 expect(state.workspaceWrites).toHaveLength(0);
 await input.fill(pastedProduction);
 await dialog.getByRole('button',{name:'Conferir prévia',exact:true}).click();
 await dialog.getByRole('button',{name:'Atualizar produção',exact:true}).click();
 await expect(dialog).toBeHidden();
 await expect.poll(()=>state.workspaceWrites.length).toBe(1);
 const saved=state.workspaceRows[0].dataset;
 const key='cadence:1002:3017:0:VN';
 const before=original.rows.find(r=>r.key===key),after=saved.rows.find(r=>r.key===key);
 expect(after.actuals[0]).toBe(1111.11);expect(after.actuals[1]).toBe(0);
 expect(after.actuals[7]).toBe(before.actuals[7]);expect(after.actuals[8]).toBe(12.5);
 expect(after.targets).toEqual(before.targets);expect(after.annualTarget).toBe(before.annualTarget);
 expect(after.name).toBe(before.name);
 for(const row of original.rows.filter(r=>r.key!==key)) expect(saved.rows.find(r=>r.key===row.key)).toEqual(row);
 expect(saved.rows.find(r=>r.key==='cadence:1002:3017:7:VN').actuals[8]).toBe(30);
 expect(saved.rows).toHaveLength(original.rows.length+1);
 expect(state.workspaceWrites[0]).toMatchObject({method:'PATCH',payload:{revision:2},filters:{owner_id:`eq.${owner}`,revision:'eq.1'}});
 await page.reload();
 await expect(page.getByRole('heading',{level:1,name:'Análises',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'Resultado do período',exact:true})).toBeVisible();
 expect(state.errors).toEqual([]);
 expect(state.writes).toEqual([]);expect(state.relationshipWrites).toEqual([]);
});

const basePasteHeaders=['G. CENTRAL','Nº CENTRAL','SIGLA CENTRAL','G. COOP','Nº COOP','SIGLA COOPERATIVA','META','META_JAN','REAL_JAN','% JAN','META','REAL','%','REAL_AGO','REAL_SET','REAL_OUT','META_ANUAL','REAL_ACUM','META_PER','REAL_PER'];
const basePasteRows=[
 ['C1','1002','Central recebida','S1','3017','Cooperativa recebida','VENDA NOVA','999,00','1.234,56','999%','999999','999999','999%','','25,00','55,00','999999','999999','999999','999999'],
 ['C1','1002','Central recebida','S1','3017','Cooperativa recebida','ARRECADAÇÃO','999,00','5.000,00','999%','999999','999999','999%','-','700,00','9.999,00','999999','999999','999999','999999'],
];
const basePasteMarkdown=[
 '| Relatório de produção |',
 '| '+basePasteHeaders.join(' | ')+' |',
 '| '+basePasteHeaders.map(()=>'---').join(' | ')+' |',
 ...basePasteRows.map(row=>'| '+row.map(value=>value.replaceAll(' ','&#x20;')).join(' | ')+' |'),
].join('\n');
for(const width of [1440,390]) test(`base production paste with two portfolios ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});
 const state=await setup(page,v=>v,{compactPortal:true,trackWorkspaceWrites:true});
 const original=structuredClone(state.workspaceRows[0].dataset);
 async function prepare(){
  await page.getByRole('button',{name:'Importar base',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Importar base',exact:true});
  await dialog.getByRole('combobox',{name:'Fonte dos dados',exact:true}).selectOption('base');
  await dialog.getByRole('textbox',{name:'Dados das centrais e cooperativas',exact:true}).fill(basePasteMarkdown);
  await dialog.getByLabel('Data de corte de Venda Nova',{exact:true}).fill('2026-10-05');
  await dialog.getByLabel('Data de corte de Arrecadação',{exact:true}).fill('2026-09-10');
  await dialog.getByRole('button',{name:'Conferir prévia',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Atualizar produção',exact:true})).toBeEnabled();
  return dialog;
 }
 const dialog=await prepare();
 expect(state.workspaceWrites).toHaveLength(0);
 await expect(dialog.getByText(/^Venda Nova ·/).last()).toBeVisible();
 await expect(dialog.getByText(/^Arrecadação ·/).last()).toBeVisible();
 await page.screenshot({path:info.outputPath(`base-paste-preview-${width}.png`),fullPage:true});
 expect(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+2)).toBe(false);
 // Changing the layout must invalidate the reviewed data.
 await dialog.getByRole('combobox',{name:'Fonte dos dados',exact:true}).selectOption('cadence');
 await expect(dialog.getByRole('button',{name:'Atualizar produção',exact:true})).toHaveCount(0);
 await dialog.getByRole('combobox',{name:'Fonte dos dados',exact:true}).selectOption('base');
 await dialog.getByRole('textbox',{name:'Dados das centrais e cooperativas',exact:true}).fill(basePasteMarkdown);
 await dialog.getByLabel('Data de corte de Venda Nova',{exact:true}).fill('2026-10-05');
 await dialog.getByLabel('Data de corte de Arrecadação',{exact:true}).fill('2026-09-10');
 await dialog.getByRole('button',{name:'Conferir prévia',exact:true}).click();
 await dialog.getByRole('button',{name:'Atualizar produção',exact:true}).click();
 await expect(dialog).toBeHidden();await expect.poll(()=>state.workspaceWrites.length).toBe(1);
 const saved=structuredClone(state.workspaceRows[0].dataset);
 const vn=saved.rows.find(r=>r.key==='base:1002:3017::VN'),ar=saved.rows.find(r=>r.key==='base:1002:3017::AR');
 expect(vn.actuals[0]).toBe(1234.56);expect(vn.actuals[7]).toBe(50);expect(vn.actuals[9]).toBe(55);
 expect(ar.actuals[0]).toBe(5000);expect(ar.actuals[7]).toBe(0);expect(ar.actuals[8]).toBe(700);expect(ar.actuals[9]).toBeNull();
 for(const row of saved.rows){const before=original.rows.find(item=>item.key===row.key);expect(row.targets).toEqual(before.targets);expect(row.annualTarget).toBe(before.annualTarget);expect(row.name).toBe(before.name);}
 for(const row of original.rows.filter(r=>!(r.source==='base'&&r.central==='1002'&&r.cooperative==='3017'))) expect(saved.rows.find(r=>r.key===row.key)).toEqual(row);
 expect(saved.rows).toHaveLength(original.rows.length);
 expect(saved.rows.some(row=>row.source==='base'&&!row.cooperative)).toBe(false);
 await page.reload();await expect(page.getByRole('region',{name:'Resultado do período',exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'Central',exact:true}).click();
 await page.getByRole('combobox',{name:'Central',exact:true}).first().selectOption('1002');
 await page.getByLabel('Período',{exact:true}).first().selectOption('month');
 await page.getByLabel('Mês de referência',{exact:true}).first().selectOption('0');
 await expect(page.getByRole('article',{name:'Realizado até o corte',exact:true})).toContainText('1.384,56');
 if(width===1440){
  const repeat=await prepare();await repeat.getByRole('button',{name:'Atualizar produção',exact:true}).click();
  await expect.poll(()=>state.workspaceWrites.length).toBe(2);
  expect(state.workspaceRows[0].dataset.rows).toEqual(saved.rows);
 }
 expect(state.errors).toEqual([]);expect(state.writes).toEqual([]);expect(state.relationshipWrites).toEqual([]);
});

function goalPeriodFixture(dataset){
 dataset.rows=dataset.rows.map(row=>({...row,actuals:Array(12).fill(row.source==='cadence'&&row.cooperative==='3017'?900:row.actuals[0]),cutoff:'2026-12-31'}));
 dataset=upsertEntity(dataset,{kind:'pa',central:'2007',cooperative:'3017',pa:'0',name:'PA Nordeste zero',group:'P1'});
 return upsertPlanRow(dataset,{entityId:'pa:2007:3017:0',metric:'VN',targets:Array(12).fill(450),annualTarget:5400,actuals:Array(12).fill(450),cutoff:'2026-12-31'});
}
for(const width of [1440,390]) test(`goal periods, cascading PA filters and isolated acknowledgement ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async()=>{throw new DOMException('Use download for this test','NotAllowedError');}}}));
 const state=await setup(page,goalPeriodFixture,{compactPortal:true});
 await page.getByRole('navigation',{name:'Navegação principal',exact:true}).getByRole('button',{name:'Metas atingidas',exact:true}).click();
 const alerts=page.getByRole('region',{name:'Metas atingidas por período',exact:true});
 const filters=alerts.getByRole('region',{name:'Filtros das metas atingidas',exact:true});
 const period=filters.getByRole('combobox',{name:'Período',exact:true});
 const central=filters.getByRole('combobox',{name:'Central',exact:true});
 const coop=filters.getByRole('combobox',{name:'Cooperativa',exact:true});
 const pa=filters.getByRole('combobox',{name:'PA',exact:true});
 await expect(coop).toBeDisabled();await expect(pa).toBeDisabled();
 await central.selectOption('1002');await coop.selectOption('cooperative:1002:3017');await pa.selectOption('pa:1002:3017:0');
 await expect(alerts.getByRole('article')).toHaveCount(1);
 await expect(alerts.getByRole('article').getByRole('heading',{name:'PA Alfa zero',exact:true})).toBeVisible();
 await alerts.getByRole('button',{name:'Marcar como lida',exact:true}).click();
 await expect(alerts.getByText('Lida',{exact:true})).toBeVisible();
 for(const [value,label] of [['quarter','4º trimestre'],['semester','2º semestre'],['annual','Anual'],['ytd','Acumulado']]){
  await period.selectOption(value);
  await expect(alerts.getByRole('article')).toHaveCount(1);
  await expect(alerts.getByRole('article')).toContainText(label);
  await expect(alerts.getByRole('button',{name:'Marcar como lida',exact:true})).toBeVisible();
  await alerts.getByRole('button',{name:'Preparar Outlook',exact:true}).click();
  const email=alerts.getByRole('region',{name:'E-mail de PA Alfa zero',exact:true});
  await expect(email).toContainText(label);
  await expect(email).not.toContainText('Meta mensal atingida');
  await email.getByRole('button',{name:'Fechar preparação do Outlook',exact:true}).click();
  if(value==='annual'){
   const file=page.waitForEvent('download');
   await alerts.getByRole('article').getByRole('button',{name:'Copiar painel como imagem',exact:true}).click();
   const downloaded=await file;
   expect(downloaded.suggestedFilename()).toContain('-annual-');
   expect([...(await readFile(await downloaded.path())).subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
  }
 }
 await period.selectOption('annual');
 await alerts.getByRole('button',{name:'Marcar como lida',exact:true}).click();
 await expect(alerts.getByText('Lida',{exact:true})).toBeVisible();
 const stored=state.goalStateRows.filter(row=>row.entity_id==='pa:1002:3017:0');
 expect(stored.map(row=>row.period).sort()).toEqual(['annual','month']);
 expect(new Set(stored.map(row=>row.alert_key)).size).toBe(2);
 await period.selectOption('quarter');await expect(alerts.getByRole('button',{name:'Marcar como lida',exact:true})).toBeVisible();
 await period.selectOption('month');await expect(alerts.getByText('Lida',{exact:true})).toBeVisible();
 if(width===1440){
  const a=await period.boundingBox(),b=await filters.getByRole('combobox',{name:'Mês de referência',exact:true}).boundingBox();
  expect(Math.abs(a.y-b.y)).toBeLessThan(3);expect(b.x).toBeGreaterThan(a.x);
 }
 await central.selectOption('2007');await expect(coop).toHaveValue('all');await expect(pa).toHaveValue('all');await expect(pa).toBeDisabled();
 await coop.selectOption('cooperative:2007:3017');await pa.selectOption('pa:2007:3017:0');
 await expect(alerts.getByRole('article')).toHaveCount(1);await expect(alerts.getByRole('article')).toContainText('PA Nordeste zero');
 await expect(alerts.getByRole('article')).not.toContainText('PA Alfa zero');
 await page.screenshot({path:info.outputPath(`goal-alerts-${width}.png`),fullPage:true});
 await alerts.getByRole('button',{name:'Limpar filtros',exact:true}).click();await expect(central).toHaveValue('all');await expect(coop).toBeDisabled();await expect(pa).toBeDisabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2)).toBe(false);
 expect(state.goalStateRows.every(row=>row.owner_id===owner)).toBe(true);expect(state.errors).toEqual([]);
});

for(const width of [1440,390])test(`audit fixes: unified PA pages, scope reset and account context ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});
 const state=await setup(page,d=>{const source=d.rows.find(row=>row.source==='cadence');d.rows=[...d.rows.filter(row=>row.source!=='cadence'),...Array.from({length:103},(_,i)=>({...source,key:`cadence:${source.central}:${source.cooperative}:${100+i}:VN`,pa:String(100+i),name:`PA de teste ${i}`}))];return d;},{compactPortal:true});
 const nav=page.getByRole('navigation',{name:'Navegação principal',exact:true});
 await nav.getByRole('button',{name:'Cadência dos PAs',exact:true}).click();
 await expect(page.getByRole('tab',{name:'PAs',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.locator('.unit-results-table tbody>tr')).toHaveCount(50);
 const pages=page.getByRole('navigation',{name:'Paginação dos PAs',exact:true});
 await pages.getByRole('button',{name:'Próxima',exact:true}).click();await expect(page.locator('.unit-results-table tbody>tr')).toHaveCount(50);
 await pages.getByRole('button',{name:'Próxima',exact:true}).click();await expect(page.locator('.unit-results-table tbody>tr')).toHaveCount(5);
 const filters=page.getByRole('region',{name:'Filtros da análise',exact:true});
 await filters.getByRole('button',{name:/Mais filtros/}).click();
 await filters.getByLabel('Grupo do PA').selectOption('P1');
 await nav.getByRole('button',{name:'Análises',exact:true}).click();
 await expect(page.getByRole('tab',{name:'Central',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('region',{name:'Resultado do período',exact:true})).toBeVisible();
 await page.getByLabel('Conta ativa',{exact:true}).click();await expect(page.locator('.account-menu')).toContainText('browser-test@example.com');
 await page.screenshot({path:info.outputPath(`audit-context-${width}.png`),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2)).toBe(false);expect(state.errors).toEqual([]);
});

test('audit fixes: operational action survives reload and rejects concurrent overwrite',async({page})=>{
 const state=await setup(page,d=>d,{compactPortal:true});
 await page.getByRole('navigation',{name:'Navegação principal',exact:true}).getByRole('button',{name:'Plano de ação',exact:true}).click();
 await expect(page.getByLabel('Ordenar análise',{exact:true})).toHaveValue('priority');
 await page.locator('.action-card').first().click();
 let dialog=page.getByRole('dialog');await dialog.getByLabel('Responsável',{exact:true}).fill('Responsável persistente');
 await dialog.getByLabel('Prazo',{exact:true}).fill('2026-10-30');await dialog.getByRole('button',{name:'Salvar ação',exact:true}).click();
 await expect(page.locator('.message.success')).toContainText('Ação salva no cadastro anual');expect(state.operational.actionWrites).toHaveLength(1);
 await dialog.getByRole('button',{name:'Fechar',exact:true}).click();await page.reload();
 await expect(page.getByRole('heading',{level:1,name:'Plano de ação',exact:true})).toBeVisible();await expect(page.locator('.action-list')).toContainText('Responsável persistente');
 await page.locator('.action-card').filter({hasText:'Responsável persistente'}).click();dialog=page.getByRole('dialog');
 await expect(dialog.getByLabel('Prazo',{exact:true})).toHaveValue('2026-10-30');
 state.operational.actions[0].updated_at='2026-10-28T20:00:00.000Z';
 await dialog.getByLabel('Responsável',{exact:true}).fill('Edição concorrente');await dialog.getByRole('button',{name:'Salvar ação',exact:true}).click();
 await expect(page.locator('.message.error[role=alert]')).toContainText('outra sessão');expect(state.operational.actions[0].owner_name).toBe('Responsável persistente');
});

test('audit fixes: unavailable saved action blocks edits until retry succeeds',async({page})=>{
 const state=await setup(page,d=>d,{compactPortal:true});
 let release;const held=new Promise(resolve=>{release=resolve;});let unavailable=true;
 await page.route('**/rest/v1/commercial_workspace_actions*',async route=>{
  if(route.request().method()!=='GET')return route.fallback();
  if(unavailable){await held;return route.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({message:'Indisponível no teste'})});}
  return route.fallback();
 });
 try{
  await page.reload();await page.getByRole('navigation',{name:'Navegação principal',exact:true}).getByRole('button',{name:'Plano de ação',exact:true}).click();
  await page.locator('.action-card').first().click();const editor=page.locator('.action-editor');
  await expect(editor.getByLabel('Responsável',{exact:true})).toBeDisabled();await expect(editor.getByRole('button',{name:'Salvar ação',exact:true})).toBeDisabled();
  release();await expect(editor.getByRole('button',{name:'Tentar carregar plano',exact:true})).toBeVisible();
  unavailable=false;await editor.getByRole('button',{name:'Tentar carregar plano',exact:true}).click();
  await expect(editor.getByLabel('Responsável',{exact:true})).toBeEnabled();await expect(editor.getByRole('button',{name:'Salvar ação',exact:true})).toBeEnabled();expect(state.operational.actionWrites).toHaveLength(0);
 }finally{release();}
});

test('audit fixes: validated calendar saves without changing targets or production',async({page},info)=>{
 const state=await setup(page,d=>d,{compactPortal:true,trackWorkspaceWrites:true});const before=structuredClone(state.workspaceRows[0].dataset);
 await page.getByRole('navigation',{name:'Navegação principal',exact:true}).getByRole('button',{name:'Cadastro e metas',exact:true}).click();
 const calendar=page.locator('.calendar-settings');await calendar.locator('summary').click();await calendar.getByLabel('Datas sem expediente',{exact:true}).fill('2027-01-01');
 await calendar.getByRole('button',{name:'Salvar calendário',exact:true}).click();await expect(calendar.getByRole('alert')).toContainText('2026');expect(state.workspaceWrites).toHaveLength(0);
 await calendar.getByLabel('Datas sem expediente',{exact:true}).fill('2026-12-25');page.once('dialog',dialog=>dialog.accept());await calendar.getByRole('button',{name:'Salvar calendário',exact:true}).click();
 await expect(calendar).toContainText('1 data');expect(state.workspaceWrites).toHaveLength(1);expect(state.workspaceRows[0].dataset.config.calendarHolidays).toEqual(['2026-12-25']);
 expect(state.workspaceRows[0].dataset.rows).toEqual(before.rows);await page.screenshot({path:info.outputPath('calendar-settings.png'),fullPage:true});expect(state.errors).toEqual([]);
});

test('audit fixes: clipboard differences and version restore preserve targets, units and history',async({page},info)=>{
 const state=await setup(page,d=>d,{compactPortal:true,trackWorkspaceWrites:true});const original=structuredClone(state.workspaceRows[0].dataset);
 await page.getByRole('button',{name:'Importar base',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Importar base',exact:true});
 await dialog.getByRole('textbox',{name:'Dados da Cadência PA',exact:true}).fill(pastedProduction);
 await dialog.getByLabel('Data de corte da produção colada',{exact:true}).fill('2026-09-10');await dialog.getByRole('button',{name:'Conferir prévia',exact:true}).click();
 const review=dialog.getByRole('region',{name:'Diferenças da produção',exact:true});await expect(review).toContainText('Anterior');await expect(review).toContainText('Novo');await expect(review).toContainText('1.111,11');
 const csvEvent=page.waitForEvent('download');await review.getByRole('button',{name:'Baixar todas as diferenças',exact:true}).click();expect((await csvEvent).suggestedFilename()).toMatch(/conferencia-producao/);
 await dialog.getByRole('button',{name:'Atualizar produção',exact:true}).click();await expect(dialog).toBeHidden();
 await page.getByRole('navigation',{name:'Navegação principal',exact:true}).getByRole('button',{name:'Importações',exact:true}).click();const versions=page.getByRole('region',{name:'Histórico de atualizações',exact:true});
 await expect(versions).toContainText('Revisão 1');const membership=structuredClone(state.workspaceRows[0].dataset.registry.entities);
 page.once('dialog',dialog=>dialog.accept());await versions.getByRole('button',{name:'Restaurar produção',exact:true}).first().click();
 await expect.poll(()=>state.workspaceWrites.length).toBe(2);
 const restored=state.workspaceRows[0].dataset;const key='cadence:1002:3017:0:VN';expect(restored.rows.find(r=>r.key===key).actuals).toEqual(original.rows.find(r=>r.key===key).actuals);
 expect(restored.rows.find(r=>r.key===key).targets).toEqual(original.rows.find(r=>r.key===key).targets);expect(restored.registry.entities).toEqual(membership);
 await expect(versions).toContainText('Revisão 2');expect(state.operational.versions).toHaveLength(2);expect(state.errors).toEqual([]);
 await page.screenshot({path:info.outputPath('audit-version-history.png'),fullPage:true});
});

test('audit fixes: URL restores recorte and calendar month remains selectable in accumulated period',async({page})=>{
 const state=await setup(page,d=>d,{compactPortal:true});
 await page.getByRole('tab',{name:'Cooperativas',exact:true}).click();await page.getByRole('combobox',{name:'Central',exact:true}).selectOption('1002');await page.getByRole('combobox',{name:'Cooperativa',exact:true}).selectOption('1002:3017');
 await page.getByLabel('Mês limite do acumulado',{exact:true}).selectOption('7');
 await page.reload();await expect(page.getByRole('tab',{name:'Cooperativas',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('combobox',{name:'Central',exact:true})).toHaveValue('1002');await expect(page.getByRole('combobox',{name:'Cooperativa',exact:true})).toHaveValue('1002:3017');await expect(page.getByLabel('Mês limite do acumulado',{exact:true})).toHaveValue('7');
 await page.getByRole('tab',{name:'PAs',exact:true}).click();await page.goBack();await expect(page.getByRole('tab',{name:'Cooperativas',exact:true})).toHaveAttribute('aria-selected','true');
 expect(state.errors).toEqual([]);
});
