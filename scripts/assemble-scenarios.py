from pathlib import Path
import re

def patch(s, old, new):
    if old not in s: raise RuntimeError('Anchor missing: '+old[:120])
    return s.replace(old,new)

# Model all Supabase roles when running complete migrations in isolated PostgreSQL.
for p in Path('tests').glob('*.mjs'):
    s=p.read_text()
    if re.search(r'create role authenticated;',s,re.I) and not re.search(r'create role service_role',s,re.I):
        s=re.sub(r'(create role authenticated;)',r'\1 create role service_role;',s,flags=re.I)
        p.write_text(s)
p=Path('tests/browser/portfolio.spec.mjs');s=p.read_text()
if 'registerScenarioTests' not in s:
    s='import { registerScenarioTests } from "./scenario-cases.mjs";\n'+s
    s=patch(s,'  const drafts = [];','  const drafts = [];\n  const templates = new Map();')
    anchor="    if (url.pathname === '/rest/v1/commercial_entity_contacts')"
    block="""    if (url.pathname === '/rest/v1/commercial_message_templates') {
      const key = `${url.searchParams.get('entity_kind')}:${url.searchParams.get('metric')}`;
      if (['POST','PATCH'].includes(request.method())) {
        const row = request.postDataJSON(); templates.set(`eq.${row.entity_kind}:eq.${row.metric}`, row); return answer(row);
      }
      return answer(templates.get(key) || null);
    }
"""
    s=patch(s,anchor,block+anchor)
    s+='\nregisterScenarioTests({ test, expect, setup, composer, owner, created });\n'
    p.write_text(s)
p=Path('components/message-customization.tsx');s=p.read_text()
if 'editError' not in s:
    s=patch(s,'  const message = baseMessage ?', '  const editError = [values.email, values.whatsapp].some(value => !value.trim()) ? "Preencha o texto dos dois canais ou restaure o texto automático." : [values.email, values.whatsapp].some(value => (value.match(/\\{\\{cenario\\}\\}/g) || []).length > 1) ? "Use {{cenario}} apenas uma vez em cada canal." : "";\n  const safeEmail = editError ? DEFAULT_MESSAGE_TEMPLATE : values.email;\n  const safeWhatsapp = editError ? DEFAULT_MESSAGE_TEMPLATE : values.whatsapp;\n  const message = baseMessage ?')
    s=s.replace('applyMessageTemplate(values.email,','applyMessageTemplate(safeEmail,').replace('templateHtml(values.email,','templateHtml(safeEmail,').replace('applyMessageTemplate(values.whatsapp,','applyMessageTemplate(safeWhatsapp,')
    s=patch(s,'    if (!owner || !supabase || stored?.scope !== scope) return;', '    if (!owner || !supabase || stored?.scope !== scope || editError) return;')
    s=patch(s,'disabled={!owner || saving || stored?.scope !== scope}', 'disabled={!owner || saving || stored?.scope !== scope || !!editError}')
    s=patch(s,'    <label>Texto / modelo do e-mail', '    {editError && <p role="alert" className={styles.warning}>{editError} A prévia usa o cenário automático até a correção.</p>}\n    <button type="button" className="button secondary" onClick={() => change({ email: baseMessage?.text ?? DEFAULT_MESSAGE_TEMPLATE })}>Editar texto completo do e-mail</button>\n    <label>Texto / modelo do e-mail')
    s=patch(s,'    <label>Texto / modelo do WhatsApp', '    <button type="button" className="button secondary" onClick={() => change({ whatsapp: baseWhatsapp?.whatsapp ?? DEFAULT_MESSAGE_TEMPLATE })}>Editar texto completo do WhatsApp</button>\n    <label>Texto / modelo do WhatsApp')
    s=patch(s,'return { message, whatsappMessage, editor };','return { message, whatsappMessage, editor, editError };')
    p.write_text(s)
p=Path('components/portfolio-communication.tsx');s=p.read_text()
if 'editError: templateError' not in s:
    s=patch(s,'editor: messageEditor } = useMessageCustomization','editor: messageEditor, editError: templateError } = useMessageCustomization')
    s=patch(s,'  const invalid = recipients.error;', '  const invalid = recipients.error || templateError;')
    s=patch(s,'{whatsapp.value && !loading ?', '{whatsapp.value && !loading && !templateError ?')
    p.write_text(s)
print('Scenario browser and isolated PostgreSQL integration updated.')
