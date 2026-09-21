import type { Workbook } from 'exceljs';
export type ResultExportContext = {
  year: number; month: number; period: string; source: string; metric: string; level: string;
  scopeLabel: string; filterLabel?: string; uplift?: number;
};
export type ResultExportAnalysis = {
  key: string; source: string; metric: string; central: string; cooperative: string; pa: string | null;
  group: string; name: string; cutoff: string; cutoffMin?: string; start?: string; end?: string;
  target: number | null; actual: number | null; projected: number | null; complete: boolean; annualConflict?: boolean;
};
export type ResultExportColumn = { key: string; label: string; type: string };
export type ExportRow = Record<string, string | number | boolean | null> & {
  id: string; target: number | null; actual: number | null; projected: number | null;
  attainment: number | null; gap: number | null; surplus: number | null; projectedAttainment: number | null;
};
export type ResultExportReport = {
  columns: readonly ResultExportColumn[]; rows: ExportRow[]; totals: ExportRow;
  records: (string | number | boolean | null)[][]; metadata: (string | number)[][];
  context: ResultExportContext; mode: 'filtered' | 'selected'; filename: string;
};
export const RESULT_EXPORT_COLUMNS: readonly ResultExportColumn[];
export function buildResultExport(options: { rows: readonly ResultExportAnalysis[]; context: ResultExportContext; selectedIds?: readonly string[]; mode?: 'filtered' | 'selected' }): ResultExportReport;
export function resultExportCsv(report: ResultExportReport): string;
export function createResultWorkbook(report: ResultExportReport): Promise<Workbook>;
export function resultExportXlsx(report: ResultExportReport): Promise<Uint8Array>;
