from pathlib import Path

def replace(path, old, new):
    p = Path(path); text = p.read_text()
    if new in text: return
    if old not in text: raise RuntimeError('Missing anchor in '+path+': '+old[:100])
    p.write_text(text.replace(old, new))

# A cached year must reload its own revision, never reuse the currently displayed year.
replace('components/dashboard.tsx', '      let revision = current ? workspaceRevision : null;', '      let revision = !historical && dataset?.year === config.year ? workspaceRevision : null;')
replace('components/dashboard.tsx', 'Ordem pelo maior GAP projetado em reais. Abra uma', 'Ordem conforme o critério selecionado. Abra uma')
replace('components/dashboard.tsx', '''                  Grupo {selected.group} · Meta fixa mensal:{" "}
                  {money(paTargetForGroup(selected.group)?.monthly)} · Meta fixa
                  anual: {money(paTargetForGroup(selected.group)?.annual)} ·{" "}''', '''                  Grupo {selected.group} · Meta cadastrada em {MONTHS[month]}:{" "}
                  {money(selected.targets[month])} · Meta anual cadastrada:{" "}
                  {money(selected.annualTarget)} ·{" "}''')
# Imported historical goals are explicit, protected plans; changing P group is not permission to replace them.
replace('lib/importer.mjs', 'targetRule: cadence ? historicalPa ? "registry" : "group-fixed" : "source",', 'targetRule: cadence ? historicalPa ? "manual" : "group-fixed" : "source",')
replace('components/message-customization.tsx', '  const editError = [values.email, values.whatsapp].some(value => !value.trim())', '  const editError = [values.email, values.whatsapp].some(value => value.length > 12000) ? "O texto de cada canal deve ter até 12 mil caracteres. Use {{cenario}} para inserir automaticamente um cenário extenso." : [values.email, values.whatsapp].some(value => !value.trim())')
replace('components/scenario-panels.tsx', '      <p className="helper">Variação percentual requer produção anterior positiva;', '      {filters.source === "base" && filters.level === "central" && <p className="helper">A composição de cooperativas de uma central pode mudar entre anos. Para isolar unidades comuns, compare no nível Cooperativas e marque a opção de presença nos dois anos.</p>}\n      <p className="helper">Variação percentual requer produção anterior positiva;')
p=Path('components/scenario-panels.tsx');p.write_text(p.read_text().replace('<th>', '<th scope="col">'))
# Role locators match the actual accessible select names and avoid label text including option children.
p=Path('tests/browser/scenario-cases.mjs');s=p.read_text()
for name in ['Central', 'Período', 'Mês de referência']:
    s=s.replace("page.getByLabel('"+name+"',{exact:true})", "page.getByRole('combobox',{name:'"+name+"',exact:true})")
s=s.replace("comparison.getByLabel('Comparar 2026 com')", "comparison.getByRole('combobox',{name:'Comparar 2026 com',exact:true})")
s=s.replace("toContainText('100,0%')", "toContainText('100%')")
p.write_text(s)
# Align the CLI-created local migration version with the successful remote apply_migration.
p=Path('supabase/migrations/20260910184749_scenario_message_defaults.sql')
if p.exists(): p.rename('supabase/migrations/20260910185201_scenario_message_defaults.sql')
p=Path('tests/historical-import.test.mjs');s=p.read_text()
if 'historic group changes preserve explicit' not in s:
    s=s.replace('initializeRegistry, mergeProduction', 'initializeRegistry, mergeProduction, upsertEntity')
    s+='''
test('historic group changes preserve explicit imported goals rather than applying a newer policy',async()=>{
 const part=await parseWorkbook(await workbook(),'historico.xlsx',config);
 const dataset=mergeProduction(null,combineImports([part],config));
 const entity=dataset.registry.entities.find(value=>value.kind==='pa');
 const changed=upsertEntity(dataset,{...entity,group:'P5'},entity.id);
 assert.equal(changed.rows[0].targets[0],200);assert.equal(changed.rows[0].annualTarget,2400);
 assert.equal(changed.rows[0].group,'P5');assert.equal(dataset.rows[0].group,'P1');
});
'''
    p.write_text(s)
print('Historical revision isolation, protected goals, accessible controls and deployed migration version refined.')
