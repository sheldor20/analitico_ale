"use client";
import { useEffect, useId, useMemo, useState } from 'react';
import { MONTHS, money, percent } from '@/lib/analytics.mjs';
import { compareYears, networkSummary, sortAnalysis } from '@/lib/scenarios.mjs';
import { loadWorkspace } from '@/lib/workspace-store';
import type { Dataset } from '@/lib/types';
import styles from './scenario-panels.module.css';
import ComparisonDashboard from './comparison-dashboard';
import { ChevronDown } from 'lucide-react';
export type ScenarioFilters = { central: string; coop: string; source: string; metric: string; group: string; level: string; period: string; month: number; uplift: number; sortBy: string; search: string; status: string };
export function PaTable({ dataset, filters, onSelect, expanded = false, onToggle }: { dataset: Dataset; filters: ScenarioFilters; onSelect?: (row: any) => void; expanded?: boolean; onToggle: () => void }) {
  const model = useMemo(() => networkSummary(dataset, { ...filters, source: 'base', search: '', status: 'all' }), [dataset, filters]);
  const rows = sortAnalysis(model.pas, filters.sortBy);
  const contentId = useId();
  return <section id="cooperative-pas" className={`panel ${styles.section}`} aria-label="PAs da cooperativa">
    <div className="panel-heading"><div><h2>PAs desta cooperativa</h2><p>{rows.length} PAs · {model.paAchieved} com meta atingida · Venda Nova</p></div><button type="button" className="button secondary" onClick={onToggle} aria-expanded={expanded} aria-controls={contentId}>{expanded ? "Fechar PAs" : "Abrir PAs"}<ChevronDown size={16} className={expanded ? styles.rotated : undefined} /></button></div>
    <div id={contentId} hidden={!expanded}>
    <p className="helper">Cadência PA no período selecionado, sem somar à produção da cooperativa. Clique no PA para abrir o histórico mensal.</p>
    <div className="table-scroll"><table><thead><tr><th scope="col">PA / grupo</th><th scope="col">Meta</th><th scope="col">Realizado</th><th scope="col">Atingimento</th><th scope="col">GAP</th><th scope="col">Projeção</th><th scope="col">GAP projetado</th><th scope="col">Necessário/dia útil</th><th scope="col">Necessário/mês</th><th scope="col">Corte</th><th scope="col">Situação</th></tr></thead><tbody>{rows.map((row: any) => <tr key={row.key}><td><button className="entity-button" disabled={!onSelect} onClick={() => onSelect?.(row)}><strong>PA {row.pa} · {row.name}</strong><small>{row.group} · Coop. {row.cooperative}</small></button></td><td className="numeric">{money(row.target)}</td><td className="numeric">{money(row.actual)}</td><td className="numeric">{percent(row.attainment)}</td><td className="numeric">{money(row.gap)}</td><td className="numeric">{money(row.projected)}</td><td className="numeric">{money(row.projectionGap)}</td><td className="numeric">{money(row.requiredDaily)}</td><td className="numeric">{money(row.requiredMonthly)}</td><td>{row.cutoff.split('-').reverse().join('/')}</td><td>{row.status}</td></tr>)}</tbody></table></div>
    {!rows.length && <p className="empty">Nenhum PA cadastrado para esta cooperativa neste ano. Importe a cadência PA ou inclua no cadastro fixo.</p>}
    </div>
  </section>;
}
export function NetworkSummary({ dataset, filters }: { dataset: Dataset; filters: ScenarioFilters }) {
  const model = useMemo(() => networkSummary(dataset, filters), [dataset, filters]);
  return <section className={`panel ${styles.network}`} aria-label="Resumo da rede filtrada">
    <h2>Rede da seleção</h2><div className={styles.networkCounts}>
      <div><strong>{model.cooperativeCount}</strong><span>Cooperativas<small>{model.cooperativeAchieved} na meta · {model.cooperativeUnknown} sem avaliação</small></span></div>
      <div><strong>{model.paCount}</strong><span>PAs<small>{model.paAchieved} na meta · {model.paUnknown} sem avaliação</small></span></div>
      {filters.coop === 'all' && <div><strong>{model.centralAchieved}<small>/{model.centralCount}</small></strong><span>Centrais na meta<small>{filters.metric === 'AR' ? 'Arrecadação' : 'Venda Nova'}</small></span></div>}
    </div><p className="helper">Meta atingida = realizado ≥ 100% no período. PAs: cadência de Venda Nova.</p>
  </section>;
}
export function YearComparison({ dataset, filters, owner, years, sessionDatasets }: { dataset: Dataset; filters: ScenarioFilters; owner: string | null; years: number[]; sessionDatasets: Map<number, Dataset> }) {
  const choices = [...new Set(years)].filter(year => year !== dataset.year).sort((a, b) => b - a);
  const [year, setYear] = useState<number | null>(null);
  const [commonOnly, setCommonOnly] = useState(false);
  const selectedYear = year !== null && choices.includes(year) ? year : choices.find(value => value < dataset.year) ?? choices[0];
  const [loaded, setLoaded] = useState<{ key: string; dataset: Dataset | null; error: string } | null>(null);
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const key = `${owner ?? 'session'}:${dataset.year}:${selectedYear}:${dataset.importedAt}:${dataset.registry?.updatedAt ?? ''}`;
  useEffect(() => {
    if (!open || !selectedYear) return;
    let cancelled = false;
    setLoaded(null);
    if (!owner) { setLoaded({ key, dataset: sessionDatasets.get(selectedYear) ?? null, error: '' }); return; }
    loadWorkspace(owner, selectedYear).then(value => { if (!cancelled) setLoaded({ key, dataset: value?.dataset?.year === selectedYear ? value.dataset : null, error: '' }); }).catch(() => { if (!cancelled) setLoaded({ key, dataset: null, error: 'Não foi possível carregar o ano comparado. Tente novamente ou recarregue o cadastro salvo.' }); });
    return () => { cancelled = true; };
  }, [open, owner, selectedYear, key, sessionDatasets, dataset]);
  const prior = loaded?.key === key ? loaded.dataset : null;
  const comparison = useMemo(() => prior ? compareYears(dataset, prior, filters, commonOnly) : null, [dataset, prior, filters, commonOnly]);
  return <section className={`panel ${styles.section}`} aria-label="Comparativo entre anos"><div className="panel-heading"><div><h2>Comparativo entre anos</h2><p>Compare produção, metas e evolução nos mesmos meses fechados.</p></div><button className="button secondary" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls={contentId}>{open ? 'Fechar comparativo' : 'Comparar anos'}<ChevronDown size={16} className={open ? styles.rotated : undefined} /></button></div>
    <div id={contentId} hidden={!open}>{open && <><div className={styles.controls}><label>Comparar {dataset.year} com<select value={selectedYear ?? ''} onChange={event => setYear(Number(event.target.value))} disabled={!choices.length}>{!choices.length && <option value="">Nenhum outro ano cadastrado</option>}{choices.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label className={styles.check}><input type="checkbox" checked={commonOnly} onChange={event => setCommonOnly(event.target.checked)} />Somente unidades presentes nos dois anos</label></div>
    {!choices.length ? <p>Use Importar base → Base e produção de outro ano. O cadastro atual não será sobrescrito.</p> : loaded?.key !== key ? <p role="status">Carregando o ano comparado…</p> : loaded.error ? <p role="alert">{loaded.error}</p> : !prior ? <p>Este ano não possui base salva. Importe a base e a produção histórica.</p> : comparison && <>
      <p className="helper">{comparison.available ? `Mesmos meses fechados: ${MONTHS[comparison.first]} a ${MONTHS[comparison.last]} em ambos os anos. Meses parciais não entram no cálculo.` : 'Não há mês fechado comum no período escolhido. A fonte mensal não permite reconstruir a produção de um dia de anos anteriores.'} </p>

      {comparison.available && <>
      <ComparisonDashboard comparison={comparison} currentYear={dataset.year} previousYear={selectedYear} />
      <details className={styles.unitDetails}><summary>Detalhar por unidade · {comparison.rows.length} unidades</summary><div className="table-scroll"><table className="comparison-unit-table"><thead><tr><th scope="col">Unidade</th><th scope="col">Presença no cadastro</th><th scope="col">Meta {dataset.year}</th><th scope="col">Produção {dataset.year}</th><th scope="col">Atingimento {dataset.year}</th><th scope="col">GAP {dataset.year}</th><th scope="col">Meta {selectedYear}</th><th scope="col">Produção {selectedYear}</th><th scope="col">Atingimento {selectedYear}</th><th scope="col">GAP {selectedYear}</th><th scope="col">Variação R$</th><th scope="col">Variação %</th><th scope="col">Variação atingimento (p.p.)</th></tr></thead><tbody>{comparison.rows.map((row: any) => <tr key={row.key}><td><strong>{row.name}</strong><small className="cell-note">{row.key}</small></td><td>{row.membership === 'both' ? 'Nos dois anos' : `Somente no cadastro de ${row.membership === 'current' ? dataset.year : selectedYear}`}</td>{[row.current, row.previous].map((value: any, index: number) => <Cells key={index} value={value} />)}<td className="numeric">{money(row.delta)}</td><td className="numeric">{percent(row.growth)}</td><td className="numeric">{row.attainmentDelta == null ? 'Sem base' : row.attainmentDelta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td></tr>)}</tbody></table>{!comparison.rows.length && <p className="empty">Nenhuma unidade corresponde aos filtros.</p>}</div></details></>}
      {filters.source === "base" && filters.level === "central" && <p className="helper">A composição de cooperativas de uma central pode mudar entre anos. Para isolar unidades comuns, compare no nível Cooperativas e marque a opção de presença nos dois anos.</p>}

    </>}</>}</div>
  </section>;
}
function Cells({ value }: { value: any }) { return <><td className="numeric">{money(value?.target)}</td><td className="numeric">{money(value?.actual)}</td><td className="numeric">{percent(value?.attainment)}</td><td className="numeric">{money(value?.gap)}</td></>; }
