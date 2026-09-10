from pathlib import Path
import sys
p=Path('components/scenario-panels.tsx')
s=p.read_text()
if 'import ComparisonDashboard' not in s:
 s=s.replace('useEffect, useMemo, useState','useEffect, useId, useMemo, useState')
 s=s.replace("import styles from './scenario-panels.module.css';", "import styles from './scenario-panels.module.css';\nimport ComparisonDashboard from './comparison-dashboard';\nimport { ChevronDown } from 'lucide-react';")
 s=s.replace('onSelect }: { dataset: Dataset; filters: ScenarioFilters; onSelect?: (row: any) => void })', 'onSelect, expanded = false, onToggle }: { dataset: Dataset; filters: ScenarioFilters; onSelect?: (row: any) => void; expanded?: boolean; onToggle: () => void })')
 s=s.replace('  const rows = sortAnalysis(model.pas, filters.sortBy);','  const rows = sortAnalysis(model.pas, filters.sortBy);\n  const contentId = useId();')
 s=s.replace('<p>{rows.length} PAs cadastrados em {dataset.year} · Cadência PA / Venda Nova · período selecionado. Esta fonte não é somada ao resultado da cooperativa.</p></div></div>', '<p>{rows.length} PAs · {model.paAchieved} com meta atingida · Venda Nova</p></div><button type="button" className="button secondary" onClick={onToggle} aria-expanded={expanded} aria-controls={contentId}>{expanded ? "Fechar PAs" : "Abrir PAs"}<ChevronDown size={16} className={expanded ? styles.rotated : undefined} /></button></div>\n    <div id={contentId} hidden={!expanded}>\n    <p className="helper">Cadência PA no período selecionado, sem somar à produção da cooperativa. Clique no PA para abrir o histórico mensal.</p>')
 s=s.replace('  </section>;\n}\nexport function NetworkSummary', '    </div>\n  </section>;\n}\nexport function NetworkSummary',1)
 start=s.index('  return <section',s.index('export function NetworkSummary'));end=s.index('\n}\nexport function YearComparison',start)
 s=s[:start]+'''  return <section className={`panel ${styles.network}`} aria-label="Resumo da rede filtrada">
    <h2>Rede da seleção</h2><div className={styles.networkCounts}>
      <div><strong>{model.cooperativeCount}</strong><span>Cooperativas<small>{model.cooperativeAchieved} na meta · {model.cooperativeUnknown} sem avaliação</small></span></div>
      <div><strong>{model.paCount}</strong><span>PAs<small>{model.paAchieved} na meta · {model.paUnknown} sem avaliação</small></span></div>
      {filters.coop === 'all' && <div><strong>{model.centralAchieved}<small>/{model.centralCount}</small></strong><span>Centrais na meta<small>{filters.metric === 'AR' ? 'Arrecadação' : 'Venda Nova'}</small></span></div>}
    </div><p className="helper">Meta atingida = realizado ≥ 100% no período. PAs: cadência de Venda Nova.</p>
  </section>;'''+s[end:]
 s=s.replace('  const [open, setOpen] = useState(false);','  const [open, setOpen] = useState(false);\n  const contentId = useId();')
 s=s.replace("const key = `${owner ?? 'session'}:${selectedYear}`;", "const key = `${owner ?? 'session'}:${dataset.year}:${selectedYear}:${dataset.importedAt}:${dataset.registry?.updatedAt ?? ''}`;")
 s=s.replace('    let cancelled = false;\n    if (!owner)','    let cancelled = false;\n    setLoaded(null);\n    if (!owner)')
 s=s.replace("dataset: value?.dataset ?? null, error: ''", "dataset: value?.dataset?.year === selectedYear ? value.dataset : null, error: ''")
 s=s.replace('<p>Centrais, cooperativas e PAs são vinculados pelos códigos e pela hierarquia de cada ano, nunca apenas pelo nome.</p>','<p>Compare produção, metas e evolução nos mesmos meses fechados.</p>')
 s=s.replace('onClick={() => setOpen(value => !value)} aria-expanded={open}', 'onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls={contentId}')
 s=s.replace("{open ? 'Fechar comparativo' : 'Comparar anos'}</button>","{open ? 'Fechar comparativo' : 'Comparar anos'}<ChevronDown size={16} className={open ? styles.rotated : undefined} /></button>")
 s=s.replace('    {open && <><div className={styles.controls}>','    <div id={contentId} hidden={!open}>{open && <><div className={styles.controls}>')
 s=s.replace('Uma unidade ausente é identificada como “somente no cadastro”, sem presumir produção zero ou encerramento.','')
 s=s.replace('      <p>{comparison.common} unidades em ambos · {comparison.currentOnly} somente em {dataset.year} · {comparison.previousOnly} somente em {selectedYear}</p>','')
 s=s.replace('      {comparison.available && <div className="table-scroll"><table>', '''      {comparison.available && <>
      <ComparisonDashboard comparison={comparison} currentYear={dataset.year} previousYear={selectedYear} />
      <details className={styles.unitDetails}><summary>Detalhar por unidade · {comparison.rows.length} unidades</summary><div className="table-scroll"><table className="comparison-unit-table">''')
 s=s.replace('</p>}</div>}','</p>}</div></details></>}',1)
 s=s.replace('      <p className="helper">Variação percentual requer produção anterior positiva; ausência de dado não é zero. Em “Maior produção”, a ordem considera {dataset.year}. As bases e metas de cada ano permanecem independentes.</p>','')
 s=s.replace('    </>}</>}\n  </section>;','    </>}</>}</div>\n  </section>;')
 p.write_text(s)
p=Path('tests/browser/scenario-cases.mjs');s=p.read_text()
if "comparison-unit-table" not in s:
 s=s.replace("comparison.locator('tbody tr')","comparison.locator('.comparison-unit-table tbody tr')").replace("comparison.locator('tbody')","comparison.locator('.comparison-unit-table tbody')")
 s=s.replace("    await expect(comparison.locator('.comparison-unit-table tbody tr')).toHaveCount(2);", "    await expect(comparison.getByLabel('Dashboard comparativo',{exact:true})).toBeVisible();\n    await expect(comparison.locator('.comparison-unit-table')).toBeHidden();\n    await comparison.locator('summary').filter({hasText:'Detalhar por unidade'}).click();\n    await expect(comparison.locator('.comparison-unit-table tbody tr')).toHaveCount(2);")
 p.write_text(s)
p=Path('tests/browser/portfolio.spec.mjs');s=p.read_text()
if 'registerUxTests' not in s: p.write_text("import { registerUxTests } from './ux-cases.mjs';\n"+s+"\nregisterUxTests({test,expect,setup,owner,created});\n")
