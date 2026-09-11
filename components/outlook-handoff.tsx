'use client';
import { useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import styles from './portfolio-communication.module.css';
/** HTML cannot be injected into a cross-origin Outlook editor by a compose URL.
 * Copy first while the document is focused; only then offer the real link.
 * Never open a popup before an asynchronous clipboard write (Safari/focus).
 */
export default function OutlookHandoff({ html, text, url, disabled, clipboardVersion }: { html: string; text: string; url: string | null; disabled: boolean; clipboardVersion: number }) {
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const generation = useRef(0);
  const snapshot = JSON.stringify([html, text, url, clipboardVersion]);
  const ready = copied === snapshot && !disabled && !!url;
  useEffect(() => {
    alive.current = true;
    // No clipboard reads: native copy/cut or leaving this window invalidates the hint.
    const invalidate = () => { generation.current++; setCopied(''); };
    document.addEventListener('copy', invalidate);
    document.addEventListener('cut', invalidate);
    window.addEventListener('blur', invalidate);
    return () => {
      alive.current = false; generation.current++;
      document.removeEventListener('copy', invalidate);
      document.removeEventListener('cut', invalidate);
      window.removeEventListener('blur', invalidate);
    };
  }, []);
  async function copy() {
    if (disabled || busy) return;
    const attempt = ++generation.current;
    setBusy(true); setError(''); setCopied('');
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Clipboard unavailable');
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })]);
      if (alive.current && attempt === generation.current) setCopied(snapshot);
    } catch { if (alive.current) setError('A cópia formatada foi bloqueada. Permita a área de transferência ou use Baixar e-mail (.eml). Nenhum Outlook foi aberto.'); }
    finally { if (alive.current) setBusy(false); }
  }
  return <div className={styles.handoff}>
    <p>No Outlook Web, o painel entra por colagem, não pelo link. Copie aqui, abra o Outlook e cole no corpo da mensagem com Ctrl+V (ou ⌘V). Mantenha a formatação.</p>
    <div className={styles.actions}>
      <button type="button" className="button primary" onClick={copy} disabled={disabled || busy}><Copy size={17} />{busy ? 'Copiando…' : 'Copiar painel'}</button>
      {ready ? <a className="button primary" href={url!} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} />Abrir Outlook e colar painel</a> : <button type="button" className="button secondary" disabled><ExternalLink size={17} />Abrir Outlook e colar painel</button>}
    </div>
    {ready && <p role="status" className={styles.copySuccess}>Painel copiado com formatação. Abra o Outlook e cole no corpo vazio. O link preenche apenas assunto e destinatários.</p>}
    {copied && !ready && !disabled && <p className={styles.warning}>A mensagem, os destinatários ou a área de transferência mudaram. Copie o painel novamente.</p>}
    {error && <p role="alert" className={styles.warning}>{error}</p>}
  </div>;
}
