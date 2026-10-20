import type { analyze } from './analytics.mjs';
import type { CurrentViewRow } from './current-view.mjs';
import type { Metric } from './types';

export type MatrixHorizon = 'month' | 'quarter' | 'annual';
export type UnitScenarioMatrixPeriod = ReturnType<typeof analyze> & {
  phaseKey: 'conflict' | 'future' | 'missing' | 'incomplete' | 'closed' | 'partial';
  phaseLabel: string;
};
export type UnitScenarioMatrixModel = {
  year: number; month: number; source: 'base' | 'cadence'; metric: Metric;
  horizons: { id: MatrixHorizon; title: string; label: string }[];
  rows: { id: string; key: string; unit: CurrentViewRow; periods: Record<MatrixHorizon, UnitScenarioMatrixPeriod>; cutoffMin: string; cutoff: string }[];
};
export function buildUnitScenarioMatrix(options: { rows: CurrentViewRow[]; year: number; month: number; metric?: Metric }): UnitScenarioMatrixModel;
