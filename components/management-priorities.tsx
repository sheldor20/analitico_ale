"use client";

import { useId, useMemo } from 'react';
import { ArrowRight, CircleAlert, Flag, TrendingUp } from 'lucide-react';
import { buildManagementPriorities, type ManagementAnalysis, type ManagementPriority, type ManagementPriorityAction } from '@/lib/management-priorities.mjs';
import styles from './management-priorities.module.css';

export type { ManagementPriorityAction } from '@/lib/management-priorities.mjs';

export function ManagementPriorities({ analyses, onViewUnits }: {
  analyses: ManagementAnalysis[];
  onViewUnits: (action: ManagementPriorityAction) => void;
}) {
  const headingId = useId();
  const model = useMemo(() => buildManagementPriorities(analyses), [analyses]);
  return <section className={styles.section} aria-labelledby={headingId}>
    <div className={styles.heading}><h2 id={headingId}>Prioridades da carteira</h2><span>Com base no realizado da seleção</span></div>
    {model.items.length > 0 ? <div className={styles.grid}>{model.items.map(item => <Priority key={item.kind} item={item} onViewUnits={onViewUnits} />)}</div> : <p className={styles.empty}>{model.empty}</p>}
    {model.notes.map(note => <p className={styles.note} key={note}>{note}</p>)}
    {model.additional.length > 0 && <details className={styles.additional}><summary>Contribuição da produção</summary>{model.additional.map(item => <Priority key={item.kind} item={item} onViewUnits={onViewUnits} />)}</details>}
  </section>;
}

function Priority({ item, onViewUnits }: { item: ManagementPriority; onViewUnits: (action: ManagementPriorityAction) => void }) {
  const Icon = item.kind === 'review' ? CircleAlert : item.kind === 'production' ? TrendingUp : Flag;
  return <article className={`${styles.card} ${styles[item.tone]}`}>
    <h3><Icon size={18} aria-hidden="true" />{item.title}</h3>
    <p className={styles.fact}><ReadableText text={item.detail} /></p>
    <button className={`button quiet ${styles.action}`} type="button" onClick={() => onViewUnits(item.action)} aria-label={`Ver unidades: ${item.title}`}>Ver unidades <ArrowRight size={16} aria-hidden="true" /></button>
    <details className={styles.details}><summary>Detalhes e unidades ({item.rows.length})</summary>
      {item.notes.map(note => <p key={note}>{note}</p>)}
      <ul>{item.rows.map(row => <li key={row.key}><strong>{row.name}</strong><span>{row.context} · {row.cutoff}</span><span className={styles.rowFact}><ReadableText text={row.detail} /></span></li>)}</ul>
    </details>
  </article>;
}

function ReadableText({ text }: { text: string }) {
  return <>{text.split(/(-?R\$\s*[\d.,]+)/g).map((part, index) => part.includes('R$') ? <span className={styles.money} key={index}>{part}</span> : part)}</>;
}
