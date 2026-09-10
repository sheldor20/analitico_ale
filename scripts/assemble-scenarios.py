from pathlib import Path
import re

def patch(text, old, new, count=1):
    actual = text.count(old)
    if actual != count: raise RuntimeError(f'Expected {count} anchor(s), found {actual}: {old[:100]!r}')
    return text.replace(old, new)

p=Path('components/dashboard.tsx'); s=p.read_text()
if 'scenario-panels' not in s:
    s=patch(s, 'import { supabase } from "@/lib/supabase";', 'import { supabase } from "@/lib/supabase";\nimport { sortAnalysis, SORT_OPTIONS } from "@/lib/scenarios.mjs";\nimport { NetworkSummary, PaTable, YearComparison } from "@/components/scenario-panels";')
    s=patch(s, '  const [sortBy, setSortBy] = useState("gap");', '  const [sortBy, setSortBy] = useState("gap");\n  const [requestedYear, setRequestedYear] = useState(new Date().getFullYear() - 1);')
    s=patch(s, '  const displayed = analyses.filter((r) =>', '  const displayed = sortAnalysis(analyses.filter((r) =>')
    s=patch(s, '  ).sort((a,b) => sortBy === "name" ? a.name.localeCompare(b.name) : sortBy === "attainment" ?\n    (a.attainment ?? -1) - (b.attainment ?? -1) : (b.projectionGap ?? b.gap ?? -1) - (a.projectionGap ?? a.gap ?? -1));', '  ), sortBy);\n  const scenarioFilters = { central, coop, source: effectiveSource, metric: effectiveMetric, group, level: actualLevel, period, month, uplift, sortBy, search, status: statusFilter };')
    old='''                            <select aria-label="Ordenar análise" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                              <option value="gap">Maior gap</option><option value="attainment">Menor atingimento</option><option value="name">Nome / código</option>
                            </select>
'''
    s=patch(s,old,'')
    s=patch(s,'              </section>\n              <div className="position-line">','''                <label>Organizar lista<select aria-label="Ordenar análise" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>{Object.entries(SORT_OPTIONS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              </section>
              {dataset && <NetworkSummary dataset={dataset} filters={scenarioFilters} />}
              <div className="position-line">''')
    s=patch(s,'              {effectiveSource === "cadence" && (\n                <section','''              {dataset && view === "overview" && effectiveSource === "base" && actualLevel === "cooperative" && coop !== "all" && <PaTable dataset={dataset} filters={scenarioFilters} onSelect={setSelected} />}
              {dataset && <YearComparison key={user?.id ?? "session"} dataset={dataset} filters={scenarioFilters} owner={user?.id ?? null} years={[...workspaces.map(item => item.year), ...sessionYears.current.keys()]} sessionDatasets={sessionYears.current} />}
              {effectiveSource === "cadence" && (
                <section''')
    s=patch(s,'                                      <button type="button" className="icon-button" aria-label={`Gerar comunicação de ${r.name}`}', '''                                      {actualLevel === "cooperative" && effectiveSource === "base" && r.cooperative && <button type="button" className="button quiet" aria-label={`Ver PAs de ${r.name}`} onClick={() => { setCoop(`${r.central}:${r.cooperative}`); setLevel("cooperative"); }}>Ver PAs</button>}
                                      <button type="button" className="icon-button" aria-label={`Gerar comunicação de ${r.name}`}''')
    s=patch(s,'            <button className="button secondary" disabled={!!busy} onClick={() => openWorkspace(dataset.year + 1)}>Novo ano</button>', '''            <button className="button secondary" disabled={!!busy} onClick={() => openWorkspace(dataset.year + 1)}>Novo ano</button>
            <label>Abrir outro ano<input aria-label="Ano para abrir" type="number" min="2020" max="2100" value={requestedYear} onChange={event => setRequestedYear(Number(event.target.value))} /></label><button className="button secondary" disabled={!!busy} onClick={() => openWorkspace(requestedYear)}>Abrir ano</button>''')
    s=patch(s,'      let current = !historical && dataset?.year === config.year ? dataset : null;', '      if (dataset && !historical) sessionYears.current.set(dataset.year, dataset);\n      let current = !historical && dataset?.year === config.year ? dataset : sessionYears.current.get(config.year) ?? null;')
    s=patch(s,'      setDataset(data);\n      setConfig(data.config);','      sessionYears.current.set(data.year, data);\n      setDataset(data);\n      setConfig(data.config);')
    s=patch(s,'      setDataset(next); setConfig(next.config); setDatasetId(null); setSelected(null);','      sessionYears.current.set(next.year, next);\n      setDataset(next); setConfig(next.config); setDatasetId(null); setSelected(null);')
    s=patch(s,'<select value={importMode} onChange={(e) => setImportMode(e.target.value)}>', '''<select value={importMode} onChange={(e) => { setImportMode(e.target.value); if (e.target.value === "history") { const year = (dataset?.year ?? new Date().getFullYear()) - 1; setConfig({ ...config, year, vnCutoff: `${year}-12-31`, arCutoff: `${year}-12-31`, cadenceCutoff: `${year}-12-31`, paTargetMode: "source" }); } }}>''')
    s=patch(s,'          <option value="fixed">Cadastrar base fixa · unidades e metas</option>', '          <option value="fixed">Cadastrar base fixa · unidades e metas</option>\n          <option value="history">Base e produção de outro ano · comparativo histórico</option>')
    s=patch(s,'              setConfig({ ...config, year: Number(e.target.value) })', '              setConfig({ ...config, year: Number(e.target.value), vnCutoff: "", arCutoff: "", cadenceCutoff: "", paTargetMode: Number(e.target.value) < 2026 ? "source" : config.paTargetMode })')
    s=patch(s,'      <div className="source-upload-grid">', '''      {importMode === "history" && <p className="helper">As metas, a produção e as unidades serão guardadas somente no ano informado. Confirme os cortes; não use 31/12 se a base ainda for parcial. Novas cooperativas e PAs não serão incluídos retroativamente em outros anos.</p>}
      <label className="import-mode">Metas PA deste ano<select value={config.paTargetMode ?? (config.year < 2026 ? "source" : "group")} onChange={event => setConfig({ ...config, paTargetMode: event.target.value as "source" | "group" })}><option value="source">Metas da planilha · preservar histórico</option><option value="group">Regra fixa P1–P5 (2026)</option></select></label>
      <div className="source-upload-grid">''')
    s=patch(s,'{importMode === "fixed" ? "Cadastrar base fixa" : "Atualizar produção"}', '{importMode === "fixed" ? "Cadastrar base fixa" : importMode === "history" ? "Importar ano histórico" : "Atualizar produção"}')
    s=patch(s,'      for (const [expectedSource, file] of selectedFiles) {', '      for (const [expectedSource, file] of selectedFiles) {\n        if (file.size > 10 * 1024 * 1024) throw new Error("Cada arquivo pode ter até 10 MB.");')
    p.write_text(s)

