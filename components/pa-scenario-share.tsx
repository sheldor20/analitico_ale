'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Download, ExternalLink, ImageIcon, Mail, X } from 'lucide-react';
import { buildPaScenarioReport, renderPaScenarioPng } from '@/lib/pa-scenario-share.mjs';
import { buildEmailFile, buildOutlookLink, buildWhatsappLink, normalizeRecipients } from '@/lib/portfolio-communication.mjs';
import type { Dataset } from '@/lib/types';
import type { ScenarioFilters } from './scenario-panels';
import EmailPreview from './email-preview';
import OutlookHandoff from './outlook-handoff';
import styles from './pa-scenario-share.module.css';

export type PaScenarioShareProps = { dataset: Dataset; filters: ScenarioFilters; userId: string; onClose: () => void };
type Report = ReturnType<typeof buildPaScenarioReport>;
type Part = Report['parts'][number];
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

export default function PaScenarioShare({ dataset, filters, userId, onClose }: PaScenarioShareProps) {
  const titleId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  const [clipboardVersion, setClipboardVersion] = useState(0);
  const invalidateClipboard = useCallback(() => setClipboardVersion((value) => value + 1), []);
  const contextKey = JSON.stringify([userId, dataset.year, filters]);

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
        <div><span className="section-label">CENÁRIO DOS PAs</span><h2 id={titleId}>Compartilhar cenário dos PAs</h2><p>Revise a seleção e prepare o painel para WhatsApp ou e-mail.</p></div>
        <button ref={closeButton} type="button" className="icon-button" aria-label="Fechar compartilhamento" onClick={onClose}><X size={22} aria-hidden="true" /></button>
      </header>
      {userId ? <ShareContent key={contextKey} dataset={dataset} filters={filters} userId={userId} clipboardVersion={clipboardVersion} onClipboardChange={invalidateClipboard} /> : <p className={styles.error} role="alert">Entre na sua conta para compartilhar o cenário.</p>}
    </section>
  </div>;
}

