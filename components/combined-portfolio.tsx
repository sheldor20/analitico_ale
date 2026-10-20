'use client';

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Download, Share2 } from 'lucide-react';
import { analyze, money, percent, summarize } from '@/lib/analytics.mjs';
import { attainmentBand } from '@/lib/attainment.mjs';
import { buildCurrentViewModels, type CurrentViewFilters, type CurrentViewModel, type CurrentViewRow } from '@/lib/current-view.mjs';
import { goalVariance } from '@/lib/goal-variance.mjs';
import { analysisEffort } from '@/lib/analysis-workspace.mjs';
import type { compareYears } from '@/lib/scenarios.mjs';
import type { Dataset, Metric } from '@/lib/types';
import { AnalysisSimulation, OverviewUnits, type AnalysisTab } from './analysis-workspace';
import { ManagementPriorities, type ManagementPriorityAction } from './management-priorities';
import { PaTable, YearComparison, type ScenarioFilters } from './scenario-panels';
import AttainmentLegend from './ui/attainment-legend';
import PeriodPerformance from './period-performance';
import UnitScenarioMatrix from './unit-scenario-matrix';
import styles from './combined-portfolio.module.css';

export type CombinedPortfolioProps = {
  dataset: Dataset; filters: CurrentViewFilters; models?: CurrentViewModel[];
  ownerId?: string | null; expandRequest?: number; controls?: ReactNode;
  mode?: AnalysisTab; years?: number[]; sessionDatasets?: Map<number, Dataset>;
  unitLayout?: 'period' | 'matrix'; onMatrixShare?: (model: CurrentViewModel) => void;
  simulationUplift?: number; onUplift?: (value: number) => void;
  onAnalysisTab?: (tab: AnalysisTab) => void;
  onPriority?: (action: ManagementPriorityAction, metric: Metric) => void;
  onComparisonShare?: (comparison: ReturnType<typeof compareYears>, previousYear: number, model: CurrentViewModel) => void;
  onSimulationShare?: (model: CurrentViewModel) => void;
  shareRequest?: number;
  onSelect: (row: CurrentViewRow) => void; onDrill: (row: CurrentViewRow) => void;
  onHistory?: (row: CurrentViewRow) => void; onPaShare?: (row: CurrentViewRow) => void; onAction?: (row: CurrentViewRow) => void;
  onShare: (metric?: Metric) => void; onExport: (metric: Metric) => void;
};
const EMPTY_DATASETS = new Map<number, Dataset>();
const dateLabel = (value: string) => value.split('-').reverse().join('/');
function Money({ value, large = false }: { value: number | null; large?: boolean }) {
  if (value == null) return <span className={styles.missing} aria-label="Não disponível">—</span>;
  const formatted = money(value);
  return <span className={styles.money} style={large ? { fontSize: `clamp(16px, ${Math.min(12, 145 / formatted.length)}cqi, 30px)` } : undefined}>{formatted}</span>;
}
function Badge({ value }: { value: number | null }) {
  const band = attainmentBand(value);
  return <span className={styles.badge} data-attainment={band.key} title={band.label}>{value == null ? 'Sem avaliação' : percent(value)}</span>;
}
function Balance({ value }: { value: ReturnType<typeof goalVariance> }) {
  return <span className={styles.balance} data-variance={value.kind} aria-label={`${value.label}: ${money(value.value)}`}>
    {['growth', 'gap'].includes(value.kind) && <span aria-hidden="true">{value.kind === 'growth' ? '+' : '−'}</span>}
    <Money value={value.value} />
  </span>;
}
function Headline({ model }: { model: CurrentViewModel }) {
  const effort = analysisEffort(model.rows, model.summary);
  return <dl className={styles.kpis} aria-label={`Indicadores de ${model.label}`}>
    <div><dt>Meta do período</dt><dd data-field="target"><Money value={model.summary.target} large /></dd><small>{model.periodLabel}</small></div>
    <div data-kpi-attainment={attainmentBand(model.attainment).key}><dt>Realizado até o corte</dt><dd><span data-field="actual"><Money value={model.summary.actual} large /></span><Badge value={model.attainment} /></dd><small>{model.phaseLabel}</small></div>
    <div><dt title="Diferença entre a soma das metas e a soma do realizado. As superações compensam os déficits de outras unidades.">{model.variance.kind === 'growth' ? 'Superação consolidada' : 'GAP consolidado'}</dt><dd data-field="variance"><Money value={model.variance.value} large /></dd><small>Compensa as superações da seleção</small></div>
    <div><dt>Projeção do período</dt><dd data-field="projected"><Money value={model.summary.projected} large /></dd><small>{percent(model.summary.projectedAttainment)} da meta · estimativa</small><small>GAP projetado: <Money value={effort.projectedGap} /></small></div>
  </dl>;
}

