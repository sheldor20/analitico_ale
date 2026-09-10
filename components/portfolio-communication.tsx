"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Mail, MessageSquareText, Save, Trash2, X } from "lucide-react";
import { MONTHS } from "@/lib/analytics.mjs";
import { supabase } from "@/lib/supabase";
import { listResponsibleContacts } from "@/lib/contact-store";
import type { ResponsibleContact } from "@/lib/contact-store";
import { buildEmailFile, buildOutlookLink, buildPortfolioReport, buildWhatsappLink, KIND_LABELS, normalizeRecipients, PERIOD_LABELS, recipientsForContacts, renderPortfolioCommunication } from "@/lib/portfolio-communication.mjs";
import { deletePortfolioDraft, listPortfolioDrafts, savePortfolioDraft } from "@/lib/portfolio-store";
import type { PortfolioDraft } from "@/lib/portfolio-store";
import type { Dataset, Metric, RegistryEntity } from "@/lib/types";
import styles from "./portfolio-communication.module.css";

type Props = { dataset: Dataset; candidates: RegistryEntity[]; initialKey?: string; metric: Metric; month: number; period: string; uplift?: number; onClose: () => void };
const errorText = (reason: unknown) => reason instanceof Error ? reason.message : "Não foi possível concluir a operação.";
function attempt<T>(fn: () => T): { value: T | null; error: string } {
  try { return { value: fn(), error: "" }; } catch (reason) { return { value: null, error: errorText(reason) }; }
}