function ShareContent({ dataset, filters, userId, clipboardVersion, onClipboardChange }: Omit<PaScenarioShareProps, 'onClose'> & { clipboardVersion: number; onClipboardChange: () => void }) {
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
  const built = useMemo(() => attempt(() => buildPaScenarioReport({ dataset, filters, mode })), [dataset, filters, mode]);
  const report = built.value;
  const page = Math.min(partIndex, Math.max(0, (report?.parts.length ?? 0) - 1));
  const part = report?.parts[page];
  const snapshot = JSON.stringify([userId, dataset.year, filters, mode, report?.html, page, channel, phone, addresses, personal]);
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
    if (!part) return Promise.reject(new Error('Não há PAs nesta seleção.'));
    if (imageCache.current?.part === part) return imageCache.current.promise;
    const promise = renderPaScenarioPng(part);
    // The preview and clipboard can consume the same promise at different times.
    void promise.catch(() => { if (imageCache.current?.part === part) imageCache.current = null; });
    imageCache.current = { part, promise };
    return promise;
  }, [part]);

  const recipients = attempt(() => normalizeRecipients(addresses));
  const outlook = attempt(() => report && recipients.value ? buildOutlookLink({ recipients: recipients.value, subject: report.subject, body: '', personal }) : null);
  const whatsapp = attempt(() => report ? buildWhatsappLink({ phone, body: report.whatsapp }) : null);
  const isCurrent = (captured: string) => alive.current && current.current === captured;
  const notice = feedback.snapshot === snapshot ? feedback : null;
  const filename = `cenario-pas-${dataset.year}-${filters.month + 1}-${mode}-parte-${page + 1}-de-${report?.parts.length ?? 1}.png`;

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
        setFeedback({ snapshot: captured, text: 'Texto copiado. Revise o destinatário e cole no WhatsApp.', error: false });
      }
    } catch {
      if (isCurrent(captured) && generation === clipboardGeneration.current) {
        setManualWhatsapp(captured);
        setFeedback({ snapshot: captured, text: 'A cópia foi bloqueada. Abra “Ver texto do WhatsApp”, selecione e copie manualmente. Depois, use o link para abrir a conversa e colar.', error: true });
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
        if (isCurrent(captured)) setFeedback({ snapshot: captured, text: `Imagem da parte ${page + 1} copiada. Cole na conversa e revise antes de enviar.`, error: false });
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
          setFeedback({ snapshot: captured, text: 'A cópia da imagem foi bloqueada. Baixamos o PNG desta parte para você anexar.', error: false });
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
      downloadBlob(new Blob([content], { type: 'message/rfc822' }), `cenario-pas-${dataset.year}-${filters.month + 1}-${mode}.eml`);
      setFeedback({ snapshot, text: 'E-mail baixado com o painel completo. Abra no Outlook e revise os destinatários antes de enviar.', error: false });
    } catch (reason) { setFeedback({ snapshot, text: messageOf(reason), error: true }); }
  }

  if (!report) return <p role="alert" className={styles.error}>{built.error}</p>;
  const actionFeedback = <>
    {busy && <p role="status" className={styles.feedback}>Preparando compartilhamento…</p>}
    {notice?.text && <p role={notice.error ? 'alert' : 'status'} className={notice.error ? styles.error : styles.feedback}>{notice.text}</p>}
  </>;

  return <div className={styles.content}>
    <div className={styles.context}><strong>{report.scopeLabel}</strong><span>{report.periodLabel}</span></div>
    <fieldset className={styles.scope}><legend>PAs no compartilhamento</legend>
      <label className={mode === 'all' ? styles.selectedScope : ''}><input type="radio" aria-label="Todos os PAs da seleção" name={scopeName} checked={mode === 'all'} onChange={() => changeMode('all')} /><span><strong>Todos os PAs da seleção</strong><small>{report.allCount} PAs na seleção</small></span></label>
      <label className={mode === 'filtered' ? styles.selectedScope : ''}><input type="radio" aria-label="Somente PAs filtrados" name={scopeName} checked={mode === 'filtered'} onChange={() => changeMode('filtered')} /><span><strong>Somente PAs filtrados</strong><small>{report.filteredCount} PAs após os filtros</small></span></label>
    </fieldset>
    <p className={styles.helper}>{mode === 'all' ? 'Inclui todos os PAs da central e cooperativa selecionadas, sem restringir por busca, situação ou grupo.' : 'Aplica a busca, a situação e o grupo escolhidos na lista de PAs.'}</p>
    <div className={styles.summary}><strong>{report.count} {report.count === 1 ? 'PA no painel' : 'PAs no painel'}</strong><span>{report.parts.length} {report.parts.length === 1 ? 'imagem' : 'imagens'} · e-mail com lista completa</span></div>
    {!report.count ? <p role="status" className={styles.empty}>Nenhum PA corresponde a esta seleção. Escolha todos os PAs ou ajuste os filtros na lista.</p> : <>
      <fieldset className={styles.channels}><legend>Canal de compartilhamento</legend>
        <label className={channel === 'image' ? styles.activeChannel : ''}><input type="radio" name={channelName} checked={channel === 'image'} onChange={() => changeChannel('image')} /><ImageIcon size={18} aria-hidden="true" />WhatsApp e imagem</label>
        <label className={channel === 'email' ? styles.activeChannel : ''}><input type="radio" name={channelName} checked={channel === 'email'} onChange={() => changeChannel('email')} /><Mail size={18} aria-hidden="true" />E-mail</label>
      </fieldset>
      {channel === 'image' ? <section className={styles.channelPanel} aria-label="Compartilhar por WhatsApp e imagem">
        <div className={styles.pageNavigation}>
          <div><h3>Imagem do cenário</h3><p aria-live="polite">Parte {page + 1} de {report.parts.length}{part ? ` · PAs ${part.from} a ${part.to}` : ''}</p></div>
          <div className={styles.actions}><button type="button" className="button secondary" aria-label="Parte anterior" disabled={page === 0} onClick={() => setPartIndex(page - 1)}><ChevronLeft size={18} aria-hidden="true" />Anterior</button><button type="button" className="button secondary" aria-label="Próxima parte" disabled={page >= report.parts.length - 1} onClick={() => setPartIndex(page + 1)} >Próxima<ChevronRight size={18} aria-hidden="true" /></button></div>
        </div>
        <div className={styles.actions}>
          <button type="button" className="button primary" disabled={busy} onClick={() => void imageAction(true)}><Copy size={17} aria-hidden="true" />Copiar imagem desta parte</button>
          <button type="button" className="button secondary" disabled={busy} onClick={() => void imageAction(false)}><Download size={17} aria-hidden="true" />Baixar imagem desta parte</button>
        </div>
        {actionFeedback}
        <p className={styles.helper}>Copie e cole a imagem na conversa, ou baixe para anexar. {report.parts.length > 1 ? `Compartilhe as ${report.parts.length} partes para incluir todos os PAs.` : 'A imagem inclui todos os PAs desta seleção.'}</p>
        <div className={styles.destination}>
          <h3>Preparar WhatsApp</h3>
          <label className={styles.field}>WhatsApp do destinatário (opcional)<input type="tel" autoComplete="off" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="DDD + número, ou +DDI" /></label>
          <p className={styles.helper}>Deixe em branco para escolher a conversa no WhatsApp. As imagens são coladas ou anexadas separadamente.</p>
          {whatsapp.error && <p role="alert" className={styles.error}>{whatsapp.error}</p>}
          {whatsapp.value?.requiresPaste && <p className={styles.warning}>Este cenário é longo para o link do WhatsApp. Copie o texto abaixo; depois abra a conversa e cole a mensagem.</p>}
          <div className={styles.actions}>
            <button type="button" className="button secondary" disabled={busy} onClick={() => void copyText()}><Copy size={17} aria-hidden="true" />Copiar texto do WhatsApp</button>
            {whatsapp.value && (!whatsapp.value.requiresPaste || whatsappCopied === snapshot || manualWhatsapp === snapshot) ? <a className="button primary" href={whatsapp.value.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} aria-hidden="true" />{whatsapp.value.requiresPaste ? manualWhatsapp === snapshot ? 'Abrir WhatsApp para colar manualmente' : 'Abrir WhatsApp e colar texto' : 'Abrir WhatsApp'}</a> : <button type="button" className="button primary" disabled><ExternalLink size={17} aria-hidden="true" />{whatsapp.value?.requiresPaste ? 'Abrir WhatsApp e colar texto' : 'Abrir WhatsApp'}</button>}
          </div>
          <details className={styles.textPreview}><summary>Ver texto do WhatsApp</summary><pre aria-label="Texto do WhatsApp">{report.whatsapp}</pre></details>
        </div>
        <ImagePreview key={`${mode}:${page}:${report.html}`} getImage={getImage} index={page + 1} total={report.parts.length} />
      </section> : <section className={styles.channelPanel} aria-label="Compartilhar por e-mail">
        <div className={styles.emailFields}>
          <label className={styles.field}>Destinatários do e-mail<textarea value={addresses} rows={2} onChange={(event) => setAddresses(event.target.value)} placeholder="nome@cooperativa.com.br; outro@cooperativa.com.br" /></label>
          <label className={styles.field}>Conta do Outlook<select value={personal ? 'personal' : 'work'} onChange={(event) => setPersonal(event.target.value === 'personal')}><option value="work">Microsoft 365 / Corporativa</option><option value="personal">Outlook.com / Pessoal</option></select></label>
        </div>
        <p className={styles.helper}>Separe os e-mails por ponto e vírgula. Você também pode escolher os destinatários no Outlook.</p>
        <p className={styles.subject}><strong>Assunto:</strong> {report.subject}</p>
        {(recipients.error || outlook.error) && <p role="alert" className={styles.error}>{recipients.error || outlook.error}</p>}
        <OutlookHandoff key={`${userId}:${dataset.year}:${mode}`} html={report.html} text={report.text} url={outlook.value?.url ?? null} clipboardVersion={clipboardVersion} disabled={busy || !!recipients.error || !!outlook.error} />
        <div className={styles.actions}><button type="button" className="button secondary" disabled={!!recipients.error} onClick={downloadEmail}><Download size={17} aria-hidden="true" />Baixar e-mail (.eml)</button></div>
        {actionFeedback}
        <p className={styles.helper}>O arquivo contém o painel completo. A abertura como rascunho depende da versão do Outlook.</p>
        <div className={styles.emailPreview}><h3>Prévia do e-mail · {report.count} PAs</h3><EmailPreview html={report.html} /></div>
      </section>}
    </>}
    <p className={styles.footer}>Revise o destinatário e o conteúdo antes de enviar.</p>
  </div>;
}

function ImagePreview({ getImage, index, total }: { getImage: () => Promise<Blob>; index: number; total: number }) {
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
    {preview.url ? <><img src={preview.url} alt={`Cenário dos PAs — parte ${index} de ${total}`} /><figcaption><a href={preview.url} target="_blank" rel="noopener noreferrer">Ampliar imagem<ExternalLink size={15} aria-hidden="true" /></a></figcaption></> : <p role={preview.error ? 'alert' : 'status'}>{preview.error || 'Preparando a prévia da imagem…'}</p>}
  </figure>;
}
