import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as relationship from '../lib/relationship.mjs';

const owner='00000000-0000-0000-0000-000000000001';
const other='00000000-0000-0000-0000-000000000002';
const source=await readFile(new URL('../lib/relationship-store.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

function row(index,patch={}) {
  return {id:`10000000-0000-0000-0000-${String(index).padStart(12,'0')}`,owner_id:owner,workspace_year:2026,
    entity_id:['central:1002','cooperative:1002:3017','pa:1002:3017:0'][index%3],title:`Compromisso ${index}`,kind:'meeting',
    starts_at:`2026-09-${String(index%27+1).padStart(2,'0')}T12:00:00.000Z`,ends_at:`2026-09-${String(index%27+1).padStart(2,'0')}T13:00:00.000Z`,
    timezone:'America/Sao_Paulo',location:'Sala',notes:'',status:'scheduled',updated_at:'2026-09-01T00:00:00.000Z',...patch};
}

function setup(rows,options={}) {
  const requests=[]; let authCalls=0;
  const supabase={
    auth:{getUser:async()=>{authCalls++;return{data:{user:{id:options.auth?.(authCalls)||owner}},error:null};}},
    from(table) {
      const request={table,filters:[],order:null,limit:null,cursor:null};
      const query={
        select(columns){request.columns=columns;return query;},
        eq(column,value){request.filters.push([column,value]);return query;},
        order(column,config){request.order=[column,config];return query;},
        limit(value){request.limit=value;return query;},
        gt(column,value){assert.equal(column,'id');request.cursor=value;return query;},
        then(resolve,reject) {
          requests.push(request);
          if (options.failAt===requests.length) return Promise.resolve({data:null,error:{message:'Falha temporária'}}).then(resolve,reject);
          const data=rows.filter((item)=>request.filters.every(([key,value])=>item[key]===value) && (!request.cursor || options.repeatPage || item.id>request.cursor))
            .sort((a,b)=>a.id.localeCompare(b.id)).slice(0,Math.min(request.limit,options.apiCap??1000));
          return Promise.resolve({data,error:null}).then(resolve,reject);
        },
      };
      return query;
    },
  };
  const module={exports:{}};
  vm.runInNewContext(compiled,{module,exports:module.exports,require:(name)=>{
    if(name==='./supabase')return{supabase};
    if(name==='./relationship.mjs')return relationship;
    throw new Error(`Unexpected dependency ${name}`);
  }});
  return{store:module.exports,requests,get authCalls(){return authCalls;}};
}

test('annual calendar loads beyond API row caps, combines every unit and sorts equal times deterministically',async()=>{
  const expected=Array.from({length:1103},(_,index)=>row(index+1));
  const mock=setup([...expected,row(5000,{owner_id:other}),row(5001,{workspace_year:2027})],{apiCap:137});
  const result=await mock.store.listWorkspaceAppointments(2026,owner);
  assert.equal(result.length,1103);
  assert.equal(new Set(result.map((item)=>item.id)).size,1103);
  assert.equal(new Set(result.map((item)=>item.entityId)).size,3);
  assert.deepEqual(Array.from(result,(item)=>item.id),expected.sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)||a.id.localeCompare(b.id)).map((item)=>item.id));
  assert.equal(mock.authCalls,2,'Verify expected owner before and after the in-flight fetch');
  assert.ok(mock.requests.length>3);
  for(const request of mock.requests) {
    assert.equal(request.table,'commercial_entity_appointments');
    assert.deepEqual(request.filters,[['owner_id',owner],['workspace_year',2026]]);
    assert.equal(request.order[0],'id'); assert.equal(request.order[1].ascending,true);
    assert.equal(request.limit,500);
  }
});

test('annual calendar rejects invalid years and a different session without publishing rows',async()=>{
  const invalid=setup([]);
  await assert.rejects(()=>invalid.store.listWorkspaceAppointments(2019,owner),/Ano do cadastro inválido/);
  assert.equal(invalid.requests.length,0);
  const changedBefore=setup([row(1)],{auth:()=>other});
  await assert.rejects(()=>changedBefore.store.listWorkspaceAppointments(2026,owner),/sessão mudou/);
  assert.equal(changedBefore.requests.length,0);
  const changedDuring=setup([row(1)],{auth:(call)=>call===1?owner:other});
  await assert.rejects(()=>changedDuring.store.listWorkspaceAppointments(2026,owner),/sessão mudou/);
});

test('annual calendar fails as a whole on later page errors or a cursor that stops advancing',async()=>{
  const rows=[row(1),row(2),row(3)];
  const failed=setup(rows,{apiCap:1,failAt:2});
  await assert.rejects(()=>failed.store.listWorkspaceAppointments(2026,owner),/Falha temporária/);
  const repeated=setup(rows,{apiCap:1,repeatPage:true});
  await assert.rejects(()=>repeated.store.listWorkspaceAppointments(2026,owner),/agenda completa/);
  assert.equal(repeated.requests.length,2);
});
