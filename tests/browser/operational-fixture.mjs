import assert from 'node:assert/strict';
/** Mock persistence only. Database invariants are independently tested in PGlite. */
export function operationalFixture(owner){
 const actions=[],versions=[],actionWrites=[];let serial=1;
 const stamp=()=>new Date(Date.UTC(2026,8,10,12,0,0,serial++)).toISOString();
 function archive(row,reason){versions.push({id:`version-${row.revision}`,owner_id:owner,workspace_year:row.year,revision:row.revision,dataset:structuredClone(row.dataset),saved_at:row.updated_at,archived_at:stamp(),change_reason:reason||'Atualização do cadastro'});}
 async function handle(route){
  const request=route.request(),url=new URL(request.url()),table=url.pathname.split('/').at(-1);
  if(!['commercial_workspace_actions','commercial_workspace_versions'].includes(table))return false;
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
  if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers});return true;}
  const answer=body=>route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(body)});
  const matches=row=>[...url.searchParams].every(([key,value])=>value.startsWith('eq.')?String(row[key])===value.slice(3):value.startsWith('lt.')?Number(row[key])<Number(value.slice(3)):true);
  const object=(request.headers().accept||'').includes('vnd.pgrst.object');
  if(request.method()!=='POST'){assert.equal(url.searchParams.get('owner_id'),`eq.${owner}`);assert.ok(url.searchParams.get('workspace_year')?.startsWith('eq.'));}
  if(request.method()==='GET'){
   const selected=(table==='commercial_workspace_actions'?actions:versions).filter(matches).sort((a,b)=>table==='commercial_workspace_versions'?b.revision-a.revision:String(a.id).localeCompare(String(b.id)));
   const offset=Number(url.searchParams.get('offset'))||0,limit=Number(url.searchParams.get('limit'))||selected.length;
   await answer(object?selected[0]||null:selected.slice(offset,offset+limit));return true;
  }
  assert.equal(table,'commercial_workspace_actions');
  const payload=request.postDataJSON();assert.equal(payload.owner_id,owner);actionWrites.push({method:request.method(),payload,filters:Object.fromEntries(url.searchParams)});
  let row;
  if(request.method()==='POST'){
   if(actions.some(a=>a.workspace_year===payload.workspace_year&&a.entity_key===payload.entity_key)){await route.fulfill({status:409,headers,contentType:'application/json',body:JSON.stringify({code:'23505',message:'Conflito'})});return true;}
   row={id:`action-${serial}`,updated_at:stamp(),...payload};actions.push(row);
  }else{row=actions.find(matches);if(row)Object.assign(row,payload,{updated_at:stamp()});}
  await answer(object?row||null:row?[row]:[]);return true;
 }
 return {actions,versions,actionWrites,handle,archive};
}
