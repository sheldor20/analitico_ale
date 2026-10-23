'use client';
import {useId} from 'react';
import { ArrowRight, Building2, CalendarRange, GitCompareArrows, Gauge, LayoutDashboard } from 'lucide-react';
import { money, percent } from '@/lib/analytics.mjs';
import {goalVariance} from '@/lib/goal-variance.mjs';
import type { CurrentViewRow } from '@/lib/current-view.mjs';

export type AnalysisTab = 'overview' | 'units' | 'periods' | 'comparison' | 'simulation';
export type UnitLayout = 'period' | 'matrix';
export function UnitLayoutSwitch({value,onChange}:{value:UnitLayout;onChange:(layout:UnitLayout)=>void}) {
  const name=useId();
  return <fieldset className="unit-layout-switch"><legend className="sr-only">Visualização das unidades</legend>{([{value:'period',label:'Resultado do período'},{value:'matrix',label:'Mês · trimestre · ano'}] as const).map(option=><label key={option.value} data-selected={value===option.value}><input type="radio" name={name} value={option.value} checked={value===option.value} onChange={()=>onChange(option.value)}/><span>{option.label}</span></label>)}</fieldset>;
}
export const ANALYSIS_TABS = [
  {id:'overview',label:'Visão geral',icon:LayoutDashboard},
  {id:'units',label:'Cooperativas e PAs',icon:Building2},
  {id:'periods',label:'Por período',icon:CalendarRange},
  {id:'comparison',label:'Comparar anos',icon:GitCompareArrows},
  {id:'simulation',label:'Simulação',icon:Gauge},
] as const;
export function AnalysisTabs({active,onChange}:{active:AnalysisTab;onChange:(tab:AnalysisTab)=>void}) {
  return <nav className="analysis-tabs" role="tablist" aria-label="Análises comerciais">{ANALYSIS_TABS.map((tab,index)=><button key={tab.id} id={`analysis-tab-${tab.id}`} type="button" role="tab" aria-selected={active===tab.id} aria-controls={`analysis-panel-${tab.id}`} tabIndex={active===tab.id?0:-1} onClick={()=>onChange(tab.id)} onKeyDown={event=>{
    const next=event.key==='Home'?0:event.key==='End'?ANALYSIS_TABS.length-1:event.key==='ArrowRight'?(index+1)%ANALYSIS_TABS.length:event.key==='ArrowLeft'?(index+ANALYSIS_TABS.length-1)%ANALYSIS_TABS.length:-1;
    if(next>=0){event.preventDefault();onChange(ANALYSIS_TABS[next].id);document.getElementById(`analysis-tab-${ANALYSIS_TABS[next].id}`)?.focus();}
  }}><tab.icon size={17} aria-hidden="true"/>{tab.label}</button>)}</nav>;
}
export function AnalysisBreadcrumb({items}:{items:{label:string;onClick?:()=>void}[]}) {
  return <nav className="analysis-breadcrumb" aria-label="Trilha da análise"><ol>{items.map((item,index)=><li key={`${index}:${item.label}`}>{item.onClick?<button type="button" aria-current={index===items.length-1?'location':undefined} onClick={item.onClick}>{item.label}</button>:<span aria-current="location">{item.label}</span>}</li>)}</ol></nav>;
}
export function OverviewUnits({rows,onAnalyze,onAll}:{rows:CurrentViewRow[];onAnalyze:(row:CurrentViewRow)=>void;onAll:()=>void}) {
  return <>
    <section className="panel overview-unit-summary" aria-label="Resumo das unidades"><header><div><h2>Unidades do recorte</h2><p>{rows.length} unidades · todas na ordem selecionada</p></div><button type="button" className="button secondary" onClick={onAll}>Análise detalhada <ArrowRight size={16}/></button></header>
      <div className="table-scroll"><table aria-label="Resumo das unidades filtradas"><thead><tr><th>Unidade</th><th className="numeric">Realizado</th><th className="numeric">Atingimento</th><th className="numeric">GAP / Superação</th><th>Ação</th></tr></thead><tbody>{rows.map((row)=><tr key={row.key}><th scope="row"><strong>{row.name}</strong><small>{row.cooperative?`Coop. ${row.cooperative}`:`Central ${row.central}`}{row.pa!=null?` · PA ${row.pa}`:''} · {row.status}</small></th><td className="numeric">{money(row.actual)}</td><td className="numeric">{row.complete&&!row.annualConflict?row.target===0?'Meta zero':percent(row.attainment):'Sem avaliação'}</td><td className="numeric">{(()=>{const balance=goalVariance(row.actual,row.target,row.complete&&!row.annualConflict);return balance.value==null?'—':`${balance.kind==='growth'?'+ ':balance.kind==='gap'?'− ':''}${money(balance.value)}`;})()}</td><td><button type="button" className="button quiet" onClick={()=>onAnalyze(row)}>{row.pa!=null?'Analisar PA':row.cooperative?'Analisar cooperativa':'Analisar central'}</button></td></tr>)}</tbody></table>{!rows.length&&<p className="empty">Nenhuma unidade corresponde aos filtros.</p>}</div>
    </section>

  </>;
}
type SimulationSummary={actual:number|null;target:number|null;projected:number|null;projectedAttainment:number|null;gap:number|null};
export function AnalysisSimulation({baseline,simulated,uplift,onChange,period,days,daily,monthly}:{baseline:SimulationSummary;simulated:SimulationSummary;uplift:number;onChange:(value:number)=>void;period:string;days:number|null;daily:number|null;monthly:number|null}) {
  const sliderId=useId();
  const impact=baseline.projected!=null&&simulated.projected!=null?simulated.projected-baseline.projected:null;
  const projectedGap=simulated.target!=null&&simulated.projected!=null?Math.max(0,simulated.target-simulated.projected):null;
  return <section className="panel analysis-simulation" aria-label="Simulação comercial"><header><div><h2>Simulação de fechamento</h2><p>{period} · estimativa, sem alterar metas ou realizado</p></div><button type="button" className="button secondary" onClick={()=>onChange(0)}>Restaurar premissas</button></header><div className="simulation-premises"><label htmlFor={sliderId}>Aumento do ritmo futuro <strong>+{uplift}%</strong></label><input id={sliderId} type="range" min="0" max="100" step="5" value={uplift} onChange={event=>onChange(Number(event.target.value))}/><p>Aplica o aumento à produção futura estimada pelo ritmo observado e pelas metas restantes. Não representa probabilidade de fechamento.</p></div><dl className="simulation-results"><div><dt>Realizado até o corte</dt><dd>{money(baseline.actual)}</dd><small>Valor registrado</small></div><div><dt>Projeção atual</dt><dd>{money(baseline.projected)}</dd><small>{percent(baseline.projectedAttainment)} da meta · estimativa</small></div><div><dt>Cenário simulado</dt><dd>{money(simulated.projected)}</dd><small>{percent(simulated.projectedAttainment)} da mesma meta · +{uplift}% no ritmo futuro</small></div></dl><dl className="simulation-impact"><div><dt>Impacto na projeção</dt><dd>{money(impact)}</dd></div><div><dt>GAP projetado do período</dt><dd>{money(projectedGap)}</dd></div><div><dt>GAP consolidado atual</dt><dd>{money(baseline.gap)}</dd></div><div><dt>Esforço por dia útil restante</dt><dd>{money(daily)}</dd><small>{days==null?'Cortes ou prazos distintos · consulte por unidade':`${days} dias úteis · segunda a sexta, sem feriados`}</small></div><div><dt>Esforço por mês equivalente</dt><dd>{money(monthly)}</dd><small>Mesma meta e mesmo prazo do período</small></div></dl><p className="helper">Valores sem base suficiente aparecem como travessão. A simulação fica restrita a esta aba e é identificada no compartilhamento.</p></section>;
}
