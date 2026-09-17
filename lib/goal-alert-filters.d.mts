import type { Dataset } from './types';
import type { GoalAlert } from './goal-alerts.mjs';
export type GoalFilterOption = { value: string; central: string; cooperative?: string; name: string };
export function goalAlertFilterOptions(dataset: Dataset): { centrals: GoalFilterOption[]; cooperatives: GoalFilterOption[] };
export function filterGoalAlerts(alerts: GoalAlert[], filters?: { kind?: string; central?: string; cooperative?: string }): GoalAlert[];
