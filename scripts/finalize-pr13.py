from pathlib import Path
import hashlib
root=Path.cwd()
expected={
 'components/email-preview.tsx':'f53290386040972e49491ee7ac24cc19a423bb8556483cdd3a62e7a60371fe48',
 'components/portfolio-communication.tsx':'0d4c57065d4eed88e36918a1a85034c5a876606c54e34a919c30714c8db61b5e',
 'components/outlook-handoff.tsx':'83048920a03afc761b3c9bcb2209e1abb5c17138f64210afad5d3e529cc34c61',
 'components/dashboard.tsx':'2b3fc9b97bfaf3064d870b1a7e4028e7a3066c60ab0d3ce7d4851f30fd95ea96',
 'tests/browser/followup-cases.mjs':'cfb89dc4226a0101cad850dabadb335d2347aff689a3d779abd27f7d9d9e0513',
 'docs/UX_PAINEL_COMUNICACAO.md':'6386757ff2edbac0a6664e4e9030177bd8e6c6e8d5b63e8160f22b7ba3d72ae0'
}
for name,digest in expected.items():
 assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest,name

def edit(name,transform):
 p=root/name;p.write_text(transform(p.read_text()))
def replace(s,a,b):
 assert s.count(a)==1,(a,s.count(a));return s.replace(a,b)
edit('components/email-preview.tsx',lambda s:replace(s,"    if (!node?.contentDocument) return;\n    node.style.height = '1px';\n    node.style.height = `${Math.max(360, node.contentDocument.documentElement.scrollHeight)}px`;","    // srcDoc navigation and unmount can briefly leave a document without a root.\n    const root = node?.contentDocument?.documentElement;\n    if (!node?.isConnected || !root) return;\n    node.style.height = '1px';\n    node.style.height = `${Math.max(360, root.scrollHeight)}px`;"))
def composer(s):
 s=replace(s,'import { useEffect, useMemo, useRef, useState }','import { useEffect, useLayoutEffect, useMemo, useRef, useState }')
 s=replace(s,'  useEffect(() => {\n    const previous = document.body.style.overflow;','  // Capture the opener before descendant passive effects move focus into a step.\n  useLayoutEffect(() => {\n    const previous = document.body.style.overflow;')
 s=replace(s,'return () => { document.body.style.overflow = previous; active?.focus(); };','return () => { document.body.style.overflow = previous; if (active?.isConnected) active.focus(); };')
 s=replace(s,'  const [tab, setTab] = useState("panel");','  const [tab, setTab] = useState("panel");\n  const [clipboardVersion, setClipboardVersion] = useState(0);')
 s=replace(s,'  async function copy(value: string, label: string) {\n    setError(""); setFeedback("");','  async function copy(value: string, label: string) {\n    setClipboardVersion((version) => version + 1);\n    setError(""); setFeedback("");')
 s=replace(s,'    catch { if (mounted.current) setError("O navegador bloqueou a cópia. Selecione e copie o texto na prévia ou baixe o arquivo."); }','    catch { if (mounted.current) setError("O navegador bloqueou a cópia. Selecione e copie o texto na prévia ou baixe o arquivo."); }\n    finally { if (mounted.current) setClipboardVersion((version) => version + 1); }')
 return replace(s,'<OutlookHandoff html={message.html}','<OutlookHandoff clipboardVersion={clipboardVersion} html={message.html}')
edit('components/portfolio-communication.tsx',composer)
def outlook(s):
 s=replace(s,'{ html, text, url, disabled }: { html: string; text: string; url: string | null; disabled: boolean }','{ html, text, url, disabled, clipboardVersion }: { html: string; text: string; url: string | null; disabled: boolean; clipboardVersion: number }')
 s=replace(s,'  const snapshot = JSON.stringify([html, text, url]);','  const generation = useRef(0);\n  const snapshot = JSON.stringify([html, text, url, clipboardVersion]);')
 s=replace(s,'  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);',"""  useEffect(() => {
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
  }, []);""")
 s=replace(s,"    setBusy(true); setError(''); setCopied('');","    const attempt = ++generation.current;\n    setBusy(true); setError(''); setCopied('');")
 s=replace(s,'      if (alive.current) setCopied(snapshot);','      if (alive.current && attempt === generation.current) setCopied(snapshot);')
 return replace(s,'O cenário ou os destinatários mudaram. Copie novamente antes de abrir o Outlook.','A mensagem, os destinatários ou a área de transferência mudaram. Copie o painel novamente.')
