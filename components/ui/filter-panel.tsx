'use client';
import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
export default function FilterPanel({ children, description, onReset, active }: {
  children: ReactNode; description: string; onReset: () => void; active: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const id = useId();
  return <section className="filter-panel panel" aria-label="Filtros da análise">
    <div className="filter-panel-heading">
      <button className="filter-toggle" type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>
        <SlidersHorizontal size={17} aria-hidden="true" /><strong>Filtros</strong>
        <span>{expanded ? 'Recolher' : 'Expandir'}</span><ChevronDown className={expanded ? 'rotated' : ''} size={16} aria-hidden="true" />
      </button>
      {active && <button className="button quiet filter-reset" onClick={onReset} type="button">Limpar filtros</button>}
    </div>
    {!expanded && <p className="filter-description">{description}</p>}
    <div className="filters" id={id} hidden={!expanded}>{children}</div>
  </section>;
}
