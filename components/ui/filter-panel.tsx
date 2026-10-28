'use client';
import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
export default function FilterPanel({ children, primary, description, onReset, active, compact = false, refinements = false }: {
  children: ReactNode; primary?: ReactNode; description: string; onReset: () => void; active: boolean; compact?: boolean; refinements?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return <section className={`filter-panel panel${compact ? " filter-panel-compact" : ""}`} aria-label="Filtros da análise">
    {primary && <section className="analysis-context" aria-label="Contexto da análise">{primary}</section>}
    {(!compact || refinements) && <><div className="filter-summary">
    {!compact && <p className="filter-description" aria-live="polite">{description}</p>}
    <div className="filter-panel-heading">
      <button className="filter-toggle" type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>
        <SlidersHorizontal size={17} aria-hidden="true" /><strong>{compact ? 'Mais filtros' : 'Filtros'}</strong>
        <span>{expanded ? 'Recolher' : 'Alterar'}{active ? ' · ativos' : ''}</span><ChevronDown className={expanded ? 'rotated' : ''} size={16} aria-hidden="true" />
      </button>
      {active && <button className="button quiet filter-reset" onClick={onReset} type="button">Limpar filtros</button>}
    </div>
    </div>
    <div className="filters" id={id} hidden={!expanded}>{children}</div></>}
  </section>;
}
