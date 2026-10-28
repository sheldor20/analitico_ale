'use client';
import {useEffect,useState} from 'react';
import {calendarDates,calendarDescription} from '@/lib/calendar-policy.mjs';
import type {Dataset} from '@/lib/types';
export default function CalendarSettings({dataset,onSave,disabled,onDirtyChange}:{dataset:Dataset;onDirtyChange?:(dirty:boolean)=>void;onSave:(dataset:Dataset)=>Promise<void>;disabled:boolean}){
 const [text,setText]=useState((dataset.config.calendarHolidays||[]).join('\n')),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const dirty=text!==(dataset.config.calendarHolidays||[]).join('\n');
 useEffect(()=>{onDirtyChange?.(dirty);if(!dirty)return;const prevent=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',prevent);return()=>{window.removeEventListener('beforeunload',prevent);onDirtyChange?.(false);};},[dirty,onDirtyChange]);
 async function save(){setError('');try{const dates=calendarDates(text,dataset.year);if(!window.confirm('Aplicar este calendário aos cálculos de ritmo, projeção e esforço? Metas e produção realizada serão preservadas.'))return;setSaving(true);await onSave({...dataset,config:{...dataset.config,calendarHolidays:dates}});}catch(reason){setError(reason instanceof Error?reason.message:'Não foi possível salvar o calendário.');}finally{setSaving(false);}}
 return <details className="calendar-settings panel"><summary>Calendário de dias úteis · {dataset.year}</summary><div><p>{calendarDescription(dataset.config.calendarHolidays)}</p><p>Cadastre somente datas sem expediente validadas pela gestão. O sistema não presume feriados nacionais ou locais.</p><label>Datas sem expediente<textarea aria-label="Datas sem expediente" rows={3} placeholder="AAAA-MM-DD, uma data por linha" value={text} disabled={disabled||saving} onChange={event=>setText(event.target.value)}/></label>{error&&<p role="alert">{error}</p>}<button type="button" className="button secondary" disabled={disabled||saving} onClick={()=>void save()}>Salvar calendário</button></div></details>;
}
