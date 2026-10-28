import type { Dataset, RegistryEntity, Metric } from './types';
export type GoalAlertPeriod = 'month' | 'quarter' | 'semester' | 'annual' | 'ytd';
export type GoalAlert = { key: string; year: number; month: number; period?: GoalAlertPeriod; periodLabel?: string; periodStart?: string; periodEnd?: string; entity: RegistryEntity; centralName?: string; metric: Metric; metricLabel: string; target: number; actual: number; attainment: number; cutoff: string; cutoffMin: string };
export function defaultGoalAlertMonth(dataset: Dataset): number;
export function buildPeriodGoalAlerts(dataset: Dataset, options?: {period?: GoalAlertPeriod;month?: number}):GoalAlert[];
export function buildMonthlyGoalAlerts(dataset: Dataset, month?: number): GoalAlert[];
export function goalAchievementMessage(alert: GoalAlert): string;
