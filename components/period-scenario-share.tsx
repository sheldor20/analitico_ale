'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Download, ExternalLink, ImageIcon, Mail, X } from 'lucide-react';
import { buildPeriodPerformanceShare, type PeriodShareSelection } from '@/lib/period-performance-share.mjs';
import { renderPeriodPerformancePng, type PeriodPerformanceImagePart } from '@/lib/period-performance-image.mjs';
import { buildEmailFile, buildOutlookLink, buildWhatsappLink, normalizeRecipients } from '@/lib/portfolio-communication.mjs';
import type { PeriodPerformanceModel } from '@/lib/period-performance.mjs';
import type { PerformanceOrder } from '@/lib/period-performance-order.mjs';
import { listResponsibleContacts, type ResponsibleContact } from '@/lib/contact-store';
import EmailPreview from './email-preview';
import OutlookHandoff from './outlook-handoff';
import styles from './pa-scenario-share.module.css';

const selections: Record<PeriodShareSelection, string> = { all: 'Todos os períodos', month: 'Mensais', quarter: 'Trimestrais', semester: 'Semestrais', annual: 'Anual' };
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível preparar o compartilhamento.';
function attempt<T>(operation: () => T): { value: T | null; error: string } { try { return { value: operation(), error: '' }; } catch (error) { return { value: null, error: messageOf(error) }; } }
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PeriodScenarioShare({ model, initialPeriod = 'all', order, centralName, ownerId, onClose }: {
  model: PeriodPerformanceModel; initialPeriod?: PeriodShareSelection; order: PerformanceOrder; centralName: string; ownerId?: string | null; onClose: () => void;
}) {
  const titleId = useId(), channelsId = useId(), close = useRef<HTMLButtonElement>(null);
  const [period, setPeriod] = useState(initialPeriod);
  const [showProjection, setShowProjection] = useState(false);
  const [channel, setChannel] = useState<'email' | 'image'>('email');
  const [addresses, setAddresses] = useState(''), [phone, setPhone] = useState(''), [personal, setPersonal] = useState(false);
  const [contacts, setContacts] = useState<ResponsibleContact[]>([]), [contactIds, setContactIds] = useState<string[]>([]), [contactError, setContactError] = useState('');
  const [textMode, setTextMode] = useState<'caption' | 'report'>('caption');
  const [partIndex, setPartIndex] = useState(0), [busy, setBusy] = useState(false), [clipboardVersion, setClipboardVersion] = useState(0);
  const [copied, setCopied] = useState(''), [manual, setManual] = useState('');
  const [feedback, setFeedback] = useState({ key: '', text: '', error: false });
  const built = useMemo(() => attempt(() => buildPeriodPerformanceShare({ model, period, order, showProjection, centralName })), [model, period, order, showProjection, centralName]);
  const report = built.value, page = Math.min(partIndex, Math.max(0, (report?.parts.length || 0) - 1)), part = report?.parts[page];
  const text = textMode === 'caption' ? report?.caption || '' : report?.text || '';
  const selectedContacts = contacts.filter(contact => contactIds.includes(contact.id));
  const snapshot = JSON.stringify([ownerId, model.year, report?.html, page, channel, addresses, selectedContacts, phone, personal, text]);
  const latest = useRef(snapshot); latest.current = snapshot;
  const alive = useRef(true), generation = useRef(0), cache = useRef<{ part: PeriodPerformanceImagePart; promise: Promise<Blob> } | null>(null);
  const recipients = attempt(() => normalizeRecipients([...selectedContacts.flatMap(contact => contact.emails), ...addresses.split(/[;,\n]+/)]));
  const outlook = attempt(() => report && recipients.value ? buildOutlookLink({ recipients: recipients.value, subject: report.subject, body: '', personal }) : null);
  const whatsapp = attempt(() => report ? buildWhatsappLink({ phone, body: text }) : null);
  const notice = feedback.key === snapshot ? feedback : null;
  const isCurrent = (key: string) => alive.current && latest.current === key;
  const invalidate = () => { generation.current++; setCopied(''); setManual(''); setClipboardVersion(value => value + 1); };
  const unitId = model.units.length === 1 ? model.units[0].id : null;
  const scopeSlug = model.scopeLabel.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
  const fileBase = `cenario-periodos-${model.metric.toLowerCase()}-${model.year}-${period}-${scopeSlug || 'recorte'}`;

  useEffect(() => {
    let active = true;
    setContacts([]); setContactIds([]); setContactError('');
    if (!ownerId || !unitId) return;
    listResponsibleContacts(model.year, unitId).then(items => {
      if (active) setContacts(items.filter(contact => contact.ownerId === ownerId && contact.workspaceYear === model.year && contact.entityId === unitId));
    }).catch(() => { if (active) setContactError('Não foi possível carregar os responsáveis. Informe o destinatário manualmente.'); });
    return () => { active = false; };
  }, [ownerId, model.year, unitId]);

  useLayoutEffect(() => {
    const overflow = document.body.style.overflow, opener = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden'; close.current?.focus();
    return () => { document.body.style.overflow = overflow; if (opener?.isConnected) opener.focus(); };
  }, []);
  useEffect(() => {
    alive.current = true;
    const resetClipboard = () => { generation.current++; setCopied(''); setManual(''); setClipboardVersion(value => value + 1); };
    document.addEventListener('copy', resetClipboard); document.addEventListener('cut', resetClipboard); window.addEventListener('blur', resetClipboard);
    return () => { alive.current = false; generation.current++; document.removeEventListener('copy', resetClipboard); document.removeEventListener('cut', resetClipboard); window.removeEventListener('blur', resetClipboard); };
  }, []);
  const getImage = useCallback(() => {
    if (!part) return Promise.reject(new Error('Nenhum período nesta seleção.'));
    if (cache.current?.part === part) return cache.current.promise;
    const promise = renderPeriodPerformancePng(part);
    void promise.catch(() => { if (cache.current?.part === part) cache.current = null; });
    cache.current = { part, promise }; return promise;
  }, [part]);

  async function imageAction(copy: boolean) {
    if (!part || busy) return;
    const captured = snapshot;
    setBusy(true); setFeedback({ key: '', text: '', error: false });
    if (copy) invalidate();
    const currentGeneration = generation.current;
    const current = () => isCurrent(captured) && (!copy || generation.current === currentGeneration);
    const png = getImage(), filename = `${fileBase}-parte-${page + 1}-de-${report?.parts.length || 1}.png`;
    try {
      if (copy) {
        if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Clipboard unavailable');
        const guarded = png.then(blob => { if (!current()) throw new Error('O cenário mudou.'); return blob; });
        void guarded.catch(() => {});
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': guarded })]);
        if (current()) setFeedback({ key: captured, text: `Imagem da parte ${page + 1} copiada. Cole na conversa.`, error: false });
      } else {
        const blob = await png; if (!current()) return;
        download(blob, filename); setFeedback({ key: captured, text: `Imagem da parte ${page + 1} baixada. Anexe no WhatsApp.`, error: false });
      }
    } catch (error) {
      if (!current()) return;
      if (copy) {
        try { const blob = await png; if (!current()) return; download(blob, filename); setFeedback({ key: captured, text: 'A cópia foi bloqueada. Anexe o PNG baixado no WhatsApp.', error: false }); }
        catch (reason) { if (current()) setFeedback({ key: captured, text: messageOf(reason), error: true }); }
      } else setFeedback({ key: captured, text: messageOf(error), error: true });
    } finally { if (alive.current) { setBusy(false); if (copy) setClipboardVersion(value => value + 1); } }
  }
  async function copyText() {
    if (!report || busy) return;
    invalidate(); const currentGeneration = generation.current, captured = snapshot;
    setBusy(true); setFeedback({ key: '', text: '', error: false });
    try {
      await navigator.clipboard.writeText(text);
      if (isCurrent(captured) && generation.current === currentGeneration) { setCopied(captured); setFeedback({ key: captured, text: 'Texto copiado. Cole na conversa.', error: false }); }
    } catch {
      if (isCurrent(captured) && generation.current === currentGeneration) { setManual(captured); setFeedback({ key: captured, text: 'A cópia foi bloqueada. Copie manualmente o texto da prévia e cole na conversa.', error: true }); }
    } finally { if (alive.current) { setBusy(false); setClipboardVersion(value => value + 1); } }
  }
  function downloadEmail() {
    if (!report || !recipients.value || recipients.error) return;
    try { download(new Blob([buildEmailFile({ recipients: recipients.value, subject: report.subject, text: report.text, html: report.html })], { type: 'message/rfc822' }), `${fileBase}.eml`); setFeedback({ key: snapshot, text: 'E-mail completo baixado. Abra no Outlook e revise antes de enviar.', error: false }); }
    catch (error) { setFeedback({ key: snapshot, text: messageOf(error), error: true }); }
  }

  return <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,iframe')].filter(node => node.getClientRects().length > 0);
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus(); }
    }}>
      <header className={styles.heading}><h2 id={titleId}>Compartilhar cenário por período</h2><button ref={close} type="button" className="icon-button" aria-label="Fechar compartilhamento de períodos" onClick={onClose}><X size={22} aria-hidden="true" /></button></header>
      <div className={styles.content}>
        <div className={styles.context}><strong>{model.scopeLabel}</strong><span>{model.metric === 'AR' ? 'Arrecadação' : 'Venda Nova'} · {model.year}</span></div>
        <label className={styles.field}>Períodos para compartilhar<select aria-label="Períodos para compartilhar" value={period} onChange={event => { setPeriod(event.target.value as PeriodShareSelection); setPartIndex(0); }}>{Object.entries(selections).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <p className={styles.helper}>Mesmas unidades do recorte atual · {report?.orderLabel}. Recolher um grupo no painel não remove seus períodos do compartilhamento.</p>
        <label className={styles.projectionOption}><input type="checkbox" aria-label="Incluir projeção de produção" checked={showProjection} onChange={event => { setShowProjection(event.target.checked); setPartIndex(0); }} /><span>Incluir projeção de produção<small>Estimativa separada do realizado, com as premissas da análise.</small></span></label>
        {!report ? <p className={styles.error} role="alert">{built.error}</p> : <>
          <fieldset className={styles.channels}><legend>Canal de compartilhamento</legend><label className={channel === 'email' ? styles.activeChannel : ''}><input type="radio" name={channelsId} checked={channel === 'email'} onChange={() => { setChannel('email'); invalidate(); }} /><Mail size={18} aria-hidden="true" />E-mail</label><label className={channel === 'image' ? styles.activeChannel : ''}><input type="radio" name={channelsId} checked={channel === 'image'} onChange={() => { setChannel('image'); invalidate(); }} /><ImageIcon size={18} aria-hidden="true" />WhatsApp e imagem</label></fieldset>
          {channel === 'email' ? <section className={styles.channelPanel} aria-label="Compartilhar cenário por e-mail">
            {contacts.some(contact => contact.emails.length) && <fieldset className={styles.unitSelector}><legend>Responsáveis da unidade</legend><div className={styles.unitOptions}>{contacts.filter(contact => contact.emails.length).map(contact => <label key={contact.id}><input type="checkbox" checked={contactIds.includes(contact.id)} onChange={event => setContactIds(ids => event.target.checked ? [...ids, contact.id] : ids.filter(id => id !== contact.id))} /><span><strong>{contact.name}</strong><small>{contact.emails.join('; ')}</small></span></label>)}</div></fieldset>}
            {contactError && <p className={styles.warning} role="status">{contactError}</p>}
            <div className={styles.emailFields}><label className={styles.field}>Destinatários do e-mail<textarea value={addresses} maxLength={10000} rows={2} onChange={event => setAddresses(event.target.value)} placeholder="nome@cooperativa.com.br; outro@cooperativa.com.br" /></label><label className={styles.field}>Conta do Outlook<select aria-label="Conta do Outlook" value={personal ? 'personal' : 'work'} onChange={event => setPersonal(event.target.value === 'personal')}><option value="work">Microsoft 365 / Corporativa</option><option value="personal">Outlook.com / Pessoal</option></select></label></div>
            <p className={styles.subject}><strong>Assunto:</strong> {report.subject}</p>
            {(recipients.error || outlook.error) && <p className={styles.error} role="alert">{recipients.error || outlook.error}</p>}
            <OutlookHandoff html={report.html} text={report.text} url={outlook.value?.url || null} clipboardVersion={clipboardVersion} disabled={busy || !!recipients.error || !!outlook.error} />
            <div className={styles.actions}><button type="button" className="button secondary" disabled={!!recipients.error} onClick={downloadEmail}><Download size={17} aria-hidden="true" />Baixar e-mail (.eml)</button></div>
            <EmailPreview html={report.html} />
          </section> : <section className={styles.channelPanel} aria-label="Compartilhar cenário por WhatsApp">
            <div className={styles.pageNavigation}><div><h3>Imagem do cenário</h3><p aria-live="polite">Parte {page + 1} de {report.parts.length} · períodos {part?.from} a {part?.to}</p></div><div className={styles.actions}><button type="button" className="button secondary" aria-label="Parte anterior" disabled={page === 0} onClick={() => setPartIndex(page - 1)}><ChevronLeft size={18} aria-hidden="true" />Anterior</button><button type="button" className="button secondary" aria-label="Próxima parte" disabled={page === report.parts.length - 1} onClick={() => setPartIndex(page + 1)}>Próxima<ChevronRight size={18} aria-hidden="true" /></button></div></div>
            <div className={styles.actions}><button type="button" className="button primary" aria-label="Copiar imagem desta parte" disabled={busy} onClick={() => void imageAction(true)}><Copy size={17} aria-hidden="true" />Copiar imagem</button><button type="button" className="button secondary" aria-label="Baixar imagem desta parte" disabled={busy} onClick={() => void imageAction(false)}><Download size={17} aria-hidden="true" />Baixar PNG</button></div>
            <p className={styles.helper}>Cole ou anexe a imagem.{report.parts.length > 1 ? ` Envie as ${report.parts.length} partes para incluir todos os períodos.` : ''}</p>
            <label className={styles.field}>Texto do WhatsApp<select aria-label="Texto do WhatsApp" value={textMode} onChange={event => setTextMode(event.target.value as 'caption' | 'report')}><option value="caption">Mensagem curta para acompanhar a imagem</option><option value="report">Relatório completo</option></select></label>
            {contacts.some(contact => contact.whatsapp) && <label className={styles.field}>Responsável para o WhatsApp<select aria-label="Responsável para o WhatsApp" value={contacts.find(contact => contact.whatsapp === phone)?.id || ''} onChange={event => setPhone(contacts.find(contact => contact.id === event.target.value)?.whatsapp || '')}><option value="">Informar manualmente / escolher no WhatsApp</option>{contacts.filter(contact => contact.whatsapp).map(contact => <option key={contact.id} value={contact.id}>{contact.name} · {contact.whatsapp}</option>)}</select></label>}
            <label className={styles.field}>WhatsApp do destinatário (opcional)<input type="tel" maxLength={40} value={phone} onChange={event => setPhone(event.target.value)} placeholder="DDD + número, ou +DDI" /></label>
            {whatsapp.error && <p className={styles.error} role="alert">{whatsapp.error}</p>}
            {whatsapp.value?.requiresPaste && <p className={styles.warning}>Mensagem longa: copie o texto completo, abra o WhatsApp e cole na conversa.</p>}
            <div className={styles.actions}><button type="button" className="button secondary" disabled={busy} onClick={() => void copyText()}><Copy size={17} aria-hidden="true" />Copiar texto do WhatsApp</button>{whatsapp.value && (!whatsapp.value.requiresPaste || copied === snapshot || manual === snapshot) ? <a className="button primary" href={whatsapp.value.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} aria-hidden="true" />{whatsapp.value.requiresPaste ? 'Abrir WhatsApp e colar texto' : 'Abrir WhatsApp'}</a> : <button type="button" className="button primary" disabled>Abrir WhatsApp</button>}</div>
            <details className={styles.textPreview}><summary>Ver texto do WhatsApp</summary><pre aria-label="Texto do WhatsApp">{text}</pre></details>
            <PeriodImagePreview key={`${period}:${page}:${report.html}`} getImage={getImage} index={page + 1} total={report.parts.length} />
          </section>}
        </>}
        {busy && <p className={styles.feedback} role="status">Preparando compartilhamento…</p>}
        {notice && <p className={notice.error ? styles.error : styles.feedback} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
        <p className={styles.helper}>Revise o destinatário no aplicativo. Nada é enviado automaticamente.</p>
      </div>
    </section>
  </div>;
}

function PeriodImagePreview({ getImage, index, total }: { getImage: () => Promise<Blob>; index: number; total: number }) {
  const [preview, setPreview] = useState({ url: '', error: '' });
  useEffect(() => {
    let active = true, url = '';
    getImage().then(blob => { if (!active) return; url = URL.createObjectURL(blob); setPreview({ url, error: '' }); }).catch(error => { if (active) setPreview({ url: '', error: messageOf(error) }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [getImage]);
  return <figure className={styles.imagePreview}>{preview.url ? <><img src={preview.url} alt={`Cenário por período — parte ${index} de ${total}`} /><figcaption><a href={preview.url} target="_blank" rel="noopener noreferrer">Ampliar imagem<ExternalLink size={15} aria-hidden="true" /></a></figcaption></> : <p role={preview.error ? 'alert' : 'status'}>{preview.error || 'Preparando a prévia da imagem…'}</p>}</figure>;
}
