import type { Dataset, RegistryEntity } from './types';
import type { goalVariance } from './goal-variance.mjs';

export type PerformanceFilters = Partial<{
  central: string; coop: string; pa: string; source: string; metric: string; group: string;
  level: string; period: string; month: number; uplift: number; search: string; status: string;
}>;
export type PerformancePeriod = 'month' | 'quarter' | 'semester' | 'annual';
export type PerformanceRow = {
  id: string; period: PerformancePeriod; month: number; label: string; start: string | null; end: string | null;
  target: number | null; actual: number | null; attainment: number | null;
  projected: number | null; projectedAttainment: number | null; variance: ReturnType<typeof goalVariance>;
  complete: boolean; annualConflict: boolean; mixedCutoffs: boolean;
  phase: 'conflict' | 'future' | 'missing' | 'incomplete' | 'closed' | 'partial'; phaseLabel: string;
  cutoffMin: string | null; cutoff: string | null;
};
export type PeriodPerformanceModel = {
  year: number; source: 'base' | 'cadence'; metric: 'VN' | 'AR'; level: 'central' | 'cooperative' | 'pa';
  count: number; countLabel: string; scopeLabel: string; units: RegistryEntity[];
  cutoffMin: string | null; cutoff: string | null; uplift: number;
  groups: { period: PerformancePeriod; title: string; rows: PerformanceRow[] }[];
};
export function buildPeriodPerformance(options: { dataset: Dataset; filters?: PerformanceFilters; unitIds: string[] }): PeriodPerformanceModel;
