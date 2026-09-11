import { matchesStatus } from './scenarios.mjs';
/** The same text/status scope drives the list and its headline metrics. */
export function filterDashboardRows(rows, search = '', status = 'all') {
  const query = search.trim().toLocaleLowerCase('pt-BR');
  return rows.filter(row => `${row.name || ''} ${row.cooperative || ''} ${row.pa ?? ''}`.toLocaleLowerCase('pt-BR').includes(query) && matchesStatus(row, status));
}
/** Central totals are never added to their children; PA zero is a valid identity. */
export function visibleLeafRows(leaves, displayed, level) {
  const key = row => level === 'central' ? row.central : level === 'pa'
    ? `${row.central}:${row.cooperative}:${row.pa}` : `${row.central}:${row.cooperative}`;
  const selected = new Set(displayed.map(key));
  return leaves.filter(row => selected.has(key(row)));
}
export function effortLabel(requiredDaily, gap, formatMoney) {
  if (gap === 0) return 'Meta do período atingida';
  if (requiredDaily == null || !Number.isFinite(requiredDaily)) return 'Sem estimativa diária disponível';
  return `${formatMoney(requiredDaily)} por dia útil restante`;
}
