import type { DataRow, Issue } from './types';
export const PRODUCTION_PASTE_LIMIT_MB: number;
export function parseCadencePaste(text: string, config: {year:number;cadenceCutoff:string;allowedCentrals?:string[];paTargetMode?:string;[key:string]:unknown}): {
  source:'cadence'; rows:DataRow[]; issues:Issue[]; skipped:number; filename:string; months:number[]; inputRowCount:number; ignoredActualCount:number;
};
