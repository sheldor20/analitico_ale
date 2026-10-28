import type { DataRow, Issue } from './types';
export const PRODUCTION_PASTE_LIMIT_MB: number;
export type PasteSource = 'base' | 'cadence';
export type ProductionPasteConfig = {year:number;cadenceCutoff?:string;vnCutoff?:string;arCutoff?:string;allowedCentrals?:string[];paTargetMode?:string;[key:string]:unknown};
export type ProductionPasteResult<S extends PasteSource = PasteSource> = {
  source:S; rows:DataRow[]; issues:Issue[]; skipped:number; filename:string; months:number[]; inputRowCount:number; ignoredActualCount:number;
};
export function parseProductionPaste<S extends PasteSource>(text:string, config:ProductionPasteConfig, source:S):ProductionPasteResult<S>;
export function parseCadencePaste(text:string, config:ProductionPasteConfig):ProductionPasteResult<'cadence'>;
export function parseBasePaste(text:string, config:ProductionPasteConfig):ProductionPasteResult<'base'>;
