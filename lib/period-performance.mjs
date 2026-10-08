import { analyze, summarize } from './analytics.mjs';
import { scopedAnalyses } from './scenarios.mjs';
import { entityFromAnalysis } from './portfolio-communication.mjs';
import { goalVariance } from './goal-variance.mjs';

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const GROUPS = [
  { period: 'month', title: 'Resultados mensais', labels: MONTH_NAMES, months: Array.from({ length: 12 }, (_, month) => month) },
  { period: 'quarter', title: 'Resultados trimestrais', labels: ['1º trimestre', '2º trimestre', '3º trimestre', '4º trimestre'], months: [2, 5, 8, 11] },
  { period: 'semester', title: 'Resultados semestrais', labels: ['1º semestre', '2º semestre'], months: [5, 11] },
  { period: 'annual', title: 'Resultado anual', labels: ['Ano completo'], months: [11] },
];

function periodResult(rows, { year, uplift, period, month, label }) {
  const analyses = rows.map((row) => analyze(row, { year, uplift, period, month }));
  const totals = summarize(analyses);
  const complete = analyses.length > 0 && analyses.every((row) => row.complete);
  const annualConflict = analyses.some((row) => row.annualConflict);
  const range = analyses[0];
  const future = analyses.length > 0 && analyses.every((row) => row.cutoff < row.start);
  const closed = analyses.length > 0 && analyses.every((row) => row.phase === 'Fechado');
  const dates = [...new Set(analyses.flatMap((row) => [row.cutoffMin || row.cutoff, row.cutoff].map((date) => date < row.end ? date : row.end)))].sort();
  const mixedCutoffs = dates.length > 1;
  const phase = annualConflict ? 'conflict' : future ? 'future' : totals.actual == null ? 'missing' : !complete ? 'incomplete' : closed ? 'closed' : 'partial';
  const phaseLabel = { conflict: 'Metas divergentes', future: 'Após o corte', missing: 'Sem realizado', incomplete: 'Dados incompletos', closed: 'Fechado', partial: 'Parcial' }[phase];
  // Financial values come from the same engine as the current dashboard. A
  // conflicting annual plan remains visible but cannot earn an attainment band.
  return {
    id: `${period}:${month}`, period, month, label,
    start: range?.start ?? null, end: range?.end ?? null,
    target: totals.target, actual: totals.actual,
    attainment: annualConflict ? null : totals.attainment,
    projected: totals.projected, projectedAttainment: annualConflict ? null : totals.projectedAttainment,
    variance: goalVariance(totals.actual, totals.target, totals.gap != null && !annualConflict),
    complete, annualConflict, mixedCutoffs, phase, phaseLabel,
    cutoffMin: dates[0] ?? null, cutoff: dates.at(-1) ?? null,
  };
}

/** Keep the displayed cohort fixed across all periods. Search, status and
 * priority have already selected unitIds; reapplying them per month would
 * compare different units. Source/hierarchy/group still bound the cohort.
 */
export function buildPeriodPerformance({ dataset, filters = {}, unitIds }) {
  if (!dataset || !Number.isInteger(dataset.year) || dataset.year < 2020 || dataset.year > 2100) throw new Error('Ano da análise inválido.');
  if (!Array.isArray(unitIds) || unitIds.some((id) => typeof id !== 'string')) throw new Error('Selecione as unidades dos resultados por período.');
  const source = filters.source === 'cadence' ? 'cadence' : 'base';
  const metric = source === 'cadence' ? 'VN' : filters.metric === 'AR' ? 'AR' : 'VN';
  const level = source === 'cadence' ? 'pa' : filters.level === 'central' ? 'central' : 'cooperative';
  const uplift = filters.uplift ?? 0;
  if (!Number.isFinite(uplift) || uplift < 0 || uplift > 1000) throw new Error('Informe uma aceleração válida para a projeção.');
  const included = new Set(unitIds);
  // Analyze the scoped units once to reuse the shared hierarchy aggregation.
  // Their monthly arrays and target policy then feed each of the 19 periods.
  const rows = scopedAnalyses(dataset, { ...filters, source, metric, level, pa: source === 'cadence' ? filters.pa : 'all', period: 'month', month: 0, uplift })
    .filter((row) => included.has(entityFromAnalysis(row).id));
  const units = rows.map(entityFromAnalysis);
  const cutoffs = [...new Set(rows.flatMap((row) => [row.cutoffMin || row.cutoff, row.cutoff]))].sort();
  const labels = { central: ['central', 'centrais'], cooperative: ['cooperativa', 'cooperativas'], pa: ['PA', 'PAs'] };
  const countLabel = `${units.length} ${labels[level][units.length === 1 ? 0 : 1]}`;
  const single = units.length === 1 ? units[0] : null;
  const scopeLabel = single
    ? `${single.kind === 'central' ? 'Central' : single.kind === 'cooperative' ? 'Cooperativa' : 'PA'} ${single.kind === 'central' ? single.central : single.kind === 'cooperative' ? single.cooperative : single.pa} · ${single.name}`
    : countLabel;
  return {
    year: dataset.year, source, metric, level, count: units.length, countLabel, scopeLabel, units,
    cutoffMin: cutoffs[0] ?? null, cutoff: cutoffs.at(-1) ?? null, uplift,
    groups: GROUPS.map((group) => ({
      period: group.period, title: group.title,
      rows: group.months.map((month, index) => periodResult(rows, { year: dataset.year, uplift, period: group.period, month, label: group.labels[index] })),
    })),
  };
}