p=Path('components/portfolio-communication.tsx');s=p.read_text()
if 'useMessageCustomization' not in s:
    s=patch(s,'import WhatsappDashboard from "./whatsapp-dashboard";', 'import WhatsappDashboard from "./whatsapp-dashboard";\nimport { useMessageCustomization } from "./message-customization";')
    s=patch(s,'  const message = report ? renderPortfolioCommunication', '  const baseMessage = report ? renderPortfolioCommunication')
    s=patch(s,'  const whatsappMessage = report ? renderPortfolioCommunication', '  const baseWhatsapp = report ? renderPortfolioCommunication')
    s=patch(s,'  const outlook = attempt(', '''  const { message, whatsappMessage, editor: messageEditor } = useMessageCustomization({ owner, kind: entity.kind, metric: entity.kind === "pa" ? "VN" : includeBoth ? "BOTH" : metric, contextKey: `${dataset.year}:${entity.id}:${metric}:${includeBoth}:${period}:${month}:${uplift}`, unit: entity.name, year: dataset.year, period: PERIOD_LABELS[period] || period, baseMessage, baseWhatsapp });
  const outlook = attempt(''')
    s=patch(s,'        <h3>Personalizar a mensagem</h3>', '        <h3>Personalizar a mensagem</h3>')
    s=patch(s,'      <section className={styles.card}>\n        <h3>WhatsApp</h3>', '      {messageEditor}\n      <section className={styles.card}>\n        <h3>WhatsApp</h3>')
    p.write_text(s)

