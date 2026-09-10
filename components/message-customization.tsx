"use client";
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { applyMessageTemplate, DEFAULT_MESSAGE_TEMPLATE, templateHtml } from '@/lib/message-template.mjs';
import styles from './portfolio-communication.module.css';
type Template = { email_template: string; whatsapp_template: string; enabled: boolean; revision: number };
export function useMessageCustomization({ owner, kind, metric, contextKey, unit, year, period, baseMessage, baseWhatsapp }: { owner: string | null; kind: string; metric: string; contextKey: string; unit: string; year: number; period: string; baseMessage: any; baseWhatsapp: any }) {
  const scope = `${owner || 'session'}:${kind}:${metric}`;
  const [stored, setStored] = useState<{ scope: string; value: Template | null } | null>(null);
  const [edited, setEdited] = useState<{ key: string; email: string; whatsapp: string; enabled: boolean } | null>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    if (!owner || !supabase) { setStored({ scope, value: null }); return; }
    supabase.from('commercial_message_templates').select('email_template,whatsapp_template,enabled,revision').eq('owner_id', owner).eq('entity_kind', kind).eq('metric', metric).maybeSingle().then(({ data, error }) => {
      if (cancelled) return;
      if (error) { setError('Não foi possível carregar o modelo padrão. A mensagem automática e a edição temporária continuam disponíveis.'); setStored({ scope, value: null }); }
      else setStored({ scope, value: data });
    });
    return () => { cancelled = true; };
  }, [scope, owner, kind, metric]);
  const standard = stored?.scope === scope ? stored.value : null;
  const key = `${scope}:${contextKey}`;
  const values = edited?.key === key ? edited : { key, email: standard?.enabled ? standard.email_template : DEFAULT_MESSAGE_TEMPLATE, whatsapp: standard?.enabled ? standard.whatsapp_template : DEFAULT_MESSAGE_TEMPLATE, enabled: standard?.enabled || false };
  const context = { unit, year, period };
  const editError = [values.email, values.whatsapp].some(value => !value.trim()) ? "Preencha o texto dos dois canais ou restaure o texto automático." : [values.email, values.whatsapp].some(value => (value.match(/\{\{cenario\}\}/g) || []).length > 1) ? "Use {{cenario}} apenas uma vez em cada canal." : "";
  const safeEmail = editError ? DEFAULT_MESSAGE_TEMPLATE : values.email;
  const safeWhatsapp = editError ? DEFAULT_MESSAGE_TEMPLATE : values.whatsapp;
  const message = baseMessage ? { ...baseMessage, text: applyMessageTemplate(safeEmail, baseMessage.text, context), html: templateHtml(safeEmail, baseMessage.html, context) } : null;
  const whatsappMessage = baseWhatsapp ? { ...baseWhatsapp, whatsapp: applyMessageTemplate(safeWhatsapp, baseWhatsapp.whatsapp, context) } : null;
  const change = (patch: Partial<typeof values>) => { setEdited({ ...values, ...patch }); setFeedback(''); };
  async function save() {
    if (!owner || !supabase || stored?.scope !== scope || editError) return;
    setSaving(true); setError(''); setFeedback('');
    const row = { owner_id: owner, entity_kind: kind, metric, email_template: values.email, whatsapp_template: values.whatsapp, enabled: values.enabled, revision: (standard?.revision || 0) + 1, updated_at: new Date().toISOString() };
    const query = standard ? supabase.from('commercial_message_templates').update(row).eq('owner_id', owner).eq('entity_kind', kind).eq('metric', metric).eq('revision', standard.revision) : supabase.from('commercial_message_templates').insert(row);
    try {
      const { data, error } = await query.select('email_template,whatsapp_template,enabled,revision').maybeSingle();
      if (error || !data) throw new Error('Não foi possível salvar. O modelo pode ter sido alterado em outra sessão; feche e abra a comunicação para recarregar.');
      if (!alive.current) return;
      setStored({ scope, value: data }); setFeedback(values.enabled ? 'Modelo padrão salvo para este nível e carteira, somente na sua conta.' : 'Padrão desativado. Este texto vale apenas para a comunicação aberta.');
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : 'Não foi possível salvar.'); }
    finally { if (alive.current) setSaving(false); }
  }
  const editor = <section className={styles.card} aria-label="Editar textos e padrão"><h3>Editar textos e padrão</h3><p className="helper">Edite livremente os dois canais. Mantenha {'{{cenario}}'} para atualizar o texto e os indicadores automaticamente. Também disponíveis: {'{{unidade}}'}, {'{{ano}}'} e {'{{periodo}}'}. Sem {'{{cenario}}'}, o e-mail envia somente seu texto.</p>
    {editError && <p role="alert" className={styles.warning}>{editError} A prévia usa o cenário automático até a correção.</p>}
    <button type="button" className="button secondary" onClick={() => change({ email: baseMessage?.text ?? DEFAULT_MESSAGE_TEMPLATE })}>Editar texto completo do e-mail</button>
    <label>Texto / modelo do e-mail<textarea aria-label="Texto / modelo do e-mail" rows={5} maxLength={12000} value={values.email} onChange={event => change({ email: event.target.value })} /></label>
    <button type="button" className="button secondary" onClick={() => change({ whatsapp: baseWhatsapp?.whatsapp ?? DEFAULT_MESSAGE_TEMPLATE })}>Editar texto completo do WhatsApp</button>
    <label>Texto / modelo do WhatsApp<textarea aria-label="Texto / modelo do WhatsApp" rows={5} maxLength={12000} value={values.whatsapp} onChange={event => change({ whatsapp: event.target.value })} /></label>
    <p className="helper">A prévia, a cópia, os links e os rascunhos usam o texto editado. O painel WhatsApp mantém os indicadores calculados; a legenda é editável.</p>
    <label className={styles.contact}><input type="checkbox" checked={values.enabled} onChange={event => change({ enabled: event.target.checked })} /><span>Usar como padrão para este nível e carteira</span></label>
    {values.enabled && (!values.email.includes('{{cenario}}') || !values.whatsapp.includes('{{cenario}}')) && <p className={styles.warning}>Há texto fixo sem cenário automático. Valores digitados não serão recalculados nos próximos envios.</p>}
    <div className={styles.actions}><button type="button" className="button secondary" onClick={() => change({ email: DEFAULT_MESSAGE_TEMPLATE, whatsapp: DEFAULT_MESSAGE_TEMPLATE, enabled: false })}>Restaurar texto automático</button><button type="button" className="button secondary" disabled={!owner || saving || stored?.scope !== scope || !!editError} onClick={save}>{saving ? 'Salvando…' : 'Salvar preferência de texto'}</button></div>
    {!owner && <p className="helper">Entre para guardar um padrão. Sem salvar, a edição vale apenas para esta comunicação.</p>}{feedback && <p role="status">{feedback}</p>}{error && <p role="alert" className={styles.warning}>{error}</p>}
  </section>;
  return { message, whatsappMessage, editor, editError };
}
