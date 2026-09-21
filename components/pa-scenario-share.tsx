'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Download, ExternalLink, ImageIcon, Mail, X } from 'lucide-react';
import { buildPaScenarioReport, renderPaScenarioPng } from '@/lib/pa-scenario-share.mjs';
import { buildCooperativeScenarioReport, renderCooperativeScenarioPng } from '@/lib/cooperative-scenario-share.mjs';
import { buildEmailFile, buildOutlookLink, buildWhatsappLink, normalizeRecipients } from '@/lib/portfolio-communication.mjs';
import type { Dataset } from '@/lib/types';
import type { ScenarioFilters } from './scenario-panels';
import EmailPreview from './email-preview';
import OutlookHandoff from './outlook-handoff';
import styles from './pa-scenario-share.module.css';

type UnitKind = 'pa' | 'cooperative';
export type PaScenarioShareProps = { dataset: Dataset; filters: ScenarioFilters; userId: string; onClose: () => void; unitKind?: UnitKind };
type Report = ReturnType<typeof buildPaScenarioReport> | ReturnType<typeof buildCooperativeScenarioReport>;
type Part = Report['parts'][number];
const UNITS = {
  pa: { title: 'Compartilhar cenário dos PAs', preview: 'Cenário dos PAs', plural: 'PAs', singular: 'PA', group: 'PAs no compartilhamento', all: 'Todos os PAs da seleção', filtered: 'Somente PAs filtrados', empty: 'Nenhum PA nesta seleção.', filename: 'pas' },
  cooperative: { title: 'Compartilhar cenário das cooperativas', preview: 'Cenário das cooperativas', plural: 'cooperativas', singular: 'cooperativa', group: 'Cooperativas no compartilhamento', all: 'Todas as cooperativas da seleção', filtered: 'Somente cooperativas filtradas', empty: 'Nenhuma cooperativa nesta seleção.', filename: 'cooperativas' },
} as const;
const messageOf = (reason: unknown) => reason instanceof Error ? reason.message : 'Não foi possível preparar o compartilhamento.';

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

export default function PaScenarioShare({ dataset, filters, userId, onClose, unitKind = 'pa' }: PaScenarioShareProps) {
  const titleId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  const [clipboardVersion, setClipboardVersion] = useState(0);
  const invalidateClipboard = useCallback(() => setClipboardVersion((value) => value + 1), []);
  const contextKey = JSON.stringify([userId, dataset.year, filters, unitKind]);

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
      {userId ? <ShareContent key={contextKey} dataset={dataset} filters={filters} userId={userId} unitKind={unitKind} clipboardVersion={clipboardVersion} onClipboardChange={invalidateClipboard} /> : <p className={styles.error} role="alert">Entre na sua conta para compartilhar o cenário.</p>}
    </section>
  </div>;
}

