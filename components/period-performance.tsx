'use client';

import { useMemo } from 'react';
import { CalendarRange } from 'lucide-react';
import { money, percent } from '@/lib/analytics.mjs';
import { attainmentBand } from '@/lib/attainment.mjs';
import { buildPeriodPerformance, type PerformanceFilters, type PerformanceRow } from '@/lib/period-performance.mjs';
import type { Dataset } from '@/lib/types';
import AttainmentLegend from './ui/attainment-legend';
import styles from './period-performance.module.css';

const dateLabel = (date: string | null) => date?.split('-').reverse().join('/') ?? 'não informado';
const varianceLabel = (row: PerformanceRow) => row.variance.kind === 'growth' ? 'Superação da meta' : row.variance.kind === 'gap' ? 'GAP para a meta' : row.variance.kind === 'met' ? row.target === 0 ? 'Meta zero' : 'Meta atingida' : 'Sem avaliação';

export default function PeriodPerformance({ dataset, filters, unitIds }: { dataset: Dataset; filters: PerformanceFilters; unitIds: string[] }) {
  const result = useMemo(() => {
    try { return { model: buildPeriodPerformance({ dataset, filters, unitIds }), error: '' }; }
    catch (reason) { return { model: null, error: reason instanceof Error ? reason.message : 'Não foi possível preparar os resultados por período.' }; }
  }, [dataset, filters, unitIds]);
  const model = result.model;
  return <section id="resultados-por-periodo" tabIndex={-1} aria-label="Resultados por período" className={styles.section}>
    <header className={styles.heading}><div><h2><CalendarRange size={21} aria-hidden="true" />Resultados por período</h2><p>Mesmas unidades do recorte atual, em todos os períodos de {dataset.year}.</p></div>{model && <span className={styles.metric}>{model.metric === 'AR' ? 'Arrecadação' : 'Venda Nova'}</span>}</header>
    {result.error ? <p role="alert" className={styles.empty}>{result.error}</p> : model && !model.count ? <p className={styles.empty}>Nenhuma unidade no recorte atual. Ajuste os filtros para comparar os períodos.</p> : model && <>
      <div className={styles.context}><strong>{model.scopeLabel}</strong><span>{model.cutoffMin === model.cutoff ? `Corte: ${dateLabel(model.cutoff)}` : `Cortes: ${dateLabel(model.cutoffMin)} a ${dateLabel(model.cutoff)}`}</span></div>
      <AttainmentLegend />
      <p className={styles.helper}>Realizado é a produção informada até o corte. Projeção é uma estimativa de fechamento.{model.uplift > 0 ? ` Aceleração considerada: ${model.uplift.toLocaleString('pt-BR')}%.` : ''}</p>
      {model.groups.map((group) => <div className={styles.group} key={group.period}>
        <h3>{group.title}</h3>
        <div className={styles.tableScroll}><table aria-label={group.title}>
          <thead><tr><th scope="col">Período</th><th scope="col">Meta</th><th scope="col">Realizado · atingimento</th><th scope="col">GAP ou superação</th><th scope="col">Projeção</th></tr></thead>
          <tbody>{group.rows.map((row) => {
            const band = attainmentBand(row.attainment);
            return <tr key={row.id} data-period={row.period} data-month={row.month} data-phase={row.phase}>
              <th scope="row"><strong>{row.label}</strong><small>{row.phaseLabel}{row.mixedCutoffs && row.phase !== 'closed' ? ' · cortes diferentes' : ''}</small></th>
              <td className={styles.numeric}>{money(row.target)}</td>
              <td className={styles.numeric}><strong>{money(row.actual)}</strong><span className={styles.attainment} data-attainment={band.key} title={band.label}>{row.attainment == null ? 'Sem avaliação' : percent(row.attainment)}</span></td>
              <td className={styles.numeric} data-variance={row.variance.kind}><strong>{money(row.variance.value)}</strong><small>{varianceLabel(row)}</small></td>
              <td className={styles.numeric}><strong>{money(row.projected)}</strong><small>{row.projected == null ? 'Sem projeção disponível' : row.phase === 'closed' ? 'Realizado ao encerrar' : 'Estimativa de fechamento'}</small></td>
            </tr>;
          })}</tbody>
        </table></div>
      </div>)}
    </>}
  </section>;
}
