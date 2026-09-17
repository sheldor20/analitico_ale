"use client";

import { useEffect, useState } from "react";
import { Check, Info, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { CAPITAL_MODALITIES, RATE_PERIODS, RATE_UNITS } from "@/lib/relationship.mjs";
import { deleteEntityProfile, emptyProfile, loadEntityProfile, saveEntityProfile, type ProfileInput, type RateTable } from "@/lib/relationship-store";
import type { RegistryEntity } from "@/lib/types";
import styles from "./entity-profile.module.css";

const message = (reason: unknown) => reason instanceof Error ? reason.message : "Não foi possível salvar a ficha.";
export default function EntityProfile({ entity, year, userId, disabled = false, onDirtyChange }: { entity: RegistryEntity; year: number; userId: string; disabled?: boolean; onDirtyChange?: (dirty: boolean) => void }) {
  const [form, setForm] = useState<ProfileInput>(emptyProfile);
  const [loading, setLoading] = useState(true); const [loadFailed, setLoadFailed] = useState(false); const [reload, setReload] = useState(0); const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(""); const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [removing, setRemoving] = useState(false);
  const locked = disabled || loading || saving;
  useEffect(() => { let active = true; setLoading(true); setLoadFailed(false); setError(""); loadEntityProfile(year, entity.id, userId).then((value) => { if (active) { setForm(value ?? emptyProfile()); setSavedAt(value?.updatedAt ?? ""); } }).catch((reason) => { if (active) { setError(message(reason)); setLoadFailed(true); } }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [entity.id, year, userId, reload]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  function update(changes: Partial<ProfileInput>) { setForm((current) => ({ ...current, ...changes })); setDirty(true); setNotice(""); }
  function updateRate(id: string, changes: Partial<RateTable>) { update({ rateTables: form.rateTables.map((rate) => rate.id === id ? { ...rate, ...changes } : rate) }); }
  async function submit(event: React.FormEvent) { event.preventDefault(); if (loadFailed || loading) return; setSaving(true); setError(""); setNotice(""); try { const saved = await saveEntityProfile(year, entity, form, userId); setForm(saved); setSavedAt(saved.updatedAt); setDirty(false); setNotice("Ficha salva."); } catch (reason) { setError(message(reason)); } finally { setSaving(false); } }
  async function remove() { setSaving(true); setError(""); try { await deleteEntityProfile(year, entity.id, userId); setForm(emptyProfile()); setSavedAt(""); setDirty(false); setRemoving(false); setNotice("Informações da ficha removidas. Contatos, agenda, metas e produção foram preservados."); } catch (reason) { setError(message(reason)); } finally { setSaving(false); } }
  return <section className={styles.section} aria-label={`Ficha de ${entity.name}`}>
    <div className={styles.heading}><div><h3>Ficha da carteira</h3><p>Condições comerciais e informações para acompanhar esta unidade.</p></div>{savedAt && <span className={styles.muted}>Salva em {new Date(savedAt).toLocaleDateString("pt-BR")}</span>}</div>
    {error && <div className="message error" role="alert"><Info size={17} />{error}</div>}{notice && <div className="message success" role="status"><Check size={17} />{notice}</div>}
    {loading ? <p className={styles.muted}><LoaderCircle size={18} className="spin" /> Carregando ficha…</p> : loadFailed ? <button type="button" className="button secondary" onClick={() => setReload((current) => current + 1)}>Recarregar ficha</button> : <form onSubmit={submit}>
      <fieldset className="registry-fieldset" disabled={locked}>
        <div className={styles.section}>
          <div className={styles.fieldgroup}><h4>Seguro prestamista</h4><p className={styles.muted}>Registre a modalidade do capital segurado e as condições negociadas.</p><div className={styles.grid}><label>Modalidade de capital<select value={form.capitalModality} onChange={(event) => update({ capitalModality: event.target.value })}>{CAPITAL_MODALITIES.map((item) => <option key={item}>{item}</option>)}</select></label><label className={styles.full}>Condições do capital<textarea maxLength={4000} value={form.capitalNotes} onChange={(event) => update({ capitalNotes: event.target.value })} placeholder="Ex.: regras de contratação, limites de capital e características da carteira." /></label></div></div>
          <div className={styles.fieldgroup}><div className={styles.heading}><div><h4 style={{ margin: 0 }}>Tabelas e taxas</h4><p>Informe a unidade, o período e a vigência de cada taxa.</p></div><button type="button" className="button secondary" disabled={form.rateTables.length >= 30} onClick={() => update({ rateTables: [...form.rateTables, { id: crypto.randomUUID(), name: "", rate: "", unit: "percent", period: "monthly", validFrom: "", validUntil: "", notes: "" }] })}><Plus size={16} /> Adicionar tabela</button></div>
            {!form.rateTables.length && <p className={styles.muted}>Nenhuma tabela cadastrada.</p>}
            {form.rateTables.map((rate, index) => <div key={rate.id} className={styles.rate}><div className={styles.heading}><strong>Tabela {index + 1}</strong><button type="button" className="button quiet registry-danger" aria-label={`Remover tabela ${index + 1}`} onClick={() => update({ rateTables: form.rateTables.filter((item) => item.id !== rate.id) })}><Trash2 size={16} /> Remover</button></div><div className={styles.grid}>
              <label>Nome da tabela<input required maxLength={160} value={rate.name} onChange={(event) => updateRate(rate.id, { name: event.target.value })} placeholder="Ex.: Prestamista PJ · tabela 01" /></label>
              <label>Taxa<input required inputMode="decimal" value={String(rate.rate).replace(".", ",")} onChange={(event) => updateRate(rate.id, { rate: event.target.value })} placeholder="Ex.: 0,035" /></label>
              <label>Unidade<select aria-label="Unidade" value={rate.unit} onChange={(event) => updateRate(rate.id, { unit: event.target.value as RateTable["unit"] })}>{Object.entries(RATE_UNITS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label>Período da taxa<select aria-label="Período da taxa" value={rate.period} onChange={(event) => updateRate(rate.id, { period: event.target.value as RateTable["period"] })}>{Object.entries(RATE_PERIODS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label>Vigência inicial<input type="date" value={rate.validFrom} onChange={(event) => updateRate(rate.id, { validFrom: event.target.value })} /></label><label>Vigência final<input type="date" min={rate.validFrom || undefined} value={rate.validUntil} onChange={(event) => updateRate(rate.id, { validUntil: event.target.value })} /></label>
              <label className={styles.full}>Condições da tabela<textarea maxLength={2000} value={rate.notes} onChange={(event) => updateRate(rate.id, { notes: event.target.value })} placeholder="Público elegível, faixa etária, coberturas e demais condições." /></label>
            </div></div>)}
          </div>
          <div className={styles.fieldgroup}><h4>Informações da carteira</h4><div className={styles.grid}><label>Arrecadação<textarea maxLength={4000} value={form.collectionNotes} onChange={(event) => update({ collectionNotes: event.target.value })} placeholder="Histórico, recorrência, cancelamentos e oportunidades na carteira existente." /></label><label>Venda nova<textarea maxLength={4000} value={form.newSalesNotes} onChange={(event) => update({ newSalesNotes: event.target.value })} placeholder="Estratégia comercial, campanhas, oportunidades e próximos passos." /></label><label className={styles.full}>Outras observações<textarea maxLength={4000} value={form.generalNotes} onChange={(event) => update({ generalNotes: event.target.value })} placeholder="Contexto relevante para o relacionamento com a unidade." /></label></div><p className={styles.muted}>Os valores de metas e produção ficam na aba “Metas e produção”.</p></div>
          <div className={styles.actions}><button className="button primary" type="submit" disabled={!dirty}>{saving ? <LoaderCircle size={17} className="spin" /> : <Save size={17} />} Salvar ficha</button>{dirty && <span className={styles.muted}>Alterações ainda não salvas</span>}{savedAt && <button className="button quiet registry-danger" type="button" onClick={() => setRemoving(true)}><Trash2 size={16} /> Excluir ficha</button>}</div>
          {removing && <div className={styles.confirmation} role="alertdialog" aria-label="Limpar informações da ficha"><p>Excluir as condições e observações desta ficha? Os contatos, compromissos e valores permanecem cadastrados.</p><div className={styles.actions}><button type="button" className="button secondary" onClick={() => setRemoving(false)}>Manter ficha</button><button type="button" className="button registry-danger" onClick={() => void remove()}>Excluir informações</button></div></div>}
        </div>
      </fieldset>
    </form>}
  </section>;
}
