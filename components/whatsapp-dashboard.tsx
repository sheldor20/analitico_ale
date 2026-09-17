"use client";

import { useEffect, useState } from 'react';
import { Copy, Download, Share2 } from 'lucide-react';
import { renderDashboardPng } from '@/lib/portfolio-image.mjs';
import { validateDashboard } from '@/lib/portfolio-presentation.mjs';
import type { PortfolioDashboard } from '@/lib/portfolio-presentation.mjs';
import styles from './portfolio-communication.module.css';

type Ready = { key: string; file: File; url: string };
export default function WhatsappDashboard({ model, text, subject, saved = false, busy = false, onClipboardChange }: {
  model: PortfolioDashboard; text: string; subject: string; saved?: boolean; busy?: boolean; onClipboardChange?: () => void;
}) {
  const key = JSON.stringify(model);
  const [ready, setReady] = useState<Ready | null>(null);
  const [issue, setIssue] = useState({ key: '', message: '' });
  const [feedback, setFeedback] = useState('');
  const [sharing, setSharing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [retry, setRetry] = useState(0);
  const current = ready?.key === key ? ready : null;
  useEffect(() => {
    let cancelled = false, url = '';
    setReady(null); setIssue({ key, message: '' }); setFeedback('');
    // Pre-render before the click: native file sharing must retain user activation.
    const timer = setTimeout(() => {
      Promise.resolve().then(() => renderDashboardPng(validateDashboard(JSON.parse(key)))).then((blob) => {
        if (cancelled) return;
        const parsed = validateDashboard(JSON.parse(key));
        const safeId = parsed.entityId.replace(/[^a-zA-Z0-9_-]/g, '-');
        const file = new File([blob], `painel-${safeId}-${parsed.period}-${parsed.year}.png`, { type: 'image/png' });
        url = URL.createObjectURL(blob); setReady({ key, file, url });
      }).catch((error: unknown) => { if (!cancelled) setIssue({ key, message: error instanceof Error ? error.message : 'Não foi possível gerar a imagem.' }); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); if (url) URL.revokeObjectURL(url); };
  }, [key, retry]);
  function download() {
    if (!current) return;
    const link = document.createElement('a'); link.href = current.url; link.download = current.file.name; link.click();
    setFeedback('Painel baixado. Anexe a imagem na conversa e cole a mensagem comercial. O download não confirma envio.');
  }
  async function copyImage() {
    if (!current || copying) return;
    setCopying(true); setFeedback(''); onClipboardChange?.();
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Clipboard unavailable');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': current.file })]);
      setFeedback('Imagem copiada. Abra a conversa no WhatsApp e cole para revisar antes de enviar.');
    } catch {
      download();
      setFeedback('O navegador não permitiu copiar a imagem. O painel foi baixado em PNG para anexar na conversa.');
    } finally { setCopying(false); onClipboardChange?.(); }
  }
  async function share() {
    if (!current || sharing) return;
    setFeedback('');
    const payload = { files: [current.file], text, title: subject };
    try {
      if (!navigator.share || !navigator.canShare?.({ files: payload.files })) { download(); return; }
      setSharing(true);
      await navigator.share(payload);
      setFeedback('Painel encaminhado ao compartilhamento do aparelho. Confirme o destinatário e o envio no WhatsApp; não há confirmação de entrega no sistema.');
    } catch (error: unknown) {
      setFeedback(error instanceof Error && error.name === 'AbortError'
        ? 'Compartilhamento cancelado. Nenhum envio foi confirmado.'
        : 'O aparelho não concluiu o compartilhamento. Use Baixar painel e anexe a imagem no WhatsApp.');
    } finally { setSharing(false); }
  }
  return <section className={styles.imagePanel} aria-label={saved ? 'Painel WhatsApp salvo' : 'Painel do WhatsApp'}>
    <h3>{saved ? 'Painel do rascunho' : 'Painel pronto para WhatsApp'}</h3>
    <p className="helper">Copie a imagem e cole na conversa. Você também pode compartilhar pelo aparelho ou baixar o arquivo.</p>
    {current ? <img className={styles.dashboardImage} src={current.url} alt={`Dashboard ${model.periodLabel} de ${model.scope}. Os indicadores também estão no texto da mensagem.`} />
      : issue.key === key && issue.message ? <div><p role="alert" className={styles.warning}>{issue.message}</p><button className="button secondary" onClick={() => setRetry((value) => value + 1)}>Gerar imagem novamente</button></div>
      : <p aria-live="polite">Preparando imagem do cenário…</p>}
    <div className={styles.actions}>
      <button className="button primary" disabled={!current || sharing || copying || busy} onClick={copyImage}><Copy size={17} /> {copying ? 'Copiando imagem…' : 'Copiar painel como imagem'}</button>
      <button className="button secondary" disabled={!current || sharing || copying || busy} onClick={share}><Share2 size={17} /> {sharing ? 'Compartilhando…' : 'Compartilhar painel + mensagem'}</button>
      <button className="button secondary" disabled={!current || copying || busy} onClick={download}><Download size={17} /> {saved ? 'Baixar painel salvo (PNG)' : 'Baixar painel WhatsApp (PNG)'}</button>
    </div>
    <p className="helper">Ao compartilhar, escolha a pessoa no WhatsApp. Se o navegador não permitir copiar ou compartilhar, o PNG será baixado para anexar.</p>
    {feedback && <p role="status" className="message">{feedback}</p>}
  </section>;
}
