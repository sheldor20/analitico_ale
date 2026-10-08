import type { PerformanceRow } from './period-performance.mjs';

export type PerformanceOrder = 'chronological' | 'attainment-desc' | 'attainment' | 'production' | 'gap' | 'growth' | 'projected';
export const PERIOD_ORDER_OPTIONS: Readonly<Record<PerformanceOrder, string>>;
export function sortPerformancePeriods<T extends PerformanceRow>(rows: readonly T[], order?: PerformanceOrder): T[];
