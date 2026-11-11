'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Ban, CircleX, ClipboardList, Clock3, Upload } from 'lucide-react';
import { money } from '@/lib/analytics.mjs';
import {
  buildProposalProjection, FORECAST_STATUSES, parseProposalPaste, PROPOSAL_LABELS, PROPOSAL_STATUSES,
  sumProposalAmounts, validateProposalDate, type ProposalPosition, type ProposalProjection,
} from '@/lib/proposal-status.mjs';
import { loadProposalPosition, saveProposalPosition } from '@/lib/proposal-status-store';
import type { RegistryEntity } from '@/lib/types';
import Kpi from './ui/metric-card';
import styles from './proposal-status-panel.module.css';

type Props = {
  owner: string;
  year: number;
  years: number[];
  entities: RegistryEntity[];
  disabled: boolean;
  onYearChange: (year: number) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSavingChange: (saving: boolean) => void;
};
type Editor = { text: string; date: string; accumulated: boolean };
const icons = { cancelled: CircleX, inReview: Clock3, pending: ClipboardList, rejected: Ban };
const currency = (value: number) => money(value / 100);
const dateLabel = (value: string) => value.split('-').reverse().join('/');

function ProposalTable({ model, nameFor }: { model: ProposalProjection; nameFor: (code: string) => string | undefined }) {
  return <div className={`table-scroll ${styles.tableScroll}`} role="region" aria-label="Tabela de valores por cooperativa" tabIndex={0}>
    <table className={styles.table}>
      <thead><tr><th scope="col">Cooperativa</th>{PROPOSAL_STATUSES.map(status => <th className="numeric" key={status} scope="col">{PROPOSAL_LABELS[status]}</th>)}</tr></thead>
      <tbody>{model.rows.map(({ code, actual, forecast }) => <tr key={code}>
        <th scope="row">{code}{nameFor(code) && <small>{nameFor(code)}</small>}</th>
        {PROPOSAL_STATUSES.map(status => <td className="numeric" key={status}>
          {currency(actual[status])}
          {status !== 'accepted' && forecast[status] !== null && !model.closed && <small>31/12 · {currency(forecast[status])}</small>}
        </td>)}
      </tr>)}</tbody>
      <tfoot><tr><th scope="row">Total da seleção</th>{PROPOSAL_STATUSES.map(status => <td className="numeric" key={status}>
        {currency(model.totals[status])}
        {status !== 'accepted' && model.projected[status] !== null && !model.closed && <small>31/12 · {currency(model.projected[status])}</small>}
      </td>)}</tr></tfoot>
    </table>
  </div>;
}

