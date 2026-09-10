"use client";
import { useEffect, useMemo, useState } from 'react';
import { MONTHS, money, percent } from '@/lib/analytics.mjs';
import { compareYears, networkSummary, sortAnalysis } from '@/lib/scenarios.mjs';
import { loadWorkspace } from '@/lib/workspace-store';
import type { Dataset } from '@/lib/types';
import styles from './scenario-panels.module.css';
export type ScenarioFilters = { central: string; coop: string; source: string; metric: string; group: string; level: string; period: string; month: number; uplift: number; sortBy: string; search: string; status: string };
export function PaTable({ dataset, filters, onSelect }: { dataset: Dataset; filters: ScenarioFilters; onSelect?: (row: any) => void }) {
  const model = useMemo(() => networkSummary(dataset, { ...filters, source: 'base', search: '', status: 'all' }), [dataset, filters]);
  const rows = sortAnalysis(model.pas, filters.sortBy);
  return <section id="cooperative-pas" className={`panel ${styles.section}`} aria-label="PAs da cooperativa">
    <div className="panel-heading"><div><h2>PAs desta cooperativa</h2><p>{rows.length} PAs cadastrados em {dataset.year} · Cadência PA / Venda Nova · período selecionado. Esta fonte não é somada ao resultado da cooperativa.</p></div></div>
    <div className="table-scroll"><table><thead><tr><th>PA / grupo</th><th>Meta</th><th>Realizado</th><th>Atingimento</th><th>GAP</th><th>Projeção</th><th>GAP projetado</th><th>Necessário/dia útil</th><th>Necessário/mês</th><th>Corte</th><th>Situação</th></tr></thead><tbody>{rows.map((row: any) => <tr key={row.key}><td><button className="entity-button" disabled={!onSelect} onClick={() => onSelect?.(row)}><strong>PA {row.pa} · {row.name}</strong><small>{row.group} · Coop. {row.cooperative}</small></button></td><td className="numeric">{money(row.target)}</td><td className="numeric">{money(row.actual)}</td><td className="numeric">{percent(row.attainment)}</td><td className="numeric">{money(row.gap)}</td><td className="numeric">{money(row.projected)}</td><td className="numeric">{money(row.projectionGap)}</td><td className="numeric">{money(row.requiredDaily)}</td><td className="numeric">{money(row.requiredMonthly)}</td><td>{row.cutoff.split('-').reverse().join('/')}</td><td>{row.status}</td></tr>)}</tbody></table></div>
    {!rows.length && <p className="empty">Nenhum PA cadastrado para esta cooperativa neste ano. Importe a cadência PA ou inclua no cadastro fixo.</p>}
  </section>;
}
export function NetworkSummary({ dataset, filters }: { dataset: Dataset; filters: ScenarioFilters }) {
  const model = useMemo(() => networkSummary(dataset, filters), [dataset, filters]);
  return <section className={`panel ${styles.section}`} aria-label="Resumo da rede filtrada"><div className="panel-heading"><div><h2>Resumo da rede filtrada</h2><p>{dataset.year} · {MONTHS[filters.month]} · considera período, unidade, busca e situação. Meta entregue significa realizado de pelo menos 100%, não projeção.</p></div></div><div className={styles.cards}>
    <article><span>Cooperativas da seleção</span><strong>{model.cooperativeCount}</strong><small>{model.cooperativeAchieved} com meta atingida · {model.cooperativeUnknown} sem avaliação completa</small></article>
    <article><span>PAs da seleção</span><strong>{model.paCount}</strong><small>Cadastro deste ano, inclusive sem produção</small></article>
    <article><span>PAs com meta atingida</span><strong>{model.paAchieved} <small>/ {model.paCount}</small></strong><small>Cadência PA / Venda Nova · {model.paUnknown} sem avaliação completa</small></article>
    <article><span>Centrais com meta atingida</span><strong>{model.centralAchieved} <small>/ {model.centralCount}</small></strong><small>{filters.metric === 'AR' ? 'Arrecadação' : 'Venda Nova'} · consolidado das cooperativas da seleção</small></article>
  </div></section>;
}
export function YearComparison({ dataset, filters, owner, years, sessionDatasets }: { dataset: Dataset; filters: ScenarioFilters; owner: string | null; years: number[]; sessionDatasets: Map<number, Dataset> }) {
  const choices = [...new Set(years)].filter(year => year !== dataset.year).sort((a, b) => b - a);
  const [year, setYear] = useState<number | null>(null);
  const [commonOnly, setCommonOnly] = useState(false);
  const selectedYear = year !== null && choices.includes(year) ? year : choices.find(value => value < dataset.year) ?? choices[0];
  const [loaded, setLoaded] = useState<{ key: string; dataset: Dataset | null; error: string } | null>(null);
  const [open, setOpen] = useState(false);
  const key = `${owner ?? 'session'}:${selectedYear}`;
  useEffect(() => {
    if (!open || !selectedYear) return;
    let cancelled = false;
    if (!owner) { setLoaded({ key, dataset: sessionDatasets.get(selectedYear) ?? null, error: '' }); return; }
    loadWorkspace(owner, selectedYear).then(value => { if (!cancelled) setLoaded({ key, dataset: value?.dataset ?? null, error: '' }); }).catch(() => { if (!cancelled) setLoaded({ key, dataset: null, error: 'Não foi possível carregar o ano comparado. Tente novamente ou recarregue o cadastro salvo.' }); });
    return () => { cancelled = true; };
  }, [open, owner, selectedYear, key, sessionDatasets, dataset]);
  const prior = loaded?.key === key ? loaded.dataset : null;
  const comparison = useMemo(() => prior ? compareYears(dataset, prior, filters, commonOnly) : null, [dataset, prior, filters, commonOnly]);
  return <section className={`panel ${styles.section}`} aria-label="Comparativo entre anos"><div className="panel-heading"><div><h2>Comparativo entre anos</h2><p>Centrais, cooperativas e PAs são vinculados pelos códigos e pela hierarquia de cada ano, nunca apenas pelo nome.</p></div><button className="button secondary" onClick={() => setOpen(value => !value)} aria-expanded={open}>{open ? 'Fechar comparativo' : 'Comparar anos'}</button></div>
    {open && <><div className={styles.controls}><label>Comparar {dataset.year} com<select value={selectedYear ?? ''} onChange={event => setYear(Number(event.target.value))} disabled={!choices.length}>{!choices.length && <option value="">Nenhum outro ano cadastrado</option>}{choices.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label className={styles.check}><input type="checkbox" checked={commonOnly} onChange={event => setCommonOnly(event.target.checked)} />Somente unidades presentes nos dois anos</label></div>
    {!choices.length ? <p>Use Importar base → Base e produção de outro ano. O cadastro atual não será sobrescrito.</p> : loaded?.key !== key ? <p role="status">Carregando o ano comparado…</p> : loaded.error ? <p role="alert">{loaded.error}</p> : !prior ? <p>Este ano não possui base salva. Importe a base e a produção histórica.</p> : comparison && <>
      <p className="helper">{comparison.available ? `Mesmos meses fechados: ${MONTHS[comparison.first]} a ${MONTHS[comparison.last]} em ambos os anos. Meses parciais não entram no cálculo.` : 'Não há mês fechado comum no período escolhido. A fonte mensal não permite reconstruir a produção de um dia de anos anteriores.'} Uma unidade ausente é identificada como “somente no cadastro”, sem presumir produção zero ou encerramento.</p>
      <p>{comparison.common} unidades em ambos · {comparison.currentOnly} somente em {dataset.year} · {comparison.previousOnly} somente em {selectedYear}</p>
      {comparison.available && <div className="table-scroll"><table><thead><tr><th>Unidade</th><th>Presença no cadastro</th><th>Meta {dataset.year}</th><th>Produção {dataset.year}</th><th>Atingimento {dataset.year}</th><th>GAP {dataset.year}</th><th>Meta {selectedYear}</th><th>Produção {selectedYear}</th><th>Atingimento {selectedYear}</th><th>GAP {selectedYear}</th><th>Variação R$</th><th>Variação %</th><th>Variação atingimento (p.p.)</th></tr></thead><tbody>{comparison.rows.map((row: any) => <tr key={row.key}><td><strong>{row.name}</strong><small className="cell-note">{row.key}</small></td><td>{row.membership === 'both' ? 'Nos dois anos' : `Somente no cadastro de ${row.membership === 'current' ? dataset.year : selectedYear}`}</td>{[row.current, row.previous].map((value: any, index: number) => <Cells key={index} value={value} />)}<td className="numeric">{money(row.delta)}</td><td className="numeric">{percent(row.growth)}</td><td className="numeric">{row.attainmentDelta == null ? 'Sem base' : row.attainmentDelta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td></tr>)}</tbody></table>{!comparison.rows.length && <p className="empty">Nenhuma unidade corresponde aos filtros.</p>}</div>}
      <p className="helper">Variação percentual requer produção anterior positiva; ausência de dado não é zero. Em “Maior produção”, a ordem considera {dataset.year}. As bases e metas de cada ano permanecem independentes.</p>
    </>}</>}
  </section>;
}
function Cells({ value }: { value: any }) { return <><td className="numeric">{money(value?.target)}</td><td className="numeric">{money(value?.actual)}</td><td className="numeric">{percent(value?.attainment)}</td><td className="numeric">{money(value?.gap)}</td></>; }
