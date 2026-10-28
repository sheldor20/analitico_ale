import type {DataRow,Dataset} from './types';
export type ProductionChange={key:string;central:string;cooperative:string;pa:string|null;name:string;metric:string;month:number;before:number|null;after:number;delta:number|null};
export function productionChanges(existing:DataRow[],incoming:DataRow[]):ProductionChange[];
export function restoreProduction(current:Dataset,snapshot:Dataset):Dataset;
