'use client';
import { useCallback, useEffect, useRef } from 'react';
import styles from './portfolio-communication.module.css';
/** The generated HTML escapes user strings. Scripts/forms/popups stay sandboxed.
 * Same-origin permission is used ONLY to measure the document, eliminating the
 * extra inner scrollbar. No allow-scripts, remote resources or public uploads.
 */
export default function EmailPreview({ html }: { html: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const measure = useCallback(() => {
    const node = frame.current;
    if (!node?.contentDocument) return;
    node.style.height = '1px';
    node.style.height = `${Math.max(360, node.contentDocument.documentElement.scrollHeight)}px`;
  }, []);
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    let width = -1;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width !== width) { width = entry.contentRect.width; measure(); }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure]);
  return <iframe ref={frame} className={styles.frame} title="Painel do e-mail da carteira" sandbox="allow-same-origin" referrerPolicy="no-referrer" srcDoc={html} onLoad={measure} />;
}
