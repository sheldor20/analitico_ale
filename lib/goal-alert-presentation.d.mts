import type { GoalAlert } from './goal-alerts.mjs';
import type { PortfolioDashboard } from './portfolio-presentation.mjs';

export type GoalAlertPresentation = { subject: string; text: string; html: string; dashboard: PortfolioDashboard };
export function buildGoalAlertPresentation(alert: GoalAlert): GoalAlertPresentation;
export function buildGoalAlertsDashboard(alerts: GoalAlert[], options: { year: number; month: number; period?: 'month' | 'quarter' | 'semester' | 'annual' | 'ytd'; kindLabel?: string }): PortfolioDashboard;
