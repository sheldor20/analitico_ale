import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { installAuthFixture } from './auth-db-fixture.mjs';

const A='00000000-0000-0000-0000-000000000001', B='00000000-0000-0000-0000-000000000002';
const ID='10000000-0000-0000-0000-000000000001', OTHER='10000000-0000-0000-0000-000000000002';
const BUCKET='commercial-cnv-regulations';
const details={title:'Ação sintética CNV',year:2026,summary:'Resumo conferido no regulamento.',products:['Vida'],goals:['Critério comercial do regulamento'],
  startDate:'2026-02-01',endDate:'2026-03-31',periodLabel:'Fevereiro e março de 2026',eligibility:[],rewards:[],importantRules:[],
  needsReview:false,warnings:['Resumo revisado'],sourcePages:[{field:'goals',page:1,excerpt:'Critério comercial do regulamento'}]};

async function fixture() {
  const db=new PGlite();
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    insert into auth.users values('${A}'),('${B}');
    create schema storage;
    create table storage.buckets(id text primary key,name text not null,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated,anon;
    create policy unrelated_broad_policy on storage.objects for all to authenticated,anon using(true) with check(true);`);
  await installAuthFixture(db);
  const dir=new URL('../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(file=>file.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(file,dir),'utf8'));
  return db;
}
async function as(db,owner){await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false)`);}
async function insert(db,owner=A,id=ID,hash='a'.repeat(64),draft=details,path=`${owner}/${id}/regulamento.pdf`){
  return db.query(`insert into commercial_cnv_actions(id,owner_id,title,details,filename,storage_path,file_sha256,page_count)
    values($1,$2,$3,$4,'regulamento.pdf',$5,$6,2) returning *`,[id,owner,draft.title,JSON.stringify(draft),path,hash]);
}

test('CNV actions preserve original identity, reject stale revisions and isolate approved accounts and sessions', async()=>{
  const db=await fixture();
  try{
    await as(db,A); await insert(db);
    assert.equal((await db.query('select * from commercial_cnv_actions')).rows.length,1);
    assert.equal((await db.query('update commercial_cnv_actions set revision=2 where id=$1 and revision=1 returning revision',[ID])).rows[0].revision,2);
    assert.equal((await db.query('update commercial_cnv_actions set revision=2 where id=$1 and revision=1 returning id',[ID])).rows.length,0);
    await assert.rejects(()=>db.query('update commercial_cnv_actions set revision=4 where id=$1',[ID]),/revisão|Recarregue/);
    await assert.rejects(()=>db.query('update commercial_cnv_actions set revision=3,owner_id=$1 where id=$2',[B,ID]),/identidade/);
    await assert.rejects(()=>db.query('update commercial_cnv_actions set revision=3,storage_path=$1 where id=$2',[`${B}/${ID}/regulamento.pdf`,ID]),/identidade/);
    await assert.rejects(()=>insert(db,A,OTHER),/unique/);
    await assert.rejects(()=>insert(db,A,OTHER,'b'.repeat(64),details,`${B}/${OTHER}/regulamento.pdf`),/check constraint/);
    for(const invalid of [{...details,needsReview:true},{...details,year:null},{...details,needsReview:null},{...details,title:null},{...details,products:null},{...details,startDate:'2026-02-31'},{...details,products:[7]},{...details,endDate:'2026-01-01'},{...details,sourcePages:[{field:'goals',page:0,excerpt:''}]}])
      {
        assert.equal((await db.query('select commercial_security.cnv_details_valid($1) valid',[JSON.stringify(invalid)])).rows[0].valid,false);
        await assert.rejects(()=>insert(db,A,OTHER,'b'.repeat(64),invalid),/constraint/);
      }
    await as(db,B);
    assert.equal((await db.query('select * from commercial_cnv_actions')).rows.length,0);
    assert.equal((await db.query('update commercial_cnv_actions set revision=3 returning id')).rows.length,0);
    assert.equal((await db.query('delete from commercial_cnv_actions returning id')).rows.length,0);
    await assert.rejects(()=>insert(db,A,OTHER,'b'.repeat(64)),/row-level security/);
    await insert(db,B,OTHER);
    assert.equal((await db.query('select * from commercial_cnv_actions')).rows.length,1,'Duplicate regulation is permitted in a different account.');
    await db.exec(`reset role; update auth.sessions set not_after=now()-interval '1 second' where user_id='${A}'`);
    await as(db,A);
    assert.equal((await db.query('select * from commercial_cnv_actions')).rows.length,0);
    await assert.rejects(()=>insert(db,A,OTHER,'b'.repeat(64)),/row-level security/);
    await db.exec('reset role; set role anon');
    await assert.rejects(()=>db.query('select * from commercial_cnv_actions'),/permission denied/);
    await db.exec(`reset role; delete from auth.sessions where user_id='${B}'; delete from auth.users where id='${B}'`);
    assert.equal((await db.query('select * from commercial_cnv_actions where owner_id=$1',[B])).rows.length,0);
  }finally{await db.close();}
});

test('CNV PDF bucket stays private and restrictive storage rules defeat broader policies and expired sessions',async()=>{
  const db=await fixture();
  try{
    const bucket=(await db.query('select * from storage.buckets where id=$1',[BUCKET])).rows[0];
    assert.equal(bucket.public,false); assert.equal(Number(bucket.file_size_limit),20*1024*1024); assert.deepEqual(bucket.allowed_mime_types,['application/pdf']);
    await as(db,A);
    await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',[BUCKET,`${A}/${ID}/regulamento.pdf`]);
    assert.equal((await db.query('select * from storage.objects')).rows.length,1);
    await assert.rejects(()=>db.query('insert into storage.objects(bucket_id,name) values($1,$2)',[BUCKET,`${B}/${ID}/regulamento.pdf`]),/row-level security/);
    await assert.rejects(()=>db.query('insert into storage.objects(bucket_id,name) values($1,$2)',[BUCKET,`${A}/../regulamento.pdf`]),/row-level security/);
    assert.equal((await db.query("update storage.objects set metadata='{}' returning id")).rows.length,0,'Original PDF cannot be replaced.');
    await as(db,B);
    assert.equal((await db.query('select * from storage.objects')).rows.length,0);
    assert.equal((await db.query('delete from storage.objects returning id')).rows.length,0);
    await db.exec('reset role; set role anon');
    assert.equal((await db.query('select * from storage.objects')).rows.length,0,'An unrelated permissive anon policy cannot expose CNV files.');
    await db.exec(`reset role; update auth.sessions set not_after=now()-interval '1 second' where user_id='${A}'`);
    await as(db,A);
    assert.equal((await db.query('select * from storage.objects')).rows.length,0);
    await assert.rejects(()=>db.query('insert into storage.objects(bucket_id,name) values($1,$2)',[BUCKET,`${A}/${OTHER}/regulamento.pdf`]),/row-level security/);
  }finally{await db.close();}
});
