import type { analyze, summarize } from './analytics.mjs';
import type { goalVariance } from './goal-variance.mjs';
import type { PerformanceFilters } from './period-performance.mjs';
import type { Dataset, Metric, RegistryEntity } from './types';

export type CurrentViewFilters = PerformanceFilters & { sortBy?:string; unitIds?:string[]; unitIdsByMetric?:Partial<Record<Metric,string[]>> };
export type CurrentViewRow = ReturnType<typeof analyze> & { contribution?:number|null; recentGrowth?:number|null; recentLabel?:string };
export type CurrentViewModel = {
  metric:Metric; label:string; filters:CurrentViewFilters & { source:'base'|'cadence'; metric:Metric; level:'central'|'cooperative'|'pa'; month:number; period:string; uplift:number; sortBy:string };
  rows:CurrentViewRow[]; summary:ReturnType<typeof summarize>; unitIds:string[]; units:RegistryEntity[]; count:number; level:'central'|'cooperative'|'pa';
  periodLabel:string; cutoffMin:string|null; cutoff:string|null; hasGoalConflict:boolean; attainment:number|null;
  variance:ReturnType<typeof goalVariance>; phaseLabel:string;
};
export function buildCurrentViewModels(options:{dataset:Dataset;filters?:CurrentViewFilters}):CurrentViewModel[];
