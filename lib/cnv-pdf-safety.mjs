export const CNV_PDF_MAX_BYTES = 20 * 1024 * 1024;
export const CNV_PDF_MAX_PAGES = 200;
export const CNV_PDF_MAX_TEXT = 1_000_000;
export function validateCnvPdfFile(file) {
  if (!file || typeof file.name !== 'string' || !/\.pdf$/i.test(file.name)) throw new Error('Selecione um arquivo PDF.');
  if (!Number.isFinite(file.size) || file.size <= 0) throw new Error('O PDF está vazio.');
  if (file.size > CNV_PDF_MAX_BYTES) throw new Error('O regulamento deve ter até 20 MB.');
  if (file.type && file.type !== 'application/pdf') throw new Error('Selecione um arquivo PDF válido.');
}
export function validateCnvPdfHeader(bytes) {
  const prefix = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  if (!/%PDF-\d\.\d/.test(prefix)) throw new Error('O arquivo não contém um PDF válido.');
}
export function cnvTextFromItems(items) {
  return items.map(item => typeof item.str === 'string' ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '').join('').replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').trim();
}
