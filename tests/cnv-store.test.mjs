import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { File } from 'node:buffer';
import vm from 'node:vm';
import ts from 'typescript';

const owner='00000000-0000-0000-0000-000000000001', other='00000000-0000-0000-0000-000000000002';
const id='10000000-0000-0000-0000-000000000001', path=`${owner}/${id}/regulamento.pdf`;
const details={title:'Ação CNV',year:2026,summary:'Resumo conferido.',products:['Vida'],goals:[],startDate:null,endDate:null,
  periodLabel:'A confirmar',eligibility:[],rewards:[],importantRules:[],needsReview:false};
const compiled=ts.transpileModule(await readFile(new URL('../lib/cnv-store.ts',import.meta.url),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const file=new File(['%PDF-1.7\nSynthetic original regulation\n%%EOF'], 'regulamento.pdf', {type:'application/pdf'});
const hash=Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256',await file.arrayBuffer())),value=>value.toString(16).padStart(2,'0')).join('');
const record={id,owner_id:owner,details,filename:file.name,storage_path:path,file_sha256:hash,page_count:1,revision:1,
  created_at:'2026-10-23T12:00:00Z',updated_at:'2026-10-23T12:00:00Z'};
const item={id,details,filename:file.name,path,fileHash:hash,pageCount:1,revision:1,createdAt:record.created_at,updatedAt:record.updated_at};

function setup(options={}){
  const state={row:options.row??null,uploads:[],removals:[],requests:[],authCalls:0,cleanupFailures:options.cleanupFailures??0};
  const supabase={
    auth:{getUser:async()=>({data:{user:{id:options.auth?.(++state.authCalls)??owner}},error:null})},
    storage:{from(bucket){
      assert.equal(bucket,'commercial-cnv-regulations');
      return{upload:async(objectPath)=>{state.uploads.push(objectPath);return{data:{path:objectPath},error:null};},
        remove:async(paths)=>{state.removals.push(paths);if(state.cleanupFailures-->0)return{data:null,error:{message:'Storage temporário'}};return{data:paths.map(name=>({name})),error:null};}};
    }},
    from(table){
      assert.equal(table,'commercial_cnv_actions');
      const request={operation:'select',filters:[],payload:null,columns:''};
      const result=()=>{
        state.requests.push(request);
        if(request.operation==='insert'){
          if(options.insert==='committed-network')state.row={...record,...request.payload};
          if(options.insert==='rejected')return{data:null,error:{message:'Constraint rejeitada',code:'23514'}};
          if(['committed-network','network'].includes(options.insert))return{data:null,error:{message:'Resposta HTTP perdida',code:''}};
          state.row={...record,...request.payload};return{data:state.row,error:null};
        }
        const matches=state.row&&request.filters.every(([key,value])=>state.row[key]===value);
        if(request.operation==='delete'){
          if(!matches)return{data:[],error:null};state.row=null;return{data:[{id}],error:null};
        }
        if(options.lookupError&&request.filters.some(([key])=>key==='id'))return{data:null,error:{message:'Leitura indisponível'}};
        return{data:matches?state.row:null,error:null};
      };
      const query={select(columns){request.columns=columns;return query;},eq(key,value){request.filters.push([key,value]);return query;},
        insert(payload){request.operation='insert';request.payload=payload;return query;},delete(){request.operation='delete';return query;},
        maybeSingle:async()=>result(),single:async()=>result(),then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);}};
      return query;
    },
  };
  const module={exports:{}};
  vm.runInNewContext(compiled,{module,exports:module.exports,TextEncoder,TextDecoder,File,Blob,
    crypto:{subtle:webcrypto.subtle,randomUUID:()=>id},require:name=>{if(name==='./supabase')return{supabase};throw new Error(`Unexpected import: ${name}`);}});
  return{store:module.exports,state};
}

test('CNV import retains the original after an ambiguous committed write or unreadable outcome',async()=>{
  for(const options of [{insert:'committed-network'},{insert:'network'},{insert:'rejected',lookupError:true}]){
    const mock=setup(options);
    await assert.rejects(()=>mock.store.createCnvAction(owner,details,file,1,hash),/HTTP perdida|Constraint/);
    assert.equal(mock.state.uploads.length,1);assert.equal(mock.state.removals.length,0,'Do not remove a possibly committed original.');
  }
});

test('CNV import cleans a confirmed rejected upload only after confirming scoped row absence',async()=>{
  const mock=setup({insert:'rejected'});
  await assert.rejects(()=>mock.store.createCnvAction(owner,details,file,1,hash),/Constraint/);
  assert.deepEqual(Array.from(mock.state.removals[0]),[path]);
  const lookup=mock.state.requests.find(request=>request.operation==='select'&&request.filters.some(([key])=>key==='id'));
  assert.deepEqual(Array.from(lookup.filters,entry=>Array.from(entry)),[['owner_id',owner],['id',id]]);
});

test('CNV import never cleans a committed file after the expected browser account changes',async()=>{
  const mock=setup({auth:call=>call>=4?other:owner});
  await assert.rejects(()=>mock.store.createCnvAction(owner,details,file,1,hash),/sessão mudou/);
  assert.equal(mock.state.row.id,id);assert.equal(mock.state.removals.length,0);
});

test('CNV deletion retries orphan cleanup and leaves PDFs of stale revisions untouched',async()=>{
  const retry=setup({row:{...record},cleanupFailures:1});
  await assert.rejects(()=>retry.store.deleteCnvAction(owner,item),/Confirmar exclusão novamente/);
  assert.equal(retry.state.row,null);
  await retry.store.deleteCnvAction(owner,item);
  assert.equal(retry.state.removals.length,2);
  const stale=setup({row:{...record,revision:2}});
  await assert.rejects(()=>stale.store.deleteCnvAction(owner,item),/outra janela/);
  assert.equal(stale.state.removals.length,0);assert.equal(stale.state.row.revision,2);
  const changed=setup({row:{...record},auth:call=>call>=2?other:owner});
  await assert.rejects(()=>changed.store.deleteCnvAction(owner,item),/sessão mudou/);
  assert.equal(changed.state.removals.length,0);
});
