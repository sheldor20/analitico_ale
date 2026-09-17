'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, X } from 'lucide-react';
import { listResponsibleContacts } from '@/lib/contact-store';
import { buildEmailFile, buildOutlookLink, normalizeRecipients, recipientsForContacts } from '@/lib/portfolio-communication.mjs';
import { buildGoalAlertPresentation } from '@/lib/goal-alert-presentation.mjs';
import type { GoalAlert } from '@/lib/goal-alerts.mjs';
import OutlookHandoff from './outlook-handoff';
import styles from './goal-alerts.module.css';

export default function GoalAlertOutlook({ alert, userId, clipboardVersion, notifiedAt, marking, onMarkSent, onClose }: {
  alert: GoalAlert; userId: string; clipboardVersion: number; notifiedAt?: string | null; marking: boolean; onMarkSent: () => void; onClose: () => void;
}) {
  const [addresses, setAddresses] = useState('');
  const [personal, setPersonal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contactNotice, setContactNotice] = useState('');
  const [feedback, setFeedback] = useState('');
  const message = useMemo(() => buildGoalAlertPresentation(alert), [alert]);

  useEffect(() => {
    let active = true;
    listResponsibleContacts(alert.year, alert.entity.id).then((contacts) => {
      if (!active) return;
      const scoped = recipientsForContacts(contacts, alert.year, alert.entity).filter((contact) => contact.ownerId === userId);
      const emails = normalizeRecipients(scoped.flatMap((contact) => contact.emails));
      setAddresses(emails.join('; '));
      if (!emails.length) setContactNotice('Nenhum e-mail cadastrado nesta unidade. Informe abaixo ou escolha os destinatários no Outlook.');
    }).catch(() => { if (active) setContactNotice('Não foi possível carregar os contatos. Informe os e-mails abaixo ou escolha os destinatários no Outlook.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [alert.year, alert.entity.id, userId]);

  let recipients: string[] = [], validationError = '', linkError = '', url: string | null = null;
  try { recipients = normalizeRecipients(addresses); }
  catch (error) { validationError = error instanceof Error ? error.message : 'Confira os e-mails informados.'; }
  if (!validationError) {
    try { url = buildOutlookLink({ recipients, subject: message.subject, body: '', personal }).url; }
    catch (error) { linkError = error instanceof Error ? error.message : 'Não foi possível gerar o link do Outlook.'; }
  }

  function download() {
    if (loading || validationError) return;
    const content = buildEmailFile({ recipients, ...message });
    const fileUrl = URL.createObjectURL(new Blob([content], { type: 'message/rfc822' }));
    const link = document.createElement('a'); link.href = fileUrl;
    link.download = `meta-${alert.entity.id.replace(/[^a-zA-Z0-9_-]/g, '-')}-${alert.metric}-${alert.year}-${alert.month + 1}.eml`;
    link.click(); setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
    setFeedback('E-mail baixado com o painel completo. Abra no Outlook e revise os destinatários antes de enviar.');
  }

  return <section className={styles.emailPanel} aria-label={`E-mail de ${alert.entity.name}`}>
    <div className={styles.emailHeading}><h4>Reconhecimento por e-mail</h4><button type="button" className="button quiet" aria-label="Fechar preparação do Outlook" onClick={onClose}><X size={17} aria-hidden="true" /></button></div>
    <p className={styles.emailSubject}><strong>Assunto:</strong> {message.subject}</p>
    <label>Destinatários do e-mail<textarea aria-label="Destinatários do e-mail" value={addresses} disabled={loading} rows={2} onChange={(event) => setAddresses(event.target.value)} placeholder="nome@cooperativa.com.br; outro@cooperativa.com.br" /></label>
    <p className={styles.feedback}>{loading ? 'Carregando e-mails da unidade…' : contactNotice || 'E-mails dos responsáveis desta unidade. Você pode ajustar a lista para este envio.'}</p>
    <label>Conta do Outlook<select aria-label="Conta do Outlook" value={personal ? 'personal' : 'work'} onChange={(event) => setPersonal(event.target.value === 'personal')}><option value="work">Microsoft 365 / Corporativa</option><option value="personal">Outlook.com / Pessoal</option></select></label>
    {(validationError || linkError) && <p className={styles.error} role="alert">{validationError || linkError}</p>}
    <OutlookHandoff html={message.html} text={message.text} url={url} clipboardVersion={clipboardVersion} disabled={loading || !!validationError || !!linkError} />
    <div className={styles.actions}><button type="button" className="button secondary" disabled={loading || !!validationError} onClick={download}><Download size={16} aria-hidden="true" />Baixar e-mail (.eml)</button><button type="button" className="button secondary" disabled={marking || !!notifiedAt} onClick={onMarkSent}>{notifiedAt ? 'Comunicação registrada' : 'Já enviei: registrar comunicação'}</button></div>
    <p className={styles.feedback}>O arquivo inclui o painel e o texto. A abertura como rascunho depende da versão do Outlook. Copiar ou abrir o e-mail não registra o envio.</p>
    {feedback && <p role="status" className={styles.feedback}>{feedback}</p>}
  </section>;
}
