export const CNV_PDF_MAX_BYTES: number;
export const CNV_PDF_MAX_PAGES: number;
export const CNV_PDF_MAX_TEXT: number;
export function validateCnvPdfFile(file: {name:string;size:number;type?:string}): void;
export function validateCnvPdfHeader(bytes: Uint8Array): void;
export function cnvTextFromItems(items: {str?:string;hasEOL?:boolean}[]): string;
