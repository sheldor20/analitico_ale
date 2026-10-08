import type { PerformanceRow } from './period-performance.mjs';

export type PeriodPerformanceImagePart = {
  index: number; total: number; from: number; to: number; rows: PerformanceRow[];
  year: number; metric: 'VN' | 'AR'; scopeLabel: string; centralName: string; unitLabel: string;
  periodLabel: string; cutoffMin: string | null; cutoff: string | null; showProjection: boolean;
  notes: string[]; orderLabel: string;
};
export type PeriodPerformanceImageCommand =
  | { type: 'rect'; x: number; y: number; width: number; height: number; fill: string }
  | { type: 'text'; value: string; x: number; y: number; maxWidth: number; size: number; bold: boolean; fill: string };
export function periodPerformanceImageLayout(part: PeriodPerformanceImagePart, context: CanvasRenderingContext2D): { width: number; height: number; commands: PeriodPerformanceImageCommand[] };
export function renderPeriodPerformancePng(part: PeriodPerformanceImagePart): Promise<Blob>;
