"use client";

import { useEffect, useState } from "react";
import { Check, Info, LoaderCircle, Mail, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import {
  deleteResponsibleContact,
  listResponsibleContacts,
  saveResponsibleContact,
  type ResponsibleContact,
  type ResponsibleContactInput,
} from "@/lib/contact-store";
import type { RegistryEntity } from "@/lib/types";

const EMPTY: ResponsibleContactInput = { name: "", jobTitle: "", teams: "", whatsapp: "", emails: [""] };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Não foi possível salvar o responsável.";

export default function ResponsibleManager({ entity, year, disabled = false }: { entity: RegistryEntity; year: number; disabled?: boolean }) {
  const [contacts, setContacts] = useState<ResponsibleContact[]>([]);
  const [form, setForm] = useState<ResponsibleContactInput | null>(null);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const locked = disabled || saving;

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(""); setNotice(""); setForm(null); setEditingId(undefined);
    listResponsibleContacts(year, entity.id)
      .then((rows) => { if (!cancelled) setContacts(rows); })
      .catch((reason) => { if (!cancelled) { setContacts([]); setError(errorMessage(reason)); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [entity.id, year]);

  function startCreate() {
    setEditingId(undefined); setForm({ ...EMPTY, emails: [""] }); setError(""); setNotice("");
  }
  function startEdit(contact: ResponsibleContact) {
    setEditingId(contact.id);
    setForm({ name: contact.name, jobTitle: contact.jobTitle, teams: contact.teams, whatsapp: contact.whatsapp, emails: contact.emails.length ? [...contact.emails] : [""] });
    setError(""); setNotice("");
  }
  function updateEmail(index: number, value: string) {
    if (!form) return;
    setForm({ ...form, emails: form.emails.map((item, current) => current === index ? value : item) });
  }
  function addEmail() {
    if (!form || form.emails.length >= 10) return;
    setForm({ ...form, emails: [...form.emails, ""] });
  }
  function removeEmail(index: number) {
    if (!form) return;
    const next = form.emails.filter((_, current) => current !== index);
    setForm({ ...form, emails: next.length ? next : [""] });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const saved = await saveResponsibleContact(year, entity, form, editingId);
      setContacts((current) => [...current.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      setForm(null); setEditingId(undefined); setNotice("Responsável salvo e disponível para o envio do cenário da carteira.");
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(false); }
  }
  async function remove(contact: ResponsibleContact) {
    setSaving(true); setError(""); setNotice("");
    try {
      await deleteResponsibleContact(year, entity.id, contact.id);
      setContacts((current) => current.filter((item) => item.id !== contact.id));
      setNotice("Responsável removido.");
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(false); }
  }

  return <section className="registry-form" aria-label={`Responsáveis de ${entity.name}`}>
    <div className="panel-heading">
      <div><h3>Responsáveis para comunicação</h3><p>Contatos desta unidade para envio do cenário.</p></div>
      {!form && <button type="button" className="button secondary" onClick={startCreate} disabled={locked || loading}><Plus size={16} /> Adicionar responsável</button>}
    </div>
    {error && <div className="message error registry-error" role="alert"><Info size={17} /><span>{error}</span></div>}
    {notice && <div className="message success" role="status"><Check size={17} /><span>{notice}</span></div>}
    {loading ? <p className="helper"><LoaderCircle size={16} className="spin" /> Carregando responsáveis…</p> : form ? <form onSubmit={submit}>
      <fieldset disabled={locked} className="registry-fieldset">
        <div className="registry-grid">
          <label>Nome<input required maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nome do responsável" /></label>
          <label>Cargo<input maxLength={160} value={form.jobTitle} onChange={(event) => setForm({ ...form, jobTitle: event.target.value })} placeholder="Ex.: Gerente de Negócios" /></label>
          <label>Teams<input maxLength={300} value={form.teams} onChange={(event) => setForm({ ...form, teams: event.target.value })} placeholder="Usuário, e-mail ou link do Teams" /></label>
          <label>WhatsApp<input maxLength={40} inputMode="tel" value={form.whatsapp} onChange={(event) => setForm({ ...form, whatsapp: event.target.value })} placeholder="Ex.: +55 71 99999-9999" /></label>
        </div>
        <div className="registry-fieldset">
          <div className="panel-heading"><div><strong>E-mails</strong><p className="helper">Inclua até 10 endereços para o mesmo responsável.</p></div><button type="button" className="button quiet" onClick={addEmail} disabled={form.emails.length >= 10}><Plus size={15} /> Outro e-mail</button></div>
          {form.emails.map((email, index) => <div className="registry-actions" key={index}>
            <label style={{ flex: 1 }}><span className="sr-only">E-mail {index + 1}</span><input type="email" maxLength={254} value={email} onChange={(event) => updateEmail(index, event.target.value)} placeholder="nome@empresa.com.br" /></label>
            <button type="button" className="button quiet" aria-label={`Remover e-mail ${index + 1}`} onClick={() => removeEmail(index)}><X size={16} /></button>
          </div>)}
        </div>
        <div className="registry-actions"><button type="button" className="button secondary" onClick={() => { setForm(null); setEditingId(undefined); }}>Cancelar</button><button type="submit" className="button primary">{saving ? <LoaderCircle size={18} className="spin" /> : <Save size={18} />} Salvar responsável</button></div>
      </fieldset>
    </form> : contacts.length ? <div className="registry-list">
      {contacts.map((contact) => <div className="registry-unit" key={contact.id}>
        <span className="section-label">{contact.jobTitle || "Responsável"}</span>
        <strong>{contact.name}</strong>
        <small>{[contact.teams && `Teams: ${contact.teams}`, contact.whatsapp && `WhatsApp: ${contact.whatsapp}`].filter(Boolean).join(" · ") || "Sem Teams ou WhatsApp informado"}</small>
        {contact.emails.length > 0 && <small><Mail size={13} /> {contact.emails.join(" · ")}</small>}
        <div className="registry-actions"><button type="button" className="button quiet" onClick={() => startEdit(contact)} disabled={locked}><Pencil size={15} /> Editar</button><button type="button" className="button quiet registry-danger" onClick={() => void remove(contact)} disabled={locked}><Trash2 size={15} /> Excluir</button></div>
      </div>)}
    </div> : <p className="registry-notice"><Info size={17} /> Nenhum responsável cadastrado para esta unidade. Adicione os contatos para preparar os próximos envios de cenário.</p>}
  </section>;
}
