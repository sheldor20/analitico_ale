import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { portfolioFixture, unit } from './portfolio-fixture.mjs';
import { buildPortfolioReport, renderPortfolioCommunication } from '../lib/portfolio-communication.mjs';
const A = '00000000-0000-0000-0000-000000000001';
const B = '00000000-0000-0000-0000-000000000002';
async function database() {
  const db = new PGlite();
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    insert into auth.users values ('${A}'),('${B}');`);
  const directory = new URL('../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(file, directory), 'utf8'));
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${A}',false);`);
  return db;
}
function draft() {
  const dataset = portfolioFixture();
  const report = buildPortfolioReport({ dataset, entity: unit(dataset, 'cooperative:1002:3017'), month: 7 });
  const message = renderPortfolioCommunication(report);
  return { dataset, report, message };
}
async function insert(db, values = {}) {
  const { report, message } = draft();
  return db.query(`insert into public.commercial_communication_drafts(owner_id,year,entity_id,entity_kind,subject,email_body,email_html,whatsapp_body,recipients,whatsapp_number,report)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id,subject,report,recipients`, [values.owner ?? A, values.year ?? 2026, values.entityId ?? report.entity.id, values.kind ?? 'cooperative', values.subject ?? message.subject, message.text, message.html, message.whatsapp, values.recipients ?? ['ana@example.com','bob@example.com'], values.phone ?? '5571999999999', JSON.stringify(values.report ?? report)]);
}

test('private drafts persist report without modifying targets, actuals or contacts; remain immutable', async () => {
  const db = await database();
  try {
    const { dataset, report } = draft();
    await db.query('insert into public.commercial_workspaces(owner_id,year,dataset) values ($1,2026,$2)', [A, JSON.stringify(dataset)]);
    const saved = (await insert(db)).rows[0];
    assert.deepEqual(saved.report, report);
    assert.deepEqual(saved.recipients, ['ana@example.com','bob@example.com']);
    assert.deepEqual((await db.query('select dataset from public.commercial_workspaces')).rows[0].dataset, dataset);
    assert.equal((await db.query('select revision from public.commercial_workspaces')).rows[0].revision, 1);
    assert.equal((await db.query('select count(*)::int as n from public.commercial_entity_contacts')).rows[0].n, 0);
    await assert.rejects(() => db.query("update public.commercial_communication_drafts set subject='changed'"), /permission denied/);
    await db.query('delete from public.commercial_communication_drafts where id=$1', [saved.id]);
    assert.equal((await db.query('select * from public.commercial_communication_drafts')).rows.length, 0);
  } finally { await db.close(); }
});
test('RLS prevents cross-user reads inserts deletes and anonymous access', async () => {
  const db = await database();
  try {
    const saved = (await insert(db)).rows[0];
    await assert.rejects(() => insert(db, { owner: B }), /row-level security/);
    await db.exec(`select set_config('request.jwt.claim.sub','${B}',false);`);
    assert.equal((await db.query('select * from public.commercial_communication_drafts')).rows.length, 0);
    assert.equal((await db.query('delete from public.commercial_communication_drafts where id=$1 returning id', [saved.id])).rows.length, 0);
    await insert(db, { owner: B });
    await db.exec('reset role; set role anon;');
    await assert.rejects(() => db.query('select * from public.commercial_communication_drafts'), /permission denied/);
    await assert.rejects(() => db.query("select public.commercial_communication_recipients_valid(array['a@example.com'])"), /permission denied/);
  } finally { await db.close(); }
});
test('database rejects invalid or mismatched report and recipient input', async () => {
  const db = await database();
  try {
    const { report } = draft();
    for (const values of [
      { year: 2025 }, { entityId: 'cooperative:2007:3017' }, { kind: 'pa' },
      { report: { ...report, period: 'unexpected' } }, { report: { ...report, month: 12 } },
      { report: { ...report, source: 'cadence' } }, { report: {} }, { report: { ...report, sections: 'not-array' } },
      { subject: 'Injected\r\nBcc:x@example.com' }, { recipients: ['not-email'] },
      { recipients: ['ANA@example.com','ana@example.com'] }, { recipients: [null] },
      { recipients: Array.from({ length: 101 }, (_, i) => `person${i}@example.com`) },
      { phone: 'javascript:alert(1)' },
    ]) await assert.rejects(() => insert(db, values), /check constraint/);
    await insert(db, { recipients: Array.from({ length: 12 }, (_, i) => `person${i}@example.com`), phone: '' });
    await insert(db, { recipients: [], phone: '' });
  } finally { await db.close(); }
});
