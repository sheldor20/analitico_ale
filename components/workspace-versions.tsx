'use client';
import {useEffect,useRef,useState} from 'react';
import {listWorkspaceVersions,readWorkspaceVersion,type WorkspaceVersion} from '@/lib/workspace-store';
import {restoreProduction} from '@/lib/production-changes.mjs';
import type {Dataset} from '@/lib/types';
export default function WorkspaceVersions({owner,dataset,revision,onRestore,disabled}:{owner:string;dataset:Dataset;revision:number|null;onRestore:(next:Dataset,reason:string)=>Promise<void>;disabled:boolean}) {
 const [rows,setRows]=useState<WorkspaceVersion[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[more,setMore]=useState(false);
 const request=useRef(0),scope=`${owner}:${dataset.year}:${revision}`;const current=useRef(scope);current.current=scope;
 async function load(append=false){const expected=scope,id=++request.current;setBusy(true);setError('');try{const data=await listWorkspaceVersions(owner,dataset.year,append?rows.at(-1)?.revision:undefined);if(current.current===expected&&id===request.current){setRows(old=>append?[...old,...data]:data);setMore(data.length===20);}}catch(reason){if(current.current===expected)setError(reason instanceof Error?reason.message:'Não foi possível carregar as versões.');}finally{if(current.current===expected)setBusy(false);}}
 useEffect(()=>{void load();return()=>{request.current++;};},[scope]);
 async function restore(version:WorkspaceVersion){
  if(disabled||busy||!window.confirm(`Restaurar a produção da revisão ${version.revision}? Isso substituirá os realizados atuais. Metas, unidades, contatos e agenda serão preservados. A situação atual ficará no histórico.`))return;
  const expected=scope;setBusy(true);setError('');
  try{const snapshot=await readWorkspaceVersion(owner,dataset.year,version.revision);if(current.current!==expected)return;await onRestore(restoreProduction(dataset,snapshot),`Restauração de produção · revisão ${version.revision}`);}catch(reason){if(current.current===expected)setError(reason instanceof Error?reason.message:'Não foi possível restaurar a produção.');}finally{if(current.current===expected)setBusy(false);}
 }
 return <section className="panel workspace-versions" aria-label="Histórico de atualizações"><header className="panel-heading"><div><h2>Histórico de atualizações</h2><p>Versões anteriores à gravação. Restaurar cria uma nova revisão.</p></div></header><div className="workspace-version-content">{error&&<p role="alert">{error}</p>}{!rows.length&&!busy&&<p>Nenhuma versão anterior disponível. As próximas atualizações serão registradas automaticamente.</p>}<ul>{rows.map(row=><li key={row.revision}><div><strong>Revisão {row.revision}</strong><span>{new Date(row.saved_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</span><small>Substituída por: {row.change_reason}</small></div><button className="button secondary" disabled={disabled||busy} onClick={()=>void restore(row)}>Restaurar produção</button></li>)}</ul>{busy&&<p role="status">Carregando versões…</p>}{more&&<button className="button secondary" disabled={busy} onClick={()=>void load(true)}>Carregar mais versões</button>}</div></section>;
}