p=Path('lib/types.ts');s=p.read_text()
if 'paTargetMode?' not in s:
    s=patch(s,'  allowedCentrals?: string[];', '  allowedCentrals?: string[];\n  paTargetMode?: "source" | "group";')
    p.write_text(s)

p=Path('lib/importer.mjs');s=p.read_text()
if 'historicalPa' not in s:
    s=patch(s,'    const targetColumns = cadence\n      ? []\n      : MONTHS.map((m) => optionalColumn(headers, [`META${m}`]));', '    const targetColumns = MONTHS.map((m) => optionalColumn(headers, [`META${m}`]));')
    s=patch(s,'      const importedAnnualTarget = cadence ? fixedPaTarget.annual : number(val(annual));', '''      const historicalPa = cadence && (config.paTargetMode === "source" || (config.year < 2026 && config.paTargetMode !== "group"));
      const historicalTargets = targetColumns.some(Boolean) ? targetColumns.map(col => col ? number(val(col)) : null) : sourceMonthlyTarget != null ? Array(12).fill(sourceMonthlyTarget) : distributeAmount(sourceAnnualTarget);
      const importedAnnualTarget = cadence ? historicalPa ? sourceAnnualTarget ?? (historicalTargets.every(value => value != null) ? sum(historicalTargets) : null) : fixedPaTarget.annual : number(val(annual));''')
    s=patch(s,'        ? Array(12).fill(fixedPaTarget.monthly)', '        ? historicalPa ? historicalTargets : Array(12).fill(fixedPaTarget.monthly)')
    s=patch(s,'        cadence &&\n        sourceMonthlyTarget', '        cadence && !historicalPa &&\n        sourceMonthlyTarget')
    s=patch(s,'        cadence &&\n        sourceAnnualTarget', '        cadence && !historicalPa &&\n        sourceAnnualTarget')
    s=patch(s,'        targetRule: cadence ? "group-fixed" : "source",', '        targetRule: cadence ? historicalPa ? "registry" : "group-fixed" : "source",')
    s=patch(s,'      if (cadence && !val(paName))', '      if (historicalPa) issue("Metas históricas da planilha preservadas. Metas ausentes permanecem sem informação; a regra P1–P5 de 2026 não foi aplicada.");\n      if (cadence && !val(paName))')
    s=patch(s,'      kind === "cadence"\n        ? "Cadência PA:', '      kind === "cadence"\n        ? (config.paTargetMode === "source" || (config.year < 2026 && config.paTargetMode !== "group")) ? "Cadência PA: metas históricas da fonte, sem substituir pela política de 2026." : "Cadência PA:')
    p.write_text(s)

# Visible commercial terminology only; identifiers named gap are deliberately left intact.
for folder in ['components','lib','tests']:
    for p in Path(folder).rglob('*'):
        if p.suffix not in ['.tsx','.ts','.mjs']: continue
        s=p.read_text(); n=re.sub(r'\b[Ss]aldos\b','GAPs',s);n=re.sub(r'\b[Ss]aldo\b','GAP',n);n=re.sub(r'\bGap\b','GAP',n)
        for old,new in [('gap projetado','GAP projetado'),('maior gap','maior GAP'),('Maior gap','Maior GAP')]:n=n.replace(old,new)
        if n!=s:p.write_text(n)
p=Path('lib/message-template.mjs');s=p.read_text();s=s.replace('return html.replace(body[0], body[1] + content + body[3]);','return html.replace(body[0], () => body[1] + content + body[3]);');p.write_text(s)
print('Scenario integration completed; existing calculations and authentication preserved.')
