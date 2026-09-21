import type { PaScenarioPart } from './pa-scenario-share.mjs';

export type PaScenarioImageCommand =
  | { type: 'rect'; x: number; y: number; width: number; height: number; fill: string }
  | { type: 'text'; value: string; x: number; y: number; maxWidth: number; size: number; bold: boolean; fill: string };
export function paScenarioImageLayout(part: PaScenarioPart, context: CanvasRenderingContext2D): { width: number; height: number; commands: PaScenarioImageCommand[] };
export function renderPaScenarioPng(part: PaScenarioPart): Promise<Blob>;
