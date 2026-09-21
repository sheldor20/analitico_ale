import type { Dataset } from './types';
import type { goalVariance } from './goal-variance.mjs';

export type PaScenarioFilters = Partial<{
  central: string; coop: string; source: string; metric: string; group: string;
  level: string; period: string; month: number; uplift: number; sortBy: string;
  search: string; status: string;
}>;
export type PaScenarioRow = {
  id: string; central: string; cooperative: string; pa: string; name: string; group: string;
  target: number | null; actual: number | null; attainment: number | null;
  variance: ReturnType<typeof goalVariance>; status: string;
  cutoff: string; cutoffMin: string; complete: boolean; annualConflict: boolean;
};
export type PaScenarioPart = {
  index: number; total: number; from: number; to: number; rows: PaScenarioRow[];
  scope: string; periodLabel: string; notes: string[]; year: number;
  kind?: 'pa' | 'cooperative'; metric?: 'VN' | 'AR'; title?: string;
  context?: { central: string | null; cooperative: string | null; cutoff: string; cutoffMin: string; mixedCutoffs?: boolean };
};
export type PaScenarioReport = {
  mode: 'all' | 'filtered'; count: number; allCount: number; filteredCount: number;
  scope: string; scopeLabel: string; periodLabel: string; notes: string[];
  subject: string; text: string; whatsapp: string; html: string;
  rows: PaScenarioRow[]; parts: PaScenarioPart[];
  kind: 'pa' | 'cooperative'; metric: 'VN' | 'AR'; title: string;
};
export const PA_SCENARIO_PAGE_SIZE: 20;
export function buildPaScenarioReport(options: {
  dataset: Dataset; filters: PaScenarioFilters; mode?: 'all' | 'filtered';
}): PaScenarioReport;
export { renderPaScenarioPng } from './pa-scenario-image.mjs';
