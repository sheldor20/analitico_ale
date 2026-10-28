'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, ClipboardPaste, LoaderCircle } from 'lucide-react';
import type { DataRow, ImportConfig, Issue } from '@/lib/types';
import { money, MONTHS } from '@/lib/analytics.mjs';
import styles from './production-paste.module.css';

type Preview = {
  rows: DataRow[];
  issues: Issue[];
  skipped: number;
  months: number[];
  newCount: number;
  cellCount: number;
  afterCutoff: number;
  manualCount: number;
};
type Props = {
  config: ImportConfig;
  existingRows: DataRow[];
  allowedCentrals: string[];
  disabled?: boolean;
  onApply: (text: string, config: ImportConfig) => Promise<void>;
};
const total = (row: DataRow, last: number) => row.actuals.slice(0, last + 1).reduce<number>((value, next) => value + (next ?? 0), 0);

export default function ProductionPaste({ config, existingRows, allowedCentrals, disabled = false, onApply }: Props) {
  const [text, setText] = useState('');
  const [cutoff, setCutoff] = useState(config.cadenceCutoff);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [applying, setApplying] = useState(false);
  const operation = useRef(0);
  const actionPending = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);
  const scope = [...allowedCentrals].sort().join(',');
  const registryKey = useMemo(() => JSON.stringify(existingRows), [existingRows]);
  const last = Number(cutoff.slice(5, 7)) - 1;
  const locked = disabled || pending;

  useEffect(() => {
    setCutoff(config.cadenceCutoff);
    setPreview(null);
    setError('');
    operation.current += 1;
  }, [config.year, config.cadenceCutoff, config.paTargetMode, scope, registryKey]);
  useEffect(() => () => { operation.current += 1; }, []);

  function invalidate() {
    operation.current += 1;
    setPreview(null);
    setError('');
  }
  async function review() {
    if (locked || actionPending.current) return;
    actionPending.current = true;
    const request = ++operation.current;
    setPending(true);
    setError('');
    setPreview(null);
    try {
      const { parseCadencePaste } = await import('@/lib/production-paste.mjs');
      const part = parseCadencePaste(text, { ...config, cadenceCutoff: cutoff, allowedCentrals });
      const previous = new Map(existingRows.map(row => [row.key, row]));
      let newCount = 0, cellCount = 0, afterCutoff = part.ignoredActualCount, manualCount = 0;
      for (const row of part.rows) {
        const saved = previous.get(row.key);
        if (saved && cutoff < saved.cutoff) throw new Error(`${saved.name}: a data de corte é anterior à posição já salva (${saved.cutoff.split('-').reverse().join('/')}). Informe uma data igual ou posterior.`);
        if (!saved) newCount += 1;
        for (let month = 0; month < 12; month += 1) {
          if (row.actuals[month] == null) continue;
          if (month > last) afterCutoff += 1;
          else {
            cellCount += 1;
            if (saved?.cutoff === cutoff && saved.manualActualMonths?.includes(month)) manualCount += 1;
          }
        }
      }
      if (!cellCount) throw new Error('Não há valores de produção até a data de corte informada. Confira os meses e a data.');
      if (operation.current !== request) return;
      setPreview({ rows: part.rows, issues: part.issues, skipped: part.skipped, months: part.months, newCount, cellCount, afterCutoff, manualCount });
      requestAnimationFrame(() => feedback.current?.focus());
    } catch (cause) {
      if (operation.current === request) setError(cause instanceof Error ? cause.message : 'Não foi possível conferir os dados colados.');
    } finally {
      actionPending.current = false;
      setPending(false);
    }
  }
  async function apply() {
    if (locked || actionPending.current || !preview) return;
    actionPending.current = true;
    setPending(true);
    setApplying(true);
    setError('');
    try {
      await onApply(text, { ...config, cadenceCutoff: cutoff, allowedCentrals });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a produção. Os dados continuam disponíveis para conferência.');
    } finally {
      actionPending.current = false;
      setApplying(false);
      setPending(false);
    }
  }

  return <section className={styles.root} aria-label="Atualização por dados colados">
    <header className={styles.header}>
      <div><h3>Colar produção dos PAs</h3><p>Copie as células da planilha com o cabeçalho e cole abaixo.</p></div>
      <span className={styles.badge}>Cadência PA · Venda Nova</span>
    </header>
    <div className={styles.fields}>
      <label>Ano do cadastro<input aria-label="Ano da produção colada" type="number" value={config.year} readOnly /></label>
      <label>Data de corte<input aria-label="Data de corte da produção colada" type="date" min={`${config.year}-01-01`} max={`${config.year}-12-31`} value={cutoff} disabled={locked} onChange={event => { invalidate(); setCutoff(event.target.value); }} /></label>
    </div>
    <label className={styles.paste}>Dados da Cadência PA
      <textarea aria-label="Dados da Cadência PA" spellCheck={false} wrap="off" value={text} disabled={locked} placeholder={'Cole aqui o cabeçalho e as linhas copiadas do Excel (Ctrl + V).'} onChange={event => { invalidate(); setText(event.target.value); }} />
    </label>
    <p className={styles.note}>Metas cadastradas preservadas. Células vazias mantêm valores; traço (-) atualiza para zero.</p>
    <div className={styles.actions}>
      <button type="button" className="button quiet" disabled={locked || !text} onClick={() => { invalidate(); setText(''); }}>Limpar dados</button>
      <button type="button" className="button secondary" disabled={locked || !text.trim() || !cutoff} onClick={() => void review()}>{pending && !applying ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <ClipboardPaste size={16} aria-hidden="true" />}Conferir prévia</button>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {preview && <div className={styles.preview} ref={feedback} tabIndex={-1} aria-label="Prévia da atualização">
      <div className={styles.previewHeading}><CheckCircle2 size={18} aria-hidden="true" /><h3>Prévia da atualização</h3><span>{cutoff.split('-').reverse().join('/')}</span></div>
      <div className={styles.cards}>
        <div><strong>{preview.rows.length}</strong><span>PAs recebidos</span></div>
        <div><strong>{new Set(preview.rows.map(row => `${row.central}:${row.cooperative}`)).size}</strong><span>Cooperativas</span></div>
        <div><strong>{preview.months.filter(month => month <= last).length}</strong><span>Meses até o corte</span></div>
        <div><strong>{money(preview.rows.reduce((value, row) => value + total(row, last), 0))}</strong><span>Produção colada até o corte</span></div>
      </div>
      <p className={styles.note}>{preview.cellCount} valores mensais recebidos · {preview.months.filter(month => month <= last).map(month => MONTHS[month]).join(' · ')}</p>
      {preview.newCount > 0 && <p className={styles.notice}>{preview.newCount} {preview.newCount === 1 ? 'PA novo será incluído' : 'PAs novos serão incluídos'} com {config.paTargetMode === 'source' || config.year < 2026 && config.paTargetMode !== 'group' ? 'as metas da planilha' : 'as metas da regra P1–P5'}. As metas já cadastradas permanecem iguais.</p>}
      {preview.skipped > 0 && <p className={styles.notice}>{preview.skipped} linhas de centrais fora do cadastro foram desconsideradas.</p>}
      {preview.afterCutoff > 0 && <p className={styles.notice}>{preview.afterCutoff} valores após o corte não serão aplicados nesta atualização.</p>}
      {preview.manualCount > 0 && <p className={styles.notice}>{preview.manualCount} ajustes manuais do mesmo corte serão mantidos. Para substituí-los, use uma posição mais recente.</p>}
      <div className={styles.tableScroll}><table><caption>Amostra: {Math.min(5, preview.rows.length)} de {preview.rows.length} PAs</caption><thead><tr><th>PA</th><th>Central / Cooperativa / PA</th><th>Produção até o corte</th></tr></thead><tbody>{preview.rows.slice(0, 5).map(row => <tr key={row.key}><th scope="row">{row.name}</th><td>{row.central} / {row.cooperative} / {row.pa}</td><td>{money(total(row, last))}</td></tr>)}</tbody></table></div>
      {preview.issues.length > 0 && <details className={styles.details}><summary>Conferências da origem ({preview.issues.length})</summary><ul>{preview.issues.slice(0, 10).map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>{preview.issues.length > 10 && <p>As demais conferências estarão disponíveis na Conferência da base após a atualização.</p>}</details>}
      <footer className={styles.footer}><span>Os valores dos meses recebidos substituirão a produção correspondente.</span><button type="button" className="button primary" disabled={locked} onClick={() => void apply()}>{applying ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}Atualizar produção</button></footer>
    </div>}
  </section>;
}