edit('components/outlook-handoff.tsx',outlook)
def dashboard(s):
 s=replace(s,'  const variance = goalVariance(summary.actual, summary.target, summary.gap != null);','  const hasGoalConflict = displayed.some((row) => row.annualConflict);\n  const variance = goalVariance(summary.actual, summary.target, summary.gap != null && !hasGoalConflict);')
 s=replace(s,'<Kpi title={variance.label} value={money(variance.value)}',"<Kpi title={variance.label} value={displayed.length ? money(variance.value) : '—'}")
 s=replace(s,"variance.kind === 'unknown' ? 'Dados insuficientes para avaliar a meta'","variance.kind === 'unknown' ? (hasGoalConflict ? 'Metas divergentes · confira a base' : 'Dados insuficientes para avaliar a meta')")
 s=replace(s,"sub={displayed.length ? `${percent(summary.attainment)} da meta do período` : 'Nenhuma unidade na seleção'}","sub={hasGoalConflict ? 'Metas divergentes · confira a base' : displayed.length ? `${percent(summary.attainment)} da meta do período` : 'Nenhuma unidade na seleção'}")
 return replace(s,'accent progress={displayed.length ? summary.attainment : null}','accent progress={displayed.length && !hasGoalConflict ? summary.attainment : null}')
edit('components/dashboard.tsx',dashboard)
addition="""
  test('followup review: annual goal conflict cannot claim growth or attainment', async ({page}) => {
    const {errors}=await setup(page,dataset=>({...dataset,rows:dataset.rows.map(row=>row.source==='base' && row.central==='1002' && row.cooperative==='3025' && row.metric==='VN' ? {...row,annualTarget:1000} : row)}));
    await page.getByRole('combobox',{name:'Período',exact:true}).selectOption('annual');
    await page.getByLabel('Buscar cooperativa ou PA').fill('Beta');
    const region=page.getByRole('region',{name:'Resultado do período',exact:true});
    await expect(page.getByRole('region',{name:'Lista de unidades'})).toContainText('Metas divergentes');
    await expect(region.getByRole('article',{name:'Crescimento sobre a meta'})).toHaveCount(0);
    await expect(region.getByRole('article').nth(2)).toContainText('Metas divergentes');
    await expect(region.getByRole('article').nth(2).locator('.kpi-value')).toHaveText('Não disponível');
    await expect(region.getByRole('meter')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
  test('followup review: any other in-app or native copy requires copying the panel again',async({page,context})=>{
    await context.grantPermissions(['clipboard-read','clipboard-write']);
    const {errors}=await setup(page);
    await page.getByRole('button',{name:'Gerar e-mail / WhatsApp',exact:true}).click();
    const dialog=composer(page);await dialog.getByLabel('Unidade selecionada').selectOption('cooperative:1002:3017');await selectAugust(dialog);
    await expect(dialog.getByText('Ana Teste',{exact:true})).toBeVisible();await step(dialog,3);
    const copyPanel=dialog.getByRole('button',{name:'Copiar painel',exact:true});
    const openPanel=dialog.getByRole('link',{name:'Abrir Outlook e colar painel',exact:true});
    await copyPanel.click();await expect(openPanel).toBeVisible();
    await disclosure(dialog,'Outras opções de e-mail');await dialog.getByRole('button',{name:'Copiar e-mail',exact:true}).click();
    await expect(dialog.getByRole('status')).toContainText('Texto do e-mail copiado.');
    await expect(openPanel).toHaveCount(0);
    await expect(dialog.getByRole('button',{name:'Abrir Outlook e colar painel',exact:true})).toBeDisabled();
    for(const event of ['copy','cut']) {
      await copyPanel.click();await expect(openPanel).toBeVisible();
      await page.evaluate(name=>document.dispatchEvent(new Event(name)),event);
      await expect(openPanel).toHaveCount(0);
    }
    await copyPanel.click();await expect(openPanel).toBeVisible();
    expect(errors).toEqual([]);
  });
"""
p=root/'tests/browser/followup-cases.mjs';s=p.read_text();assert s.endswith('}\n');p.write_text(s[:-2]+addition+'}\n')
old=root/'supabase/migrations/20260911020435_portfolio_card_support.sql'
new=root/'supabase/migrations/20260911020542_portfolio_card_support.sql'
assert old.exists() and not new.exists();old.rename(new)
edit('docs/UX_PAINEL_COMUNICACAO.md',lambda s:s+'''

## Conclusão da revisão antes do merge

- Prévia HTML protege a medição quando o iframe ainda não tem raiz ou já foi desmontado. A altura final continua ajustada ao conteúdo, sem barra vertical interna.
- O modal captura o botão de origem antes de mover o foco para a primeira etapa; fechar restaura esse foco.
- Seleção vazia mostra travessão no cartão de GAP, como nos demais cartões. Divergência entre meta anual e distribuição mensal impede alegações de crescimento/atingimento.
- Outras cópias do aplicativo invalidam o estado de painel copiado, antes e depois da operação assíncrona. Cópia/recorte nativos ou saída da janela também invalidam a indicação, sem ler a área de transferência.
- O arquivo da migração foi alinhado ao registro já aplicado no Supabase: `20260911020542_portfolio_card_support.sql`. Apenas renomeado; nenhum SQL reaplicado. Verificação remota confirmou restrição validada, compatibilidade antiga/nova, rejeição de destaque inválido, seis políticas de sessão preservadas e nenhuma leitura anônima de rascunhos.
- Testes anteriores preservados, com regressões adicionais de metas divergentes e sobrescrita da área de transferência.
''')
print('Reviewed changes applied; existing browser assertions preserved.')
