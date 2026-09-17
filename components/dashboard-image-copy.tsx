'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { renderDashboardPng } from '@/lib/portfolio-image.mjs';
import type { PortfolioDashboard } from '@/lib/portfolio-presentation.mjs';
import styles from './goal-alerts.module.css';

export default function DashboardImageCopy({ buildModel, snapshot, filename, label = 'Copiar painel como imagem', disabled = false, onClipboardChange }: {
  buildModel: () => PortfolioDashboard; snapshot: string; filename: string; label?: string; disabled?: boolean; onClipboardChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ snapshot: '', text: '', error: false });
  const current = useRef(snapshot); current.current = snapshot;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  async function copy() {
    if (busy || disabled) return;
    const selected = snapshot;
    const isCurrent = () => alive.current && current.current === selected;
    setBusy(true); setFeedback({ snapshot: selected, text: '', error: false }); onClipboardChange();
    let png: Promise<Blob> | undefined;
    try {
      const model = buildModel();
      png = renderDashboardPng(model);
      // Start the clipboard write inside the click to retain Safari user activation.
      // Also observe renderer failures when a browser rejects the clipboard immediately.
      void png.catch(() => {});
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Clipboard unavailable');
      const currentPng = png.then((blob) => {
        if (!isCurrent()) throw new Error('A seleção mudou. Copie o painel atual.');
        return blob;
      });
      void currentPng.catch(() => {});
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': currentPng })]);
      if (isCurrent()) setFeedback({ snapshot: selected, text: 'Imagem copiada. Cole no WhatsApp ou no corpo do e-mail para revisar e enviar.', error: false });
    } catch (reason) {
      try {
        if (!png) throw reason;
        const blob = await png;
        if (!isCurrent()) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setFeedback({ snapshot: selected, text: 'O navegador bloqueou a cópia. O painel foi baixado em PNG para anexar à mensagem.', error: false });
      } catch (error) {
        if (isCurrent()) setFeedback({ snapshot: selected, text: error instanceof Error ? error.message : 'Não foi possível gerar a imagem. Tente novamente.', error: true });
      }
    } finally {
      if (alive.current) setBusy(false);
      onClipboardChange();
    }
  }

  return <div className={styles.imageAction}>
    <button type="button" className="button secondary" disabled={disabled || busy} onClick={() => void copy()}><Copy size={16} aria-hidden="true" />{busy ? 'Copiando imagem…' : label}</button>
    {feedback.snapshot === snapshot && feedback.text && <p className={feedback.error ? styles.error : styles.feedback} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
  </div>;
}
