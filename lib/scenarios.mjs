import { aggregate, analyze, periodBounds, targetPolicyFor } from './analytics.mjs';
import { analysisRows, initializeRegistry } from './registry.mjs';

export const SORT_OPTIONS = Object.freeze({ gap: 'Maior GAP', attainment: 'Menor atingimento', 'attainment-desc': 'Maior atingimento', production: 'Maior produção', name: 'Nome / código' });
const valid = value => typeof value === 'number' && Number.isFinite(value);
/** Null always sorts last, including negative production. Never mutates the input. */
export function sortAnalysis(rows, order = 'gap') {
  return [...rows].sort((a, b) => {
    const tie = String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { numeric: true }) || String(a.key || '').localeCompare(String(b.key || ''));
    if (order === 'name') return tie;
    const field = order === 'production' ? 'actual' : order.startsWith('attainment') ? 'attainment' : 'gap';
    const av = field === 'gap' ? a.projectionGap ?? a.gap : a[field];
    const bv = field === 'gap' ? b.projectionGap ?? b.gap : b[field];
    if (!valid(av)) return !valid(bv) ? tie : 1;
    if (!valid(bv)) return -1;
    return (order === 'attainment' ? av - bv : bv - av) || tie;
  });
}
export function matchesStatus(row, status = 'all') {
  return status === 'all' || (status === 'attention' ? ['Atenção', 'Prazo encerrado'].includes(row.status) : status === 'missing' ? !row.complete || row.status === 'Sem meta' : ['Em rota', 'Meta atingida'].includes(row.status));
}
const matchesScope = (row, filters) => (filters.central === 'all' || !filters.central || row.central === filters.central) && (filters.coop === 'all' || !filters.coop || `${row.central}:${row.cooperative}` === filters.coop);
const matchesText = (row, search = '') => `${row.name || ''} ${row.cooperative || ''} ${row.pa ?? ''}`.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'));
const optionsFor = (dataset, filters) => ({ year: dataset.year, month: filters.month ?? 0, period: filters.period || 'month', uplift: filters.uplift || 0 });
export function scopedAnalyses(dataset, filters = {}) {
  const source = filters.source || 'base';
  const metric = source === 'cadence' ? 'VN' : filters.metric || 'VN';
  const rows = analysisRows(dataset).filter(row => row.source === source && row.metric === metric && matchesScope(row, filters) && (!filters.group || filters.group === 'all' || row.group === filters.group));
  return aggregate(rows, source === 'cadence' ? 'pa' : filters.level || 'cooperative').map(row => analyze(row, optionsFor(dataset, filters)));
}
/** Registry membership is annual. No PA production is added to cooperative totals. */
export function networkSummary(dataset, filters = {}) {
  const registry = initializeRegistry(dataset).registry.entities;
  let entities = registry.filter(entity => matchesScope(entity, filters));
  const selected = scopedAnalyses(dataset, filters).filter(row => matchesText(row, filters.search) && matchesStatus(row, filters.status));
  const keys = new Set(selected.map(row => filters.source === 'cadence' ? `pa:${row.central}:${row.cooperative}:${row.pa}` : filters.level === 'central' ? `central:${row.central}` : `cooperative:${row.central}:${row.cooperative}`));
  if (filters.search || (filters.status && filters.status !== 'all')) entities = entities.filter(entity => keys.has(`central:${entity.central}`) || keys.has(`cooperative:${entity.central}:${entity.cooperative}`) || keys.has(entity.id));
  if (filters.source === 'cadence' && filters.group && filters.group !== 'all') {
    const pas = entities.filter(entity => entity.kind === 'pa' && entity.group === filters.group);
    const parents = new Set(pas.flatMap(entity => [`central:${entity.central}`, `cooperative:${entity.central}:${entity.cooperative}`]));
    entities = entities.filter(entity => entity.kind === 'pa' ? entity.group === filters.group : parents.has(entity.id));
  }
  // Include ancestors after PA-level search/status filtering without adding siblings.
  const paIds = new Set(entities.filter(entity => entity.kind === 'pa').map(entity => entity.id));
  const coopIds = new Set(entities.filter(entity => entity.kind === 'cooperative').map(entity => entity.id));
  entities.filter(entity => entity.kind === 'pa').forEach(entity => coopIds.add(`cooperative:${entity.central}:${entity.cooperative}`));
  const centralIds = new Set(entities.map(entity => entity.central));
  const allRows = analysisRows(dataset);
  const pas = aggregate(allRows.filter(row => row.source === 'cadence' && paIds.has(`pa:${row.central}:${row.cooperative}:${row.pa}`)), 'pa').map(row => analyze(row, optionsFor(dataset, filters)));
  const coops = aggregate(allRows.filter(row => row.source === 'base' && row.metric === (filters.metric || 'VN') && coopIds.has(`cooperative:${row.central}:${row.cooperative}`)), 'cooperative').map(row => analyze(row, optionsFor(dataset, filters)));
  const centrals = aggregate(allRows.filter(row => row.source === 'base' && row.metric === (filters.metric || 'VN') && centralIds.has(row.central) && (coopIds.has(`cooperative:${row.central}:${row.cooperative}`) || !row.cooperative)), 'central').map(row => analyze(row, optionsFor(dataset, filters)));
  const achieved = rows => rows.filter(row => row.complete && !row.annualConflict && row.target > 0 && row.attainment >= 1).length;
  const unknown = rows => rows.filter(row => !row.complete || row.target == null || row.target <= 0 || row.annualConflict).length;
  return { cooperativeCount: coopIds.size, paCount: paIds.size, centralCount: centralIds.size, cooperativeAchieved: achieved(coops), paAchieved: achieved(pas), centralAchieved: achieved(centrals), paUnknown: unknown(pas), cooperativeUnknown: unknown(coops), pas };
}

