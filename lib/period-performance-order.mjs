export const PERIOD_ORDER_OPTIONS = Object.freeze({
  chronological: 'Ordem cronológica',
  'attainment-desc': 'Maior atingimento',
  attainment: 'Menor atingimento',
  production: 'Maior realizado',
  gap: 'Maior GAP',
  growth: 'Maior superação',
  projected: 'Maior projeção',
});

function measure(row, order) {
  if (order === 'gap' || order === 'growth') {
    if (row.variance.kind === 'unknown') return null;
    return row.variance.kind === order ? row.variance.value : 0;
  }
  return row[order.startsWith('attainment') ? 'attainment' : order === 'production' ? 'actual' : 'projected'];
}

/** Sort one period group without changing its rows, metrics or membership. */
export function sortPerformancePeriods(rows, order = 'chronological') {
  const chronological = (left, right) => left.month - right.month;
  if (order === 'chronological' || !Object.hasOwn(PERIOD_ORDER_OPTIONS, order)) return [...rows].sort(chronological);
  return [...rows].sort((left, right) => {
    const a = measure(left, order), b = measure(right, order);
    if (!Number.isFinite(a)) return Number.isFinite(b) ? 1 : chronological(left, right);
    if (!Number.isFinite(b)) return -1;
    return (order === 'attainment' ? a - b : b - a) || chronological(left, right);
  });
}
