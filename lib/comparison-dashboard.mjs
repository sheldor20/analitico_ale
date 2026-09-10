/** Presentation-only aggregation of compareYears output; never persists or edits datasets. */
const finite = value => typeof value === 'number' && Number.isFinite(value);
const cents = value => Math.round(value * 100);
const total = values => values.length && values.every(finite)
  ? values.reduce((sum, value) => sum + cents(value), 0) / 100 : null;
const delta = (current, previous) => finite(current) && finite(previous)
  ? (cents(current) - cents(previous)) / 100 : null;
function sideSummary(rows, side, fullYear) {
  const present = rows.map(row => row[side]).filter(Boolean);
  const actual = total(present.map(row => row.actual));
  const target = total(present.map(row => row.target));
  const inconsistent = fullYear && present.some(row => {
    const monthly = total(row.targets ?? []);
    return row.annualConflict || (monthly != null && finite(row.annualTarget) && Math.abs(monthly - row.annualTarget) > 0.011);
  });
  return {
    count: present.length,
    observed: present.filter(row => finite(row.actual)).length,
    actual, target, inconsistent,
    attainment: !inconsistent && actual != null && target > 0 ? actual / target : null,
    gap: actual != null && target != null ? Math.max(0, delta(target, actual)) : null,
  };
}
export function comparisonDashboard(comparison) {
  const rows = comparison.available ? comparison.rows : [];
  const fullYear = comparison.first === 0 && comparison.last === 11;
  const current = sideSummary(rows, 'current', fullYear);
  const previous = sideSummary(rows, 'previous', fullYear);
  const productionDelta = delta(current.actual, previous.actual);
  const growth = productionDelta != null && previous.actual > 0 ? productionDelta / previous.actual : null;
  const attainmentDelta = current.attainment != null && previous.attainment != null
    ? (current.attainment - previous.attainment) * 100 : null;
  const months = comparison.available ? Array.from({ length: comparison.last - comparison.first + 1 }, (_, index) => {
    const month = comparison.first + index;
    return {
      month,
      current: total(rows.map(row => row.current).filter(Boolean).map(row => row.actuals[month])),
      previous: total(rows.map(row => row.previous).filter(Boolean).map(row => row.actuals[month])),
    };
  }) : [];
  return { current, previous, productionDelta, growth, attainmentDelta, months,
    compositionChanged: rows.some(row => row.membership !== 'both') };
}
/** A shared linear domain includes zero and negative adjustments, with no divide by zero. */
export function chartDomain(values) {
  const numbers = values.filter(finite);
  const min = Math.min(0, ...numbers), max = Math.max(0, ...numbers);
  return { min, max: max === min ? min + 1 : max };
}
export function signedBar(value, domain) {
  if (!finite(value)) return null;
  const scale = input => (input - domain.min) / (domain.max - domain.min) * 100;
  const zero = scale(0), end = scale(value);
  return { left: Math.min(zero, end), width: Math.abs(end - zero), zero };
}
