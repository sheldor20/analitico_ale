"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Mail, MessageSquareText, Save, Trash2, X } from "lucide-react";
import PeriodSelector, { usePeriodSelection } from './period-selector';
import { periodTitle } from '@/lib/periods.mjs';
import { supabase } from "@/lib/supabase";
import { listResponsibleContacts } from "@/lib/contact-store";
import type { ResponsibleContact } from "@/lib/contact-store";
import { buildEmailFile, buildOutlookLink, buildPortfolioReport, buildWhatsappLink, KIND_LABELS, normalizeRecipients, recipientsForContacts, renderPortfolioCommunication } from "@/lib/portfolio-communication.mjs";
import { deletePortfolioDraft, listPortfolioDrafts, savePortfolioDraft } from "@/lib/portfolio-store";
import type { PortfolioDraft } from "@/lib/portfolio-store";
import type { Dataset, Metric, RegistryEntity } from "@/lib/types";
import WhatsappDashboard from "./whatsapp-dashboard";
import { useMessageCustomization } from "./message-customization";
import styles from "./portfolio-communication.module.css";
import OutlookHandoff from "./outlook-handoff";
import EmailPreview from "./email-preview";

type Props = { dataset: Dataset; candidates: RegistryEntity[]; initialKey?: string; metric: Metric; month: number; period: string; uplift?: number; onClose: () => void };
const errorText = (reason: unknown) => reason instanceof Error ? reason.message : "Não foi possível concluir a operação.";
function attempt<T>(fn: () => T): { value: T | null; error: string } {
  try { return { value: fn(), error: "" }; } catch (reason) { return { value: null, error: errorText(reason) }; }
}

export default function PortfolioCommunication({ dataset, candidates, initialKey, metric, month, period, uplift = 0, onClose }: Props) {
  const entities = useMemo(() => [...new Map(candidates.map((candidate) => [candidate.id, dataset.registry?.entities.find((entry) => entry.id === candidate.id) ?? candidate])).values()], [candidates, dataset.registry]);
  const [entityId, setEntityId] = useState(initialKey || entities[0]?.id || "");
  const [owner, setOwner] = useState<string | null>(null);
  const { period: selectedPeriod, month: selectedMonth, setPeriod: setSelectedPeriod, setMonth: setSelectedMonth } = usePeriodSelection(period, month);
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const selected = entities.find((entry) => entry.id === entityId) ?? entities[0];
  useEffect(() => {
    const previous = document.body.style.overflow;
    const active = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => { document.body.style.overflow = previous; active?.focus(); };
  }, []);
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    let authChanged = false;
    supabase.auth.getUser().then(({ data }) => { if (!cancelled && !authChanged) setOwner(data.user?.id ?? null); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { authChanged = true; setOwner(session?.user.id ?? null); });
    return () => { cancelled = true; data.subscription.unsubscribe(); };
  }, []);
  return <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="portfolio-title" className={styles.dialog} onKeyDown={(event) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      if (event.key !== "Tab") return;
      const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,iframe')].filter((node) => node.offsetParent !== null);
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
    }}>
      <div className={styles.heading}><div><span className="section-label">COMUNICAÇÃO DA CARTEIRA</span><h2 id="portfolio-title">Comunicar resultado</h2><p>Escolha os destinatários, revise o painel e prepare o envio.</p></div><button ref={closeButton} type="button" className="icon-button" onClick={onClose} aria-label="Fechar comunicação"><X size={22} /></button></div>
      <div className={styles.filters}>
        <label>Unidade selecionada<select value={selected?.id ?? ""} onChange={(event) => setEntityId(event.target.value)}>{entities.map((entry) => <option key={entry.id} value={entry.id}>{KIND_LABELS[entry.kind]} {entry.kind === "pa" ? `${entry.cooperative} / ${entry.pa}` : entry.kind === "cooperative" ? entry.cooperative : entry.central} · {entry.name}</option>)}</select></label>
        <PeriodSelector label="Período da mensagem" period={selectedPeriod} month={selectedMonth} year={dataset.year}
          onPeriodChange={setSelectedPeriod} onMonthChange={setSelectedMonth} />
      </div>
      {selected ? <Composer key={`${owner ?? "session"}:${dataset.year}:${selected.id}`} dataset={dataset} entity={selected} owner={owner} metric={metric} period={selectedPeriod} month={selectedMonth} uplift={uplift} /> : <p role="alert">Não há unidades neste filtro.</p>}
    </section>
  </div>;
}

