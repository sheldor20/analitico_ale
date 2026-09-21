import type { PaScenarioReport, PaScenarioPart, PaScenarioRow, ScenarioReportOptions } from './pa-scenario-share.mjs';
export type CooperativeScenarioReport = PaScenarioReport;
export type CooperativeScenarioPart = PaScenarioPart;
export type CooperativeScenarioRow = PaScenarioRow;
export const COOPERATIVE_SCENARIO_PAGE_SIZE: 12;
export function buildCooperativeScenarioReport(options: ScenarioReportOptions): CooperativeScenarioReport;
export { renderPaScenarioPng as renderCooperativeScenarioPng } from './pa-scenario-image.mjs';
