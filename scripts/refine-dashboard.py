from pathlib import Path
import sys
p=Path('components/dashboard.tsx')
s=p.read_text()
if 'const VIEW_TITLES:' in s: sys.exit(0)
def rep(old,new,n=1):
 global s
 assert old in s,old[:120]
 s=s.replace(old,new,n)
rep('import type { ActionState, DataRow, Dataset, ImportConfig } from "@/lib/types";', 'import type { ActionState, DataRow, Dataset, ImportConfig } from "@/lib/types";\nimport "./dashboard-ux.css";')
rep('type Analysis = ReturnType<typeof analyze>;', '''const VIEW_TITLES: Record<View, string> = {
  overview: "Visão geral", cadence: "Cadência dos PAs", actions: "Plano de ação",
  audit: "Conferência da base", imports: "Importações", registry: "Cadastro e metas",
};
type Analysis = ReturnType<typeof analyze>;''')
rep('  const [statusFilter, setStatusFilter] = useState("all");', '  const [statusFilter, setStatusFilter] = useState("all");\n  const [expandedPaKey, setExpandedPaKey] = useState("");\n  const [showMoreIndicators, setShowMoreIndicators] = useState(false);')
rep('  const effectiveMetric = effectiveSource === "cadence" ? "VN" : metric;', '  const effectiveMetric = effectiveSource === "cadence" ? "VN" : metric;\n  const paPanelKey = `${dataset?.year}:${coop}`;')
rep('setHistorical(false); sessionYears.current.clear();', 'setHistorical(false); sessionYears.current.clear(); setExpandedPaKey("");')
rep('    setView(next);\n    setSearch("");', '    setView(next);\n    setExpandedPaKey("");\n    setSearch("");')
rep('        <main>', '        <main className="workspace-content">')
start=s.index('              <h1>');end=s.index('              <p>',start)
s=s[:start]+'              <h1>{VIEW_TITLES[view]}</h1>\n'+s[end:]
rep('{dataset && view !== "imports" && view !== "registry" && (', '{dataset && ["overview", "cadence", "actions"].includes(view) && (')
start=s.index('            <button className="button secondary" disabled={!!busy} onClick={() => openWorkspace(dataset.year + 1)}>');end=s.index('            {user && <button',start)
segment=s[start:end];s=s[:start]+'            <details className="year-management"><summary>Gerenciar anos</summary><div>'+segment+'</div></details>\n'+s[end:]
rep('              {dataset && <NetworkSummary dataset={dataset} filters={scenarioFilters} />}\n','')
rep('              {dataset && view === "overview" && effectiveSource === "base" && actualLevel === "cooperative" && coop !== "all" && <PaTable dataset={dataset} filters={scenarioFilters} onSelect={setSelected} />}\n','')
year='              {dataset && <YearComparison key={user?.id ?? "session"} dataset={dataset} filters={scenarioFilters} owner={user?.id ?? null} years={[...workspaces.map(item => item.year), ...sessionYears.current.keys()]} sessionDatasets={sessionYears.current} />}\n'
rep(year,'')
start=s.index('              {effectiveSource === "cadence" && (\n                <section');end=s.index('              {view === "audit" ?',start);s=s[:start]+s[end:]
start=s.index('                      <section className="chart-grid">');end=s.index('                      <section className="panel table-panel">',start);chart=s[start:end];s=s[:start]+s[end:]
start=s.index('                  <section className="decision-insights"');end=s.index('                  {view === "actions" ?',start);insights=s[start:end];s=s[:start]+s[end:]
rep('<section className="kpi-grid">', '<section className="kpi-grid" aria-label="Resultado do período">')
rep('                  <div className="all-goals-note">', '                  {summary.gap != null && leafSummary.individualGap != null && leafSummary.individualGap > summary.gap + 0.01 && <div className="all-goals-note">')
rep('                  </div>\n                  {view === "actions" ?', '                  </div>}\n                  {view !== "actions" && dataset && <NetworkSummary dataset={dataset} filters={scenarioFilters} />}\n                  {view === "actions" ?')
rep('                    <section className="panel">\n                      <div className="panel-heading">\n                        <div>\n                          <h2>Prioridades', '                    <section className="panel action-panel" aria-label="Lista de ações">\n                      <div className="panel-heading">\n                        <div>\n                          <h2>Prioridades')
rep('                                  <p>{a.text}</p>', '                                  <p>GAP: {money(r.gap)}{r.requiredDaily != null ? ` · Necessário: ${money(r.requiredDaily)}/dia útil` : ""}</p>')
rep('                <label>Organizar lista<select aria-label="Ordenar análise" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>{Object.entries(SORT_OPTIONS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>\n','')
start=s.index('                            <select aria-label="Filtrar situação"');end=s.index('                          </div>\n                        </div>\n                        <div className="table-scroll">',start);controls=s[start:end]
rep(controls, '''                            {listControls}
                            <label className="indicator-toggle"><input type="checkbox" checked={showMoreIndicators} onChange={e => setShowMoreIndicators(e.target.checked)} />Mais indicadores</label>
''')
controls=controls.replace('{effectiveSource === "base" && (', '{effectiveSource === "base" && view !== "actions" && (')
controls+='''                            <select aria-label="Ordenar análise" value={sortBy} onChange={event => setSortBy(event.target.value)}>{Object.entries(SORT_OPTIONS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
'''
rep('  const importPanel = (', '  const listControls = <>\n'+controls+'  </>;\n  const importPanel = (')
rep('                      <div className="action-list">', '                      <div className="table-controls action-controls">{listControls}</div>\n                      {!displayed.length && <p className="empty">Nenhuma ação corresponde aos filtros.</p>}\n                      <div className="action-list">')
rep('<section className="panel table-panel">', '<section className="panel table-panel" aria-label="Lista de unidades">')
rep('                                <th className="numeric">Projeção</th>\n                                <th className="numeric">Necessário/dia</th>', '                                <th className="numeric">GAP</th>\n                                {showMoreIndicators && <><th className="numeric">Projeção</th><th className="numeric">Necessário/dia</th></>}')
start=s.index('                                    <td className="numeric">\n                                      {money(r.projected)}');end=s.index('                                    <td>\n                                      <Pill>',start);cells=s[start:end]
s=s[:start]+'                                    <td className="numeric">{money(r.gap)}</td>\n                                    {showMoreIndicators && <>\n'+cells+'                                    </>}\n'+s[end:]
rep('setCoop(`${r.central}:${r.cooperative}`); setLevel("cooperative");', 'setCoop(`${r.central}:${r.cooperative}`); setLevel("cooperative"); setExpandedPaKey(`${dataset?.year}:${r.central}:${r.cooperative}`);')
anchor='''                        <div className="pagination">{displayed.length} unidades exibidas · exportação inclui a seleção completa</div>
                      </section>'''
