import { buildScenarioReport } from './scenario-share-presentation.mjs';
export { renderPaScenarioPng as renderCentralScenarioPng } from './pa-scenario-image.mjs';
export function buildCentralScenarioReport(options) {
  return buildScenarioReport({ ...options, kind: 'central' });
}
