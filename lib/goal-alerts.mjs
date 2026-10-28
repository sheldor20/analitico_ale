import { aggregate, analyze, money, percent, MONTHS } from './analytics.mjs';
import { analysisRows, entityId } from './registry.mjs';
import { PERIOD_OPTIONS, periodTitle } from './periods.mjs';

/** Latest observed month, not the computer clock or a future planned month. */
export function defaultGoalAlertMonth(dataset) {
  return (dataset?.rows || []).reduce((latest, row) => {
    const last = /^\d{4}-\d{2}-\d{2}$/.test(row.cutoff || '') && Number(row.cutoff.slice(0, 4)) === dataset.year
      ? Number(row.cutoff.slice(5, 7)) - 1 : -1;
    return row.actuals.reduce((found, actual, month) => Number.isFinite(actual) && month <= last ? Math.max(found, month) : found, latest);
  }, 0);
}

/** Recomputed from observed production only; callers own calendar/reference selection. */
export function buildPeriodGoalAlerts(dataset, {period = 'month', month = defaultGoalAlertMonth(dataset)} = {}) {
  if (!dataset || !Object.hasOwn(PERIOD_OPTIONS, period) || !Number.isInteger(month) || month < 0 || month > 11) return [];
  // A period has one identity even when selected through a different month inside it.
  if (period === 'quarter') month = Math.floor(month / 3) * 3 + 2;
  if (period === 'semester') month = Math.floor(month / 6) * 6 + 5;
  if (period === 'annual') month = 11;
  const rows = analysisRows(dataset);
  const base = rows.filter((row) => row.source === 'base');
  const groups = [
    ...aggregate(base, 'central').map((row) => ({ row, kind: 'central' })),
    ...aggregate(base.filter((row) => row.cooperative), 'cooperative').map((row) => ({ row, kind: 'cooperative' })),
    ...aggregate(rows.filter((row) => row.source === 'cadence' && row.pa != null), 'pa').map((row) => ({ row, kind: 'pa' })),
  ];
  const labels = new Map((dataset.registry?.entities || []).map((entity) => [entity.id, entity.name]));
  const cents = (value) => Math.round((value + Number.EPSILON) * 100);
  return groups.flatMap(({ row, kind }) => {
    if (!['VN', 'AR'].includes(row.metric) || !String(row.cutoff).startsWith(`${dataset.year}-`)) return [];
    const result = analyze(row, { year: dataset.year, month, period });
    if (!result.complete || result.annualConflict || !Number.isFinite(result.target) || cents(result.target) <= 0 || !Number.isFinite(result.actual) || cents(result.actual) < cents(result.target)) return [];
    const entity = { kind, central: row.central, name: row.name,
      ...(kind === 'central' ? {} : { cooperative: row.cooperative }),
      ...(kind === 'pa' ? { pa: String(row.pa) } : {}) };
    entity.id = entityId(entity);
    entity.name = labels.get(entity.id) || entity.name;
    const key = period === 'month' ? `${dataset.year}:${month + 1}:${entity.id}:${row.metric}` : `${dataset.year}:${period}:${month + 1}:${entity.id}:${row.metric}`;
    return [{ key, year: dataset.year, month, period, periodLabel: periodTitle(period,month,dataset.year), periodStart:result.start, periodEnd:result.end,
      entity, centralName: labels.get(`central:${row.central}`) || row.centralName || (kind === 'central' ? entity.name : ''), metric: row.metric, metricLabel: row.metric === 'AR' ? 'Arrecadação' : 'Venda nova',
      target: cents(result.target) / 100, actual: cents(result.actual) / 100,
      attainment: result.actual / result.target, cutoff: row.cutoff < result.end ? row.cutoff : result.end,
      cutoffMin: row.cutoffMin && row.cutoffMin < result.end ? row.cutoffMin : row.cutoff < result.end ? row.cutoff : result.end,
    }];
  }).sort((a, b) => a.entity.kind.localeCompare(b.entity.kind) || a.entity.name.localeCompare(b.entity.name, 'pt-BR') || a.metric.localeCompare(b.metric));
}

/** Existing monthly callers and saved monthly keys remain unchanged. */
export function buildMonthlyGoalAlerts(dataset, month = defaultGoalAlertMonth(dataset)) {
  return buildPeriodGoalAlerts(dataset,{period:'month',month});
}

export function goalAchievementMessage(alert) {
  const name = String(alert.entity.name).replace(/[\r\n*_~`]/g, ' ').trim();
  const monthly = !alert.period || alert.period === 'month';
  const label = monthly ? `${MONTHS[alert.month]}/${alert.year}` : alert.periodLabel || periodTitle(alert.period,alert.month,alert.year);
  return `${name}: meta de ${alert.metricLabel.toLowerCase()} atingida em ${label}!\nMeta ${monthly ? 'do mês' : 'do período'}: ${money(alert.target)}\nRealizado: ${money(alert.actual)} (${percent(alert.attainment)})\nDados até ${alert.cutoff.split('-').reverse().join('/')}.\nParabéns à equipe pelo resultado!`;
}
