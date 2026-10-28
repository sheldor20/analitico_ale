import { test, expect } from '@playwright/test';
import { portfolioFixture } from '../portfolio-fixture.mjs';
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
  const profileRows = structuredClone(relationshipSeed.profiles || []);
  const appointmentRows = structuredClone(relationshipSeed.appointments || []);
  const goalStateRows = structuredClone(relationshipSeed.goalStates || []);
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
      if (relationshipSeed.workspaceMissing && ['POST', 'PATCH'].includes(request.method())) {
        const payload = request.postDataJSON();workspaceWrites.push({method:request.method(),payload,filters:Object.fromEntries(url.searchParams)});
        if (request.method() === 'POST') {
          if (payload.owner_id !== owner || payload.revision !== 1) errors.push('Workspace: incorrect initial owner or revision');
          workspaceRows.push({id:'00000000-0000-0000-0000-000000000010',updated_at:created,...payload});
        } else {
          if (url.searchParams.get('owner_id') !== `eq.${owner}`) errors.push('Workspace: incorrect update owner');
          const row=workspaceRows.find(item=>`eq.${item.year}`===url.searchParams.get('year')&&`eq.${item.revision}`===url.searchParams.get('revision'));
          if (!row) return answer(null);
          Object.assign(row,payload,{updated_at:created});
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
        const required = method === 'HEAD' ? ['owner_id', 'workspace_year', 'central'] : isWorkspaceAgenda ? ['owner_id', 'workspace_year'] : isState ? (method === 'GET' ? ['owner_id', 'workspace_year', 'month'] : [...identityColumns, 'month', 'metric']) : identityColumns;
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
        const unique = isState ? [...identityColumns, 'month', 'metric'] : identityColumns;
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
    await page.getByRole('tab', {name:'Cooperativas e PAs',exact:true}).click();
    await page.locator('.filter-toggle[aria-expanded="false"]').click();
  }

  return { errors, writes, workspaceWrites, workspaceRows, relationshipWrites, relationshipReads, profileRows, appointmentRows, goalStateRows, contactRows: contacts, contactReads, contactImports };
}

for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
 test(`refined workspace ${viewport.width}: navigation and compact controls`,async({page},info)=>{
  await page.setViewportSize(viewport);
  const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
  await setup(page,v=>v,{compactPortal:true});
  for(const name of ['Central','Cooperativas','PAs','Período','Comparar anos','Simulação']){
   await page.getByRole('tab',{name,exact:true}).click();
   await expect(page.getByRole('tab',{name,exact:true})).toHaveAttribute('aria-selected','true');
   await expect(page.getByLabel('Cooperativa',{exact:true}).first()).toBeVisible();
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
  for(const name of ['Agenda','Metas atingidas','Cadastro e metas','Importações','Conferência da base','Plano de ação','Ações CNV 2026']){
   await navigation.getByRole('button',{name,exact:true}).click();
   await expect(page.getByRole('heading',{level:1,name,exact:true})).toBeVisible();
   await page.screenshot({path:info.outputPath(`${name.replaceAll(' ','-')}.png`),fullPage:true});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
   expect(overflow,`${name} has page overflow`).toBe(false);
  }
  expect(pageErrors).toEqual([]);
 });
}
