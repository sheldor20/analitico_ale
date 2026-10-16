"use client";

import { useId, useMemo, useState } from 'react';
import { ArrowRight, CircleAlert, Flag, TrendingUp } from 'lucide-react';
import { money, percent } from '@/lib/analytics.mjs';
import { buildManagementPriorities, type ManagementAnalysis, type ManagementPriority, type ManagementPriorityAction } from '@/lib/management-priorities.mjs';
import styles from './management-priorities.module.css';
import PanelToggle from './ui/panel-toggle';

export type { ManagementPriorityAction } from '@/lib/management-priorities.mjs';

export function ManagementPriorities({ analyses, onViewUnits }: {
  analyses: ManagementAnalysis[];
  onViewUnits: (action: ManagementPriorityAction) => void;
}) {
  const headingId = useId();
  const contentId = useId();
  const [expanded, setExpanded] = useState(true);
  const model = useMemo(() => buildManagementPriorities(analyses), [analyses]);
  return <section className={styles.section} aria-labelledby={headingId}>
    <div className={styles.heading}><div><h2 id={headingId}>Prioridades da carteira</h2><span>Escolha o próximo acompanhamento</span></div><PanelToggle expanded={expanded} onToggle={() => setExpanded(value => !value)} controls={contentId} label="prioridades" /></div>
    <div id={contentId} hidden={!expanded}>
      {model.items.length > 0 ? <div className={styles.grid}>{model.items.map(item => <Priority key={item.kind} item={item} onViewUnits={onViewUnits} />)}</div> : <p className={styles.empty}>{model.empty}</p>}
      {model.review && <div className={styles.review}>
        <CircleAlert size={16} aria-hidden="true" /><p>{model.review.detail} Ausência de dado não é produção zero.</p>
        <button type="button" className="button quiet" onClick={() => onViewUnits(model.review!.action)} aria-label="Ver unidades: Conferir registros">Conferir registros <ArrowRight size={14} aria-hidden="true" /></button>
      </div>}
      {model.notes.map(note => <p className={styles.note} key={note}>{note}</p>)}
    </div>
  </section>;
}

function Priority({ item, onViewUnits }: { item: ManagementPriority; onViewUnits: (action: ManagementPriorityAction) => void }) {
  const Icon = item.kind === 'pace' ? TrendingUp : Flag;
  const actionLabel = item.kind === 'pace' ? 'Ver unidades abaixo do ritmo' : item.kind === 'near-goal' ? 'Ver metas próximas' : 'Acompanhar déficits';
  return <article className={`${styles.card} ${styles[item.tone]}`} data-priority-kind={item.kind}>
    <h3><Icon size={17} aria-hidden="true" />{item.title}</h3>
    <p className={styles.fact}><ReadableText text={item.detail} /></p>
    {item.concentration && <p className={styles.concentration}>
      <strong>{percent(item.concentration.share)} dos déficits</strong> em {item.concentration.count} {item.concentration.count === 1 ? 'unidade' : 'unidades'}: {item.concentration.names.join(', ')}.
    </p>}
    <button className={`button quiet ${styles.action}`} type="button" onClick={() => onViewUnits(item.action)} aria-label={`Ver unidades: ${item.title}`}>{actionLabel} <ArrowRight size={15} aria-hidden="true" /></button>
    <details className={styles.details}><summary>Critério e unidades ({item.rows.length})</summary>
      {item.notes.map(note => <p key={note}>{note}</p>)}
      {item.reconciliation && <p>Na seleção: déficits de <ReadableText text={money(item.reconciliation.deficits)} />, superações de <ReadableText text={money(item.reconciliation.surplus)} /> e GAP consolidado de <ReadableText text={money(item.reconciliation.consolidated)} />.</p>}
      <ul>{item.rows.map(row => <li key={row.key}><strong>{row.name}</strong><span>{row.context} · corte {row.cutoff}</span><span className={styles.rowFact}><ReadableText text={row.detail} /></span></li>)}</ul>
    </details>
  </article>;
}

function ReadableText({ text }: { text: string }) {
  return <>{text.split(/(-?R\$\s*[\d.,]+)/g).map((part, index) => part.includes('R$') ? <span className={styles.money} key={index}>{part}</span> : part)}</>;
}
