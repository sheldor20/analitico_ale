import type { PaScenarioPart, PaScenarioReport, PaScenarioRow, ScenarioReportOptions } from './pa-scenario-share.mjs';
export function scenarioDisplay(part: PaScenarioPart): {
  title: string; metricLabel: string; scope: string; cutoffLabel: string;
  groups: { key: string; label: string; rows: { row: PaScenarioRow; label: string; exception: string; varianceLabel: string; attainmentLabel: string }[] }[];
};
export function buildScenarioReport(options: ScenarioReportOptions & { kind: 'pa' | 'cooperative' }): PaScenarioReport;