export default function CombinedPortfolio({ dataset, filters, models: suppliedModels, ownerId, expandRequest, controls, mode = 'units', unitLayout = 'period', onMatrixShare, years = [], sessionDatasets = EMPTY_DATASETS, simulationUplift, onUplift, onAnalysisTab, onPriority, onComparisonShare, onSimulationShare, shareRequest, onSelect, onDrill, onHistory, onPaShare, onAction, onShare, onExport }: CombinedPortfolioProps) {
  const models = useMemo(() => suppliedModels ?? buildCurrentViewModels({ dataset, filters }), [suppliedModels, dataset, filters]);
  const [expandedPas, setExpandedPas] = useState<string[]>([]);
  const [visitedModes, setVisitedModes] = useState<AnalysisTab[]>([mode]);
  useEffect(() => { setVisitedModes(previous => previous.includes(mode) ? previous : [...previous, mode]); }, [mode]);
  const visited = (tab: AnalysisTab) => mode === tab || visitedModes.includes(tab);
  const firstPopulated = models.find(model => model.count)?.metric;
  const navigate = (tab: AnalysisTab) => onAnalysisTab?.(tab);
  return <section id={mode === 'periods' ? 'resultados-por-periodo' : undefined} className={styles.combined} aria-label="Venda Nova e Arrecadação" data-analysis-mode={mode}>
    {mode === 'units' && controls}
    {models.map(model => {
      const baseline = visited('simulation') ? summarize(model.rows.map(row => analyze(row, { year: dataset.year, month: model.filters.month, period: model.filters.period, uplift: 0 }))) : null;
      const effort = visited('simulation') ? analysisEffort(model.rows, model.summary) : null;
      const scopeFilters: ScenarioFilters = { ...model.filters, central: model.filters.central ?? 'all', coop: model.filters.coop ?? 'all', group: model.filters.group ?? 'all', search: model.filters.search ?? '', status: model.filters.status ?? 'all', unitIds: model.unitIds };
      const togglePas = (row: CurrentViewRow) => {
        const key = `${model.metric}:${row.key}`;
        setExpandedPas(previous => previous.includes(key) ? previous.filter(value => value !== key) : [...previous, key]);
      };
      const shareMatrixUnit = (row: CurrentViewRow) => {
        if (!onMatrixShare) return;
        const entity = model.units[model.rows.findIndex(value => value.key === row.key)];
        if (!entity) return;
        const selected = buildCurrentViewModels({ dataset, filters: { ...model.filters, unitIds: [entity.id] } })[0];
        if (selected?.count) onMatrixShare(selected);
      };
      const expandedContent = (row: CurrentViewRow) => <PaTable dataset={dataset} filters={{ ...scopeFilters, central: row.central, coop: `${row.central}:${row.cooperative}`, pa: 'all', search: '', status: 'all', unitIds: undefined }} expanded onToggle={() => togglePas(row)} onSelect={onSelect} onHistory={onHistory} onShare={onPaShare ? () => onPaShare(row) : undefined} onOpenCadence={() => onDrill(row)} />;
      return <section className={styles.portfolio} key={model.metric} aria-label={`Carteira ${model.label}`} data-portfolio={model.metric} data-unit-layout={unitLayout}>
        <header className={styles.heading}><div><h2>{model.label}</h2><p>{model.periodLabel} · {model.count} {model.level === 'central' ? model.count === 1 ? 'central' : 'centrais' : model.level === 'pa' ? model.count === 1 ? 'PA' : 'PAs' : model.count === 1 ? 'cooperativa' : 'cooperativas'}</p><p className={styles.cutoff}>{model.cutoff ? model.cutoffMin && model.cutoffMin !== model.cutoff ? `Cortes: ${dateLabel(model.cutoffMin)} a ${dateLabel(model.cutoff)}` : `Corte: ${dateLabel(model.cutoff)}` : 'Sem data de atualização'} · {model.phaseLabel}</p></div>
          {(mode === 'overview' || mode === 'units') && <div className={styles.actions}><button type="button" className="button secondary" disabled={!model.count || (mode === 'units' && unitLayout === 'matrix' && !onMatrixShare)} onClick={() => mode === 'units' && unitLayout === 'matrix' ? onMatrixShare?.(model) : onShare(model.metric)}><Share2 size={16} aria-hidden="true" />Compartilhar {model.label}</button><button type="button" className="button quiet" disabled={!model.count} onClick={() => onExport(model.metric)}><Download size={16} aria-hidden="true" />Exportar {model.label}</button></div>}
          {mode === 'simulation' && onSimulationShare && <button type="button" className="button secondary" disabled={!model.count} onClick={() => onSimulationShare(model)}><Share2 size={16} aria-hidden="true" />Compartilhar cenário</button>}
        </header>
        <div hidden={mode !== 'overview'}>{visited('overview') && <>
          <Headline model={model} />
          <div className={styles.overview}><ManagementPriorities analyses={model.rows} onViewUnits={action => { if (onPriority) onPriority(action, model.metric); else navigate('units'); }} /><OverviewUnits rows={model.rows} onAnalyze={onSelect} onAll={() => navigate('units')} /></div>
        </>}</div>
        <div hidden={mode !== 'units'}>{visited('units') && (model.count ? <>
          {unitLayout === 'matrix' ? <div className={styles.matrixLayout}><UnitScenarioMatrix rows={model.rows} year={dataset.year} month={model.filters.month} metric={model.metric} onAnalyze={onSelect} onHistory={onHistory} onShare={onMatrixShare ? shareMatrixUnit : undefined} onAction={onAction} onExpand={model.level === 'cooperative' ? togglePas : undefined} expandedKeys={model.rows.filter(row => expandedPas.includes(`${model.metric}:${row.key}`)).map(row => row.key)} renderExpanded={model.level === 'cooperative' ? expandedContent : undefined} /></div> :
          <div className={styles.tableScroll}><table role="table" aria-label={`Unidades de ${model.label}`}>
            <thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">Unidade</th><th role="columnheader" scope="col">Meta</th><th role="columnheader" scope="col">Realizado</th><th role="columnheader" scope="col">Atingimento</th><th role="columnheader" scope="col">GAP / Superação</th><th role="columnheader" scope="col">Projeção</th><th role="columnheader" scope="col">Ações</th></tr></thead>
            <tbody role="rowgroup">{model.rows.map((row, index) => {
              const entity = model.units[index], variance = goalVariance(row.actual, row.target, row.complete && !row.annualConflict), paKey = `${model.metric}:${row.key}`, expanded = expandedPas.includes(paKey);
              const togglePas = () => setExpandedPas(keys => keys.includes(paKey) ? keys.filter(key => key !== paKey) : [...keys, paKey]);
              return <Fragment key={row.key}><tr role="row" data-unit-id={entity.id} data-metric={model.metric}>
                <th role="rowheader" scope="row"><button className={styles.unitButton} type="button" onClick={() => onSelect(row)}>{entity.kind === 'central' ? `Central ${entity.central}` : entity.kind === 'pa' ? `PA ${entity.pa}` : `Cooperativa ${entity.cooperative}`} · {row.name}</button><small>{entity.kind !== 'central' ? `Central ${entity.central}${entity.kind === 'pa' ? ` · Cooperativa ${entity.cooperative}` : ''} · ` : ''}{row.status}</small></th>
                <td role="cell" className={styles.numeric} data-label="Meta"><span data-field="target"><Money value={row.target} /></span></td>
                <td role="cell" className={styles.numeric} data-label="Realizado"><span data-field="actual"><Money value={row.actual} /></span></td>
                <td role="cell" className={styles.numeric} data-label="Atingimento"><span data-field="attainment"><Badge value={row.complete && !row.annualConflict ? row.attainment : null} /></span></td>
                <td role="cell" className={styles.numeric} data-label="GAP / Superação"><span data-field="variance"><Balance value={variance} /></span></td>
                <td role="cell" className={styles.numeric} data-label="Projeção" title={`Estimativa de fechamento de ${model.periodLabel}`}><span data-field="projected"><Money value={row.projected} /></span></td>
                <td role="cell" className={styles.actionCell} data-label="Ações"><div className={styles.rowActions}><button type="button" className="button quiet" onClick={() => onSelect(row)}>{model.level === 'pa' ? 'Analisar PA' : model.level === 'central' ? 'Analisar central' : 'Analisar cooperativa'}</button>{model.level === 'central' ? <button type="button" className="button quiet" onClick={() => onDrill(row)}>Ver cooperativas</button> : model.level === 'cooperative' ? <button type="button" className="button quiet" aria-expanded={expanded} onClick={togglePas}>{expanded ? 'Fechar PAs' : 'Ver PAs'}</button> : onHistory && <button type="button" className="button quiet" onClick={() => onHistory(row)}>Ver histórico</button>}</div></td>
              </tr>{model.level === 'cooperative' && expanded && <tr className={styles.expandedRow}><td colSpan={7}>{expandedContent(row)}</td></tr>}</Fragment>;
            })}</tbody>
          </table></div>}<div className={styles.legend}><AttainmentLegend /></div>
        </> : <p className={styles.empty}>Nenhuma unidade de {model.label} no recorte atual. Ajuste os filtros para continuar.</p>)}</div>
        <div hidden={mode !== 'periods'}>{visited('periods') && <PeriodPerformance dataset={dataset} filters={model.filters} unitIds={model.unitIds} ownerId={ownerId} sectionId={`resultados-por-periodo-${model.metric.toLowerCase()}`} standalone initialExpanded expandRequest={expandRequest || undefined} shareRequest={mode === 'periods' && model.metric === firstPopulated ? shareRequest : undefined} />}</div>
        <div hidden={mode !== 'comparison'}>{visited('comparison') && <YearComparison dataset={dataset} filters={scopeFilters} owner={ownerId ?? null} years={years} sessionDatasets={sessionDatasets} standalone initialExpanded onShare={onComparisonShare ? (comparison, previousYear) => onComparisonShare(comparison, previousYear, model) : undefined} />}</div>
        <div hidden={mode !== 'simulation'}>{visited('simulation') && baseline && effort && <AnalysisSimulation baseline={baseline} simulated={model.summary} uplift={simulationUplift ?? model.filters.uplift} onChange={value => onUplift?.(value)} period={model.periodLabel} days={effort.remainingDays} daily={effort.daily} monthly={effort.monthly} />}</div>
      </section>;
    })}
  </section>;
}
