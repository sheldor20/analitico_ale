import type { PeriodPerformanceModel, PerformancePeriod, PerformanceRow } from './period-performance.mjs';
import type { PerformanceOrder } from './period-performance-order.mjs';
import type { PeriodPerformanceImagePart } from './period-performance-image.mjs';
export type PeriodShareSelection = 'all' | PerformancePeriod;
export type PeriodPerformanceShareReport = Omit<PeriodPerformanceImagePart, 'index' | 'total' | 'from' | 'to'> & {
  period: PeriodShareSelection; order: PerformanceOrder; brand: string; count: number;
  rows: PerformanceRow[]; parts: PeriodPerformanceImagePart[]; subject: string; caption: string; text: string; whatsapp: string; html: string;
};
export const PERIOD_SHARE_PAGE_SIZE: 12;
export function periodShareCutoff(value: { cutoff: string | null; cutoffMin: string | null }): string;
export function buildPeriodPerformanceShare(options: { model: PeriodPerformanceModel; period?: PeriodShareSelection; order?: PerformanceOrder; showProjection?: boolean; centralName?: string }): PeriodPerformanceShareReport;
