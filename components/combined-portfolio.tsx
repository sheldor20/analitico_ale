'use client';

import { useMemo, type ReactNode } from 'react';
import { Download, Share2 } from 'lucide-react';
import { money, percent } from '@/lib/analytics.mjs';
import { attainmentBand } from '@/lib/attainment.mjs';
import { buildCurrentViewModels, type CurrentViewFilters, type CurrentViewModel, type CurrentViewRow } from '@/lib/current-view.mjs';
import { goalVariance } from '@/lib/goal-variance.mjs';
import type { Dataset, Metric } from '@/lib/types';
import AttainmentLegend from './ui/attainment-legend';
import PeriodPerformance from './period-performance';
import styles from './combined-portfolio.module.css';

export type CombinedPortfolioProps = {
  dataset: Dataset; filters: CurrentViewFilters; models?: CurrentViewModel[];
  ownerId?: string | null; expandRequest?: number; controls?: ReactNode;
  onSelect: (row: CurrentViewRow) => void; onDrill: (row: CurrentViewRow) => void;
  onShare: (metric?: Metric) => void; onExport: (metric: Metric) => void;
};
const dateLabel = (value: string) => value.split('-').reverse().join('/');
function Money({ value, large = false }: { value: number | null; large?: boolean }) {
  if (value == null) return <span className={styles.missing}><span aria-hidden="true">—</span><span className="sr-only">Não disponível</span></span>;
  const formatted = money(value);
  return <span className={styles.money} style={large ? { fontSize: `clamp(16px, ${Math.min(12, 145 / formatted.length)}cqi, 30px)` } : undefined}>{formatted}</span>;
}
function Badge({ value }: { value: number | null }) {
  const band = attainmentBand(value);
  return <span className={styles.badge} data-attainment={band.key} title={band.label}>{value == null ? 'Sem avaliação' : percent(value)}</span>;
}
function Balance({ value }: { value: ReturnType<typeof goalVariance> }) {
  return <span className={styles.balance} data-variance={value.kind}>
    {value.kind !== 'unknown' && <span className="sr-only">{value.kind === 'growth' ? 'Superação' : value.kind === 'gap' ? 'GAP' : 'Na meta'}: </span>}
    {['growth', 'gap'].includes(value.kind) && <span aria-hidden="true">{value.kind === 'growth' ? '+' : '−'}</span>}
    <Money value={value.value} />
  </span>;
}
function Headline({ model }: { model: CurrentViewModel }) {
  return <dl className={styles.kpis} aria-label={`Indicadores de ${model.label}`}>
    <div><dt>Meta do período</dt><dd data-field="target"><Money value={model.summary.target} large /></dd></div>
    <div data-kpi-attainment={attainmentBand(model.attainment).key}><dt>Realizado</dt><dd><span data-field="actual"><Money value={model.summary.actual} large /></span><Badge value={model.attainment} /></dd></div>
    <div><dt>{model.variance.kind === 'growth' ? 'Superação da meta' : 'GAP para a meta'}</dt><dd data-field="variance"><Money value={model.variance.value} large /></dd></div>
    <div><dt>Projeção de fechamento</dt><dd data-field="projected"><Money value={model.summary.projected} large /></dd><small>Estimativa</small></div>
  </dl>;
}

export default function CombinedPortfolio({ dataset, filters, models: suppliedModels, ownerId, expandRequest, controls, onSelect, onDrill, onShare, onExport }: CombinedPortfolioProps) {
  const models = useMemo(() => suppliedModels ?? buildCurrentViewModels({ dataset, filters }), [suppliedModels, dataset, filters]);
  return <section className={styles.combined} aria-label="Venda Nova e Arrecadação">
    {controls}
    <AttainmentLegend />
    {models.map(model => <section className={styles.portfolio} key={model.metric} aria-label={`Carteira ${model.label}`} data-portfolio={model.metric}>
      <header className={styles.heading}><div><h2>{model.label}</h2><p>{model.periodLabel} · {model.count} {model.level === 'central' ? model.count === 1 ? 'central' : 'centrais' : model.level === 'pa' ? model.count === 1 ? 'PA' : 'PAs' : model.count === 1 ? 'cooperativa' : 'cooperativas'}</p><p className={styles.cutoff}>{model.cutoff ? model.cutoffMin && model.cutoffMin !== model.cutoff ? `Cortes: ${dateLabel(model.cutoffMin)} a ${dateLabel(model.cutoff)}` : `Corte: ${dateLabel(model.cutoff)}` : 'Sem data de atualização'} · {model.phaseLabel}</p></div><div className={styles.actions}><button type="button" className="button secondary" disabled={!model.count} onClick={() => onShare(model.metric)}><Share2 size={16} aria-hidden="true" />Compartilhar {model.label}</button><button type="button" className="button quiet" disabled={!model.count} onClick={() => onExport(model.metric)}><Download size={16} aria-hidden="true" />Exportar {model.label}</button></div></header>
      <Headline model={model} />
      {model.count ? <div className={styles.tableScroll}><table aria-label={`Unidades de ${model.label}`}>
        <thead><tr><th scope="col">Unidade</th><th scope="col">Meta</th><th scope="col">Realizado</th><th scope="col">Atingimento</th><th scope="col">GAP / Superação</th><th scope="col">Projeção</th><th scope="col">Ações</th></tr></thead>
        <tbody>{model.rows.map((row, index) => {
          const entity = model.units[index], variance = goalVariance(row.actual, row.target, row.gap != null && !row.annualConflict);
          return <tr key={row.key} data-unit-id={entity.id} data-metric={model.metric}>
            <th scope="row"><button className={styles.unitButton} type="button" onClick={() => onSelect(row)}>{entity.kind === 'central' ? `Central ${entity.central}` : entity.kind === 'pa' ? `PA ${entity.pa}` : `Cooperativa ${entity.cooperative}`} · {row.name}</button><small>{entity.kind !== 'central' ? `Central ${entity.central}${entity.kind === 'pa' ? ` · Cooperativa ${entity.cooperative}` : ''} · ` : ''}{row.status}</small></th>
            <td className={styles.numeric} data-field="target"><Money value={row.target} /></td>
            <td className={styles.numeric} data-field="actual"><Money value={row.actual} /></td>
            <td className={styles.attainmentCell}><Badge value={row.annualConflict ? null : row.attainment} /></td>
            <td className={styles.numeric} data-field="variance"><Balance value={variance} /></td>
            <td className={styles.numeric} data-field="projected"><Money value={row.projected} /></td>
            <td><div className={styles.rowActions}><button type="button" className="button quiet" onClick={() => onSelect(row)}>Detalhar</button>{model.level !== 'pa' && <button type="button" className="button quiet" onClick={() => onDrill(row)}>{model.level === 'central' ? 'Ver cooperativas' : 'Ver PAs'}</button>}</div></td>
          </tr>;
        })}</tbody>
      </table></div> : <p className={styles.empty}>Nenhuma unidade de {model.label} no recorte atual. Ajuste os filtros para continuar.</p>}
    </section>)}
    <div id="resultados-por-periodo" className={styles.periods} tabIndex={-1} aria-label="Resultados por período das carteiras">
      {models.map(model => <PeriodPerformance key={model.metric} dataset={dataset} filters={model.filters} unitIds={model.unitIds} ownerId={ownerId} sectionId={`resultados-por-periodo-${model.metric.toLowerCase()}`} initialExpanded={false} expandRequest={expandRequest || undefined} />)}
    </div>
  </section>;
}
