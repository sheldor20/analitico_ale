/** Display-only variance. No mutation of the analytics engine or source data. */
export function goalVariance(actual, target, available = true) {
  if (!available || !Number.isFinite(actual) || !Number.isFinite(target) || target < 0) {
    return { kind: 'unknown', label: 'GAP para a meta', value: null, ratio: null };
  }
  // Compare at currency precision so a fractional cent cannot claim outperformance.
  const delta = (Math.round(actual * 100) - Math.round(target * 100)) / 100;
  return { kind: delta > 0 ? 'growth' : delta < 0 ? 'gap' : 'met',
    label: delta > 0 ? 'Crescimento sobre a meta' : 'GAP para a meta',
    value: Math.abs(delta), ratio: target > 0 ? Math.abs(delta) / target : null };
}
