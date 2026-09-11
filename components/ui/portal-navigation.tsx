import { Building2, ClipboardList, History, LayoutDashboard, ShieldCheck } from 'lucide-react';
export type PortalView = 'overview' | 'cadence' | 'actions' | 'audit' | 'imports' | 'registry';
export const VIEW_TITLES: Record<PortalView, string> = {
  overview: 'Visão geral', cadence: 'Cadência dos PAs', actions: 'Plano de ação',
  audit: 'Conferência da base', imports: 'Importações', registry: 'Cadastro e metas',
};
const groups = [
  { label: 'Acompanhamento', items: [
    { id: 'overview', icon: LayoutDashboard }, { id: 'cadence', icon: Building2 }, { id: 'actions', icon: ClipboardList },
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