function ShareContent({ dataset, filters, userId, unitKind = 'pa', clipboardVersion, onClipboardChange }: Omit<PaScenarioShareProps, 'onClose'> & { clipboardVersion: number; onClipboardChange: () => void }) {
  const unit = UNITS[unitKind];
  const countUnits = (count: number) => `${count} ${count === 1 ? unit.singular : unit.plural}`;
  const scopeName = useId();
  const channelName = useId();
  const [mode, setMode] = useState<'all' | 'filtered'>('all');
  const [channel, setChannel] = useState<'image' | 'email'>('image');
  const [partIndex, setPartIndex] = useState(0);
  const [phone, setPhone] = useState('');
  const [addresses, setAddresses] = useState('');
  const [personal, setPersonal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [whatsappCopied, setWhatsappCopied] = useState('');
  const [manualWhatsapp, setManualWhatsapp] = useState('');
  const [feedback, setFeedback] = useState({ snapshot: '', text: '', error: false });
  const built = useMemo(() => attempt(() => unitKind === 'cooperative' ? buildCooperativeScenarioReport({ dataset, filters, mode }) : buildPaScenarioReport({ dataset, filters, mode })), [dataset, filters, mode, unitKind]);
  const report = built.value;
  const page = Math.min(partIndex, Math.max(0, (report?.parts.length ?? 0) - 1));
  const part = report?.parts[page];
  const snapshot = JSON.stringify([userId, dataset.year, filters, unitKind, mode, report?.html, page, channel, phone, addresses, personal]);
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
  const whatsapp = attempt(() => report ? buildWhatsappLink({ phone, body: report.whatsapp }) : null);
  const isCurrent = (captured: string) => alive.current && current.current === captured;
  const notice = feedback.snapshot === snapshot ? feedback : null;
  const filename = `cenario-${unit.filename}-${dataset.year}-${filters.month + 1}-${mode}-parte-${page + 1}-de-${report?.parts.length ?? 1}.png`;

  function changeChannel(next: 'image' | 'email') { setChannel(next); setWhatsappCopied(''); }
  function changeMode(next: 'all' | 'filtered') { setMode(next); setPartIndex(0); setWhatsappCopied(''); }

  async function copyText() {
    if (!report?.count || busy) return;
    const captured = snapshot;
    const generation = ++clipboardGeneration.current;
    setBusy(true); setFeedback({ snapshot: '', text: '', error: false }); setWhatsappCopied(''); setManualWhatsapp(''); onClipboardChange();
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(report.whatsapp);
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

  if (!report) return <p role="alert" className={styles.error}>{built.error}</p>;
  const actionFeedback = <>
    {busy && <p role="status" className={styles.feedback}>Preparando compartilhamento…</p>}
    {notice?.text && <p role={notice.error ? 'alert' : 'status'} className={notice.error ? styles.error : styles.feedback}>{notice.text}</p>}
  </>;

  return <div className={styles.content}>
    <div className={styles.context}><strong>{report.scopeLabel}</strong><span>{report.metric === 'AR' ? 'Arrecadação' : 'Venda Nova'} · {report.periodLabel}</span></div>
    <fieldset className={styles.scope}><legend>{unit.group}</legend>
      <label className={mode === 'all' ? styles.selectedScope : ''}><input type="radio" aria-label={unit.all} name={scopeName} checked={mode === 'all'} onChange={() => changeMode('all')} /><span><strong>{unit.all}</strong><small>{countUnits(report.allCount)} na seleção</small></span></label>
      <label className={mode === 'filtered' ? styles.selectedScope : ''}><input type="radio" aria-label={unit.filtered} name={scopeName} checked={mode === 'filtered'} onChange={() => changeMode('filtered')} /><span><strong>{unit.filtered}</strong><small>{countUnits(report.filteredCount)} após os filtros</small></span></label>
    </fieldset>
    <div className={styles.summary}><strong>{countUnits(report.count)} no painel</strong><span>{unitKind === 'pa'
      ? mode === 'all' ? 'Sem restringir por busca, situação ou grupo.' : 'Busca, situação e grupo da lista aplicados.'
      : mode === 'all' ? 'Todas as cooperativas do escopo selecionado.' : 'Busca e situação da lista aplicadas.'}</span></div>
    {!report.count ? <p role="status" className={styles.empty}>{unit.empty} Ajuste os filtros ou escolha a seleção completa.</p> : <>
      <fieldset className={styles.channels}><legend>Canal de compartilhamento</legend>
        <label className={channel === 'image' ? styles.activeChannel : ''}><input type="radio" name={channelName} checked={channel === 'image'} onChange={() => changeChannel('image')} /><ImageIcon size={18} aria-hidden="true" />WhatsApp e imagem</label>
        <label className={channel === 'email' ? styles.activeChannel : ''}><input type="radio" name={channelName} checked={channel === 'email'} onChange={() => changeChannel('email')} /><Mail size={18} aria-hidden="true" />E-mail</label>
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
          <label className={styles.field}>WhatsApp do destinatário (opcional)<input type="tel" autoComplete="off" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="DDD + número, ou +DDI" /></label>
          <p className={styles.helper}>Sem número, escolha a conversa no WhatsApp.</p>
          {whatsapp.error && <p role="alert" className={styles.error}>{whatsapp.error}</p>}
          {whatsapp.value?.requiresPaste && <p className={styles.warning}>Mensagem longa: copie o texto, abra a conversa e cole.</p>}
          <div className={styles.actions}>
            <button type="button" className="button secondary" aria-label="Copiar texto do WhatsApp" disabled={busy} onClick={() => void copyText()}><Copy size={17} aria-hidden="true" />Copiar texto</button>
            {whatsapp.value && (!whatsapp.value.requiresPaste || whatsappCopied === snapshot || manualWhatsapp === snapshot) ? <a className="button primary" href={whatsapp.value.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} aria-hidden="true" />{whatsapp.value.requiresPaste ? manualWhatsapp === snapshot ? 'Abrir WhatsApp para colar manualmente' : 'Abrir WhatsApp e colar texto' : 'Abrir WhatsApp'}</a> : <button type="button" className="button primary" disabled><ExternalLink size={17} aria-hidden="true" />{whatsapp.value?.requiresPaste ? 'Abrir WhatsApp e colar texto' : 'Abrir WhatsApp'}</button>}
          </div>
          <details className={styles.textPreview}><summary>Ver texto do WhatsApp</summary><pre aria-label="Texto do WhatsApp">{report.whatsapp}</pre></details>
        </div>
        </div>
        {actionFeedback}
        <ImagePreview key={`${unitKind}:${mode}:${page}:${report.html}`} getImage={getImage} index={page + 1} total={report.parts.length} title={unit.preview} />
      </section> : <section className={styles.channelPanel} aria-label="Compartilhar por e-mail">
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
      </section>}
    </>}
  </div>;
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
