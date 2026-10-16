'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Download, FileCode2, X } from 'lucide-react';
import styles from './analysis-report-share.module.css';

export type AnalysisReportShareProps = {
  title: string;
  context: string[];
  columns: string[];
  rows: string[][];
  notes: string[];
  onClose: () => void;
};
type Report = Omit<AnalysisReportShareProps, 'onClose'>;
const PAGE_SIZE = 24;
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível preparar o arquivo. Tente novamente.';

function reportText(report: Report) {
  return [report.title, ...report.context, '', report.columns.join(' | '), ...report.rows.map(row => row.join(' | ')), '', ...report.notes].join('\n');
}

function reportHtml(report: Report) {
  const paragraphs = (values: string[]) => values.map(value => `<p>${escape(value).replace(/\n/g, '<br>')}</p>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(report.title)}</title><style>body{margin:0;padding:24px;font:14px/1.4 Arial,sans-serif;color:#003641;background:#fff}header{padding:18px 20px;background:#003641;color:#fff;border-bottom:4px solid #00ae9d}h1{margin:0 0 10px;font-size:24px}p{margin:5px 0}table{width:100%;margin-top:18px;border-collapse:collapse}thead{display:table-header-group}th,td{padding:8px 10px;border-bottom:1px solid #d7e5df;text-align:right;vertical-align:top;font-variant-numeric:tabular-nums}td{white-space:nowrap}th:first-child,td:first-child{text-align:left}thead{background:#eaf3f0}tbody tr:nth-child(even){background:#f5f9f7}footer{margin-top:16px;font-size:12px;color:#435c60}.table{overflow-x:auto}tr{break-inside:avoid;page-break-inside:avoid}@page{size:A4 landscape;margin:10mm}@media print{body{padding:0;font-size:10px}.table{overflow:visible}th,td{padding:5px}header{break-after:avoid-page}footer{break-inside:avoid}}</style></head><body><header><h1>${escape(report.title)}</h1>${paragraphs(report.context)}</header><div class="table"><table><thead><tr>${report.columns.map(column => `<th scope="col">${escape(column)}</th>`).join('')}</tr></thead><tbody>${report.rows.map(row => `<tr>${report.columns.map((_, index) => index === 0 ? `<th scope="row">${escape(row[index] || '—')}</th>` : `<td>${escape(row[index] || '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div><footer>${paragraphs(report.notes)}</footer></body></html>`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function renderImage(report: Report, page: number) {
  if (document.fonts?.load) await Promise.all([document.fonts.load('400 18px "Sicoob Sans"'), document.fonts.load('700 24px "Sicoob Sans"')]);
  const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
  if (!context) throw new Error('O navegador não conseguiu gerar a imagem. Baixe o HTML completo.');
  const width = 1200, inset = 32, usable = width - inset * 2;
  const firstWidth = report.columns.length > 1 ? Math.max(220, usable * .25) : usable;
  const widths = report.columns.map((_, index) => index === 0 ? firstWidth : (usable - firstWidth) / (report.columns.length - 1));
  const positions = widths.map((_, index) => inset + widths.slice(0, index).reduce((sum, value) => sum + value, 0));
  type Draw = { value: string; x: number; y: number; size: number; bold: boolean; color: string; right?: boolean } | { x: number; y: number; width: number; height: number; fill: string };
  const commands: Draw[] = [];
  const font = (size: number, bold: boolean) => { context.font = `${bold ? '700' : '400'} ${size}px "Sicoob Sans", Arial`; };
  function lines(value: string, maxWidth: number, size: number, bold: boolean) {
    font(size, bold);
    const result: string[] = [];
    for (const paragraph of value.split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (context!.measureText(`${line}${line ? ' ' : ''}${word}`).width <= maxWidth) { line += `${line ? ' ' : ''}${word}`; continue; }
        if (line) { result.push(line); line = ''; }
        for (const character of word) {
          if (line && context!.measureText(line + character).width > maxWidth) { result.push(line); line = ''; }
          line += character;
        }
      }
      result.push(line);
    }
    return result;
  }
  function text(value: string, x: number, y: number, maxWidth: number, size = 18, bold = false, color = '#003641', right = false) {
    let fitted = size;
    // Preserve complete financial values as one indivisible string.
    if (/^[+−-]?\s*(?:R\$\s*)?[−-]?\d[\d.,]*(?:\s*%)?$/.test(value.trim())) {
      font(fitted, bold);
      while (fitted > 13 && context!.measureText(value).width > maxWidth) { fitted--; font(fitted, bold); }
      if (context!.measureText(value).width > maxWidth) throw new Error('Há um valor extenso demais para a imagem. Baixe o HTML completo para preservá-lo.');
      commands.push({ value, x, y, size: fitted, bold, color, right });
      return Math.ceil(fitted * 1.4);
    }
    const wrapped = lines(value, maxWidth, fitted, bold), step = Math.ceil(fitted * 1.4);
    wrapped.forEach((line, index) => commands.push({ value: line, x, y: y + index * step, size: fitted, bold, color, right }));
    return wrapped.length * step;
  }
  const block = { x: 0, y: 0, width, height: 1, fill: '#003641' };
  commands.push(block);
  let y = 24;
  y += text('Gestão comercial · Sicoob', inset, y, usable, 17, true, '#8fdbcf') + 7;
  y += text(report.title, inset, y, usable, 27, true, '#ffffff') + 10;
  for (const value of report.context) y += text(value, inset, y, usable, 17, false, '#ffffff') + 4;
  const total = Math.max(1, Math.ceil(report.rows.length / PAGE_SIZE)), from = page * PAGE_SIZE, rows = report.rows.slice(from, from + PAGE_SIZE);
  y += text(total === 1 ? `${report.rows.length} registros · imagem única` : `Parte ${page + 1} de ${total} · registros ${from + 1} a ${from + rows.length} de ${report.rows.length}`, inset, y + 4, usable, 16, false, '#8fdbcf') + 24;
  block.height = y;
  commands.push({ x: 0, y, width, height: 4, fill: '#00ae9d' });
  y += 20;
  const headHeight = Math.max(...report.columns.map((column, index) => lines(column, widths[index] - 20, 17, true).length * 24)) + 16;
  commands.push({ x: inset, y, width: usable, height: headHeight, fill: '#e4f1ed' });
  report.columns.forEach((column, index) => text(column, index ? positions[index] + widths[index] - 10 : positions[index] + 10, y + 8, widths[index] - 20, 17, true, '#003641', index > 0));
  y += headHeight;
  rows.forEach((row, rowIndex) => {
    const background = { x: inset, y, width: usable, height: 1, fill: rowIndex % 2 ? '#ffffff' : '#f2f8f5' };
    commands.push(background);
    const heights = report.columns.map((_, index) => text(row[index] || '—', index ? positions[index] + widths[index] - 10 : positions[index] + 10, y + 9, widths[index] - 20, 18, index === 0, '#003641', index > 0));
    const height = Math.max(26, ...heights) + 18;
    background.height = height;
    y += height;
    commands.push({ x: inset, y: y - 1, width: usable, height: 1, fill: '#d7e5df' });
  });
  y += 16;
  for (const note of report.notes) y += text(note, inset, y, usable, 16, false, '#435c60') + 6;
  const height = Math.ceil(y + 22);
  if (height > 12000) throw new Error('O conteúdo desta parte é muito extenso para uma imagem. Baixe o HTML completo.');
  canvas.width = width; canvas.height = height;
  try {
    context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); context.textBaseline = 'top';
    for (const command of commands) {
      if ('fill' in command) { context.fillStyle = command.fill; context.fillRect(command.x, command.y, command.width, command.height); }
      else { font(command.size, command.bold); context.fillStyle = command.color; context.textAlign = command.right ? 'right' : 'left'; context.fillText(command.value, command.x, command.y); }
    }
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível gerar a imagem.')), 'image/png'));
  } finally { canvas.width = 1; canvas.height = 1; }
}

export default function AnalysisReportShare({ title, context, columns, rows, notes, onClose }: AnalysisReportShareProps) {
  const titleId = useId(), closeButton = useRef<HTMLButtonElement>(null), alive = useRef(true);
  const [page, setPage] = useState(0), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(''), [manual, setManual] = useState(false);
  const [preview, setPreview] = useState({ url: '', error: '' });
  const report = useMemo(() => ({ title, context, columns, rows, notes }), [title, context, columns, rows, notes]);
  const parts = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)), currentPage = Math.min(page, parts - 1);
  const text = useMemo(() => reportText(report), [report]), html = useMemo(() => reportHtml(report), [report]);
  const filename = `${title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'cenario'}`;
  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; closeButton.current?.focus();
    return () => { document.body.style.overflow = overflow; if (opener?.isConnected) opener.focus(); };
  }, []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true, url = '';
    setPreview({ url: '', error: '' });
    if (columns.length) renderImage(report, currentPage).then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob); setPreview({ url, error: '' });
    }).catch(error => { if (active) setPreview({ url: '', error: errorMessage(error) }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [report, currentPage, columns.length]);
  async function copyText() {
    setFeedback(''); setManual(false);
    try { await navigator.clipboard.writeText(text); if (alive.current) setFeedback('Texto completo copiado.'); }
    catch { if (alive.current) { setManual(true); setFeedback('Copie manualmente o texto completo abaixo.'); } }
  }
  async function downloadImage() {
    if (busy || !columns.length) return;
    setBusy(true); setFeedback('');
    try { const blob = await renderImage(report, currentPage); if (alive.current) { download(blob, `${filename}-parte-${currentPage + 1}-de-${parts}.png`); setFeedback(`Imagem ${currentPage + 1} de ${parts} baixada.`); } }
    catch (error) { if (alive.current) setFeedback(errorMessage(error)); }
    finally { if (alive.current) setBusy(false); }
  }
  return <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={styles.dialog} role="dialog" aria-modal="true" aria-label="Compartilhar cenário" aria-describedby={titleId} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],textarea,summary')].filter(node => node.getClientRects().length);
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus(); }
    }}>
      <header className={styles.heading}><div><p>Compartilhar cenário</p><h2 id={titleId}>{title}</h2></div><button ref={closeButton} type="button" className="icon-button" aria-label="Fechar compartilhamento do cenário" onClick={onClose}><X size={22} aria-hidden="true" /></button></header>
      <div className={styles.content}>
        <div className={styles.context}>{context.map((value, index) => <span key={index}>{value}</span>)}</div>
        <p className={styles.helper}>{rows.length} registros · A prévia e os arquivos incluem todos os registros deste cenário.</p>
        <div className={styles.actions}>
          <button type="button" className="button primary" disabled={busy || !columns.length} onClick={() => void downloadImage()}><Download size={17} aria-hidden="true" />{busy ? 'Gerando imagem…' : 'Baixar imagem'}</button>
          <button type="button" className="button secondary" onClick={() => void copyText()}><Copy size={17} aria-hidden="true" />Copiar texto</button>
          <button type="button" className="button secondary" onClick={() => download(new Blob([html], { type: 'text/html;charset=utf-8' }), `${filename}.html`)}><FileCode2 size={17} aria-hidden="true" />Baixar HTML completo</button>
        </div>
        {parts > 1 && <div className={styles.parts}><span>Imagem {currentPage + 1} de {parts} · até {PAGE_SIZE} registros por imagem</span><div className={styles.actions}><button type="button" className="button secondary" disabled={currentPage === 0 || busy} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} aria-hidden="true" />Anterior</button><button type="button" className="button secondary" disabled={currentPage === parts - 1 || busy} onClick={() => setPage(currentPage + 1)}>Próxima<ChevronRight size={17} aria-hidden="true" /></button></div></div>}
        {feedback && <p className={styles.feedback} role="status">{feedback}</p>}
        {manual && <label className={styles.manual}>Texto completo<textarea readOnly value={text} rows={8} onFocus={event => event.currentTarget.select()} /></label>}
        <details className={styles.image}><summary>Prévia da imagem · {currentPage + 1} de {parts}</summary>{preview.url ? <img src={preview.url} alt={`${title} · imagem ${currentPage + 1} de ${parts}`} /> : <p role={preview.error ? 'alert' : 'status'}>{preview.error || 'Preparando imagem…'}</p>}</details>
        <section aria-label="Prévia completa do cenário"><h3>Prévia completa</h3><div className={styles.table}><table><thead><tr>{columns.map((column, index) => <th scope="col" key={index}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map((_, columnIndex) => columnIndex === 0 ? <th scope="row" key={columnIndex}>{row[columnIndex] || '—'}</th> : <td key={columnIndex}>{row[columnIndex] || '—'}</td>)}</tr>)}</tbody></table></div></section>
        {!!notes.length && <div className={styles.notes}>{notes.map((note, index) => <p key={index}>{note}</p>)}</div>}
      </div>
    </section>
  </div>;
}
