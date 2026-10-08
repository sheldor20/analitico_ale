import type { RegistryEntity } from './types';
import type { ResponsibleContact, ResponsibleContactInput } from './contact-store';

export const CONTACT_IMPORT_LIMIT: number;
export type ContactImportSourceRow = { key:string; sheet:string; row:number; central:string; cooperativeCode:string; cooperativeName:string; name:string; nameMissing:boolean; emailsText:string; whatsapp:string; jobTitle:string; teams:string; issues:string[] };
export type ContactImportWorkbook = { rows:ContactImportSourceRow[]; sheets:{name:string;headerRow:number;count:number;hasResponsibleName:boolean}[]; warnings:string[] };
export type ContactImportPreviewRow = { key:string; source:ContactImportSourceRow; entity:RegistryEntity|null; input:ResponsibleContactInput|null; contactId?:string; expectedUpdatedAt?:string; status:'invalid'|'create'|'update'|'unchanged'|'duplicate'; message:string; issues:string[] };
export function readContactWorkbook(buffer:ArrayBuffer|Uint8Array):Promise<ContactImportWorkbook>;
export function normalizeImportedPhone(value:unknown):string;
export function buildContactImportPreview(options:{rows:ContactImportSourceRow[];entities:RegistryEntity[];contacts:ResponsibleContact[]}):ContactImportPreviewRow[];
