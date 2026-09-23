'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Download, ExternalLink, ImageIcon, LayoutDashboard, Mail, X } from 'lucide-react';
import { buildPaScenarioReport, renderPaScenarioPng } from '@/lib/pa-scenario-share.mjs';
import { buildCooperativeScenarioReport, renderCooperativeScenarioPng } from '@/lib/cooperative-scenario-share.mjs';
import { buildEmailFile, buildOutlookLink, buildWhatsappLink, normalizeRecipients } from '@/lib/portfolio-communication.mjs';
import type { Dataset } from '@/lib/types';
import { money, percent } from '@/lib/analytics.mjs';
import { SORT_OPTIONS } from '@/lib/scenarios.mjs';
import type { ScenarioFilters } from './scenario-panels';
import EmailPreview from './email-preview';
import OutlookHandoff from './outlook-handoff';
import styles from './pa-scenario-share.module.css';

type UnitKind = 'pa' | 'cooperative';
type Format = 'image' | 'email' | 'summary';
type SelectionMode = 'all' | 'filtered' | 'selected';
type UnitOrder = 'name' | 'production' | 'attainment-desc' | 'attainment' | 'gap';
export type PaScenarioShareProps = {
  dataset: Dataset; filters: ScenarioFilters; userId: string; onClose: () => void; unitKind?: UnitKind;
  initialFormat?: Format; initialMode?: SelectionMode; initialSelectedIds?: string[];
};
type Report = ReturnType<typeof buildPaScenarioReport> | ReturnType<typeof buildCooperativeScenarioReport>;
type Part = Report['parts'][number];
const UNITS = {
  pa: { title: 'Compartilhar cenário dos PAs', preview: 'Cenário dos PAs', plural: 'PAs', singular: 'PA', group: 'PAs no compartilhamento', all: 'Todos os PAs da seleção', filtered: 'Somente PAs filtrados', empty: 'Nenhum PA nesta seleção.', filename: 'pas' },
  cooperative: { title: 'Compartilhar cenário das cooperativas', preview: 'Cenário das cooperativas', plural: 'cooperativas', singular: 'cooperativa', group: 'Cooperativas no compartilhamento', all: 'Todas as cooperativas da seleção', filtered: 'Somente cooperativas filtradas', empty: 'Nenhuma cooperativa nesta seleção.', filename: 'cooperativas' },
} as const;
const messageOf = (reason: unknown) => reason instanceof Error ? reason.message : 'Não foi possível preparar o compartilhamento.';
const searchText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

function attempt<T>(operation: () => T): { value: T | null; error: string } {
  try { return { value: operation(), error: '' }; }
  catch (reason) { return { value: null, error: messageOf(reason) }; }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PaScenarioShare({ dataset, filters, userId, onClose, unitKind = 'pa', initialFormat = 'image', initialMode = 'all', initialSelectedIds }: PaScenarioShareProps) {
  const titleId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  const [clipboardVersion, setClipboardVersion] = useState(0);
  const invalidateClipboard = useCallback(() => setClipboardVersion((value) => value + 1), []);
  const contextKey = JSON.stringify([userId, dataset.year, filters, unitKind, initialFormat, initialMode, initialSelectedIds]);

  useLayoutEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const opener = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; if (opener?.isConnected) opener.focus(); };
  }, []);

  return <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.dialog} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,iframe,[tabindex="0"]')]
        .filter((node) => node.getClientRects().length > 0 && !node.closest('[hidden]'));
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
    }}>
      <header className={styles.heading}>
        <h2 id={titleId}>{UNITS[unitKind].title}</h2>
        <button ref={closeButton} type="button" className="icon-button" aria-label="Fechar compartilhamento" onClick={onClose}><X size={22} aria-hidden="true" /></button>
      </header>
      {userId ? <ShareContent key={contextKey} dataset={dataset} filters={filters} userId={userId} unitKind={unitKind} initialFormat={initialFormat} initialMode={initialMode} initialSelectedIds={initialSelectedIds} clipboardVersion={clipboardVersion} onClipboardChange={invalidateClipboard} /> : <p className={styles.error} role="alert">Entre na sua conta para compartilhar o cenário.</p>}
    </section>
  </div>;
}

