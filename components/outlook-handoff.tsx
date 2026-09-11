'use client';
import { useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import styles from './portfolio-communication.module.css';
/** HTML cannot be injected into a cross-origin Outlook editor by a compose URL.
 * Copy first while the document is focused; only then offer the real link.
 * Never open a popup before an asynchronous clipboard write (Safari/focus).
 */
export default function OutlookHandoff({ html, text, url, disabled }: { html: string; text: string; url: string | null; disabled: boolean }) {
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const snapshot = JSON.stringify([html, text, url]);
  const ready = copied === snapshot && !disabled && !!url;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function copy() {
    if (disabled || busy) return;
    setBusy(true); setError(''); setCopied('');
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Clipboard unavailable');
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })]);
      if (alive.current) setCopied(snapshot);
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
    {copied && !ready && !disabled && <p className={styles.warning}>O cenário ou os destinatários mudaram. Copie novamente antes de abrir o Outlook.</p>}
    {error && <p role="alert" className={styles.warning}>{error}</p>}
  </div>;
}
