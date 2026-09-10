import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const one='00000000-0000-0000-0000-000000000001',two='00000000-0000-0000-0000-000000000002';
async function setup(){
 const db=new PGlite();await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 insert into auth.users values('${one}'),('${two}');`);
 const dir=new URL('../supabase/migrations/',import.meta.url),file=(await readdir(dir)).find(name=>name.endsWith('_scenario_message_defaults.sql'));
 assert.ok(file);await db.exec(await readFile(new URL(file,dir),'utf8'));await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${one}',false);`);return db;
}
test('message defaults are private; anonymous and cross-owner select/write/delete are blocked',async()=>{
 const db=await setup();try{
 await db.exec(`insert into commercial_message_templates(owner_id,entity_kind,metric,email_template) values(auth.uid(),'cooperative','VN','Olá {{cenario}}');`);
 assert.equal((await db.query('select email_template from commercial_message_templates')).rows[0].email_template,'Olá {{cenario}}');
 await db.exec(`select set_config('request.jwt.claim.sub','${two}',false)`);
 assert.equal((await db.query('select * from commercial_message_templates')).rows.length,0);
 await assert.rejects(db.exec(`insert into commercial_message_templates(owner_id,entity_kind,metric) values('${one}','central','VN')`),/row-level security/);
 assert.equal((await db.query('update commercial_message_templates set enabled=true returning *')).rows.length,0);
 assert.equal((await db.query('delete from commercial_message_templates returning *')).rows.length,0);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from commercial_message_templates'),/permission denied/);
 }finally{await db.close();}
});
test('defaults support disable/revision CAS, scope uniqueness and bounded input without touching workspaces',async()=>{
 const db=await setup();try{
 await db.exec(`insert into commercial_message_templates(owner_id,entity_kind,metric,enabled) values(auth.uid(),'cooperative','VN',true)`);
 await db.exec('update commercial_message_templates set enabled=false,revision=2 where revision=1');
 assert.equal((await db.query('update commercial_message_templates set enabled=true,revision=2 where revision=1 returning *')).rows.length,0);
 assert.equal((await db.query('select enabled from commercial_message_templates')).rows[0].enabled,false);
 await assert.rejects(db.exec(`insert into commercial_message_templates(owner_id,entity_kind,metric) values(auth.uid(),'cooperative','VN')`),/duplicate key/);
 await assert.rejects(db.exec(`insert into commercial_message_templates(owner_id,entity_kind,metric) values(auth.uid(),'pa','AR')`),/check constraint/);
 await assert.rejects(db.exec(`update commercial_message_templates set email_template=repeat('x',12001)`),/check constraint/);
 await assert.rejects(db.exec(`update commercial_message_templates set owner_id='${two}'`),/row-level security/);
 await db.exec('delete from commercial_message_templates');assert.equal((await db.query('select * from commercial_message_templates')).rows.length,0);
 }finally{await db.close();}
});