rep(anchor,anchor+'''
                      {dataset && view === "overview" && effectiveSource === "base" && actualLevel === "cooperative" && coop !== "all" && <PaTable dataset={dataset} filters={scenarioFilters} onSelect={setSelected} expanded={expandedPaKey === paPanelKey} onToggle={() => setExpandedPaKey(expandedPaKey === paPanelKey ? "" : paPanelKey)} />}
'''+year+'''                      <details className="progressive-panel" key={`evolution:${view}`}><summary>Evolução e simulação{uplift > 0 ? ` · cenário +${uplift}% ativo` : ""}</summary>
'''+chart+'''                      </details>''')
rep('''                  )}
                </>
              )}
              <footer''', '''                  )}
                  <details className="progressive-panel"><summary>Insights para atuação</summary>
'''+insights+'''                  </details>
                </>
              )}
              <footer''')
rep('              {view === "audit" ? (', '              {uplift > 0 && view !== "audit" && <div className="simulation-banner"><span>Simulação de ritmo +{uplift}% ativa · somente projeções</span><button className="button quiet" onClick={() => setUplift(0)}>Limpar simulação</button></div>}\n              {view === "audit" ? (')
start=s.index('                  <section className="audit-top">');end=s.index('                  <section className="panel">',start);auditReference=s[start:end];s=s[:start]+s[end:]
rep('''                    </div>
                  </section>
                </>
              ) : !filtered.length''', '''                    </div>
                  </section>
                  <details className="progressive-panel"><summary>Fontes e regras de cálculo</summary>
'''+auditReference+'''                  </details>
                </>
              ) : !filtered.length''')
rep('''                        <strong>Cadência PA:</strong> P1 R$ 450, P2 R$ 600, P3
                        R$ 750, P4 R$ 850 e P5 R$ 1.000 por mês. O anual
                        corresponde a 12 meses.''','''                        <strong>Cadência PA:</strong> metas do cadastro anual. Metas históricas da planilha e ajustes manuais têm prioridade sobre a referência P1–P5 de 2026.''')
p.write_text(s)
