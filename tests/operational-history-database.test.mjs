import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {installAuthFixture} from './auth-db-fixture.mjs';
import {portfolioFixture} from './portfolio-fixture.mjs';
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
const migration='20261028192351_operational_actions_and_workspace_versions.sql';
test('operational actions migrate legacy plans, enforce ownership/membership and keep immutable pre-update history',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
   insert into auth.users values('${A}'),('${B}');`);
  await installAuthFixture(db);
  const dir=new URL('../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(file=>file.endsWith('.sql')&&file!==migration).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
  const d=portfolioFixture();
  await db.query('insert into commercial_workspaces(owner_id,year,dataset) values($1,2026,$2),($3,2026,$2)',[A,JSON.stringify(d),B]);
  const imp=await db.query('insert into commercial_imports(owner_id,title,year,fingerprint,dataset) values($1,$2,2026,$3,$4) returning id',[A,'Snapshot','a'.repeat(64),JSON.stringify(d)]);
  await db.query(`insert into commercial_actions(import_id,owner_id,entity_key,owner_name,status,notes) values($1,$2,'base:VN:cooperative:1002:3017','Responsável anterior','Aberta','Plano anterior')`,[imp.rows[0].id,A]);
  await db.exec(await readFile(new URL(migration,dir),'utf8'));
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${A}',false);`);
  for(const [holidays,valid] of [[['2026-12-25'],true],[['2026-02-30'],false],[['2027-01-01'],false],[['invalid'],false],[null,false]]){
   const calendar={config:{calendarHolidays:holidays}};
   assert.equal((await db.query('select commercial_security.workspace_calendar_valid($1::jsonb,2026) valid',[JSON.stringify(calendar)])).rows[0].valid,valid);
  }
  const draft={year:2027,needsReview:false,title:'CNV futuro',summary:'Resumo conferido',periodLabel:'',products:[],goals:[],startDate:null,endDate:null,eligibility:[],rewards:[],importantRules:[]};
  for(const [year,valid] of [[2026,true],[2027,true],[2100,true],[2101,false],[2027.5,false]])assert.equal((await db.query('select commercial_security.cnv_details_valid($1::jsonb) valid',[JSON.stringify({...draft,year})])).rows[0].valid,valid);
  let action=(await db.query('select * from commercial_workspace_actions')).rows[0];assert.equal(action.owner_name,'Responsável anterior');assert.equal(action.entity_id,'cooperative:1002:3017');
  assert.equal((await db.query('select count(*) n from commercial_actions')).rows[0].n,1);
  await db.query(`update commercial_workspace_actions set owner_name='Responsável atual' where id=$1`,[action.id]);
  assert.equal((await db.query('select owner_name from commercial_workspace_actions')).rows[0].owner_name,'Responsável atual');
  await assert.rejects(db.query('update commercial_workspace_actions set owner_id=$1 where id=$2',[B,action.id]));
  await assert.rejects(db.query(`insert into commercial_workspace_actions(owner_id,workspace_year,entity_key,entity_id) values($1,2026,'invalid','pa:999:1:0')`,[A]),/unidade/i);
  const next=structuredClone(d);next.rows[0].actuals[0]=987;
  await db.query(`update commercial_workspaces set dataset=$1,revision=2,change_reason='Produção por colagem' where owner_id=$2 and year=2026`,[JSON.stringify(next),A]);
  let versions=(await db.query('select revision,dataset,change_reason from commercial_workspace_versions')).rows;
  assert.equal(versions.length,1);assert.equal(versions[0].revision,1);assert.equal(versions[0].dataset.rows[0].actuals[0],d.rows[0].actuals[0]);assert.equal(versions[0].change_reason,'Produção por colagem');
  await assert.rejects(db.query('update commercial_workspace_versions set dataset=$1',[JSON.stringify(next)]),/permission denied/);
  await assert.rejects(db.query('delete from commercial_workspace_versions'),/permission denied/);
  await assert.rejects(db.query(`insert into commercial_workspace_versions(owner_id,workspace_year,revision,dataset,saved_at,change_reason) values($1,2026,9,$2,now(),'forged')`,[A,JSON.stringify(next)]),/permission denied/);
  await assert.rejects(db.query('update commercial_workspaces set revision=2 where owner_id=$1',[A]),/conflict/);
  assert.equal((await db.query('select count(*) n from commercial_workspace_versions')).rows[0].n,1);
  await db.exec(`select set_config('request.jwt.claim.sub','${B}',false)`);
  assert.equal((await db.query('select * from commercial_workspace_actions')).rows.length,0);assert.equal((await db.query('select * from commercial_workspace_versions')).rows.length,0);
  await db.exec(`select set_config('request.jwt.claim.sub','${A}',false);reset role;update auth.users set raw_app_meta_data='{}' where id='${A}';set role authenticated;`);
  assert.equal((await db.query('select * from commercial_workspace_actions')).rows.length,0);assert.equal((await db.query('select * from commercial_workspace_versions')).rows.length,0);
  await db.exec('reset role;set role anon;');await assert.rejects(db.query('select * from commercial_workspace_versions'),/permission denied/);
 }finally{await db.close();}
});
