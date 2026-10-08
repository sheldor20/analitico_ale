'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { money, percent } from '@/lib/analytics.mjs';
import { attainmentBand } from '@/lib/attainment.mjs';
import { buildPeriodPerformance, type PerformanceFilters, type PerformancePeriod, type PerformanceRow } from '@/lib/period-performance.mjs';
import { PERIOD_ORDER_OPTIONS, sortPerformancePeriods, type PerformanceOrder } from '@/lib/period-performance-order.mjs';
import type { Dataset } from '@/lib/types';
import AttainmentLegend from './ui/attainment-legend';
import PanelToggle from './ui/panel-toggle';
import styles from './period-performance.module.css';

const dateLabel = (date: string | null) => date?.split('-').reverse().join('/') ?? 'não informado';
const varianceLabel = (row: PerformanceRow) => row.variance.kind === 'growth' ? 'Superação' : row.variance.kind === 'gap' ? 'GAP' : row.variance.kind === 'met' ? row.target === 0 ? 'Meta zero' : 'Na meta' : 'Sem avaliação';
const openGroups = (): Record<PerformancePeriod, boolean> => ({ month: true, quarter: true, semester: true, annual: true });

function FinancialValue({ value }: { value: number | null }) {
  return value == null ? <span className={styles.unavailable} title="Não disponível"><span aria-hidden="true">—</span><span className="sr-only">Não disponível</span></span> : <>{money(value)}</>;
}

export default function PeriodPerformance({ dataset, filters, unitIds, expandRequest }: { dataset: Dataset; filters: PerformanceFilters; unitIds: string[]; expandRequest?: number }) {
  const contentId = useId();
  const [expanded, setExpanded] = useState(true);
  const [groups, setGroups] = useState(openGroups);
  const [order, setOrder] = useState<PerformanceOrder>('chronological');
  useEffect(() => {
    if (expandRequest == null) return;
    setExpanded(true);
    setGroups(openGroups());
  }, [expandRequest]);
  const result = useMemo(() => {
    try { return { model: buildPeriodPerformance({ dataset, filters, unitIds }), error: '' }; }
    catch (reason) { return { model: null, error: reason instanceof Error ? reason.message : 'Não foi possível preparar os resultados por período.' }; }
  }, [dataset, filters, unitIds]);
  const model = result.model;
  return <section id="resultados-por-periodo" tabIndex={-1} aria-label="Resultados por período" className={styles.section}>
    <header className={styles.heading}>
      <div><h2>Resultados por período</h2><p>{model?.metric === 'AR' ? 'Arrecadação' : 'Venda Nova'} · {dataset.year} · recorte atual</p></div>
      <div className={styles.controls}>
        {expanded && Boolean(model?.count) && <label className={styles.order}>Ordenar períodos<select aria-label="Ordenar períodos" value={order} onChange={event => setOrder(event.target.value as PerformanceOrder)}>{Object.entries(PERIOD_ORDER_OPTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        <PanelToggle expanded={expanded} controls={contentId} label="resultados por período" onToggle={() => setExpanded(value => !value)} />
      </div>
    </header>
    <div id={contentId} hidden={!expanded}>
      {result.error ? <p role="alert" className={styles.empty}>{result.error}</p> : model && !model.count ? <p className={styles.empty}>Nenhuma unidade no recorte atual. Ajuste os filtros para comparar os períodos.</p> : model && <div className={styles.content}>
        <div className={styles.context}><strong>{model.scopeLabel}</strong><span>{model.cutoffMin === model.cutoff ? `Corte: ${dateLabel(model.cutoff)}` : `Cortes: ${dateLabel(model.cutoffMin)} a ${dateLabel(model.cutoff)}`}</span></div>
        <div className={styles.guide}>
          <AttainmentLegend />
          <details><summary>Como ler</summary><p>As mesmas unidades são comparadas em todos os períodos. Realizado até o corte. GAP é o que falta; superação é o valor acima da meta. Projeção estima o fechamento e coincide com o realizado nos períodos fechados.{model.uplift > 0 ? ` Aceleração: ${model.uplift.toLocaleString('pt-BR')}%.` : ''}</p></details>
        </div>
        {model.groups.map((group) => {
          const isOpen = groups[group.period], groupId = `${contentId}-${group.period}`;
          return <div className={styles.group} key={group.period}>
            <header className={styles.groupHeading}><h3>{group.title}<span className={styles.count}>{group.rows.length} {group.rows.length === 1 ? 'período' : 'períodos'}</span></h3><PanelToggle expanded={isOpen} controls={groupId} label={group.title.toLocaleLowerCase('pt-BR')} onToggle={() => setGroups(value => ({ ...value, [group.period]: !value[group.period] }))} /></header>
            <div id={groupId} hidden={!isOpen}>
              <div className={styles.tableScroll}><table aria-label={group.title}>
                <thead><tr><th scope="col">Período</th><th scope="col">Meta</th><th scope="col">Realizado · atingimento</th><th scope="col">GAP ou superação</th><th scope="col">Projeção</th></tr></thead>
                <tbody>{sortPerformancePeriods(group.rows, order).map((row) => {
                  const band = attainmentBand(row.attainment);
                  return <tr key={row.id} data-period={row.period} data-month={row.month} data-phase={row.phase}>
                    <th scope="row"><div className={styles.periodLabel}><strong>{row.label}</strong><small>{row.phaseLabel}{row.mixedCutoffs && row.phase !== 'closed' ? ' · cortes diferentes' : ''}</small></div></th>
                    <td className={styles.numeric}><FinancialValue value={row.target} /></td>
                    <td className={styles.numeric}><div className={styles.actual}><strong><FinancialValue value={row.actual} /></strong><span className={styles.attainment} data-attainment={band.key} title={band.label}>{row.attainment == null ? 'Sem avaliação' : percent(row.attainment)}</span></div></td>
                    <td className={styles.numeric} data-variance={row.variance.kind}><div className={styles.variance}><strong><FinancialValue value={row.variance.value} /></strong>{row.variance.kind !== 'unknown' && <small>{varianceLabel(row)}</small>}</div></td>
                    <td className={styles.numeric}><strong><FinancialValue value={row.projected} /></strong></td>
                  </tr>;
                })}</tbody>
              </table></div>
            </div>
          </div>;
        })}
      </div>}
    </div>
  </section>;
}
