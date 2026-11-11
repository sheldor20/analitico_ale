import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { installAuthFixture } from './auth-db-fixture.mjs';

const A = '00000000-0000-0000-0000-000000000001';
const B = '00000000-0000-0000-0000-000000000002';
const amounts = { 1010: { accepted: 0, cancelled: 1234, inReview: 5678, pending: 0, rejected: 9012 } };
const serialized = JSON.stringify(amounts);

test('proposal positions validate one whole snapshot per owner and year under active-session RLS', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create role anon; create role authenticated;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
      insert into auth.users values('${A}'),('${B}');`);
    await installAuthFixture(db);
    const dir = new URL('../supabase/migrations/', import.meta.url);
    for (const file of (await readdir(dir)).filter(file => file.endsWith('.sql')).sort()) {
      await db.exec(await readFile(new URL(file, dir), 'utf8'));
    }

    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${A}',false);`);
    const insert = 'insert into commercial_proposal_positions(owner_id,year,amounts) values($1,$2,$3) returning revision';
    assert.equal((await db.query(insert, [A, 2026, serialized])).rows[0].revision, 1);
    await assert.rejects(db.query(insert, [A, 2026, serialized]), /duplicate key/);
    await assert.rejects(db.query(insert, [B, 2026, serialized]), /row-level security/);
    for (const invalid of [{}, { 1010: [] }, { 1010: { ...amounts[1010], pending: -1 } }, { 1010: { ...amounts[1010], pending: 1.1 } }, { 1010: { ...amounts[1010], pending: '1' } }]) {
      await assert.rejects(db.query(insert, [A, 2025, JSON.stringify(invalid)]), /check constraint/);
    }

    const update = 'update commercial_proposal_positions set position_date=$1, accumulated_since_january=true where owner_id=$2 and year=2026 and revision=$3 returning revision';
    await assert.rejects(db.query(update, [null, A, 1]), /check constraint/);
    await assert.rejects(db.query(update, ['2025-12-31', A, 1]), /check constraint/);
    assert.equal((await db.query(update, ['2026-10-31', A, 1])).rows[0].revision, 2);
    assert.equal((await db.query(update, ['2026-11-01', A, 1])).rows.length, 0);
    await assert.rejects(db.query('update commercial_proposal_positions set owner_id=$1', [B]), /permission denied/);
    assert.deepEqual((await db.query('select amounts from commercial_proposal_positions')).rows[0].amounts, amounts);

    await db.exec(`select set_config('request.jwt.claim.sub','${B}',false);`);
    assert.equal((await db.query('select year from commercial_proposal_positions')).rows.length, 0);
    assert.equal((await db.query(update, ['2026-11-01', A, 2])).rows.length, 0);
    assert.equal((await db.query(insert, [B, 2026, serialized])).rows.length, 1);
    await db.exec(`reset role; delete from auth.sessions where user_id='${A}'; set role authenticated; select set_config('request.jwt.claim.sub','${A}',false);`);
    assert.equal((await db.query('select year from commercial_proposal_positions')).rows.length, 0);
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query('select year from commercial_proposal_positions'), /permission denied/);
  } finally {
    await db.close();
  }
});
