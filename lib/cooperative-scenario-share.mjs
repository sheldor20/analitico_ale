import { buildScenarioReport } from './scenario-share-presentation.mjs';
export { renderPaScenarioPng as renderCooperativeScenarioPng } from './pa-scenario-image.mjs';
export const COOPERATIVE_SCENARIO_PAGE_SIZE = 20;
export function buildCooperativeScenarioReport(options) {
  return buildScenarioReport({ ...options, kind: 'cooperative' });
}