function ShareContent({ dataset, filters, userId, unitKind = 'pa', initialFormat = 'image', initialMode = 'all', initialSelectedIds, clipboardVersion, onClipboardChange }: Omit<PaScenarioShareProps, 'onClose'> & { clipboardVersion: number; onClipboardChange: () => void }) {
  const unit = UNITS[unitKind];
  const countUnits = (count: number) => `${count} ${count === 1 ? unit.singular : unit.plural}`;
  const scopeName = useId();
  const channelName = useId();
  const [mode, setMode] = useState<SelectionMode>(initialMode);
  const [channel, setChannel] = useState<Format>(initialFormat);
  const [selectedIds, setSelectedIds] = useState<string[] | null>(initialSelectedIds ?? (initialMode === 'selected' ? [] : null));
  const [selectionSearch, setSelectionSearch] = useState('');
  const [sortBy, setSortBy] = useState<UnitOrder>(Object.hasOwn(SORT_OPTIONS, filters.sortBy) ? filters.sortBy as UnitOrder : 'attainment-desc');
  const [subject, setSubject] = useState<string | null>(null);
  const [intro, setIntro] = useState<string | null>(null);
  const [cta, setCta] = useState<string | null>(null);
  const [whatsappContent, setWhatsappContent] = useState<'caption' | 'report'>('caption');
  const [partIndex, setPartIndex] = useState(0);
  const [phone, setPhone] = useState('');
  const [addresses, setAddresses] = useState('');
  const [personal, setPersonal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [whatsappCopied, setWhatsappCopied] = useState('');
  const [manualWhatsapp, setManualWhatsapp] = useState('');
  const [feedback, setFeedback] = useState({ snapshot: '', text: '', error: false });
  const baseBuilt = useMemo(() => attempt(() => unitKind === 'cooperative' ? buildCooperativeScenarioReport({ dataset, filters, mode: 'all', sortBy }) : buildPaScenarioReport({ dataset, filters, mode: 'all', sortBy })), [dataset, filters, sortBy, unitKind]);
  const baseReport = baseBuilt.value;
  const built = useMemo(() => attempt(() => {
    const options = { dataset, filters, mode, selectedIds: selectedIds ?? [], sortBy, customization: { subject: subject ?? undefined, intro: intro ?? undefined, cta: cta ?? undefined } };
    return unitKind === 'cooperative' ? buildCooperativeScenarioReport(options) : buildPaScenarioReport(options);
  }), [dataset, filters, mode, selectedIds, sortBy, subject, intro, cta, unitKind]);
  const report = built.value;
  const page = Math.min(partIndex, Math.max(0, (report?.parts.length ?? 0) - 1));
  const part = report?.parts[page];
  const whatsappText = whatsappContent === 'caption' ? report?.caption ?? '' : report?.whatsapp ?? '';
  const snapshot = JSON.stringify([userId, dataset.year, filters, unitKind, mode, selectedIds, sortBy, subject, intro, cta, report?.html, page, channel, phone, addresses, personal, whatsappContent, whatsappText]);
  const current = useRef(snapshot);
  current.current = snapshot;
  const alive = useRef(true);
  const clipboardGeneration = useRef(0);
  const imageCache = useRef<{ part: Part; promise: Promise<Blob> } | null>(null);

  useEffect(() => {
    alive.current = true;
    const invalidate = () => { clipboardGeneration.current++; setWhatsappCopied(''); };
    document.addEventListener('copy', invalidate);
    document.addEventListener('cut', invalidate);
    window.addEventListener('blur', invalidate);
    return () => {
      alive.current = false;
      clipboardGeneration.current++;
      document.removeEventListener('copy', invalidate);
      document.removeEventListener('cut', invalidate);
      window.removeEventListener('blur', invalidate);
    };
  }, []);

  const getImage = useCallback(() => {
    if (!part) return Promise.reject(new Error(unit.empty));
    if (imageCache.current?.part === part) return imageCache.current.promise;
    const promise = unitKind === 'cooperative' ? renderCooperativeScenarioPng(part) : renderPaScenarioPng(part);
    // The preview and clipboard can consume the same promise at different times.
    void promise.catch(() => { if (imageCache.current?.part === part) imageCache.current = null; });
    imageCache.current = { part, promise };
    return promise;
  }, [part, unit.empty, unitKind]);

  const recipients = attempt(() => normalizeRecipients(addresses));
  const outlook = attempt(() => report && recipients.value ? buildOutlookLink({ recipients: recipients.value, subject: report.subject, body: '', personal }) : null);
  const whatsapp = attempt(() => report ? buildWhatsappLink({ phone, body: whatsappText }) : null);
  const isCurrent = (captured: string) => alive.current && current.current === captured;
  const notice = feedback.snapshot === snapshot ? feedback : null;
  const filename = `cenario-${unit.filename}-${dataset.year}-${filters.month + 1}-${mode}-parte-${page + 1}-de-${report?.parts.length ?? 1}.png`;

  function changeChannel(next: Format) { setChannel(next); setWhatsappCopied(''); }
  function changeMode(next: SelectionMode) {
    if (next === 'selected' && selectedIds === null) setSelectedIds(report?.rows.map((row) => row.id) ?? []);
    setMode(next); setPartIndex(0); setWhatsappCopied('');
  }
  function updateSelection(ids: string[]) { setSelectedIds(ids); setPartIndex(0); setWhatsappCopied(''); }

  async function copyText() {
    if (!report?.count || busy) return;
    const captured = snapshot;
    const generation = ++clipboardGeneration.current;
    setBusy(true); setFeedback({ snapshot: '', text: '', error: false }); setWhatsappCopied(''); setManualWhatsapp(''); onClipboardChange();
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(whatsappText);
      if (isCurrent(captured) && generation === clipboardGeneration.current) {
        setWhatsappCopied(captured);
        setFeedback({ snapshot: captured, text: 'Texto copiado. Cole no WhatsApp.', error: false });
      }
    } catch {
      if (isCurrent(captured) && generation === clipboardGeneration.current) {
        setManualWhatsapp(captured);
        setFeedback({ snapshot: captured, text: 'A cópia foi bloqueada. Em “Ver texto do WhatsApp”, copie manualmente e cole na conversa.', error: true });
      }
    } finally { if (alive.current) setBusy(false); onClipboardChange(); }
  }

  async function imageAction(copy: boolean) {
    if (!part || busy) return;
    const captured = snapshot;
    setBusy(true); setFeedback({ snapshot: '', text: '', error: false });
    if (copy) { clipboardGeneration.current++; setWhatsappCopied(''); setManualWhatsapp(''); onClipboardChange(); }
    const png = getImage();
    try {
      if (copy) {
        if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Clipboard unavailable');
        const guardedPng = png.then((blob) => {
          if (!isCurrent(captured)) throw new Error('A seleção mudou durante a preparação da imagem.');
          return blob;
        });
        void guardedPng.catch(() => {});
        // Keep the clipboard call in the click gesture, including Safari.
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': guardedPng })]);
        if (isCurrent(captured)) setFeedback({ snapshot: captured, text: `Imagem da parte ${page + 1} copiada. Cole na conversa.`, error: false });
      } else {
        const blob = await png;
        if (!isCurrent(captured)) return;
        downloadBlob(blob, filename);
        setFeedback({ snapshot: captured, text: `Imagem da parte ${page + 1} baixada. Anexe o arquivo na conversa.`, error: false });
      }
    } catch (reason) {
      if (!isCurrent(captured)) return;
      if (copy) {
        try {
          const blob = await png;
          if (!isCurrent(captured)) return;
          downloadBlob(blob, filename);
          setFeedback({ snapshot: captured, text: 'A cópia da imagem foi bloqueada. Anexe o PNG baixado.', error: false });
        } catch (downloadReason) {
          if (isCurrent(captured)) setFeedback({ snapshot: captured, text: messageOf(downloadReason), error: true });
        }
      } else setFeedback({ snapshot: captured, text: messageOf(reason), error: true });
    } finally { if (alive.current) setBusy(false); if (copy) onClipboardChange(); }
  }

  function downloadEmail() {
    if (!report?.count || !recipients.value || recipients.error) return;
    try {
      const content = buildEmailFile({ recipients: recipients.value, subject: report.subject, text: report.text, html: report.html });
      downloadBlob(new Blob([content], { type: 'message/rfc822' }), `cenario-${unit.filename}-${dataset.year}-${filters.month + 1}-${mode}.eml`);
      setFeedback({ snapshot, text: 'E-mail baixado com o painel completo. Abra no Outlook e revise.', error: false });
    } catch (reason) { setFeedback({ snapshot, text: messageOf(reason), error: true }); }
  }

  if (!baseReport) return <p role="alert" className={styles.error}>{baseBuilt.error}</p>;
  const selected = new Set(selectedIds ?? []);
  const visibleCandidates = baseReport.candidates.filter((row) => searchText(`${row.name} ${row.central} ${row.cooperative} ${row.pa} ${row.group}`).includes(searchText(selectionSearch.trim())));
  const candidateTitle = (row: Report['rows'][number]) => unitKind === 'pa' ? `PA ${row.pa} · ${row.name}` : `Cooperativa ${row.cooperative} · ${row.name}`;
  const candidateParent = (row: Report['rows'][number]) => `${unitKind === 'pa' ? `Coop. ${row.cooperative} · ` : ''}Central ${row.central}`;
  const actionFeedback = <>
    {busy && <p role="status" className={styles.feedback}>Preparando compartilhamento…</p>}
    {notice?.text && <p role={notice.error ? 'alert' : 'status'} className={notice.error ? styles.error : styles.feedback}>{notice.text}</p>}
  </>;

  return <div className={styles.content}>
    <div className={styles.context}><strong>{baseReport.scopeLabel}</strong><span>{baseReport.metric === 'AR' ? 'Arrecadação' : 'Venda Nova'} · {baseReport.periodLabel}</span></div>
    <fieldset className={styles.scope}><legend>{unit.group}</legend>
      <label className={mode === 'all' ? styles.selectedScope : ''}><input type="radio" aria-label={unit.all} name={scopeName} checked={mode === 'all'} onChange={() => changeMode('all')} /><span><strong>{unit.all}</strong><small>{countUnits(baseReport.allCount)} na seleção</small></span></label>
      <label className={mode === 'filtered' ? styles.selectedScope : ''}><input type="radio" aria-label={unit.filtered} name={scopeName} checked={mode === 'filtered'} onChange={() => changeMode('filtered')} /><span><strong>{unit.filtered}</strong><small>{countUnits(baseReport.filteredCount)} após os filtros</small></span></label>
      <label className={mode === 'selected' ? styles.selectedScope : ''}><input type="radio" aria-label="Selecionar unidades" name={scopeName} checked={mode === 'selected'} onChange={() => changeMode('selected')} /><span><strong>Selecionar unidades</strong><small>{selectedIds === null ? 'Escolha na lista' : `${countUnits(selectedIds.length)} marcadas`}</small></span></label>
    </fieldset>
    {mode === 'selected' && <section className={styles.unitSelector} aria-label="Seleção de unidades">
      <label className={styles.field}>Buscar unidades para selecionar<input type="search" value={selectionSearch} onChange={(event) => setSelectionSearch(event.target.value)} placeholder="Nome, código, cooperativa ou central" /></label>
      <div className={styles.selectionToolbar}><p className={styles.helper}>{visibleCandidates.length} visíveis · {selected.size} marcadas. A busca mantém as escolhas.</p><div className={styles.actions}>
        <button type="button" className="button secondary" disabled={!visibleCandidates.length} onClick={() => updateSelection([...new Set([...(selectedIds ?? []), ...visibleCandidates.map((row) => row.id)])])}>Selecionar unidades visíveis</button>
        <button type="button" className="button quiet" disabled={!selected.size} onClick={() => updateSelection([])}>Limpar seleção</button>
      </div></div>
      <div className={styles.unitOptions}>{visibleCandidates.map((row) => <label key={row.id} className={selected.has(row.id) ? styles.checkedUnit : ''}>
        <input type="checkbox" aria-label={`Selecionar ${candidateTitle(row)} · ${candidateParent(row)}`} checked={selected.has(row.id)} onChange={(event) => updateSelection(event.target.checked ? [...selected, row.id] : [...selected].filter((id) => id !== row.id))} />
        <span><strong>{candidateTitle(row)}</strong><small>{candidateParent(row)}</small></span>
      </label>)}</div>
      {!visibleCandidates.length && <p role="status" className={styles.empty}>Nenhuma unidade corresponde à busca.</p>}
    </section>}
    <div className={styles.selectionSettings}>
      <div className={styles.summary}><strong>{countUnits(report?.count ?? 0)} no painel</strong><span>{report?.selectionLabel || (mode === 'selected' ? 'Somente as unidades marcadas.' : mode === 'all' ? 'Todas as unidades do escopo.' : 'Filtros atuais da lista aplicados.')}</span></div>
      <label className={styles.field}>Ordem das unidades<select aria-label="Ordem das unidades" value={sortBy} onChange={(event) => { setSortBy(event.target.value as UnitOrder); setPartIndex(0); }}>{Object.entries(SORT_OPTIONS).map(([value, label]) => <option key={value} value={value}>{String(label)}</option>)}</select></label>
    </div>
    <details className={styles.messageEditor}><summary>Editar mensagem</summary><div className={styles.editorFields}>
      <label className={styles.field}>Assunto da mensagem<input value={subject ?? report?.subject ?? baseReport.subject} maxLength={300} onChange={(event) => setSubject(event.target.value)} /></label>
      <label className={styles.field}>Introdução da mensagem<textarea value={intro ?? report?.intro ?? baseReport.intro} rows={2} maxLength={1000} onChange={(event) => setIntro(event.target.value)} /></label>
      <label className={styles.field}>Chamada para ação<textarea value={cta ?? report?.cta ?? baseReport.cta} rows={2} maxLength={1000} onChange={(event) => setCta(event.target.value)} /></label>
      <div className={styles.selectionToolbar}><p className={styles.helper}>Os textos acompanham o e-mail e a mensagem curta. Os indicadores permanecem calculados pela base.</p><button type="button" className="button quiet" disabled={subject === null && intro === null && cta === null} onClick={() => { setSubject(null); setIntro(null); setCta(null); }}>Restaurar textos padrão</button></div>
    </div></details>
    {!report ? <p role="alert" className={styles.error}>{built.error}</p> : !report.count ? <p role="status" className={styles.empty}>{unit.empty} Marque unidades ou ajuste o escopo.</p> : <>
      <fieldset className={styles.channels}><legend>Canal de compartilhamento</legend>
        <label className={channel === 'image' ? styles.activeChannel : ''}><input type="radio" name={channelName} checked={channel === 'image'} onChange={() => changeChannel('image')} /><ImageIcon size={18} aria-hidden="true" />WhatsApp e imagem</label>
        <label className={channel === 'email' ? styles.activeChannel : ''}><input type="radio" name={channelName} checked={channel === 'email'} onChange={() => changeChannel('email')} /><Mail size={18} aria-hidden="true" />E-mail</label>
        <label className={channel === 'summary' ? styles.activeChannel : ''}><input type="radio" name={channelName} checked={channel === 'summary'} onChange={() => changeChannel('summary')} /><LayoutDashboard size={18} aria-hidden="true" />Painel resumido</label>
      </fieldset>
      {channel === 'image' ? <section className={styles.channelPanel} aria-label="Compartilhar por WhatsApp e imagem">
        <div className={styles.pageNavigation}>
          <div><h3>Imagem do cenário</h3><p aria-live="polite">Parte {page + 1} de {report.parts.length}{part ? ` · ${unit.plural} ${part.from} a ${part.to}` : ''}</p></div>
          <div className={styles.actions}><button type="button" className="button secondary" aria-label="Parte anterior" disabled={page === 0} onClick={() => setPartIndex(page - 1)}><ChevronLeft size={18} aria-hidden="true" />Anterior</button><button type="button" className="button secondary" aria-label="Próxima parte" disabled={page >= report.parts.length - 1} onClick={() => setPartIndex(page + 1)} >Próxima<ChevronRight size={18} aria-hidden="true" /></button></div>
        </div>
        <div className={styles.deliveryControls}>
        <div className={styles.imageActions}>
        <div className={styles.actions}>
          <button type="button" className="button primary" aria-label="Copiar imagem desta parte" disabled={busy} onClick={() => void imageAction(true)}><Copy size={17} aria-hidden="true" />Copiar imagem</button>
          <button type="button" className="button secondary" aria-label="Baixar imagem desta parte" disabled={busy} onClick={() => void imageAction(false)}><Download size={17} aria-hidden="true" />Baixar PNG</button>
        </div>
        <p className={styles.helper}>Cole a imagem ou anexe o arquivo.{report.parts.length > 1 ? ` Envie as ${report.parts.length} partes.` : ''}</p>
        </div>
        <div className={styles.destination}>
          <label className={styles.field}>Texto do WhatsApp<select aria-label="Texto do WhatsApp" value={whatsappContent} onChange={(event) => { setWhatsappContent(event.target.value as 'caption' | 'report'); setWhatsappCopied(''); setManualWhatsapp(''); }}><option value="caption">Mensagem curta para acompanhar a imagem</option><option value="report">Relatório completo</option></select></label>
          <label className={styles.field}>WhatsApp do destinatário (opcional)<input type="tel" autoComplete="off" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="DDD + número, ou +DDI" /></label>
          <p className={styles.helper}>Sem número, escolha a conversa no WhatsApp.</p>
          {whatsapp.error && <p role="alert" className={styles.error}>{whatsapp.error}</p>}
          {whatsapp.value?.requiresPaste && <p className={styles.warning}>Mensagem longa: copie o texto, abra a conversa e cole.</p>}
          <div className={styles.actions}>
            <button type="button" className="button secondary" aria-label="Copiar texto do WhatsApp" disabled={busy} onClick={() => void copyText()}><Copy size={17} aria-hidden="true" />Copiar texto</button>
            {whatsapp.value && (!whatsapp.value.requiresPaste || whatsappCopied === snapshot || manualWhatsapp === snapshot) ? <a className="button primary" href={whatsapp.value.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} aria-hidden="true" />{whatsapp.value.requiresPaste ? manualWhatsapp === snapshot ? 'Abrir WhatsApp para colar manualmente' : 'Abrir WhatsApp e colar texto' : 'Abrir WhatsApp'}</a> : <button type="button" className="button primary" disabled><ExternalLink size={17} aria-hidden="true" />{whatsapp.value?.requiresPaste ? 'Abrir WhatsApp e colar texto' : 'Abrir WhatsApp'}</button>}
          </div>
          <details className={styles.textPreview}><summary>Ver texto do WhatsApp</summary><pre aria-label="Texto do WhatsApp">{whatsappText}</pre></details>
        </div>
        </div>
        {actionFeedback}
        <ImagePreview key={`${unitKind}:${mode}:${page}:${report.html}`} getImage={getImage} index={page + 1} total={report.parts.length} title={unit.preview} />
      </section> : channel === 'email' ? <section className={styles.channelPanel} aria-label="Compartilhar por e-mail">
        <div className={styles.emailFields}>
          <label className={styles.field}>Destinatários do e-mail<textarea value={addresses} rows={2} onChange={(event) => setAddresses(event.target.value)} placeholder="nome@cooperativa.com.br; outro@cooperativa.com.br" /></label>
          <label className={styles.field}>Conta do Outlook<select value={personal ? 'personal' : 'work'} onChange={(event) => setPersonal(event.target.value === 'personal')}><option value="work">Microsoft 365 / Corporativa</option><option value="personal">Outlook.com / Pessoal</option></select></label>
        </div>
        <p className={styles.helper}>Separe por ponto e vírgula ou escolha os destinatários no Outlook.</p>
        <p className={styles.subject}><strong>Assunto:</strong> {report.subject}</p>
        {(recipients.error || outlook.error) && <p role="alert" className={styles.error}>{recipients.error || outlook.error}</p>}
        <OutlookHandoff key={`${userId}:${dataset.year}:${unitKind}:${mode}`} html={report.html} text={report.text} url={outlook.value?.url ?? null} clipboardVersion={clipboardVersion} disabled={busy || !!recipients.error || !!outlook.error} />
        <div className={styles.actions}><button type="button" className="button secondary" disabled={!!recipients.error} onClick={downloadEmail}><Download size={17} aria-hidden="true" />Baixar e-mail (.eml)</button></div>
        {actionFeedback}
        <div className={styles.emailPreview}><h3>Prévia do e-mail · {countUnits(report.count)}</h3><EmailPreview html={report.html} /></div>
      </section> : <SummaryPreview report={report} unitKind={unitKind} onFormat={changeChannel} />}
    </>}
  </div>;
}

