'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, ClipboardPaste, LoaderCircle } from 'lucide-react';
import type { DataRow, ImportConfig, Issue } from '@/lib/types';
import { money, MONTHS } from '@/lib/analytics.mjs';
import styles from './production-paste.module.css';

type PasteSource = 'base' | 'cadence';
type Preview = {
  source: PasteSource;
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
  onApply: (text: string, config: ImportConfig, source: PasteSource) => Promise<void>;
};
const lastMonth = (row: DataRow) => Number(row.cutoff.slice(5, 7)) - 1;
const total = (row: DataRow) => row.actuals.slice(0, lastMonth(row) + 1).reduce<number>((value, next) => value + (next ?? 0), 0);
const dateLabel = (value: string) => value.split('-').reverse().join('/');

export default function ProductionPaste({ config, existingRows, allowedCentrals, disabled = false, onApply }: Props) {
  const [source, setSource] = useState<PasteSource>('cadence');
  const [text, setText] = useState('');
  const [cutoff, setCutoff] = useState(config.cadenceCutoff);
  const [vnCutoff, setVnCutoff] = useState(config.vnCutoff);
  const [arCutoff, setArCutoff] = useState(config.arCutoff);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [applying, setApplying] = useState(false);
  const operation = useRef(0);
  const actionPending = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);
  const scope = [...allowedCentrals].sort().join(',');
  const registryKey = useMemo(() => JSON.stringify(existingRows), [existingRows]);
  const locked = disabled || pending;
  const cadence = source === 'cadence';
  const previewRows = preview?.source === source ? preview.rows : [];
  const validPreview = preview?.source === source ? preview : null;
  const inputLabel = cadence ? 'Dados da Cadência PA' : 'Dados das centrais e cooperativas';
  const metrics = [...new Set(previewRows.map(row => row.metric))];

  useEffect(() => {
    setCutoff(config.cadenceCutoff);
    setVnCutoff(config.vnCutoff);
    setArCutoff(config.arCutoff);
    setPreview(null);
    setError('');
    operation.current += 1;
  }, [config.year, config.cadenceCutoff, config.vnCutoff, config.arCutoff, config.paTargetMode, scope, registryKey]);
  useEffect(() => () => { operation.current += 1; }, []);

  function invalidate() {
    operation.current += 1;
    setPreview(null);
    setError('');
  }
  function importConfig(): ImportConfig {
    return { ...config, cadenceCutoff: cutoff, vnCutoff, arCutoff, allowedCentrals };
  }
  async function review() {
    if (locked || actionPending.current) return;
    actionPending.current = true;
    const request = ++operation.current;
    setPending(true);
    setError('');
    setPreview(null);
    try {
      const { parseProductionPaste } = await import('@/lib/production-paste.mjs');
      const part = parseProductionPaste(text, importConfig(), source);
      const previous = new Map(existingRows.map(row => [row.key, row]));
      let newCount = 0, cellCount = 0, afterCutoff = part.ignoredActualCount, manualCount = 0;
      const months = new Set<number>();
      for (const row of part.rows) {
        const saved = previous.get(row.key);
        if (saved && row.cutoff < saved.cutoff) throw new Error(`${saved.name} (${row.metric === 'VN' ? 'Venda Nova' : 'Arrecadação'}): a data de corte é anterior à posição já salva (${dateLabel(saved.cutoff)}). Informe uma data igual ou posterior.`);
        if (!saved) newCount += 1;
        for (let month = 0; month < 12; month += 1) {
          if (row.actuals[month] == null) continue;
          if (month > lastMonth(row)) afterCutoff += 1;
          else {
            cellCount += 1;
            months.add(month);
            if (saved?.cutoff === row.cutoff && saved.manualActualMonths?.includes(month)) manualCount += 1;
          }
        }
      }
      if (!cellCount) throw new Error('Não há valores de produção até a data de corte informada. Confira os meses e a data.');
      if (operation.current !== request) return;
      setPreview({ source, rows: part.rows, issues: part.issues, skipped: part.skipped, months: [...months].sort((a, b) => a - b), newCount, cellCount, afterCutoff, manualCount });
      requestAnimationFrame(() => feedback.current?.focus());
    } catch (cause) {
      if (operation.current === request) setError(cause instanceof Error ? cause.message : 'Não foi possível conferir os dados colados.');
    } finally {
      actionPending.current = false;
      setPending(false);
    }
  }
  async function apply() {
    if (locked || actionPending.current || !validPreview) return;
    actionPending.current = true;
    setPending(true);
    setApplying(true);
    setError('');
    try {
      await onApply(text, importConfig(), source);
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
      <div><h3>{cadence ? 'Colar produção dos PAs' : 'Colar produção das cooperativas'}</h3><p>Copie as células da planilha com o cabeçalho e cole abaixo.</p></div>
      <span className={styles.badge}>{cadence ? 'Cadência PA · Venda Nova' : 'Centrais e cooperativas'}</span>
    </header>
    <div className={`${styles.fields} ${cadence ? '' : styles.baseFields}`}>
      <label className={styles.source}>Fonte dos dados<select aria-label="Fonte dos dados" value={source} disabled={locked} onChange={event => { invalidate(); setSource(event.target.value as PasteSource); }}><option value="cadence">Cadência PA</option><option value="base">Centrais e cooperativas</option></select></label>
      <label>Ano do cadastro<input aria-label="Ano da produção colada" type="number" value={config.year} readOnly /></label>
      {cadence ? <label>Data de corte<input aria-label="Data de corte da produção colada" type="date" min={`${config.year}-01-01`} max={`${config.year}-12-31`} value={cutoff} disabled={locked} onChange={event => { invalidate(); setCutoff(event.target.value); }} /></label> : <>
        <label>Data de corte de Venda Nova<input aria-label="Data de corte de Venda Nova" type="date" min={`${config.year}-01-01`} max={`${config.year}-12-31`} value={vnCutoff} disabled={locked} onChange={event => { invalidate(); setVnCutoff(event.target.value); }} /></label>
        <label>Data de corte de Arrecadação<input aria-label="Data de corte de Arrecadação" type="date" min={`${config.year}-01-01`} max={`${config.year}-12-31`} value={arCutoff} disabled={locked} onChange={event => { invalidate(); setArCutoff(event.target.value); }} /></label>
      </>}
    </div>
    <label className={styles.paste}>{inputLabel}
      <textarea aria-label={inputLabel} spellCheck={false} wrap="off" value={text} disabled={locked} placeholder={'Cole aqui o cabeçalho e as linhas copiadas do Excel (Ctrl + V).'} onChange={event => { invalidate(); setText(event.target.value); }} />
    </label>
    <p className={styles.note}>Metas cadastradas preservadas. Células vazias mantêm valores; traço (-) atualiza para zero.</p>
    {!cadence && <p className={styles.note}>As centrais serão recalculadas a partir das cooperativas. Venda Nova e Arrecadação são atualizadas separadamente, conforme seus cortes.</p>}
    <div className={styles.actions}>
      <button type="button" className="button quiet" disabled={locked || !text} onClick={() => { invalidate(); setText(''); }}>Limpar dados</button>
      <button type="button" className="button secondary" disabled={locked || !text.trim() || cadence && !cutoff} onClick={() => void review()}>{pending && !applying ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <ClipboardPaste size={16} aria-hidden="true" />}Conferir prévia</button>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {validPreview && <div className={styles.preview} ref={feedback} tabIndex={-1} aria-label="Prévia da atualização">
      <div className={styles.previewHeading}><CheckCircle2 size={18} aria-hidden="true" /><h3>Prévia da atualização</h3>{cadence && <span>{dateLabel(cutoff)}</span>}</div>
      <div className={`${styles.cards} ${cadence ? '' : styles.baseCards}`}>
        <div><strong>{previewRows.length}</strong><span>{cadence ? 'PAs recebidos' : 'Registros de produção'}</span></div>
        <div><strong>{new Set(previewRows.map(row => `${row.central}:${row.cooperative}`)).size}</strong><span>Cooperativas</span></div>
        {cadence ? <><div><strong>{validPreview.months.length}</strong><span>Meses até o corte</span></div><div><strong>{money(previewRows.reduce((value, row) => value + total(row), 0))}</strong><span>Produção colada até o corte</span></div></> : <><div><strong>{new Set(previewRows.map(row => row.central)).size}</strong><span>Centrais</span></div><div><strong>{metrics.length}</strong><span>{metrics.length === 1 ? 'Carteira' : 'Carteiras'}</span></div></>}
      </div>
      {!cadence && <div className={styles.metricTotals}>{metrics.map(metric => <div key={metric}><span>{metric === 'VN' ? 'Venda Nova' : 'Arrecadação'} · {dateLabel(metric === 'VN' ? vnCutoff : arCutoff)}</span><strong>{money(previewRows.filter(row => row.metric === metric).reduce((value, row) => value + total(row), 0))}</strong><small>Produção colada até o corte</small></div>)}</div>}
      <p className={styles.note}>{validPreview.cellCount} valores mensais recebidos · {validPreview.months.map(month => MONTHS[month]).join(' · ')}</p>
      {validPreview.newCount > 0 && <p className={styles.notice}>{validPreview.newCount} {cadence ? validPreview.newCount === 1 ? 'PA novo será incluído' : 'PAs novos serão incluídos' : validPreview.newCount === 1 ? 'novo registro de produção será incluído' : 'novos registros de produção serão incluídos'} com {!cadence || config.paTargetMode === 'source' || config.year < 2026 && config.paTargetMode !== 'group' ? 'as metas da planilha' : 'as metas da regra P1–P5'}. As metas já cadastradas permanecem iguais.</p>}
      {validPreview.skipped > 0 && <p className={styles.notice}>{validPreview.skipped} {validPreview.skipped === 1 ? 'linha de central fora do cadastro foi desconsiderada' : 'linhas de centrais fora do cadastro foram desconsideradas'}.</p>}
      {validPreview.afterCutoff > 0 && <p className={styles.notice}>{validPreview.afterCutoff} {validPreview.afterCutoff === 1 ? 'valor após o corte não será aplicado' : 'valores após o corte não serão aplicados'} nesta atualização.</p>}
      {validPreview.manualCount > 0 && <p className={styles.notice}>{validPreview.manualCount} {validPreview.manualCount === 1 ? 'ajuste manual do mesmo corte será mantido' : 'ajustes manuais do mesmo corte serão mantidos'}. Para substituir {validPreview.manualCount === 1 ? 'esse ajuste' : 'esses ajustes'}, use uma posição mais recente.</p>}
      <div className={styles.tableScroll}><table><caption>Amostra: {Math.min(5, previewRows.length)} de {previewRows.length} {cadence ? 'PAs' : 'registros'}</caption><thead><tr><th>{cadence ? 'PA' : 'Cooperativa'}</th><th>{cadence ? 'Central / Cooperativa / PA' : 'Central / Cooperativa'}</th>{!cadence && <th>Carteira</th>}<th>Produção até o corte</th></tr></thead><tbody>{previewRows.slice(0, 5).map(row => <tr key={row.key}><th scope="row">{row.name}</th><td>{row.central} / {row.cooperative}{cadence ? ` / ${row.pa}` : ''}</td>{!cadence && <td>{row.metric === 'VN' ? 'Venda Nova' : 'Arrecadação'}</td>}<td>{money(total(row))}</td></tr>)}</tbody></table></div>
      {validPreview.issues.length > 0 && <details className={styles.details}><summary>Conferências da origem ({validPreview.issues.length})</summary><ul>{validPreview.issues.slice(0, 10).map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>{validPreview.issues.length > 10 && <p>As demais conferências estarão disponíveis na Conferência da base após a atualização.</p>}</details>}
      <footer className={styles.footer}><span>Os valores dos meses recebidos substituirão a produção correspondente.</span><button type="button" className="button primary" disabled={locked} onClick={() => void apply()}>{applying ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}Atualizar produção</button></footer>
    </div>}
  </section>;
}
