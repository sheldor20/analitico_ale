import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { installAuthFixture } from './auth-db-fixture.mjs';
import { portfolioFixture } from './portfolio-fixture.mjs';

const A='00000000-0000-0000-0000-000000000001', B='00000000-0000-0000-0000-000000000002';
const migration='20261028132908_goal_alert_period_states.sql';
const entity='cooperative:1002:3017';
const identity='owner_id,workspace_year,entity_id,entity_kind,central,cooperative';
const values="auth.uid(),2026,'cooperative:1002:3017','cooperative','1002','3017'";
const key=(period,month,metric='VN')=>period==='month'?`2026:${month}:${entity}:${metric}`:`2026:${period}:${month}:${entity}:${metric}`;

test('goal acknowledgement migration preserves monthly states and isolates canonical period identities',async(t)=>{
 const db=new PGlite();
 try {
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
   insert into auth.users values('${A}'),('${B}');`);
  await installAuthFixture(db);
  const dir=new URL('../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(file=>file.endsWith('.sql')&&file!==migration).sort()) await db.exec(await readFile(new URL(file,dir),'utf8'));
  const dataset=portfolioFixture();
  for(const owner of [A,B]) await db.query('insert into public.commercial_workspaces(owner_id,year,dataset) values($1,2026,$2)',[owner,JSON.stringify(dataset)]);
  const asUser=async(id=A,claims={})=>{
   await db.exec('reset role; set role authenticated;');
   await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify(claims)]);
  };
  await asUser();
  const legacy=(await db.query(`insert into public.commercial_goal_alert_states(${identity},month,metric,alert_key,read_at,notified_at)
   values(${values},12,'VN',$1,'2026-09-10 12:00Z','2026-09-11 12:00Z') returning *`,[key('month',12)])).rows[0];
  await db.exec('reset role');
  await db.exec(await readFile(new URL(migration,dir),'utf8'));
  await asUser();
  const insert=(period,month,metric='VN',alertKey=key(period,month,metric))=>db.query(`insert into public.commercial_goal_alert_states(${identity},period,month,metric,alert_key)
   values(${values},$1,$2,$3,$4) returning *`,[period,month,metric,alertKey]);

  await t.test('legacy monthly keys and acknowledgement timestamps survive without rewriting rows',async()=>{
   const upgraded=(await db.query('select * from public.commercial_goal_alert_states where id=$1',[legacy.id])).rows[0];
   const {period,...oldFields}=upgraded;
   assert.equal(period,'month');assert.deepEqual(oldFields,legacy);
   const row=(await db.query(`insert into public.commercial_goal_alert_states(${identity},month,metric,alert_key) values(${values},1,'VN',$1) returning period`,[key('month',1)])).rows[0];
   assert.equal(row.period,'month');
  });
  await t.test('same unit, month and metric can have one independent acknowledgement per period',async()=>{
   for(const period of ['quarter','semester','annual','ytd']) await insert(period,12);
   const rows=(await db.query('select period,alert_key from public.commercial_goal_alert_states where month=12 order by period')).rows;
   assert.deepEqual(rows.map(row=>row.period),['annual','month','quarter','semester','ytd']);
   assert.equal(new Set(rows.map(row=>row.alert_key)).size,5);
   for(const period of ['month','quarter','semester','annual','ytd']) await assert.rejects(()=>insert(period,12),/duplicate key/);
   await db.exec("update public.commercial_goal_alert_states set read_at=now() where period='quarter' and month=12");
   assert.equal((await db.query("select count(*)::int as count from public.commercial_goal_alert_states where period='annual' and read_at is not null")).rows[0].count,0);
  });
  await t.test('anchors, period values and key formats are enforced by PostgreSQL',async()=>{
   for(const month of [3,6,9]) await insert('quarter',month);
   await insert('semester',6);await insert('ytd',1);
   await insert('annual',12,'AR');
   for(const [period,month] of [['quarter',1],['quarter',8],['semester',3],['annual',6],['other',12],['month',0],['ytd',13]]) await assert.rejects(()=>insert(period,month),/check constraint/);
   await assert.rejects(()=>insert('quarter',3,'AR',key('month',3,'AR')),/check constraint/);
   await assert.rejects(()=>insert('month',3,'AR','2026:month:3:cooperative:1002:3017:AR'),/check constraint/);
   await assert.rejects(()=>db.query(`insert into public.commercial_goal_alert_states(${identity},period,month,metric,alert_key) values(${values},null,3,'AR',$1)`,[key('month',3,'AR')]),/not-null/);
  });
  await t.test('period joins immutable identity while timestamp acknowledgements remain editable',async()=>{
   await assert.rejects(()=>db.exec("update public.commercial_goal_alert_states set period='annual',alert_key='2026:annual:12:cooperative:1002:3017:VN' where period='quarter' and month=12"),/competência/);
   await assert.rejects(()=>db.exec("update public.commercial_goal_alert_states set month=6,alert_key='2026:quarter:6:cooperative:1002:3017:VN' where period='quarter' and month=3"),/competência/);
   await assert.rejects(()=>db.exec("update public.commercial_goal_alert_states set metric='AR',alert_key='2026:quarter:3:cooperative:1002:3017:AR' where period='quarter' and month=3"),/competência/);
   await assert.rejects(()=>db.exec("update public.commercial_goal_alert_states set entity_id='cooperative:1002:3025',cooperative='3025' where period='quarter' and month=3"),/identidade/);
   await assert.rejects(()=>db.exec(`update public.commercial_goal_alert_states set owner_id='${B}' where period='quarter' and month=3`),/identidade|row-level security/);
   await db.exec("update public.commercial_goal_alert_states set notified_at=now() where period='annual' and metric='VN'");
   assert.ok((await db.query("select notified_at from public.commercial_goal_alert_states where period='annual' and metric='VN'")).rows[0].notified_at);
   await assert.rejects(()=>db.exec(`insert into public.commercial_goal_alert_states(${identity},period,month,metric,alert_key) values(auth.uid(),2026,'cooperative:1002:9999','cooperative','1002','9999','annual',12,'VN','2026:annual:12:cooperative:1002:9999:VN')`),/cadastro fixo/);
   assert.equal((await db.query("select has_function_privilege('authenticated','public.commercial_entity_relationship_touch()','EXECUTE') as allowed")).rows[0].allowed,false);
  });
  await t.test('other owners, revoked sessions and anonymous clients retain existing isolation',async()=>{
   await asUser(B);
   assert.equal((await db.query('select * from public.commercial_goal_alert_states')).rows.length,0);
   assert.equal((await db.query('update public.commercial_goal_alert_states set read_at=now() returning id')).rows.length,0);
   assert.equal((await db.query('delete from public.commercial_goal_alert_states returning id')).rows.length,0);
   await insert('annual',12);
   assert.equal((await db.query('select * from public.commercial_goal_alert_states')).rows.length,1);
   await assert.rejects(()=>db.exec(`insert into public.commercial_goal_alert_states(${identity},period,month,metric,alert_key) values('${A}',2026,'cooperative:1002:3025','cooperative','1002','3025','annual',12,'VN','2026:annual:12:cooperative:1002:3025:VN')`),/row-level security|cadastro fixo/);
   await asUser(A,{session_id:B});
   assert.equal((await db.query('select * from public.commercial_goal_alert_states')).rows.length,0);
   await assert.rejects(()=>insert('ytd',2),/row-level security|cadastro fixo/);
   await db.exec(`reset role; update auth.sessions set not_after=now()-interval '1 minute' where user_id='${A}'`);
   await asUser();
   assert.equal((await db.query('select * from public.commercial_goal_alert_states')).rows.length,0);
   await assert.rejects(()=>insert('ytd',2),/row-level security|cadastro fixo/);
   await db.exec('reset role; set role anon');
   await assert.rejects(()=>db.query('select * from public.commercial_goal_alert_states'),/permission denied/);
   await db.exec(`reset role; update auth.sessions set not_after=null where user_id='${A}'`);await asUser();
  });
  await t.test('existing unit-removal guard and workspace cascading deletion remain intact',async()=>{
   await db.exec(`insert into public.commercial_entity_profiles(${identity}) values(${values})`);
   const removed=structuredClone(dataset);removed.registry.entities=removed.registry.entities.filter(entry=>entry.id!==entity);
   await assert.rejects(()=>db.query('update public.commercial_workspaces set dataset=$1,revision=revision+1 where owner_id=auth.uid()',[JSON.stringify(removed)]),/ficha ou compromissos/);
   await db.exec(`delete from public.commercial_workspaces where owner_id=auth.uid()`);
   assert.equal((await db.query('select * from public.commercial_goal_alert_states')).rows.length,0);
   await db.exec('reset role');
   assert.equal((await db.query('select * from public.commercial_goal_alert_states where owner_id=$1',[B])).rows.length,1);
  });
 } finally {await db.close();}
});
