import type { Dataset } from './types';
import type { PaScenarioFilters, PaScenarioPart, PaScenarioReport, PaScenarioRow } from './pa-scenario-share.mjs';
export function scenarioDisplay(part: PaScenarioPart): {
  title: string; metricLabel: string; scope: string; cutoffLabel: string;
  groups: { key: string; label: string; rows: { row: PaScenarioRow; label: string; exception: string; varianceLabel: string; attainmentLabel: string }[] }[];
};
export function buildScenarioReport(options: {
  dataset: Dataset; filters?: PaScenarioFilters; mode?: 'all' | 'filtered'; kind: 'pa' | 'cooperative';
}): PaScenarioReport;
