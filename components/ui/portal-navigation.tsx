import { BellRing, Building2, ClipboardList, History, LayoutDashboard, ShieldCheck } from 'lucide-react';
export type PortalView = 'overview' | 'cadence' | 'actions' | 'audit' | 'imports' | 'registry' | 'alerts';
export const VIEW_TITLES: Record<PortalView, string> = {
  overview: 'Visão geral', cadence: 'Cadência dos PAs', actions: 'Plano de ação',
  audit: 'Conferência da base', imports: 'Importações', registry: 'Cadastro e metas', alerts: 'Metas atingidas',
};
export const VIEW_DESCRIPTIONS: Record<PortalView, string> = {
  overview: 'Veja quanto foi produzido, o que falta para a meta e quais unidades precisam de atenção.',
  cadence: 'Acompanhe a produção de cada ponto de atendimento (PA) em relação à sua própria meta.',
  actions: 'Transforme os resultados em tarefas com responsável, prazo e acompanhamento.',
  audit: 'Confira os avisos da base antes de usar os resultados ou compartilhar uma parcial.',
  imports: 'Importe a produção mais recente ou consulte uma análise já salva.',
  registry: 'Abra a ficha da central, navegue pelas cooperativas e PAs e organize contatos, carteiras e agenda.',
  alerts: 'Identifique quem atingiu a meta do mês e prepare uma mensagem de reconhecimento.',
};
const groups = [
  { label: 'Acompanhamento', items: [
    { id: 'overview', icon: LayoutDashboard }, { id: 'cadence', icon: Building2 }, { id: 'actions', icon: ClipboardList }, { id: 'alerts', icon: BellRing },
  ] },
  { label: 'Gestão da base', items: [
    { id: 'audit', icon: ShieldCheck }, { id: 'imports', icon: History }, { id: 'registry', icon: Building2 },
  ] },
] as const;
export default function PortalNavigation({ view, disabled, issueCount, onNavigate }: {
  view: PortalView; disabled: boolean; issueCount: number; onNavigate: (view: PortalView) => void;
}) {
  return <nav aria-label="Navegação principal">{groups.map(group => <div className="nav-group" key={group.label}>
    <p className="nav-label">{group.label}</p>
    {group.items.map(item => <button key={item.id} type="button" aria-label={VIEW_TITLES[item.id]}
      aria-current={view === item.id ? 'page' : undefined} className={`nav-item ${view === item.id ? 'active' : ''}`}
      disabled={disabled} onClick={() => onNavigate(item.id)}>
      <item.icon size={20} aria-hidden="true" /><span>{VIEW_TITLES[item.id]}</span>
      {item.id === 'audit' && issueCount > 0 && <span className="nav-count" aria-label={`${issueCount} avisos`}>{issueCount}</span>}
    </button>)}
  </div>)}</nav>;
}
