import type { Dataset, RegistryEntity, Metric } from './types';
export type GoalAlert = { key: string; year: number; month: number; entity: RegistryEntity; centralName?: string; metric: Metric; metricLabel: string; target: number; actual: number; attainment: number; cutoff: string; cutoffMin: string };
export function defaultGoalAlertMonth(dataset: Dataset): number;
export function buildMonthlyGoalAlerts(dataset: Dataset, month?: number): GoalAlert[];
export function goalAchievementMessage(alert: GoalAlert): string;