export default function ProposalStatusPanel({ owner, year, years, entities, disabled, onYearChange, onDirtyChange, onSavingChange }: Props) {
  const [position, setPosition] = useState<ProposalPosition | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reload, setReload] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const [cooperative, setCooperative] = useState('all');
  const [resolution, setResolution] = useState({ inReview: '', pending: '' });
  const operation = useRef(false);
  const mounted = useRef(false);
  const selected = position && Object.hasOwn(position.amounts, cooperative) ? cooperative : 'all';
  const names = useMemo(() => {
    const byCode = new Map<string, string | undefined>();
    for (const entity of entities) {
      if (entity.kind !== 'cooperative' || !entity.cooperative) continue;
      byCode.set(entity.cooperative, byCode.has(entity.cooperative) ? undefined : entity.name.replace(/^SICOOB\s+/i, ''));
    }
    return byCode;
  }, [entities]);
  const nameFor = (code: string) => names.get(code);
  const model = useMemo(() => position ? buildProposalProjection(position, selected, resolution) : null, [position, selected, resolution]);
  const dirty = editor !== null && Boolean(editor.text.trim() || editor.date !== (position?.positionDate ?? '') || editor.accumulated !== (position?.accumulatedSinceJanuary ?? false));
  const preview = useMemo(() => {
    if (!editor?.text.trim()) return null;
    try {
      const amounts = parseProposalPaste(editor.text);
      return { amounts, count: Object.keys(amounts).length, totals: sumProposalAmounts(amounts) };
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Não foi possível conferir a tabela.' };
    }
  }, [editor?.text]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoadState('loading');
    loadProposalPosition(owner, year).then(value => {
      if (!active) return;
      setPosition(value);
      setLoadState('ready');
    }).catch(() => { if (active) setLoadState('error'); });
    return () => { active = false; };
  }, [owner, year, reload]);

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    onSavingChange(saving);
    return () => onSavingChange(false);
  }, [saving, onSavingChange]);

  function openEditor() {
    setFeedback(null);
    setEditor({ text: '', date: position?.positionDate ?? '', accumulated: position?.accumulatedSinceJanuary ?? false });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amounts = preview ? preview.amounts : position?.amounts;
    if (!editor || !amounts || !dirty || disabled || operation.current) return;
    operation.current = true;
    setFeedback(null);
    setSaving(true);
    try {
      const positionDate = editor.date || null;
      validateProposalDate(year, positionDate, editor.accumulated);
      const saved = await saveProposalPosition(owner, { year, positionDate, accumulatedSinceJanuary: editor.accumulated, amounts }, position?.revision ?? null);
      if (!mounted.current) return;
      setPosition(saved);
      setEditor(null);
      setFeedback({ error: false, text: 'Base de propostas salva.' });
    } catch (cause) {
      if (mounted.current) setFeedback({ error: true, text: cause instanceof Error ? cause.message : 'Não foi possível salvar a base de propostas.' });
    } finally {
      operation.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return <div className={styles.layout}>
    <section className={`panel ${styles.toolbar}`} aria-label="Filtros de propostas">
      <div className={styles.filters}>
        <label>Ano<select value={year} disabled={disabled || saving} onChange={event => onYearChange(Number(event.target.value))}>
          {years.map(option => <option key={option} value={option}>{option}</option>)}
        </select></label>
        <label>Cooperativa<select value={selected} disabled={!position || loadState !== 'ready'} onChange={event => setCooperative(event.target.value)}>
          <option value="all">Todas</option>
          {Object.keys(position?.amounts ?? {}).map(code => <option key={code} value={code}>{code}{nameFor(code) && ` · ${nameFor(code)}`}</option>)}
        </select></label>
      </div>
      {loadState === 'ready' && !editor && <button className="button secondary" type="button" disabled={disabled} onClick={openEditor}>
        <Upload size={16} aria-hidden="true" />{position ? 'Atualizar base' : 'Adicionar base'}
      </button>}
    </section>

    {loadState === 'loading' && <p role="status" className="muted">Carregando a base de propostas…</p>}
    {loadState === 'error' && <section className={`panel ${styles.state}`}>
      <p role="alert">Não foi possível carregar a base de propostas.</p>
      <button className="button secondary" type="button" onClick={() => setReload(value => value + 1)}>Tentar novamente</button>
    </section>}
    {loadState === 'ready' && !model && !editor && <p className="panel muted">Nenhuma base de propostas salva para {year}.</p>}

    {editor && <form className={`panel ${styles.editor}`} aria-label="Atualizar base de propostas" onSubmit={save}>
      <div><h2>{position ? 'Atualizar base de propostas' : 'Adicionar base de propostas'}</h2>
        <p className="muted">Cole a tabela do Excel com os códigos das cooperativas e as colunas de situação. Células vazias valem zero.</p></div>
      <div className={styles.editorFields}>
        <label>Data-base<input type="date" min={`${year}-01-01`} max={`${year}-12-31`} value={editor.date} disabled={saving || disabled} onChange={event => setEditor({ ...editor, date: event.target.value, accumulated: Boolean(event.target.value) && editor.accumulated })} /></label>
        <label className={styles.check}><input type="checkbox" checked={editor.accumulated} disabled={!editor.date || saving || disabled} onChange={event => setEditor({ ...editor, accumulated: event.target.checked })} /> Canceladas e recusadas acumuladas desde 1º de janeiro</label>
      </div>
      <label>Tabela por cooperativa<textarea rows={5} value={editor.text} disabled={saving || disabled} spellCheck={false}
        placeholder={position ? 'Deixe em branco para atualizar apenas a data-base.' : 'Cole o cabeçalho e as linhas da planilha.'}
        onChange={event => setEditor({ ...editor, text: event.target.value })} /></label>
      {preview?.error && <p className="message error" role="alert">{preview.error}</p>}
      {preview?.amounts && <div className={styles.preview} aria-live="polite">
        <strong>{preview.count} {preview.count === 1 ? 'cooperativa' : 'cooperativas'} na nova base</strong>
        <dl>{PROPOSAL_STATUSES.map(status => <div key={status}><dt>{PROPOSAL_LABELS[status]}</dt><dd>{currency(preview.totals[status])}</dd></div>)}</dl>
        {position && <p>A nova tabela substitui a base de {year} inteira.</p>}
      </div>}
      {feedback?.error && <p className="message error" role="alert">{feedback.text}</p>}
      <div className={styles.actions}>
        <button className="button quiet" type="button" disabled={saving} onClick={() => { setEditor(null); setFeedback(null); }}>Cancelar</button>
        <button className="button primary" type="submit" disabled={!dirty || !!preview?.error || (!position && !preview?.amounts) || saving || disabled}>{saving ? 'Salvando…' : 'Salvar base'}</button>
      </div>
    </form>}
    {feedback && !feedback.error && <p className="message success" role="status">{feedback.text}</p>}

    {loadState === 'ready' && model && position && <>
      <section className={styles.layout} aria-label="Posição informada">
        <header className={styles.position}><h2>Posição informada</h2><p>{position.positionDate ? `Data-base ${dateLabel(position.positionDate)}` : 'Data-base não informada'}</p></header>
        <div className={styles.cards}>{FORECAST_STATUSES.map(status => {
          const Icon = icons[status];
          const projected = model.projected[status];
          return <Kpi key={status} title={PROPOSAL_LABELS[status]} icon={<Icon size={20} />} value={currency(model.totals[status])}
            sub={projected === null ? 'Sem projeção' : model.closed ? 'Fechamento em 31/12' : `Projeção 31/12 · ${currency(projected)}`} />;
        })}</div>
      </section>

      <section className={`panel ${styles.scenario}`} aria-label="Projeção de fechamento">
        <div><h2>Projeção de fechamento</h2>
          <p className="muted">{position.accumulatedSinceJanuary
            ? 'Canceladas e recusadas seguem o ritmo diário do acumulado desde janeiro.'
            : 'Informe a data-base e confirme o acumulado desde janeiro em Atualizar base para projetar canceladas e recusadas.'}</p></div>
        {!model.closed && <>
          <p className="muted">Simule o saldo em aberto em 31/12 pelo percentual do valor informado que espera resolver até lá.</p>
          <div className={styles.rates}>
            <label>Resolução em análise (%)<input type="number" min="0" max="100" step="0.01" placeholder="0 a 100" value={resolution.inReview} onChange={event => setResolution({ ...resolution, inReview: event.target.value })} /></label>
            <label>Resolução de pendentes (%)<input type="number" min="0" max="100" step="0.01" placeholder="0 a 100" value={resolution.pending} onChange={event => setResolution({ ...resolution, pending: event.target.value })} /></label>
          </div>
        </>}
      </section>

      <section className={`panel ${styles.breakdown}`} aria-label="Valores por cooperativa">
        <header className={styles.position}><div><h2>Por cooperativa</h2><p>{model.rows.length} {model.rows.length === 1 ? 'cooperativa' : 'cooperativas'}</p></div>
          <p><strong>{currency(model.totals.inReview + model.totals.pending)}</strong> em análise e pendentes</p></header>
        <ProposalTable model={model} nameFor={nameFor} />
      </section>
    </>}
  </div>;
}
