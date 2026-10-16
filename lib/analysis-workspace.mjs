/** Presentation facts derived from the validated engine; never mutate its totals. */
export function analysisEffort(rows, summary) {
  const comparable = rows.length > 0 && rows.every(row => row.complete && !row.annualConflict);
  const days = [...new Set(rows.map(row => row.remainingDays))];
  const months = [...new Set(rows.map(row => row.remainingMonths))];
  const sameDeadline = comparable && days.length === 1 && months.length === 1;
  const remainingDays = sameDeadline ? days[0] : null;
  const remainingMonths = sameDeadline ? months[0] : null;
  return {
    remainingDays, remainingMonths, sameDeadline,
    daily: sameDeadline && summary.gap != null && remainingDays > 0 ? summary.gap / remainingDays : summary.gap === 0 ? 0 : null,
    monthly: sameDeadline && summary.gap != null && remainingMonths > 0 ? summary.gap / remainingMonths : summary.gap === 0 ? 0 : null,
    projectedGap: comparable && summary.target != null && summary.projected != null ? Math.max(0, summary.target - summary.projected) : null,
  };
}

/** Move between hierarchy scenarios using identities, never a parent-name search on children. */
export function relatedScenarioIds(rows, cohort, kind, metric) {
  const source = kind === 'pa' ? 'cadence' : 'base';
  return [...new Set(rows.filter(row => row.source === source && row.metric === metric
    && (kind !== 'cooperative' || !!row.cooperative)
    && (kind !== 'pa' || row.pa != null)
    && cohort.some(parent => String(row.central) === String(parent.central)
      && (!parent.cooperative || String(row.cooperative) === String(parent.cooperative))
      && (kind !== 'pa' || parent.pa == null || String(row.pa) === String(parent.pa))))
    .map(row => `${kind}:${row.central}${kind !== 'central' ? `:${row.cooperative}` : ''}${kind === 'pa' ? `:${row.pa}` : ''}`))];
}
