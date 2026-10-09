import { summarize } from './analytics.mjs';
import { analysisIndicators, scopedAnalyses, sortAnalysis, SORT_OPTIONS } from './scenarios.mjs';
import { filterDashboardRows } from './dashboard-view.mjs';
import { entityFromAnalysis } from './portfolio-communication.mjs';
import { goalVariance } from './goal-variance.mjs';
import { periodTitle } from './periods.mjs';

/** One model per portfolio. No production, target or cutoff is combined across metrics. */
export function buildCurrentViewModels({ dataset, filters = {} }) {
  const source = filters.source === 'cadence' ? 'cadence' : 'base';
  const metrics = source === 'cadence' ? ['VN'] : filters.metric === 'both' ? ['VN', 'AR'] : [filters.metric === 'AR' ? 'AR' : 'VN'];
  const level = source === 'cadence' ? 'pa' : filters.level === 'central' ? 'central' : 'cooperative';
  return metrics.map(metric => {
    const ids = filters.unitIdsByMetric?.[metric] ?? filters.unitIds;
    const scopedFilters = { ...filters, source, metric, level, pa: source === 'cadence' ? filters.pa || 'all' : 'all', month: filters.month ?? 0, period: filters.period || 'month', uplift: filters.uplift ?? 0, sortBy: Object.hasOwn(SORT_OPTIONS, filters.sortBy || '') ? filters.sortBy : 'attainment-desc' };
    delete scopedFilters.unitIdsByMetric;
    if (ids !== undefined) scopedFilters.unitIds = ids;
    if (ids !== undefined && (!Array.isArray(ids) || ids.some(id => typeof id !== 'string'))) throw new Error('A seleção de unidades é inválida.');
    const selected = ids === undefined ? null : new Set(ids);
    const analyses = scopedAnalyses(dataset, scopedFilters);
    const visible = filterDashboardRows(analyses, scopedFilters.search || '', scopedFilters.status || 'all')
      .filter(row => !selected || selected.has(entityFromAnalysis(row).id));
    const rows = sortAnalysis(analysisIndicators(visible, { year: dataset.year, month: scopedFilters.month, period: scopedFilters.period, uplift: scopedFilters.uplift }), scopedFilters.sortBy);
    const summary = summarize(rows), hasGoalConflict = rows.some(row => row.annualConflict);
    const units = rows.map(entityFromAnalysis);
    const dates = [...new Set(rows.filter(row => row.actuals.some(value => value != null)).flatMap(row => [row.cutoffMin || row.cutoff, row.cutoff]))].sort();
    const phaseLabel = !rows.length || rows.every(row => row.actual == null) ? 'Sem realizado' : hasGoalConflict ? 'Metas divergentes' : summary.actual == null || rows.some(row => !row.complete) ? 'Dados incompletos' : rows.every(row => row.phase === 'Fechado') ? 'Fechado' : 'Parcial';
    return {
      metric, label: metric === 'AR' ? 'Arrecadação' : 'Venda Nova', filters: scopedFilters,
      rows, summary, unitIds: units.map(unit => unit.id), units, count: units.length, level,
      periodLabel: periodTitle(scopedFilters.period, scopedFilters.month, dataset.year),
      cutoffMin: dates[0] ?? null, cutoff: dates.at(-1) ?? null, hasGoalConflict,
      attainment: hasGoalConflict ? null : summary.attainment,
      variance: goalVariance(summary.actual, summary.target, summary.gap != null && !hasGoalConflict), phaseLabel,
    };
  });
}
