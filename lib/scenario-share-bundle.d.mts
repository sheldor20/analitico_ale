import type { Dataset, Metric } from './types';
import type { PaScenarioFilters, PaScenarioReport, ScenarioCustomization } from './pa-scenario-share.mjs';
export type ScenarioBundleReport = Omit<PaScenarioReport, 'metric'> & { metric: Metric | 'both'; reports: PaScenarioReport[] };
export function buildScenarioBundleReport(options: { dataset: Dataset; filters: PaScenarioFilters; kind: 'central' | 'cooperative' | 'pa'; unitIdsByMetric?: Partial<Record<Metric, string[]>>; showProjection?: boolean; customization?: ScenarioCustomization }): ScenarioBundleReport;
