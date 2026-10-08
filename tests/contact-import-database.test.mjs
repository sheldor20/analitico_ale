import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { installAuthFixture } from './auth-db-fixture.mjs';
import { whatsappNumber } from '../lib/portfolio-communication.mjs';

const USER_A = '00000000-0000-0000-0000-000000000001';
const USER_B = '00000000-0000-0000-0000-000000000002';
const COOP_A = 'cooperative:1002:3017';
const COOP_B = 'cooperative:2007:4436';
const entities = [
  { id: 'central:1002', kind: 'central', central: '1002', name: 'Central Bahia' },
  { id: COOP_A, kind: 'cooperative', central: '1002', cooperative: '3017', name: 'Cooperativa A' },
  { id: COOP_B, kind: 'cooperative', central: '2007', cooperative: '4436', name: 'Cooperativa B' },
  { id: 'pa:1002:3017:1', kind: 'pa', central: '1002', cooperative: '3017', pa: '1', name: 'PA A' },
];
const dataset = (year = 2026, registryEntities = entities) => ({
  version: 2, year, config: { year }, sources: [], rows: [],
  registry: { version: 1, entities: registryEntities },
});
const input = (overrides = {}) => ({ entity_id: COOP_A, name: 'Ana Silva', emails: ['ana@example.com'], ...overrides });
async function database() {
  const db = new PGlite();
  await db.exec(`create schema auth; create role anon; create role authenticated;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
    insert into auth.users values ('${USER_A}'),('${USER_B}');`);
  await installAuthFixture(db);
  const directory = new URL('../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort())
    await db.exec(await readFile(new URL(file, directory), 'utf8'));
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${USER_A}',false);`);
  await saveWorkspace(db);
  return db;
}
async function saveWorkspace(db, year = 2026, registryEntities = entities) {
  await db.query('insert into public.commercial_workspaces(owner_id,year,dataset) values (auth.uid(),$1,$2)', [year, JSON.stringify(dataset(year, registryEntities))]);
}
async function runImport(db, items, { year = 2026, owner = USER_A, revision = 1 } = {}) {
  return (await db.query('select public.import_commercial_contacts($1,$2,$3,$4) as result', [year, JSON.stringify(items), owner, revision])).rows[0].result;
}
async function contacts(db) {
  return (await db.query('select *,updated_at::text as exact_updated_at from public.commercial_entity_contacts order by entity_id,name')).rows;
}
const updateInput = (contact, overrides = {}) => input({ entity_id: contact.entity_id, name: contact.name, emails: [], contact_id: contact.id, expected_updated_at: contact.exact_updated_at, ...overrides });

// All fixtures are synthetic; no spreadsheet contacts or production data enter tests.
test('contact import derives cooperative identity from the saved registry, merges nonblank fields and email addresses atomically', async () => {
  const db = await database();
  try {
    const original = (await db.query('select dataset,revision,updated_at from public.commercial_workspaces')).rows[0];
    assert.deepEqual(await runImport(db, [
      input({ name: '  Ana   Silva ', job_title: ' Gerente ', teams: ' ana.teams ', whatsapp: '+55 (71) 99999-0000', emails: ['ANA@example.com', ' ana@example.com ', ''] }),
      input({ entity_id: COOP_B, name: 'Ana Silva', emails: ['ana.nordeste@example.com'] }),
    ]), { created: 2, updated: 0, unchanged: 0 });
    const [ana, other] = await contacts(db);
    assert.equal(ana.owner_id, USER_A);
    assert.equal(ana.workspace_year, 2026);
    assert.equal(ana.entity_kind, 'cooperative');
    assert.equal(ana.central, '1002');
    assert.equal(ana.cooperative, '3017');
    assert.equal(ana.pa, null);
    assert.equal(ana.name, 'Ana Silva');
    assert.deepEqual(ana.emails, ['ana@example.com']);
    assert.equal(other.central, '2007');
    assert.deepEqual(await runImport(db, [updateInput(ana, { job_title: 'Diretora', teams: '', whatsapp: ' ', emails: ['nova@example.com', 'ANA@EXAMPLE.COM'] })]), { created: 0, updated: 1, unchanged: 0 });
    const [updated] = await contacts(db);
    assert.equal(updated.job_title, 'Diretora');
    assert.equal(updated.teams, 'ana.teams');
    assert.equal(updated.whatsapp, '+5571999990000');
    assert.deepEqual(updated.emails, ['ana@example.com', 'nova@example.com']);
    assert.deepEqual((await contacts(db))[1], other, 'another cooperative remains untouched');
    assert.deepEqual((await db.query('select dataset,revision,updated_at from public.commercial_workspaces')).rows[0], original, 'contacts do not replace targets, production or workspace revisions');
  } finally { await db.close(); }
});

test('contact import is idempotent after refreshed preview and rejects stale creates, edits and missing timestamp pairs', async () => {
  const db = await database();
  try {
    await runImport(db, [input()]);
    let [contact] = await contacts(db);
    await assert.rejects(() => runImport(db, [input({ name: ' ANA  SILVA ' })]), /cadastrado após a prévia/);
    assert.deepEqual(await runImport(db, [updateInput(contact)]), { created: 0, updated: 0, unchanged: 1 });
    assert.deepEqual((await contacts(db))[0], contact, 'unchanged imports do not touch the timestamp');
    await db.query('update public.commercial_entity_contacts set job_title=$1 where id=$2', ['Alterado manualmente', contact.id]);
    await assert.rejects(() => runImport(db, [updateInput(contact, { job_title: 'Valor antigo' })]), /mudou após a prévia/);
    [contact] = await contacts(db);
    assert.equal(contact.job_title, 'Alterado manualmente');
    await assert.rejects(() => runImport(db, [input({ contact_id: contact.id })]), /Revise os responsáveis/);
    await assert.rejects(() => runImport(db, [input({ expected_updated_at: contact.exact_updated_at })]), /Revise os responsáveis/);
    await assert.rejects(() => runImport(db, [updateInput(contact, { name: 'Outro nome' })]), /mudou após a prévia/);
    await assert.rejects(() => runImport(db, [updateInput(contact, { entity_id: COOP_B })]), /mudou após a prévia/);
    assert.equal((await contacts(db)).length, 1);
  } finally { await db.close(); }
});

test('a failing final row rolls back earlier creates and updates, including email-limit and duplicate errors', async () => {
  const db = await database();
  try {
    await runImport(db, [input({ emails: Array.from({ length: 10 }, (_, index) => `ana${index}@example.com`) })]);
    const [contact] = await contacts(db);
    await assert.rejects(() => runImport(db, [
      input({ name: 'Primeiro contato', emails: ['primeiro@example.com'] }),
      updateInput(contact, { emails: ['eleven@example.com'] }),
    ]), /ultrapassa 10/);
    assert.deepEqual(await contacts(db), [contact]);
    await assert.rejects(() => runImport(db, [
      updateInput(contact, { job_title: 'Não deve persistir' }),
      input({ name: 'Linha inválida', emails: ['sem-arroba'] }),
    ]), /e-mail inválido/);
    assert.deepEqual(await contacts(db), [contact]);
    await assert.rejects(() => runImport(db, [input({ name: 'Novo', emails: ['novo@example.com'] }), input({ name: '  NOVO ', emails: ['novo@example.com'] })]), /mais de uma vez/);
    assert.deepEqual(await contacts(db), [contact]);
  } finally { await db.close(); }
});

test('contact import binds account, saved year and revision, and enforces RLS plus approved active sessions', async () => {
  const db = await database();
  try {
    await runImport(db, [input()]);
    const [owned] = await contacts(db);
    await assert.rejects(() => runImport(db, [input({ name: 'Outra pessoa' })], { owner: USER_B }), /sessão mudou/);
    await assert.rejects(() => runImport(db, [input()], { year: 2027 }), /Salve o cadastro/);
    await db.query('update public.commercial_workspaces set revision=2 where year=2026');
    await assert.rejects(() => runImport(db, [input({ name: 'Outra pessoa' })]), /cadastro mudou/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [USER_B]);
    assert.deepEqual(await contacts(db), []);
    await assert.rejects(() => runImport(db, [input()], { owner: USER_A }), /sessão mudou/);
    await assert.rejects(() => runImport(db, [input()], { owner: USER_B }), /Salve o cadastro/);
    await saveWorkspace(db);
    await assert.rejects(() => runImport(db, [updateInput(owned)], { owner: USER_B }), /mudou após a prévia/);
    assert.deepEqual(await runImport(db, [input()], { owner: USER_B }), { created: 1, updated: 0, unchanged: 0 });
    assert.equal((await contacts(db))[0].owner_id, USER_B);
    await db.exec('reset role;');
    await db.query('delete from auth.sessions where user_id=$1', [USER_B]);
    await db.exec('set role authenticated;');
    await assert.rejects(() => runImport(db, [input({ name: 'Sessão revogada' })], { owner: USER_B }), /sessão mudou/);
    assert.deepEqual(await contacts(db), []);
    await db.exec('reset role; set role anon;');
    await assert.rejects(() => runImport(db, [input()]), /permission denied/);
    await db.exec('reset role;');
    assert.equal((await db.query('select count(*)::integer as total from public.commercial_entity_contacts')).rows[0].total, 2);
    const security = (await db.query(`select p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') as user_execute
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='import_commercial_contacts'`)).rows[0];
    assert.equal(security.prosecdef, false);
    assert.equal(security.anon_execute, false);
    assert.equal(security.user_execute, true);
    assert.deepEqual(security.proconfig, ['search_path=""']);
  } finally { await db.close(); }
});

test('contact import rejects missing, non-cooperative or ambiguous saved identities and duplicate existing names', async () => {
  const db = await database();
  try {
    for (const entityId of ['cooperative:9999:9999', 'central:1002', 'pa:1002:3017:1'])
      await assert.rejects(() => runImport(db, [input({ entity_id: entityId })]), /cooperativa|cooperativas/);
    await saveWorkspace(db, 2027, [...entities, { ...entities[1], name: 'Duplicada' }]);
    await assert.rejects(() => runImport(db, [input()], { year: 2027 }), /duplicada/);
    await runImport(db, [input()]);
    const [contact] = await contacts(db);
    await db.query(`insert into public.commercial_entity_contacts(owner_id,workspace_year,entity_id,entity_kind,central,cooperative,name)
      values(auth.uid(),2026,$1,'cooperative','1002','3017',' ANA   SILVA ')`, [COOP_A]);
    await assert.rejects(() => runImport(db, [updateInput(contact)]), /mesmo nome/);
    assert.equal((await contacts(db)).length, 2, 'legacy duplicates are preserved for explicit review, never silently merged');
  } finally { await db.close(); }
});

test('contact import validates payload types and bounds before accepting a full 1000-row batch', async () => {
  const db = await database();
  try {
    for (const items of [null, {}, [], Array.from({ length: 1001 }, () => input()), [null], [input({ owner_id: USER_B })], [input({ name: '' })], [input({ name: 123 })], [input({ emails: 'a@example.com' })], [input({ emails: [1] })], [input({ job_title: {} })], [input({ teams: 'x'.repeat(301) })], [input({ whatsapp: 'x'.repeat(41) })]])
      await assert.rejects(() => runImport(db, items));
    assert.deepEqual(await contacts(db), []);
    const large = Array.from({ length: 1000 }, (_, index) => input({ name: `Contato de teste ${index}`, emails: [`contato${index}@example.com`] }));
    assert.deepEqual(await runImport(db, large), { created: 1000, updated: 0, unchanged: 0 });
    assert.equal((await contacts(db)).length, 1000);
  } finally { await db.close(); }
});

test('workspace serialization preserves manual contact CRUD, immutable identity and workspace cascade deletion', async () => {
  const db = await database();
  try {
    await runImport(db, [input()]);
    const [contact] = await contacts(db);
    await db.query('update public.commercial_entity_contacts set name=$1 where id=$2', ['Nome ajustado manualmente', contact.id]);
    await assert.rejects(() => db.query('update public.commercial_entity_contacts set owner_id=$1 where id=$2', [USER_B, contact.id]), /identity|row-level security/);
    await db.query('delete from public.commercial_entity_contacts where id=$1', [contact.id]);
    assert.deepEqual(await contacts(db), []);
    await runImport(db, [input()]);
    await db.query('delete from public.commercial_workspaces where year=2026');
    assert.deepEqual(await contacts(db), [], 'workspace cascade still removes its contacts');
    await assert.rejects(() => runImport(db, [input()]), /Salve o cadastro/);
  } finally { await db.close(); }
});


test('contact import rechecks e-mail and normalized phone collisions against the current unit and within the batch', async () => {
  const db = await database();
  try {
    await assert.rejects(() => runImport(db, [input(), input({ name: 'Bruno', emails: ['ANA@example.com'] })]), /associado a outro responsável/);
    assert.deepEqual(await contacts(db), [], 'a duplicate channel in a later row rolls back the whole batch');
    await assert.rejects(() => runImport(db, [
      input({ name: 'Ana', emails: [], whatsapp: '(71) 99999-0000' }),
      input({ name: 'Bruno', emails: [], whatsapp: '+55 71 99999-0000' }),
    ]), /associado a outro responsável/);
    assert.deepEqual(await contacts(db), []);
    await runImport(db, [input()]);
    const [reviewed] = await contacts(db);
    await db.query(`insert into public.commercial_entity_contacts(owner_id,workspace_year,entity_id,entity_kind,central,cooperative,name,whatsapp,emails)
      values(auth.uid(),2026,$1,'cooperative','1002','3017','Bruno','71999990000',array['compartilhado@example.com'])`, [COOP_A]);
    await assert.rejects(() => runImport(db, [updateInput(reviewed, { emails: ['compartilhado@example.com'] })]), /associado a outro responsável/);
    await assert.rejects(() => runImport(db, [updateInput(reviewed, { whatsapp: '+5571999990000' })]), /associado a outro responsável/);
    assert.deepEqual((await contacts(db))[0], reviewed, 'the reviewed contact remains untouched even though its own timestamp did not change');
    assert.deepEqual(await runImport(db, [input({ entity_id: COOP_B, name: 'Bruno', emails: ['compartilhado@example.com'], whatsapp: '+5571999990000' })]), { created: 1, updated: 0, unchanged: 0 }, 'channels in different cooperatives are independent');
  } finally { await db.close(); }
});

test('contact import validates new phones consistently with communication while preserving unchanged legacy values', async () => {
  const db = await database();
  try {
    const values = ['', '71999990000', '(71) 3333-0000', '+55 71 99999-0000', '+1 (202) 555-0123', '+351 912 345 678', '99999-0000', '+55 999', '+000012345', '71999990000 / 71988880000', 'contato pelo Teams', '  +44 20 7946 0958  '];
    for (const value of values) {
      let expected;
      try { const digits = whatsappNumber(value); expected = digits ? `+${digits}` : ''; }
      catch { expected = null; }
      assert.equal((await db.query('select public.commercial_contact_import_phone($1) as value', [value])).rows[0].value, expected, value);
    }
    await assert.rejects(() => runImport(db, [input({ whatsapp: 'não é telefone' })]), /Confira o telefone/);
    await assert.rejects(() => runImport(db, [input({ emails: [], whatsapp: '' })]), /pelo menos um/);
    await db.query(`insert into public.commercial_entity_contacts(owner_id,workspace_year,entity_id,entity_kind,central,cooperative,name,whatsapp,emails)
      values(auth.uid(),2026,$1,'cooperative','1002','3017','Legado','Usar Teams',array['legado@example.com'])`, [COOP_A]);
    const [legacy] = await contacts(db);
    assert.deepEqual(await runImport(db, [updateInput(legacy, { job_title: 'Cargo atualizado', whatsapp: legacy.whatsapp })]), { created: 0, updated: 1, unchanged: 0 });
    const [saved] = await contacts(db);
    assert.equal(saved.whatsapp, 'Usar Teams');
    assert.equal(saved.job_title, 'Cargo atualizado');
    assert.deepEqual(await runImport(db, [updateInput(saved, { whatsapp: '', emails: [] })]), { created: 0, updated: 0, unchanged: 1 });
  } finally { await db.close(); }
});

test('production verification is read-only, rejects an unauthenticated RPC and restores the caller context', async () => {
  const db = await database();
  try {
    await runImport(db, [input()]);
    const before = await contacts(db);
    await db.exec('reset role;');
    const results = await db.exec(await readFile(new URL('../supabase/verification/contact_import_read_only.sql', import.meta.url), 'utf8'));
    const report = results.flatMap(result => result.rows).find(row => row.contact_import_verification)?.contact_import_verification;
    assert.equal(report.missing_session_rejected, true);
    assert.equal(report.workspace_lock_trigger_enabled, true);
    assert.equal(report.functions.length, 3);
    for (const fn of report.functions) {
      assert.equal(fn.security_invoker, true, fn.name);
      assert.equal(fn.fixed_search_path, true, fn.name);
      assert.equal(fn.anonymous_execute, false, fn.name);
      assert.equal(fn.authenticated_execute, fn.name !== 'commercial_contacts_lock_workspace', fn.name);
    }
    for (const table of report.tables) {
      assert.equal(table.rls, true);
      assert.equal(table.active_session_restrictive, true);
      assert.equal(table.anonymous_select, false);
      assert.equal(table.anonymous_insert, false);
    }
    await db.exec('set role authenticated;');
    assert.equal((await db.query('select auth.uid() as id')).rows[0].id, USER_A);
    assert.deepEqual(await contacts(db), before);
  } finally { await db.close(); }
});
