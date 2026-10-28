'use client';
import { useEffect, useState } from 'react';
import { BellRing, Building2, CalendarDays, ClipboardList, History, LayoutDashboard, Megaphone, ShieldCheck, Search, X } from 'lucide-react';
export type PortalView = 'overview' | 'cadence' | 'actions' | 'audit' | 'imports' | 'registry' | 'alerts' | 'agenda' | 'cnv';
export const VIEW_TITLES: Record<PortalView, string> = {
  overview: 'Análises', cadence: 'Cadência dos PAs', actions: 'Plano de ação',
  audit: 'Conferência da base', imports: 'Importações', registry: 'Cadastro e metas', alerts: 'Metas atingidas', agenda: 'Agenda', cnv: 'Ações CNV 2026',
};
export const VIEW_DESCRIPTIONS: Record<PortalView, string> = {
  overview: 'Metas e produção da carteira.',
  cadence: 'Produção e metas por ponto de atendimento.',
  actions: 'Prioridades, responsáveis e próximos passos.',
  audit: 'Pendências de dados e critérios de cálculo.',
  imports: 'Atualize a produção ou consulte análises salvas.',
  registry: 'Unidades, contatos, carteira e metas anuais.',
  alerts: 'Reconheça os resultados do mês.',
  agenda: 'Programação das centrais, cooperativas e PAs.',
  cnv: 'Regulamentos, produtos, metas e comunicação das ações.',
};
const groups = [
  { label: 'Acompanhamento', items: [
    { id: 'overview', icon: LayoutDashboard }, { id: 'cadence', icon: Building2 }, { id: 'actions', icon: ClipboardList }, { id: 'cnv', icon: Megaphone },
  ] },
  { label: 'Relacionamento', items: [
    { id: 'agenda', icon: CalendarDays }, { id: 'alerts', icon: BellRing },
  ] },
  { label: 'Administração', items: [
    { id: 'audit', icon: ShieldCheck }, { id: 'imports', icon: History }, { id: 'registry', icon: Building2 },
  ] },
] as const;
export default function PortalNavigation({ view, disabled, issueCount, onNavigate, collapsed = false }: {
  view: PortalView; disabled: boolean; issueCount: number; onNavigate: (view: PortalView) => void; collapsed?: boolean;
}) {
  const [query,setQuery] = useState('');
  useEffect(()=>{const resetOnMobile=()=>{if(window.innerWidth<=720)setQuery('');};window.addEventListener('resize',resetOnMobile);return()=>window.removeEventListener('resize',resetOnMobile);},[]);
  const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  const visibleGroups=groups.map(group=>({...group,items:group.items.filter(item=>!query||normalize(`${VIEW_TITLES[item.id]} ${group.label}`).includes(normalize(query)))})).filter(group=>group.items.length);
  return <nav aria-label="Navegação principal">
    {!collapsed&&<div className="menu-search"><Search size={17} aria-hidden="true"/><span className="sr-only">Buscar no menu</span><input type="search" aria-label="Buscar no menu" value={query} placeholder="Buscar no menu" onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Escape')setQuery('');}}/>{query&&<button type="button" aria-label="Limpar busca do menu" onClick={()=>setQuery('')}><X size={14}/></button>}</div>}
    {(collapsed?groups:visibleGroups).map(group => <div className="nav-group" key={group.label}>
      <p className="nav-label">{group.label}</p>
      {group.items.map(item => <button key={item.id} type="button" aria-label={VIEW_TITLES[item.id]} title={VIEW_TITLES[item.id]}
        aria-current={view === item.id ? 'page' : undefined} className={`nav-item ${view === item.id ? 'active' : ''}`}
        disabled={disabled} onClick={() => onNavigate(item.id)}>
        <item.icon size={20} aria-hidden="true" /><span>{VIEW_TITLES[item.id]}</span>
        {item.id === 'audit' && issueCount > 0 && <span className="nav-count" aria-label={`${issueCount} avisos`}>{issueCount}</span>}
      </button>)}
    </div>)}
    {!collapsed&&!visibleGroups.length&&<p className="menu-empty" role="status">Nenhum item encontrado.</p>}
  </nav>;
}
