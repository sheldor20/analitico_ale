import { buildScenarioReport } from './scenario-share-presentation.mjs';
export { renderPaScenarioPng } from './pa-scenario-image.mjs';
export const PA_SCENARIO_PAGE_SIZE = 50;
export function buildPaScenarioReport(options) {
  return buildScenarioReport({ ...options, kind: 'pa' });
}
