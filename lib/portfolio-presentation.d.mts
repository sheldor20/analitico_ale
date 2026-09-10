import type { PortfolioReport, PortfolioMessage } from './portfolio-communication.mjs';
export type DashboardBlock =
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string; tone: 'body' | 'muted' | 'action' | 'warning' }
  | { type: 'cards'; items: { label: string; value: string }[] }
  | { type: 'secondary'; title: string; lines: string[] }
  | { type: 'table'; title: string; headers: string[]; rows: string[][] };
export type PortfolioDashboard = {
  version: 2; year: number; period: string; entityId: string; scope: string; hierarchy: string;
  periodLabel: string; greeting: string; opening: string; notes: string[];
  blocks: DashboardBlock[]; footer: string; signature: string;
};
export function scenarioTitle(report: PortfolioReport): string;
export function validateDashboard(model: unknown): PortfolioDashboard;
export function buildPortfolioPresentation(report: PortfolioReport, options?: { names?: string[]; intro?: string; signature?: string; subject?: string }): PortfolioMessage;
export function renderDashboardHtml(model: PortfolioDashboard, subject?: string): string;