export default function PortfolioCommunication({ dataset, candidates, initialKey, metric, month, period, uplift = 0, onClose }: Props) {
  const entities = useMemo(() => [...new Map(candidates.map((candidate) => [candidate.id, dataset.registry?.entities.find((entry) => entry.id === candidate.id) ?? candidate])).values()], [candidates, dataset.registry]);
  const [entityId, setEntityId] = useState(initialKey || entities[0]?.id || "");
  const [owner, setOwner] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState(Object.hasOwn(PERIOD_LABELS, period) ? period : "ytd");
  const [selectedMonth, setSelectedMonth] = useState(month);
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
      <div className={styles.heading}><div><span className="section-label">COMUNICAÇÃO DA CARTEIRA</span><h2 id="portfolio-title">Do cenário à conversa</h2><p>Uma unidade por mensagem. Revise o painel, os destinatários e as próximas ações.</p></div><button ref={closeButton} type="button" className="icon-button" onClick={onClose} aria-label="Fechar comunicação"><X size={22} /></button></div>
      <div className={styles.filters}>
        <label>Unidade selecionada<select value={selected?.id ?? ""} onChange={(event) => setEntityId(event.target.value)}>{entities.map((entry) => <option key={entry.id} value={entry.id}>{KIND_LABELS[entry.kind]} {entry.kind === "pa" ? `${entry.cooperative} / ${entry.pa}` : entry.kind === "cooperative" ? entry.cooperative : entry.central} · {entry.name}</option>)}</select></label>
        <label>Período da mensagem<select value={selectedPeriod} onChange={(event) => setSelectedPeriod(event.target.value)}>{Object.entries(PERIOD_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Mês de referência<select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>{MONTHS.map((label: string, index: number) => <option key={label} value={index}>{label}/{dataset.year}</option>)}</select></label>
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
  const message = report ? renderPortfolioCommunication(report, { names: selectedContacts.map((contact) => contact.name), intro, signature, subject }) : null;
  const whatsappMessage = report ? renderPortfolioCommunication(report, { names: phoneName ? [phoneName] : [], intro, signature, subject }) : null;
  const outlook = attempt(() => message && recipients.value ? buildOutlookLink({ recipients: recipients.value, subject: message.subject, body: message.text, personal: personalOutlook }) : null);
  const whatsapp = attempt(() => whatsappMessage ? buildWhatsappLink({ phone, body: whatsappMessage.whatsapp }) : null);

  async function copy(value: string, label: string) {
    setError(""); setFeedback("");
    try { await navigator.clipboard.writeText(value); if (mounted.current) setFeedback(label); }
    catch { if (mounted.current) setError("O navegador bloqueou a cópia. Selecione e copie o texto na prévia ou baixe o arquivo."); }
  }
  async function copyPanel() {
    if (!message) return;
    setError(""); setFeedback("");
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Clipboard indisponível");
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([message.html], { type: "text/html" }), "text/plain": new Blob([message.text], { type: "text/plain" }) })]);
      if (mounted.current) setFeedback("Painel copiado com formatação. No Outlook, substitua o texto do corpo colando o painel e revise antes de enviar.");
    } catch { if (mounted.current) setError("Não foi possível copiar o painel formatado. Use Baixar e-mail (.eml), Baixar painel HTML ou copie o texto."); }
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
      const saved = await savePortfolioDraft(owner, report, { ...message, whatsapp: whatsappMessage.whatsapp }, recipients.value, phone);
      if (!mounted.current) return;
      setDrafts((items) => [saved, ...items].slice(0, 10)); setFeedback("Rascunho salvo na sua conta. Isso não confirma envio nem entrega.");
    } catch (reason) { if (mounted.current) setError(errorText(reason)); }
    finally { if (mounted.current) setSaving(false); }
  }
  if (!report || !message || !whatsappMessage) return <p role="alert" className="message error">{reportResult.error || "Não foi possível gerar o cenário."}</p>;
  // A URL-size limitation must not disable the complete MIME export or persistence.
  const invalid = recipients.error;
  return <div className={styles.composer}>
    <div className={styles.settings}>
      <section className={styles.card} aria-label="Destinatários da unidade">
        <h3>Responsáveis desta unidade</h3>
        <p className="helper">{owner ? "Somente os contatos vinculados a esta unidade e ao ano selecionado. Não inclui responsáveis de outras unidades." : "Entre na conta para usar os responsáveis cadastrados e salvar rascunhos. O preenchimento manual continua disponível."}</p>
        {loading && <p role="status">Carregando responsáveis…</p>}
        {contactError && <p role="alert" className={styles.warning}>{contactError}</p>}
        {!loading && owner && !contacts.length && !contactError && <p className="helper">Nenhum responsável cadastrado. Inclua em Base fixa → Responsáveis ou informe o contato abaixo.</p>}
        <div className={styles.contacts}>{contacts.map((contact) => <label key={contact.id} className={styles.contact}><input type="checkbox" checked={contactIds.includes(contact.id)} onChange={(event) => setContactIds((ids) => event.target.checked ? [...ids, contact.id] : ids.filter((id) => id !== contact.id))} /><span><strong>{contact.name}</strong><small>{contact.jobTitle || "Cargo não informado"}</small><small>{contact.emails.length ? contact.emails.join("; ") : "Sem e-mail cadastrado"}</small></span></label>)}</div>
        <label>E-mails adicionais<textarea rows={2} maxLength={10000} value={extraEmails} onChange={(event) => setExtraEmails(event.target.value)} placeholder="nome@empresa.com.br; outro@empresa.com.br" /></label>
        <p className="helper">{recipients.value?.length ?? 0} destinatários únicos. Separe por ponto e vírgula ou linha. Revise quem receberá os dados da carteira.</p>
        {invalid && <p role="alert" className={styles.warning}>{invalid}</p>}
      </section>
      <section className={styles.card}>
        <h3>Personalizar a mensagem</h3>
        {entity.kind !== "pa" && <label className={styles.contact}><input type="checkbox" checked={includeBoth} onChange={(event) => setIncludeBoth(event.target.checked)} /><span>Incluir Venda Nova e Arrecadação, separadamente</span></label>}
        <label>Assunto<input maxLength={300} value={subject || message.subject} onChange={(event) => setSubject(event.target.value)} /></label>
        <label>Abertura personalizada<textarea rows={3} value={intro} maxLength={2000} onChange={(event) => setIntro(event.target.value)} placeholder="Deixe vazio para usar a apresentação automática do cenário." /></label>
        <label>Assinatura / orientação final<textarea rows={2} maxLength={1000} value={signature} onChange={(event) => setSignature(event.target.value)} placeholder="Seu nome e mensagem de encerramento" /></label>
        <p className="helper">Os números são gerados pela análise. A abertura e a assinatura são aplicadas aos dois canais.</p>
      </section>
      <section className={styles.card}>
        <h3>WhatsApp</h3>
        <label>Responsável para o WhatsApp<select value={phoneContact} onChange={(event) => { const contact = contacts.find((entry) => entry.id === event.target.value); setPhoneContact(event.target.value); setPhone(contact?.whatsapp ?? ""); setPhoneName(contact?.name ?? ""); }}><option value="">Informar manualmente / escolher no WhatsApp</option>{contacts.filter((contact) => contact.whatsapp).map((contact) => <option value={contact.id} key={contact.id}>{contact.name} · {contact.whatsapp}</option>)}</select></label>
        <label>Número com DDD<input type="tel" inputMode="tel" value={phone} maxLength={40} onChange={(event) => { setPhoneContact(""); setPhone(event.target.value); }} placeholder="(71) 99999-9999 ou +DDI" /></label>
        <label>Nome para saudação no WhatsApp<input value={phoneName} maxLength={160} onChange={(event) => setPhoneName(event.target.value)} /></label>
        <p className="helper">Número vazio permite escolher o destinatário no WhatsApp. Números brasileiros com DDD recebem o código 55.</p>
        {whatsapp.error && <p role="alert" className={styles.warning}>{whatsapp.error}</p>}
      </section>
    </div>
    <div className={styles.preview}>
      <div className={styles.tabs} role="group" aria-label="Prévia da comunicação">{[["panel", "Painel do e-mail"], ["email", "Texto do e-mail"], ["whatsapp", "Texto do WhatsApp"]].map(([key, label]) => <button key={key} type="button" className={`button ${tab === key ? "primary" : "secondary"}`} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>
      {tab === "panel" ? <iframe className={styles.frame} title="Painel do e-mail da carteira" sandbox="" srcDoc={message.html} /> : <label className={styles.textPreview}>{tab === "email" ? "E-mail gerado" : "WhatsApp gerado"}<textarea rows={24} readOnly value={tab === "email" ? message.text : whatsappMessage.whatsapp} /></label>}
      <div className={styles.card}>
        <h3>Preparar o envio</h3>
        <label>Conta do Outlook<select value={personalOutlook ? "personal" : "work"} onChange={(event) => setPersonalOutlook(event.target.value === "personal")}><option value="work">Microsoft 365 / Corporativa</option><option value="personal">Outlook.com / Pessoal</option></select></label>
        <p className="helper">O link do Outlook abre assunto, destinatários e texto. Para enviar o dashboard, use Copiar painel e cole no corpo do e-mail, substituindo o texto, ou abra o arquivo .eml em um cliente compatível.</p>
        {outlook.error && <p role="alert" className={styles.warning}>{outlook.error}</p>}
        {outlook.value?.requiresPaste && <p className={styles.warning}>Este e-mail excede o tamanho seguro do link. Copie o texto ou o painel e cole no Outlook; o link levará somente assunto e destinatários, sem cortar a mensagem.</p>}
        {whatsapp.value?.requiresPaste && <p className={styles.warning}>Este texto excede o tamanho seguro do link. Copie o WhatsApp completo e cole na conversa aberta; nenhuma parte será cortada.</p>}
        {!recipients.value?.length && <p className="helper">Sem destinatários de e-mail: informe-os no Outlook antes de enviar.</p>}
        <div className={styles.actions}>
          <button className="button secondary" onClick={copyPanel}><Copy size={17} /> Copiar painel</button>
          <button className="button secondary" onClick={() => copy(message.text, "Texto do e-mail copiado.")}><Copy size={17} /> Copiar e-mail</button>
          {outlook.value && !invalid && !loading ? <a className="button primary" href={outlook.value.url} target="_blank" rel="noopener noreferrer"><Mail size={17} /> Abrir Outlook</a> : <button className="button primary" disabled><Mail size={17} /> Abrir Outlook</button>}
          <button className="button secondary" disabled={!outlook.value || !!invalid || loading} onClick={() => outlook.value && copy(outlook.value.url, "Link do Outlook copiado. Ele contém os destinatários e pode conter os dados da carteira; compartilhe apenas com pessoas autorizadas.")}>Copiar link Outlook</button>
          <button className="button secondary" onClick={() => copy(whatsappMessage.whatsapp, "Texto adaptado para WhatsApp copiado.")}><Copy size={17} /> Copiar WhatsApp</button>
          {whatsapp.value && !loading ? <a className="button primary" href={whatsapp.value.url} target="_blank" rel="noopener noreferrer"><MessageSquareText size={17} /> Abrir WhatsApp</a> : <button className="button primary" disabled>Abrir WhatsApp</button>}
          <button className="button secondary" disabled={!!invalid || loading} onClick={() => download("eml")}><Download size={17} /> Baixar e-mail (.eml)</button>
          <button className="button secondary" onClick={() => download("html")}><Download size={17} /> Baixar painel HTML</button>
          <button className="button secondary" disabled={!owner || saving || loading || !!invalid || !!whatsapp.error} onClick={save}><Save size={17} /> {saving ? "Salvando…" : "Salvar rascunho"}</button>
        </div>
        <p className="helper">Nenhuma mensagem é enviada automaticamente. Abrir um canal ou salvar um rascunho não confirma envio nem entrega. Os links podem conter dados da carteira.</p>
        {feedback && <p className="message success" role="status">{feedback}</p>}
        {error && <p className="message error" role="alert">{error}</p>}
      </div>
      {drafts.length > 0 && <section className={styles.card}><h3>Rascunhos salvos desta unidade</h3><p className="helper">Últimos 10. Os textos abaixo preservam o cenário da data de gravação; não são atualizados automaticamente.</p>{drafts.map((draft) => <details key={draft.id} className={styles.draft}><summary>{new Date(draft.created_at).toLocaleString("pt-BR")} · {draft.subject}</summary><label>E-mail salvo<textarea readOnly rows={10} value={draft.email_body} /></label><label>WhatsApp salvo<textarea readOnly rows={6} value={draft.whatsapp_body} /></label><div className={styles.actions}><button className="button secondary" onClick={() => copy(draft.email_body, "Texto do rascunho copiado.")}>Copiar e-mail salvo</button><button className="button secondary" onClick={() => copy(draft.whatsapp_body, "WhatsApp do rascunho copiado.")}>Copiar WhatsApp salvo</button><button className="button quiet" onClick={async () => { if (!owner || !window.confirm("Excluir este rascunho salvo?")) return; try { await deletePortfolioDraft(owner, draft.id); if (mounted.current) setDrafts((items) => items.filter((item) => item.id !== draft.id)); } catch (reason) { if (mounted.current) setError(errorText(reason)); } }}><Trash2 size={16} /> Excluir rascunho</button></div></details>)}</section>}
    </div>
  </div>;
}
