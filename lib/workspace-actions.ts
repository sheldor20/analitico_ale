import { supabase } from './supabase';
import type { ActionState } from './types';
export type WorkspaceActionRow = {entity_key: string; entity_id: string; owner_name: string; due_date: string | null; status: ActionState['status']; notes: string; updated_at: string};
async function client(owner: string) {
 if (!supabase) throw new Error('Entre na sua conta para salvar o plano de ação.');
 const {data,error}=await supabase.auth.getUser();
 if(error||data.user?.id!==owner) throw new Error('A sessão mudou. Recarregue antes de salvar.');
 return supabase;
}
export async function listWorkspaceActions(owner:string,year:number) {
 const db=await client(owner); const result: Record<string,ActionState>={};
 for(let offset=0;;){
  const {data,error}=await db.from('commercial_workspace_actions').select('entity_key,entity_id,owner_name,due_date,status,notes,updated_at').eq('owner_id',owner).eq('workspace_year',year).order('id').range(offset,offset+499);
  if(error) throw new Error(error.message); if(!data?.length)break;
  for(const row of data as WorkspaceActionRow[])result[row.entity_key]={owner:row.owner_name,due:row.due_date||'',status:row.status,notes:row.notes,updatedAt:row.updated_at};
  offset+=data.length;
 }
 return result;
}
export async function persistWorkspaceAction(owner:string,year:number,key:string,entityId:string,state:ActionState) {
 const db=await client(owner);
 const payload={owner_id:owner,workspace_year:year,entity_key:key,entity_id:entityId,owner_name:state.owner,due_date:state.due||null,status:state.status,notes:state.notes};
 const query=state.updatedAt?db.from('commercial_workspace_actions').update(payload).eq('owner_id',owner).eq('workspace_year',year).eq('entity_key',key).eq('updated_at',state.updatedAt):db.from('commercial_workspace_actions').insert(payload);
 const {data,error}=await query.select('updated_at').maybeSingle();
 if(error?.code==='23505'||!error&&!data)throw new Error('Esta ação foi alterada em outra sessão. Recarregue o cadastro antes de salvar.');
 if(error)throw new Error(error.message);return data!.updated_at as string;
}
