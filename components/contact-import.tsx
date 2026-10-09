'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, Upload, X } from 'lucide-react';
import { buildContactImportPreview, readContactWorkbook, type ContactImportSourceRow, type ContactImportWorkbook } from '@/lib/contact-import.mjs';
import { readWorkbookFile, XLSX_FILE_LIMIT_MB } from '@/lib/xlsx-safety.mjs';
import { importResponsibleContacts, listWorkspaceResponsibleContacts, type ResponsibleContact } from '@/lib/contact-store';
import type { RegistryEntity } from '@/lib/types';
import styles from './contact-import.module.css';

type Props = {
  entities: RegistryEntity[]; year: number; userId: string; workspaceRevision: number;
  onClose: () => void; onImported: () => void;
  onDirtyChange?: (dirty: boolean) => void; onSavingChange?: (saving: boolean) => void;
};
const messageOf = (reason: unknown) => reason instanceof Error ? reason.message : 'Não foi possível importar os contatos.';
const statusLabel = { create: 'Novo', update: 'Atualizar', unchanged: 'Sem alteração', duplicate: 'Repetido', invalid: 'Revisar' };

export default function ContactImport({ entities, year, userId, workspaceRevision, onClose, onImported, onDirtyChange, onSavingChange }: Props) {
  const [rows, setRows] = useState<ContactImportSourceRow[]>([]);
  const [workbook, setWorkbook] = useState<ContactImportWorkbook | null>(null);
  const [contacts, setContacts] = useState<ResponsibleContact[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [filename, setFilename] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const closeButton = useRef<HTMLButtonElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const alive = useRef(true);
  const generation = useRef(0);
  const locked = loading || saving;
  const context = JSON.stringify([userId, year, workspaceRevision, entities]);
  const currentContext = useRef(context);
  currentContext.current = context;
  const preview = useMemo(() => ready ? buildContactImportPreview({ rows, entities, contacts }) : [], [ready, rows, entities, contacts]);
  const changes = preview.filter(item => item.status === 'create' || item.status === 'update');
  const selectedRows = changes.filter(item => selected.includes(item.key));
  const dirty = rows.length > 0 && (!ready || preview.some(item => ['create', 'update', 'invalid'].includes(item.status)));
  const valid = (snapshot: string, task: number) => alive.current && currentContext.current === snapshot && generation.current === task;

  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null, previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; closeButton.current?.focus();
    return () => { document.body.style.overflow = previous; if (opener?.isConnected) opener.focus(); };
  }, []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; }; }, []);
  useEffect(() => {
    generation.current++; setRows([]); setWorkbook(null); setContacts([]); setSelected([]); setFilename(''); setReady(false); setLoading(false); setSaving(false); setError(''); setNotice('');
  }, [context]);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => { onSavingChange?.(locked); return () => onSavingChange?.(false); }, [locked, onSavingChange]);
  useEffect(() => { if (!locked && (error || notice)) feedback.current?.focus(); }, [locked, error, notice]);

  function close() {
    if (locked || dirty && !window.confirm('Descartar a prévia de contatos sem salvar?')) return;
    onClose();
  }
  async function chooseFile(file: File | undefined) {
    if (!file || locked) return;
    const task = ++generation.current, snapshot = context;
    setRows([]); setWorkbook(null); setContacts([]); setSelected([]); setReady(false); setError(''); setNotice(''); setLoading(true); setFilename(file.name);
    try {
      const buffer = await readWorkbookFile(file);
      if (!valid(snapshot, task)) return;
      const parsed = await readContactWorkbook(buffer);
      if (!valid(snapshot, task)) return;
      setRows(parsed.rows); setWorkbook(parsed); setSelected(parsed.rows.map(row => row.key));
      const existing = await listWorkspaceResponsibleContacts(year, userId);
      if (!valid(snapshot, task)) return;
      setContacts(existing); setReady(true);
    } catch (reason) { if (valid(snapshot, task)) setError(messageOf(reason)); }
    finally { if (valid(snapshot, task)) setLoading(false); }
  }
  async function reloadPreview() {
    if (locked || !rows.length) return;
    const task = ++generation.current, snapshot = context;
    setLoading(true); setReady(false); setError('');
    try {
      const existing = await listWorkspaceResponsibleContacts(year, userId);
      if (valid(snapshot, task)) { setContacts(existing); setReady(true); }
    } catch (reason) { if (valid(snapshot, task)) setError(messageOf(reason)); }
    finally { if (valid(snapshot, task)) setLoading(false); }
  }
  function edit(key: string, field: 'name' | 'emailsText' | 'whatsapp', value: string) {
    if (locked) return;
    setRows(current => current.map(row => row.key === key ? { ...row, [field]: value } : row)); setNotice(''); setError('');
  }
  async function save() {
    if (locked || !ready || !selectedRows.length) return;
    const task = ++generation.current, snapshot = context;
    const payload = selectedRows.map(item => ({ entity: item.entity!, input: item.input!, contactId: item.contactId, expectedUpdatedAt: item.expectedUpdatedAt }));
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await importResponsibleContacts(year, payload, userId, workspaceRevision);
      if (!valid(snapshot, task)) return;
      setNotice(`Contatos salvos: ${result.created} novos, ${result.updated} atualizados e ${result.unchanged} sem alteração.`);
      onImported(); setReady(false);
      try {
        const existing = await listWorkspaceResponsibleContacts(year, userId);
        if (valid(snapshot, task)) { setContacts(existing); setReady(true); }
      } catch {
        if (valid(snapshot, task)) setError('Contatos salvos. Não foi possível atualizar a prévia; clique em Recarregar prévia.');
      }
    } catch (reason) { if (valid(snapshot, task)) { setError(messageOf(reason)); setReady(false); } }
    finally { if (valid(snapshot, task)) setSaving(false); }
  }

  return <div className={styles.backdrop}>
    <section ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="contact-import-title" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key !== 'Tab') return;
      const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')].filter(node => node.getClientRects().length && !node.closest('[hidden]'));
      if (!nodes.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
    }}>
      <header className={styles.header}><div><h2 id="contact-import-title">Importar contatos das cooperativas</h2><p>Cadastro de {year}. Revise os contatos antes de salvar.</p></div><button ref={closeButton} type="button" className="icon-button" aria-label="Fechar importação de contatos" disabled={locked} onClick={close}><X size={21} aria-hidden="true" /></button></header>
      <div className={styles.file}><label>Planilha de contatos<input ref={fileInput} type="file" accept=".xlsx" aria-label="Planilha de contatos" disabled={locked} onChange={event => { void chooseFile(event.target.files?.[0]); event.target.value = ''; }} /></label><p>Arquivo .xlsx, até {XLSX_FILE_LIMIT_MB} MB e 1.000 contatos. Use Central, Código da cooperativa (ou Nº), Nome, E-mail e Telefone. As demais colunas não alteram metas ou produção.</p></div>
      {(error || notice) && <div ref={feedback} tabIndex={-1} className={styles.feedback}>{error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.success}>{notice}</p>}</div>}
      {loading && <p role="status" className={styles.loading}><LoaderCircle size={17} className="spin" aria-hidden="true" />Preparando prévia…</p>}
      {rows.length > 0 && <div className={styles.actions}><span>{filename} · {rows.length} linhas</span><button type="button" className="button secondary" disabled={locked} onClick={() => void reloadPreview()}>Recarregar prévia</button></div>}
      {workbook?.rows.some(row => row.nameMissing) && <p className={styles.note}>A planilha não informa todos os responsáveis. Usaremos “Contato comercial” nos nomes ausentes; você pode editar os nomes.</p>}
      {workbook?.warnings.map(warning => <p key={warning} className={styles.note}>{warning}</p>)}
      {ready && <section aria-label="Prévia da importação de contatos" className={styles.preview}>
        <div className={styles.summary}><strong>{preview.filter(item => item.status === 'create').length} novos · {preview.filter(item => item.status === 'update').length} atualizações · {preview.filter(item => item.status === 'unchanged').length} sem alteração · {preview.filter(item => item.status === 'invalid').length} para revisar · {preview.filter(item => item.status === 'duplicate').length} repetidos</strong><p>Campos em branco preservam o cadastro. E-mails novos são acrescentados. Linhas com erro ou repetidas não serão salvas.</p></div>
        {changes.length > 0 && <label className={styles.selection}><input type="checkbox" aria-label="Selecionar todos os contatos válidos" disabled={locked} checked={changes.every(item => selected.includes(item.key))} onChange={event => setSelected(event.target.checked ? rows.map(row => row.key) : [])} />Selecionar todos os contatos válidos</label>}
        <div className={styles.rows}>{preview.map(item => <article key={item.key} className={styles.row} data-import-key={item.key} data-import-status={item.status}>
          <div className={styles.rowHeading}><label className={styles.selection}><input type="checkbox" aria-label={`Selecionar contato da linha ${item.source.row} da aba ${item.source.sheet}`} checked={selected.includes(item.key) && (item.status === 'create' || item.status === 'update')} disabled={locked || !['create', 'update'].includes(item.status)} onChange={event => setSelected(current => event.target.checked ? [...new Set([...current, item.key])] : current.filter(key => key !== item.key))} /><strong>{item.entity ? `Central ${item.entity.central} · Coop. ${item.entity.cooperative} · ${item.entity.name}` : `${item.source.central || 'Central não informada'} · Coop. ${item.source.cooperativeCode} · ${item.source.cooperativeName}`}</strong></label><span className={styles.status} data-status={item.status}>{statusLabel[item.status]}</span></div>
          <small>{item.source.sheet} · linha {item.source.row}</small>
          <div className={styles.fields}><label>Nome do responsável<input aria-label={`Nome do responsável — ${item.key}`} maxLength={160} disabled={locked} value={item.source.name} onChange={event => edit(item.key, 'name', event.target.value)} /></label><label>E-mails<input aria-label={`E-mails — ${item.key}`} disabled={locked} value={item.source.emailsText} onChange={event => edit(item.key, 'emailsText', event.target.value)} /></label><label>Celular / telefone<input aria-label={`Celular ou telefone — ${item.key}`} type="tel" disabled={locked} value={item.source.whatsapp} onChange={event => edit(item.key, 'whatsapp', event.target.value)} /></label></div>
          {item.status === 'update' && item.input && <p className={styles.note}>Após salvar: {item.input.emails.join(' · ') || 'sem e-mail'}{item.input.whatsapp ? ` · ${item.input.whatsapp}` : ''}{item.input.jobTitle ? ` · ${item.input.jobTitle}` : ''}{item.input.teams ? ` · Teams: ${item.input.teams}` : ''}</p>}
          <p className={item.status === 'invalid' ? styles.error : styles.note}>{item.message}</p>
        </article>)}</div>
      </section>}
      <footer className={styles.footer}><span>{selectedRows.length} contatos selecionados para salvar</span><div className={styles.actions}><button type="button" className="button secondary" disabled={locked} onClick={close}>Cancelar importação</button><button type="button" className="button primary" disabled={locked || !ready || !selectedRows.length} onClick={() => void save()}>{saving ? <LoaderCircle size={17} className="spin" aria-hidden="true" /> : <Upload size={17} aria-hidden="true" />}Salvar contatos selecionados</button></div></footer>
    </section>
  </div>;
}
