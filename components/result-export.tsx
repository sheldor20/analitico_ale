'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { buildResultExport, resultExportCsv, resultExportXlsx } from '@/lib/result-export.mjs';
import type { ResultExportAnalysis, ResultExportContext } from '@/lib/result-export.mjs';
import styles from './result-export.module.css';

export type ResultExportProps = { rows: readonly ResultExportAnalysis[]; selectedIds: readonly string[]; context: ResultExportContext; ownerId: string; initialMode?: 'filtered' | 'selected' };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível gerar o arquivo. Tente novamente.';

export default function ResultExport(props: ResultExportProps) {
  return <ExportOptions key={JSON.stringify([props.ownerId, props.context, props.initialMode ?? 'filtered'])} {...props} />;
}

function ExportOptions({ rows, selectedIds, context, ownerId, initialMode = 'filtered' }: ResultExportProps) {
  const [mode, setMode] = useState<'filtered' | 'selected'>(initialMode);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ snapshot: '', message: '', error: false });
  const selected = new Set(selectedIds);
  const selectedCount = rows.filter(row => selected.has(row.key)).length;
  const prepared = useMemo(() => {
    try { return { report: buildResultExport({ rows, selectedIds, context, mode }), error: '' }; }
    catch (error) { return { report: null, error: errorMessage(error) }; }
  }, [rows, selectedIds, context, mode]);
  const snapshot = JSON.stringify([ownerId, context, mode, selectedIds, prepared.report?.records, prepared.error]);
  const current = useRef(snapshot); current.current = snapshot;
  const alive = useRef(true);
  const attempt = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; attempt.current++; };
  }, []);
  useEffect(() => { attempt.current++; setBusy(false); }, [snapshot]);

  async function download(format: 'csv' | 'xlsx') {
    if (!prepared.report || busy) return;
    const report = prepared.report, captured = snapshot, generation = ++attempt.current;
    const isCurrent = () => alive.current && current.current === captured && attempt.current === generation;
    setBusy(true); setFeedback({ snapshot: '', message: '', error: false });
    try {
      const blob = format === 'csv'
        ? new Blob([resultExportCsv(report)], { type: 'text/csv;charset=utf-8' })
        : new Blob([new Uint8Array(await resultExportXlsx(report))], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      if (!isCurrent()) return;
      const url = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = url; anchor.download = `${report.filename}.${format}`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback({ snapshot: captured, message: `${format === 'csv' ? 'CSV' : 'Excel'} baixado com ${report.rows.length} ${report.rows.length === 1 ? 'unidade' : 'unidades'} e o total do recorte.`, error: false });
    } catch (error) { if (isCurrent()) setFeedback({ snapshot: captured, message: errorMessage(error), error: true }); }
    finally { if (isCurrent()) setBusy(false); }
  }

  return <section className={styles.panel} aria-label="Exportação de resultados">
    <p className={styles.context}><strong>{context.scopeLabel}</strong><span>{rows.length} unidades filtradas · {selectedCount} selecionadas na lista</span></p>
    <label className={styles.field}><span>Escopo da exportação</span><select aria-label="Escopo da exportação" value={mode} onChange={event => setMode(event.target.value as 'filtered' | 'selected')}>
      <option value="filtered">Todas as unidades filtradas</option>
      <option value="selected">Somente unidades selecionadas</option>
    </select></label>
    <p>Meta, realizado, atingimento, GAP e superação em reais completos. A projeção aparece em colunas próprias, identificada como estimativa.</p>
    <p className={styles.helper}>O Excel inclui uma aba com período, filtros e critérios dos totais. Células vazias indicam dados indisponíveis; zero é um valor conhecido.</p>
    {prepared.error && <p className={styles.error} role="alert">{prepared.error}</p>}
    <div className={styles.actions}>
      <button type="button" className="button secondary" disabled={busy || !prepared.report} onClick={() => void download('csv')}><Download size={17} aria-hidden="true" />Baixar CSV</button>
      <button type="button" className="button primary" disabled={busy || !prepared.report} onClick={() => void download('xlsx')}><Download size={17} aria-hidden="true" />Baixar Excel</button>
    </div>
    {busy && <p role="status">Preparando o arquivo…</p>}
    {feedback.snapshot === snapshot && feedback.message && <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? styles.error : styles.success}>{feedback.message}</p>}
  </section>;
}
