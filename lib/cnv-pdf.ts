import { CNV_PDF_MAX_PAGES, CNV_PDF_MAX_TEXT, validateCnvPdfFile, validateCnvPdfHeader, cnvTextFromItems } from './cnv-pdf-safety.mjs';

export type CnvPdfPage = { number: number; text: string };
/** Extracts text locally; PDF scripts, attachments and links are never executed. */
export async function readCnvPdf(file: File): Promise<{pages:CnvPdfPage[];pageCount:number;fileHash:string}> {
  validateCnvPdfFile(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  validateCnvPdfHeader(bytes);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const fileHash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  const task = pdfjs.getDocument({ data:bytes, disableFontFace:true, useSystemFonts:false, useWorkerFetch:false, stopAtErrors:true });
  let expired = false;
  const timer = window.setTimeout(() => { expired = true; void task.destroy(); }, 60_000);
  try {
    const document = await task.promise;
    if (document.numPages > CNV_PDF_MAX_PAGES) throw new Error('O regulamento deve ter no máximo 200 páginas.');
    const pages:CnvPdfPage[] = [];
    let length = 0;
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const text = cnvTextFromItems(content.items.filter((item): item is typeof item & {str:string;hasEOL:boolean} => 'str' in item));
      length += text.length;
      if (length > CNV_PDF_MAX_TEXT) throw new Error('O PDF contém texto demais para uma ação. Divida o regulamento em arquivos menores.');
      pages.push({number,text});
      page.cleanup();
    }
    return { pages, pageCount:document.numPages, fileHash };
  } catch (error) {
    if (expired) throw new Error('A leitura do PDF excedeu um minuto. Tente um arquivo menor ou uma versão otimizada.');
    if (error instanceof Error && error.name === 'PasswordException') throw new Error('O PDF está protegido por senha. Importe uma versão desbloqueada.');
    if (error instanceof Error && ['InvalidPDFException','UnknownErrorException'].includes(error.name)) throw new Error('Não foi possível ler este PDF. Verifique o arquivo e tente novamente.');
    throw error;
  } finally {
    window.clearTimeout(timer);
    await task.destroy().catch(() => {});
  }
}