function SummaryPreview({ report, unitKind, onFormat }: { report: Report; unitKind: UnitKind; onFormat: (format: Format) => void }) {
  const counts = [
    { label: 'Unidades no painel', value: report.count },
    { label: 'Meta atingida', value: report.summary.achievedCount },
    { label: 'Com GAP', value: report.summary.gapCount },
    { label: 'Sem avaliação', value: report.summary.unknownCount },
  ];
  return <section className={styles.channelPanel} aria-label="Prévia do painel resumido">
    <div className={styles.pageNavigation}><h3>Painel resumido</h3><div className={styles.actions}><button type="button" className="button secondary" onClick={() => onFormat('image')}>Preparar imagem</button><button type="button" className="button secondary" onClick={() => onFormat('email')}>Preparar e-mail</button></div></div>
    <div className={styles.summaryCards}>{counts.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>
    <div className={styles.summaryTable}><table><thead><tr><th scope="col">{unitKind === 'pa' ? 'PA' : 'Cooperativa'}</th><th scope="col">Meta</th><th scope="col">Realizado</th><th scope="col">Atingimento</th><th scope="col">Crescimento / GAP</th></tr></thead><tbody>{report.rows.map((row) => <tr key={row.id}>
      <th scope="row"><strong>{unitKind === 'pa' ? row.pa : row.cooperative} · {row.name}</strong><small>{unitKind === 'pa' ? `Coop. ${row.cooperative} · ` : ''}Central {row.central}</small></th>
      <td>{money(row.target)}</td><td>{money(row.actual)}</td><td>{percent(row.attainment)}</td><td>{money(row.variance.value)}<small>{row.variance.label}</small></td>
    </tr>)}</tbody></table></div>
    <p className={styles.helper}>Valores por unidade, sem somar carteiras diferentes. Sem avaliação indica dados insuficientes.</p>
  </section>;
}

function ImagePreview({ getImage, index, total, title }: { getImage: () => Promise<Blob>; index: number; total: number; title: string }) {
  const [preview, setPreview] = useState({ url: '', error: '' });
  useEffect(() => {
    let active = true;
    let url = '';
    getImage().then((blob) => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setPreview({ url, error: '' });
    }).catch((reason) => { if (active) setPreview({ url: '', error: messageOf(reason) }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [getImage]);
  return <figure className={styles.imagePreview}>
    {preview.url ? <><img src={preview.url} alt={`${title} — parte ${index} de ${total}`} /><figcaption><a href={preview.url} target="_blank" rel="noopener noreferrer">Ampliar imagem<ExternalLink size={15} aria-hidden="true" /></a></figcaption></> : <p role={preview.error ? 'alert' : 'status'}>{preview.error || 'Preparando a prévia da imagem…'}</p>}
  </figure>;
}
