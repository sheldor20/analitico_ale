import type { PortfolioDashboard } from './portfolio-presentation.mjs';
export function renderDashboardPng(model: PortfolioDashboard): Promise<Blob>;
export function dashboardImageLayout(model: PortfolioDashboard, context: CanvasRenderingContext2D): { width: number; height: number; commands: Record<string, any>[] };