function Composer({ dataset, entity, owner, metric, month, period, uplift }: { dataset: Dataset; entity: RegistryEntity; owner: string | null; metric: Metric; month: number; period: string; uplift: number }) {
  const [contacts, setContacts] = useState<ResponsibleContact[]>([]);
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [contactError, setContactError] = useState("");
  const [extraEmails, setExtraEmails] = useState("");
  const [includeBoth, setIncludeBoth] = useState(false);
  const [intro, setIntro] = useState("");
  const [signature, setSignature] = useState("");
  const [subject, setSubject] = useState("");
  const [phoneContact, setPhoneContact] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneName, setPhoneName] = useState("");
  const [personalOutlook, setPersonalOutlook] = useState(false);
  const [tab, setTab] = useState("panel");
  const [step, setStep] = useState(1);
  const [channel, setChannel] = useState("email");
  const stepTitle = useRef<HTMLHeadingElement>(null);
  const navigate = (next: number) => { setStep(next); setFeedback(""); setError(""); };
  useEffect(() => { stepTitle.current?.focus({ preventScroll: true }); stepTitle.current?.scrollIntoView({ block: "nearest" }); }, [step]);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<PortfolioDraft[]>([]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    setLoading(true);
    listResponsibleContacts(dataset.year, entity.id).then((items) => {
      if (cancelled) return;
      const scoped = recipientsForContacts(items, dataset.year, entity).filter((contact) => contact.ownerId === owner);
      setContacts(scoped); setContactIds(scoped.map((contact) => contact.id));
      const firstPhone = scoped.find((contact) => contact.whatsapp);
      setPhoneContact(firstPhone?.id ?? ""); setPhone(firstPhone?.whatsapp ?? ""); setPhoneName(firstPhone?.name ?? "");
    }).catch(() => { if (!cancelled) setContactError("Não foi possível carregar os responsáveis. Confira a conexão ou informe os destinatários manualmente."); }).finally(() => { if (!cancelled) setLoading(false); });
    listPortfolioDrafts(owner, dataset.year, entity.id).then((items) => { if (!cancelled) setDrafts(items); }).catch(() => { /* Saving reports its own explicit error; draft history never blocks generation. */ });
    return () => { cancelled = true; };
  }, [owner, dataset.year, entity.id]);
  const selectedContacts = contacts.filter((contact) => contactIds.includes(contact.id));
  const recipients = attempt(() => normalizeRecipients([...selectedContacts.flatMap((contact) => contact.emails), ...extraEmails.split(/[;,\n]+/)]));
  const reportResult = useMemo(() => attempt(() => buildPortfolioReport({ dataset, entity, metric, includeBoth, month, period, uplift })), [dataset, entity, metric, includeBoth, month, period, uplift]);
  const report = reportResult.value;
  const baseMessage = report ? renderPortfolioCommunication(report, { names: selectedContacts.map((contact) => contact.name), intro, signature, subject }) : null;
  const baseWhatsapp = report ? renderPortfolioCommunication(report, { names: phoneName ? [phoneName] : [], intro, signature, subject }) : null;
  const { message, whatsappMessage, editor: messageEditor, editError: templateError, hasEmailPanel, restoreEmailPanel } = useMessageCustomization({ owner, kind: entity.kind, metric: entity.kind === "pa" ? "VN" : includeBoth ? "BOTH" : metric, contextKey: `${dataset.year}:${entity.id}:${metric}:${includeBoth}:${period}:${month}:${uplift}`, unit: entity.name, year: dataset.year, period: periodTitle(period, month, dataset.year), baseMessage, baseWhatsapp });
  const outlook = attempt(() => message && recipients.value ? buildOutlookLink({ recipients: recipients.value, subject: message.subject, body: message.text, personal: personalOutlook }) : null);
  const panelOutlook = attempt(() => message && recipients.value ? buildOutlookLink({ recipients: recipients.value, subject: message.subject, body: "", personal: personalOutlook }) : null);
  const whatsapp = attempt(() => whatsappMessage ? buildWhatsappLink({ phone, body: whatsappMessage.whatsapp }) : null);

  async function copy(value: string, label: string) {
    setError(""); setFeedback("");
    try { await navigator.clipboard.writeText(value); if (mounted.current) setFeedback(label); }
    catch { if (mounted.current) setError("O navegador bloqueou a cópia. Selecione e copie o texto na prévia ou baixe o arquivo."); }
  }
  function download(type: "eml" | "html") {
    if (!message) return;
    setError(""); setFeedback("");
    try {
      const content = type === "html" ? message.html : buildEmailFile({ recipients: recipients.value ?? [], subject: message.subject, text: message.text, html: message.html });
      const url = URL.createObjectURL(new Blob([content], { type: type === "html" ? "text/html;charset=utf-8" : "message/rfc822" }));
      const link = document.createElement("a"); link.href = url; link.download = `cenario-${entity.kind}-${entity.central}-${entity.cooperative ?? ""}-${entity.pa ?? ""}-${dataset.year}.${type}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback(type === "eml" ? "Arquivo de e-mail gerado com painel e texto. A abertura como rascunho depende da versão do Outlook; revise antes de enviar." : "Painel HTML gerado.");
    } catch (reason) { setError(errorText(reason)); }
  }
  async function save() {
    if (!owner || !report || !message || !whatsappMessage || !recipients.value) return;
    setSaving(true); setError(""); setFeedback("");
    try {
      const saved = await savePortfolioDraft(owner, report, { ...message, whatsapp: whatsappMessage.whatsapp, dashboard: whatsappMessage.dashboard }, recipients.value, phone);
      if (!mounted.current) return;
      setDrafts((items) => [saved, ...items].slice(0, 10)); setFeedback("Rascunho salvo na sua conta. Isso não confirma envio nem entrega.");
    } catch (reason) { if (mounted.current) setError(errorText(reason)); }
    finally { if (mounted.current) setSaving(false); }
  }
  if (!report || !message || !whatsappMessage) return <p role="alert" className="message error">{reportResult.error || "Não foi possível gerar o cenário."}</p>;
  // A URL-size limitation must not disable the complete MIME export or persistence.
  const invalid = recipients.error || templateError;
  const channelSelector = <fieldset className={styles.channels}><legend>Canal de comunicação</legend>
    <label><input type="radio" name="communication-channel" value="email" checked={channel === 'email'} onChange={() => setChannel('email')} /> E-mail</label>
    <label><input type="radio" name="communication-channel" value="whatsapp" checked={channel === 'whatsapp'} onChange={() => setChannel('whatsapp')} /> WhatsApp</label>
  </fieldset>;
  const noPanel = !hasEmailPanel && <div role="alert" className={styles.warning}>Seu modelo de e-mail contém somente texto, sem o painel de indicadores. <button type="button" className="button secondary" onClick={restoreEmailPanel}>Restaurar painel automático</button></div>;
  return <div className={styles.composer}>
    <nav className={styles.steps} aria-label="Etapas da comunicação">
      {['Destinatários', 'Revisar painel', 'Preparar envio'].map((label, index) => <button key={label} type="button" aria-current={step === index + 1 ? 'step' : undefined} onClick={() => navigate(index + 1)}><span>{index + 1}</span>{label}</button>)}
    </nav>
    <section hidden={step !== 1} className={styles.stepContent} aria-label="Configurar mensagem">
      <h3 tabIndex={-1} ref={step === 1 ? stepTitle : null}>Quem vai receber?</h3>
      {step === 1 && channelSelector}
      <div className={styles.setupGrid}>
        <section className={styles.card} aria-label="Destinatários da unidade" hidden={channel !== 'email'}>
          <h4>Destinatários do e-mail</h4>
          {loading && <p role="status">Carregando responsáveis…</p>}
          {contactError && <p role="alert" className={styles.warning}>{contactError}</p>}
          {!loading && !contacts.length && !contactError && <p className="helper">Informe os e-mails abaixo ou cadastre responsáveis em Cadastro e metas.</p>}
          <div className={styles.contacts}>{contacts.map((contact) => <label key={contact.id} className={styles.contact}><input type="checkbox" checked={contactIds.includes(contact.id)} onChange={(event) => setContactIds((ids) => event.target.checked ? [...ids, contact.id] : ids.filter((id) => id !== contact.id))} /><span><strong>{contact.name}</strong><small>{contact.emails.length ? contact.emails.join('; ') : 'Sem e-mail cadastrado'}</small></span></label>)}</div>
          <label>E-mails adicionais<textarea rows={2} maxLength={10000} value={extraEmails} onChange={(event) => setExtraEmails(event.target.value)} placeholder="nome@empresa.com.br; outro@empresa.com.br" /></label>
          <p className="helper">{recipients.value?.length ?? 0} destinatários · separados por ponto e vírgula.</p>
          {recipients.error && <p role="alert" className={styles.warning}>{recipients.error}</p>}
        </section>
        <section className={styles.card} hidden={channel !== 'whatsapp'}>
          <h4>Destinatário do WhatsApp</h4>
          <label>Responsável para o WhatsApp<select value={phoneContact} onChange={(event) => { const contact = contacts.find((entry) => entry.id === event.target.value); setPhoneContact(event.target.value); setPhone(contact?.whatsapp ?? ''); setPhoneName(contact?.name ?? ''); }}><option value="">Informar manualmente / escolher no WhatsApp</option>{contacts.filter((contact) => contact.whatsapp).map((contact) => <option value={contact.id} key={contact.id}>{contact.name} · {contact.whatsapp}</option>)}</select></label>
          <label>Número com DDD<input type="tel" inputMode="tel" value={phone} maxLength={40} onChange={(event) => { setPhoneContact(''); setPhone(event.target.value); }} placeholder="(71) 99999-9999 ou +DDI" /></label>
          <label>Nome para saudação no WhatsApp<input value={phoneName} maxLength={160} onChange={(event) => setPhoneName(event.target.value)} /></label>
          <p className="helper">Número vazio: escolha o destinatário no WhatsApp.</p>
          {whatsapp.error && <p role="alert" className={styles.warning}>{whatsapp.error}</p>}
        </section>
        <section className={styles.card}>
          <h4>Mensagem</h4>
          <label>Assunto<input maxLength={300} value={subject || message.subject} onChange={(event) => setSubject(event.target.value)} /></label>
          {entity.kind !== 'pa' && <label className={styles.contact}><input type="checkbox" checked={includeBoth} onChange={(event) => setIncludeBoth(event.target.checked)} /><span>Incluir Venda Nova e Arrecadação, separadamente</span></label>}
          <details className={styles.disclosure}><summary>Personalizar abertura e assinatura</summary>
            <label>Abertura personalizada<textarea rows={3} value={intro} maxLength={2000} onChange={(event) => setIntro(event.target.value)} placeholder="Opcional" /></label>
            <label>Assinatura / orientação final<textarea rows={2} maxLength={1000} value={signature} onChange={(event) => setSignature(event.target.value)} placeholder="Seu nome e mensagem de encerramento" /></label>
          </details>
        </section>
      </div>
      <details className={styles.disclosure}><summary>Editar textos e modelos avançados</summary>{messageEditor}</details>
      {noPanel}
    </section>
    <section hidden={step !== 2} className={styles.stepContent} aria-label="Revisão da comunicação">
      <h3 tabIndex={-1} ref={step === 2 ? stepTitle : null}>Confira antes de compartilhar</h3>
      <div className={styles.tabs} role="group" aria-label="Prévia da comunicação">{[['panel', 'Painel do e-mail'], ['email', 'Texto do e-mail'], ['whatsapp', 'Painel do WhatsApp']].map(([key, label]) => <button key={key} type="button" className={`button ${tab === key ? 'primary' : 'secondary'}`} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>
      {noPanel}
      {step === 2 && (tab === 'panel' ? <EmailPreview html={message.html} /> : tab === 'email' ? <label className={styles.textPreview}>E-mail gerado<textarea rows={18} readOnly value={message.text} /></label> : <><WhatsappDashboard model={whatsappMessage.dashboard} text={whatsappMessage.whatsapp} subject={whatsappMessage.subject} busy={loading} /><details className={styles.disclosure}><summary>Ver texto do WhatsApp</summary><label>WhatsApp gerado<textarea rows={10} readOnly value={whatsappMessage.whatsapp} /></label></details></>)}
    </section>
    <section hidden={step !== 3} className={styles.stepContent} aria-label="Preparação do envio">
      <h3 tabIndex={-1} ref={step === 3 ? stepTitle : null}>Pronto para compartilhar</h3>
      {step === 3 && channelSelector}
      <p className={styles.deliverySummary}><strong>{entity.name}</strong> · {report.periodLabel}<br />{channel === 'email' ? `${recipients.value?.length ?? 0} destinatários: ${recipients.value?.join('; ') || 'informe no Outlook antes de enviar'}` : phoneName || 'Destinatário escolhido no WhatsApp'}</p>
      <div hidden={channel !== 'email'} className={styles.card}>
        <h4>Enviar o painel pelo Outlook</h4>
        {noPanel}
        <label>Conta do Outlook<select value={personalOutlook ? 'personal' : 'work'} onChange={(event) => setPersonalOutlook(event.target.value === 'personal')}><option value="work">Microsoft 365 / Corporativa</option><option value="personal">Outlook.com / Pessoal</option></select></label>
        <OutlookHandoff html={message.html} text={message.text} url={panelOutlook.value?.url ?? null} disabled={!!invalid || loading || !hasEmailPanel} />
        {panelOutlook.error && <p role="alert" className={styles.warning}>{panelOutlook.error}</p>}
        <div className={styles.fileOption}><div><strong>Prefere abrir um arquivo?</strong><p>O arquivo contém o painel completo. Abra no Outlook; no novo Outlook, pode ser necessário encaminhar a mensagem e revisar os destinatários.</p></div><button className="button secondary" disabled={!!invalid || loading} onClick={() => download('eml')}><Download size={17} /> Baixar e-mail (.eml)</button></div>
        <details className={styles.disclosure}><summary>Outras opções de e-mail</summary><div className={styles.actions}>
          <button className="button secondary" onClick={() => copy(message.text, 'Texto do e-mail copiado.')}><Copy size={17} /> Copiar e-mail</button>
          {outlook.value && !invalid && !loading ? <a className="button secondary" href={outlook.value.url} target="_blank" rel="noopener noreferrer">Abrir Outlook somente texto</a> : <button className="button secondary" disabled>Abrir Outlook somente texto</button>}
          <button className="button secondary" onClick={() => download('html')}><Download size={17} /> Baixar painel HTML</button>
        </div>{outlook.value?.requiresPaste && <p className={styles.warning}>Texto maior que o limite do link. Cole a mensagem completa no Outlook ou use o arquivo .eml.</p>}</details>
      </div>
      {step === 3 && channel === 'whatsapp' && <div className={styles.card}><h4>Enviar pelo WhatsApp</h4>
        <WhatsappDashboard model={whatsappMessage.dashboard} text={whatsappMessage.whatsapp} subject={whatsappMessage.subject} busy={loading || !!templateError || !!whatsapp.error} />
        <details className={styles.disclosure}><summary>Enviar somente texto</summary><div className={styles.actions}>
          <button className="button secondary" onClick={() => copy(whatsappMessage.whatsapp, 'Texto adaptado para WhatsApp copiado.')}><Copy size={17} /> Copiar WhatsApp</button>
          {whatsapp.value && !loading && !templateError ? <a className="button secondary" href={whatsapp.value.url} target="_blank" rel="noopener noreferrer"><MessageSquareText size={17} /> Abrir WhatsApp</a> : <button className="button secondary" disabled>Abrir WhatsApp</button>}
        </div>{whatsapp.value?.requiresPaste && <p className={styles.warning}>Texto maior que o limite do link. Copie a mensagem completa e cole na conversa.</p>}</details>
      </div>}
      {invalid && <p role="alert" className={styles.warning}>{invalid}</p>}
      <p className="helper">Revise o destinatário no aplicativo. Nada é enviado automaticamente.</p>
      {feedback && <p className="message success" role="status">{feedback}</p>}
      {error && <p className="message error" role="alert">{error}</p>}
      <details className={styles.disclosure}><summary>Rascunhos salvos desta unidade ({drafts.length})</summary>{!drafts.length && <p>Nenhum rascunho salvo.</p>}{drafts.map((draft) => <details key={draft.id} className={styles.draft}><summary>{new Date(draft.created_at).toLocaleString('pt-BR')} · {draft.subject}</summary><p className="helper">Cenário da data de gravação; não atualizado automaticamente.</p><label>E-mail salvo<textarea readOnly rows={10} value={draft.email_body} /></label><label>WhatsApp salvo<textarea readOnly rows={6} value={draft.whatsapp_body} /></label>{draft.whatsapp_dashboard && <SavedDashboard draft={draft} />}<div className={styles.actions}><button className="button secondary" onClick={() => copy(draft.email_body, 'Texto do rascunho copiado.')}>Copiar e-mail salvo</button><button className="button secondary" onClick={() => copy(draft.whatsapp_body, 'WhatsApp do rascunho copiado.')}>Copiar WhatsApp salvo</button><button className="button quiet" onClick={async () => { if (!owner || !window.confirm('Excluir este rascunho salvo?')) return; try { await deletePortfolioDraft(owner, draft.id); if (mounted.current) setDrafts((items) => items.filter((item) => item.id !== draft.id)); } catch (reason) { if (mounted.current) setError(errorText(reason)); } }}><Trash2 size={16} /> Excluir rascunho</button></div></details>)}</details>
    </section>
    <footer className={styles.stepFooter}>
      <span>Etapa {step} de 3</span>
      <div className={styles.actions}>
        {step > 1 && <button className="button secondary" onClick={() => navigate(step - 1)}>Voltar</button>}
        {step < 3 ? <button className="button primary" onClick={() => { if (step === 1) setTab(channel === 'email' ? 'panel' : 'whatsapp'); navigate(step + 1); }}>{step === 1 ? 'Revisar painel' : 'Preparar envio'}</button> : <button className="button secondary" disabled={!owner || saving || loading || !!invalid || !!whatsapp.error} onClick={save}><Save size={17} />{saving ? 'Salvando…' : 'Salvar rascunho'}</button>}
      </div>
    </footer>
  </div>;
}

function SavedDashboard({ draft }: { draft: PortfolioDraft }) {
  const [open, setOpen] = useState(false);
  return <div><button className="button secondary" onClick={() => setOpen((value) => !value)}>{open ? "Ocultar painel salvo" : "Ver painel WhatsApp salvo"}</button>{open && draft.whatsapp_dashboard && <WhatsappDashboard model={draft.whatsapp_dashboard} text={draft.whatsapp_body} subject={draft.subject} saved />}</div>;
}
