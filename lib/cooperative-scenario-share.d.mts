import type { Dataset } from './types';
import type { PaScenarioFilters, PaScenarioReport, PaScenarioPart, PaScenarioRow } from './pa-scenario-share.mjs';
export type CooperativeScenarioReport = PaScenarioReport;
export type CooperativeScenarioPart = PaScenarioPart;
export type CooperativeScenarioRow = PaScenarioRow;
export const COOPERATIVE_SCENARIO_PAGE_SIZE: 20;
export function buildCooperativeScenarioReport(options: {
  dataset: Dataset; filters: PaScenarioFilters; mode?: 'all' | 'filtered';
}): CooperativeScenarioReport;
export { renderPaScenarioPng as renderCooperativeScenarioPng } from './pa-scenario-image.mjs';
