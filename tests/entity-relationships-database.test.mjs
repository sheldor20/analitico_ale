import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { installAuthFixture } from './auth-db-fixture.mjs';
import { portfolioFixture } from './portfolio-fixture.mjs';

const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
const tables=['commercial_entity_profiles','commercial_entity_appointments','commercial_goal_alert_states'];

test('dossiers, calendar and monthly acknowledgement enforce owner, active session and immutable unit identity', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
      insert into auth.users values('${A}'),('${B}');`);
    await installAuthFixture(db);
    const dir=new URL('../supabase/migrations/',import.meta.url);
    for (const file of (await readdir(dir)).filter((file)=>file.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(file,dir),'utf8'));
    const dataset=portfolioFixture();
    for (const owner of [A,B]) await db.query('insert into commercial_workspaces(owner_id,year,dataset) values($1,2026,$2)',[owner,JSON.stringify(dataset)]);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${A}',false)`);
    const identity="owner_id,workspace_year,entity_id,entity_kind,central,cooperative";
    const values="auth.uid(),2026,'cooperative:1002:3017','cooperative','1002','3017'";
    await db.exec(`insert into commercial_entity_profiles(${identity},capital_modality,rate_tables) values(${values},'Vinculado','[{"id":"r1","name":"Tabela vigente","rate":0.045,"unit":"percent","period":"monthly","validFrom":"2026-01-01","validUntil":"","notes":"Contrato"}]');
      insert into commercial_entity_appointments(${identity},title,kind,starts_at,ends_at) values(${values},'Treinamento de vida','training','2026-09-25 12:00Z','2026-09-25 13:00Z');
      insert into commercial_goal_alert_states(${identity},month,metric,alert_key,read_at) values(${values},8,'VN','2026:8:cooperative:1002:3017:VN',now());`);
    for (const table of tables) {
      assert.equal((await db.query(`select * from ${table}`)).rows.length,1);
      await assert.rejects(()=>db.exec(`update ${table} set owner_id='${B}'`),/identidade|row-level security/i);
      await assert.rejects(()=>db.exec(`update ${table} set entity_id='cooperative:1002:3025',cooperative='3025'`),/identidade/i);
    }
    await db.exec('update commercial_goal_alert_states set notified_at=now()');
    assert.ok((await db.query('select read_at,notified_at from commercial_goal_alert_states')).rows.every((row)=>row.read_at&&row.notified_at));
    await assert.rejects(()=>db.exec('update commercial_goal_alert_states set month=9'),/competência/i);
    await assert.rejects(()=>db.exec("update commercial_entity_appointments set ends_at=starts_at"),/check constraint/);
    await assert.rejects(()=>db.exec("update commercial_entity_appointments set starts_at='2027-01-01 12:00Z',ends_at='2027-01-01 13:00Z'"),/check constraint/);
    await assert.rejects(()=>db.exec("update commercial_entity_profiles set rate_tables='[{\"id\":\"r1\",\"name\":\"Inválida\",\"rate\":101,\"unit\":\"percent\",\"period\":\"monthly\",\"validFrom\":\"\",\"validUntil\":\"\",\"notes\":\"\"}]'"),/check constraint/);
    await assert.rejects(()=>db.exec(`insert into commercial_entity_profiles(${identity}) values(auth.uid(),2026,'cooperative:1002:9999','cooperative','1002','9999')`),/cadastro fixo/);
    const removed=structuredClone(dataset); removed.registry.entities=removed.registry.entities.filter((entity)=>entity.id!=='cooperative:1002:3017');
    await assert.rejects(()=>db.query('update commercial_workspaces set dataset=$1,revision=revision+1 where owner_id=auth.uid()',[JSON.stringify(removed)]),/ficha ou compromissos/);
    dataset.registry.entities.find((entity)=>entity.id==='cooperative:1002:3017').name='Nome atualizado';
    await db.query('update commercial_workspaces set dataset=$1,revision=revision+1 where owner_id=auth.uid()',[JSON.stringify(dataset)]);
    await db.exec(`select set_config('request.jwt.claim.sub','${B}',false)`);
    for (const table of tables) {
      assert.equal((await db.query(`select * from ${table}`)).rows.length,0,'Other owner must not read rows');
      assert.equal((await db.query(`delete from ${table} returning id`)).rows.length,0,'Other owner must not delete rows');
      assert.equal((await db.query(`update ${table} set updated_at=now() returning id`)).rows.length,0,'Other owner must not update rows');
    }
    await assert.rejects(()=>db.exec(`insert into commercial_entity_profiles(${identity}) values('${A}',2026,'cooperative:1002:3025','cooperative','1002','3025')`),/row-level security|cadastro fixo/);
    await db.exec(`reset role; update auth.sessions set not_after=now()-interval '1 minute' where user_id='${A}'; set role authenticated; select set_config('request.jwt.claim.sub','${A}',false)`);
    for (const table of tables) assert.equal((await db.query(`select * from ${table}`)).rows.length,0,'Revoked/expired session must not read rows');
    await assert.rejects(()=>db.exec(`insert into commercial_entity_profiles(${identity}) values(${values})`),/row-level security|cadastro fixo/);
    await db.exec('reset role; set role anon');
    for (const table of tables) await assert.rejects(()=>db.query(`select * from ${table}`),/permission denied/);
    await db.exec(`reset role; delete from commercial_workspaces where owner_id='${A}'`);
    for (const table of tables) assert.equal((await db.query(`select * from ${table}`)).rows.length,0,'Workspace deletion cleans dependent records');
  } finally { await db.close(); }
});