const lastClosedMonth = row => {
  const year = Number(row.cutoff?.slice(0, 4)), month = Number(row.cutoff?.slice(5, 7)) - 1;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  if (!Number.isInteger(month) || month < 0 || month > 11) return -1;
  return Number(row.cutoff.slice(8, 10)) === lastDay ? month : month - 1;
};
const identity = (row, level) => level === 'central' ? `central:${row.central}` : level === 'pa' ? `pa:${row.central}:${row.cooperative}:${row.pa}` : `cooperative:${row.central}:${row.cooperative}`;
function measured(row, year, first, last) {
  const policy = targetPolicyFor(row);
  const months = Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i);
  const total = values => values.length && values.every(valid) ? Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100 : null;
  const actual = total(months.map(m => m <= lastClosedMonth(row) ? row.actuals[m] : null));
  const target = first === 0 && last === 11 ? policy.annualTarget : total(months.map(m => policy.targets[m]));
  const attainment = actual != null && target > 0 ? actual / target : null;
  return { ...row, actual, target, attainment, gap: actual != null && target != null ? Math.max(0, target - actual) : null, projectionGap: null, year, complete: actual != null, status: actual == null ? 'Sem realizado' : target == null || target <= 0 ? 'Sem meta' : actual >= target ? 'Meta atingida' : 'Prazo encerrado' };
}
/** Compare identical CLOSED months. Partial months are never reconstructed from monthly snapshots. */
export function compareYears(current, previous, filters = {}, commonOnly = false) {
  if (current.year === previous.year) throw new Error('Selecione dois anos diferentes.');
  const level = filters.source === 'cadence' ? 'pa' : filters.level || 'cooperative';
  const raw = dataset => {
    const source = filters.source || 'base';
    const rows = analysisRows(dataset).filter(row => row.source === source && row.metric === (source === 'cadence' ? 'VN' : filters.metric || 'VN') && matchesScope(row, filters) && (!filters.group || filters.group === 'all' || row.group === filters.group));
    return aggregate(rows, level);
  };
  const a = raw(current), b = raw(previous);
  const range = periodBounds(current.year, filters.month ?? 0, filters.period || 'month');
  const closed = rows => rows.length ? Math.min(...rows.map(row => lastClosedMonth({ ...row, cutoff: row.cutoffMin || row.cutoff }))) : -1;
  const last = Math.min(range.last, closed(a), closed(b));
  const am = new Map(a.map(row => [identity(row, level), measured(row, current.year, range.first, last)]));
  const bm = new Map(b.map(row => [identity(row, level), measured(row, previous.year, range.first, last)]));
  const rows = [...new Set([...am.keys(), ...bm.keys()])].map(key => {
    const currentRow = am.get(key) || null, previousRow = bm.get(key) || null;
    const visible = currentRow || previousRow;
    const comparable = !!currentRow && !!previousRow && currentRow.actual != null && previousRow.actual != null && last >= range.first;
    return { key, name: visible.name, current: currentRow, previous: previousRow, membership: currentRow && previousRow ? 'both' : currentRow ? 'current' : 'previous', delta: comparable ? currentRow.actual - previousRow.actual : null, growth: comparable && previousRow.actual > 0 ? (currentRow.actual - previousRow.actual) / previousRow.actual : null, attainmentDelta: comparable && currentRow.attainment != null && previousRow.attainment != null ? (currentRow.attainment - previousRow.attainment) * 100 : null, actual: currentRow?.actual ?? null, attainment: currentRow?.attainment ?? null, gap: currentRow?.gap ?? null };
  }).filter(row => (!commonOnly || row.membership === 'both') && matchesText(row.current || row.previous, filters.search) && matchesStatus(row.current || row.previous, filters.status));
  return { first: range.first, last, available: last >= range.first && filters.period !== 'daily', rows: sortAnalysis(rows, filters.sortBy), currentOnly: rows.filter(row => row.membership === 'current').length, previousOnly: rows.filter(row => row.membership === 'previous').length, common: rows.filter(row => row.membership === 'both').length };
}
