"use client";
import { Fragment, useEffect, useId, useMemo, useState } from 'react';
import { MONTHS, money, percent } from '@/lib/analytics.mjs';
import { compareYears, networkSummary, sortAnalysis } from '@/lib/scenarios.mjs';
import { loadWorkspace } from '@/lib/workspace-store';
import type { Dataset } from '@/lib/types';
import styles from './scenario-panels.module.css';
import ComparisonDashboard from './comparison-dashboard';
import { periodTitle } from '@/lib/periods.mjs';
import { goalVariance } from '@/lib/goal-variance.mjs';
import { attainmentBand } from '@/lib/attainment.mjs';
import AttainmentLegend from './ui/attainment-legend';
import { ChevronDown, MessageSquareText } from 'lucide-react';
export type ScenarioFilters = { central: string; coop: string; pa?: string; unitIds?: string[]; source: string; metric: string; group: string; level: string; period: string; month: number; uplift: number; sortBy: string; search: string; status: string };
export function PaTable({ dataset, filters, onSelect, onHistory, onShare, onOpenCadence, expanded = false, onToggle, compact = true, showLegend = false }: { dataset: Dataset; filters: ScenarioFilters; onSelect?: (row: any) => void; onHistory?: (row: any) => void; onShare?: (sortBy?: string) => void; onOpenCadence?: () => void; expanded?: boolean; onToggle: () => void; compact?: boolean; showLegend?: boolean }) {
  const model = useMemo(() => networkSummary(dataset, { ...filters, source: 'base', search: '', status: 'all' }), [dataset, filters]);
  const [order, setOrder] = useState('attainment-desc');
  const [groupBy, setGroupBy] = useState(false);
  const [page, setPage] = useState(0);
  const rows = useMemo(() => {
    const sorted = sortAnalysis(model.pas, order);
    return groupBy ? sorted.sort((a: any, b: any) => String(a.group || 'Sem grupo').localeCompare(String(b.group || 'Sem grupo'), 'pt-BR', { numeric: true })) : sorted;
  }, [model.pas, order, groupBy]);
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pages - 1);
  const visibleRows = rows.slice(currentPage * 50, (currentPage + 1) * 50);
  useEffect(() => setPage(0), [dataset, filters.central, filters.coop, filters.period, filters.month, order, groupBy]);
  const achieved = model.pas.filter((row: any) => row.complete && !row.annualConflict && row.target > 0 && row.attainment >= 1).length;
  const zero = model.pas.filter((row: any) => row.actual === 0).length;
  const contentId = useId();
  const [moreIndicators, setMoreIndicators] = useState(!compact);
  return <section className={`panel ${styles.section} ${styles.paSection}`} aria-label="PAs da cooperativa">
    <div className="panel-heading"><div><h2>PAs desta cooperativa</h2><p>Venda Nova · {periodTitle(filters.period, filters.month, dataset.year)}</p></div><button type="button" className="button quiet" onClick={onToggle} aria-expanded={expanded} aria-controls={contentId}>{expanded ? "Fechar PAs" : "Ver PAs"}<ChevronDown size={16} className={expanded ? styles.rotated : undefined} /></button></div>
    <div id={contentId} hidden={!expanded}>
      <div className={styles.paSummary} aria-label="Indicadores dos PAs">
        <div><strong>{model.pas.length}</strong><span>Total de PAs</span></div>
        <div><strong>{achieved}</strong><span>Com meta entregue</span></div>
        <div><strong>{zero}</strong><span>Com produção zerada</span></div>
        <div><strong>{model.pas.length ? percent(achieved / model.pas.length) : '0%'}</strong><span>Dos PAs com meta entregue</span></div>
      </div>
      <div className={styles.paToolbar}>
        <div><label>Ordenar por<select aria-label="Ordenar PAs por" value={order} onChange={event => setOrder(event.target.value)}><option value="attainment-desc">Maior atingimento</option><option value="production">Maior produção</option><option value="name">Nome / código</option></select></label><label className={styles.paIndicators}><input type="checkbox" checked={groupBy} onChange={event => setGroupBy(event.target.checked)} />Agrupar por P1, P2 e demais grupos</label></div>
        <div>
          <label className={styles.paIndicators}><input type="checkbox" checked={moreIndicators} onChange={event => setMoreIndicators(event.target.checked)} />Mais indicadores</label>
          {onOpenCadence && <button type="button" className="button quiet" aria-label={`Abrir cadência de ${dataset.registry?.entities.find(entity => entity.id === `cooperative:${filters.coop}`)?.name ?? filters.coop}`} onClick={onOpenCadence}>Abrir cadência</button>}
          {onShare && rows.length > 0 && <button type="button" className="button secondary pa-share-trigger" aria-label="Compartilhar PAs" onClick={() => onShare(order)}><MessageSquareText size={16} aria-hidden="true" />Compartilhar cenário</button>}
        </div>
      </div>
      <p className={styles.paMethod}>Cadência de Venda Nova dos PAs. Estes valores não são somados à produção da cooperativa.</p>
      <div className="table-scroll"><table className={styles.paTable}><thead><tr><th scope="col">Unidade</th><th scope="col">Meta</th><th scope="col">Realizado</th><th scope="col">Atingimento</th><th scope="col">GAP / Superação</th><th scope="col">Projeção</th>{moreIndicators && <><th scope="col">GAP projetado</th><th scope="col" title="GAP do período dividido pelos dias úteis restantes do mesmo período">Necessário/dia útil</th><th scope="col" title="GAP do período dividido pelos meses equivalentes restantes">Necessário/mês equivalente</th><th scope="col">Corte</th><th scope="col">Ritmo do período</th></>}<th scope="col">Ações</th></tr></thead><tbody>{visibleRows.map((row: any, index: number) => {
        const assessable = row.complete && !row.annualConflict && row.target > 0;
        const dataState = row.annualConflict ? 'Metas divergentes' : row.actual == null ? 'Sem realizado' : !row.complete ? 'Dados incompletos' : row.target == null ? 'Sem meta' : row.target === 0 ? 'Meta zero' : null;
        return <Fragment key={row.key}>{groupBy && (index === 0 || visibleRows[index - 1].group !== row.group) && <tr className={styles.paGroup}><th colSpan={moreIndicators ? 12 : 7} scope="rowgroup">{row.group || 'Sem grupo'}</th></tr>}<tr data-pa={row.pa}>
          <th scope="row"><strong>PA {row.pa} · {row.name}</strong><small className="cell-note">{row.group} · Coop. {row.cooperative}{dataState ? ` · ${dataState}` : ''}</small></th>
          <td className="numeric">{money(row.target)}</td>
          <td className="numeric">{money(row.actual)}</td>
          <td className="numeric"><span className={styles.paAttainment} data-attainment={attainmentBand(assessable ? row.attainment : null).key}>{assessable ? percent(row.attainment) : row.target == null || row.target === 0 ? 'Sem meta' : 'Sem avaliação'}</span></td>
          <td className="numeric"><PaVariance row={row} /></td>
          <td className="numeric" title={`Estimativa de fechamento: ${periodTitle(filters.period, filters.month, dataset.year)}`}>{money(row.projected)}</td>
          {moreIndicators && <><td className="numeric">{money(row.projectionGap)}</td><td className="numeric">{money(row.requiredDaily)}</td><td className="numeric">{money(row.requiredMonthly)}</td><td>{row.cutoff?.split('-').reverse().join('/') ?? 'Sem corte'}</td><td>{row.status}</td></>}
          <td><div className={styles.paActions}>{onSelect && <button type="button" className="button quiet" aria-label={`Analisar PA ${row.pa} · ${row.name}`} onClick={() => onSelect(row)}>Analisar PA</button>}{onHistory && <button type="button" className="button quiet" aria-label={`Ver histórico do PA ${row.pa} · ${row.name}`} onClick={() => onHistory(row)}>Ver histórico</button>}{!onSelect && !onHistory && <span className="helper">Sem ações disponíveis</span>}</div></td>
        </tr></Fragment>;
      })}</tbody></table></div>
      <nav className={styles.paPagination} aria-label="Paginação dos PAs"><span>{rows.length ? currentPage * 50 + 1 : 0} a {Math.min((currentPage + 1) * 50, rows.length)} de {rows.length} PAs</span><div><button type="button" className="button secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</button><span>Página {currentPage + 1} de {pages}</span><button type="button" className="button secondary" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>Próxima</button></div></nav>
      {showLegend && <AttainmentLegend />}
      {!rows.length && <p className="empty">Nenhum PA cadastrado para esta cooperativa neste ano. Importe a cadência PA ou inclua no cadastro fixo.</p>}
    </div>
  </section>;
}
export function NetworkSummary({ dataset, filters }: { dataset: Dataset; filters: ScenarioFilters }) {
  const model = useMemo(() => networkSummary(dataset, filters), [dataset, filters]);
  return <section className={`panel ${styles.network}`} aria-label="Resumo da rede filtrada">
    <div className={styles.networkHeading}><h2>Rede da seleção</h2><details className={styles.networkMethod}><summary>Como é avaliada</summary><p>Meta atingida: realizado de pelo menos 100% no período. PAs usam a cadência de Venda Nova. Unidades sem dados suficientes ficam sem avaliação.</p></details></div><div className={styles.networkCounts}>
      <div><strong>{model.cooperativeCount}</strong><span>Cooperativas<small>{model.cooperativeAchieved} na meta{model.cooperativeUnknown > 0 && ` · ${model.cooperativeUnknown} sem avaliação`}</small></span></div>
      <div><strong>{model.paCount}</strong><span>PAs · Venda Nova<small>{model.paAchieved} na meta{model.paUnknown > 0 && ` · ${model.paUnknown} sem avaliação`}</small></span></div>
      {filters.coop === 'all' && <div><strong>{model.centralAchieved}<small>/{model.centralCount}</small></strong><span>Centrais na meta<small>{filters.metric === 'AR' ? 'Arrecadação' : 'Venda Nova'}</small></span></div>}
    </div>
  </section>;
}
export function YearComparison({ dataset, filters, owner, years, sessionDatasets, standalone = false, initialExpanded = false, onShare }: { dataset: Dataset; filters: ScenarioFilters; owner: string | null; years: number[]; sessionDatasets: Map<number, Dataset>; standalone?: boolean; initialExpanded?: boolean; onShare?: (comparison: ReturnType<typeof compareYears>, previousYear: number) => void }) {
  const choices = [...new Set(years)].filter(year => year !== dataset.year).sort((a, b) => b - a);
  const [year, setYear] = useState<number | null>(null);
  const [commonOnly, setCommonOnly] = useState(false);
  const selectedYear = year !== null && choices.includes(year) ? year : choices.find(value => value < dataset.year) ?? choices[0];
  const [loaded, setLoaded] = useState<{ key: string; dataset: Dataset | null; error: string } | null>(null);
  const [open, setOpen] = useState(initialExpanded);
  const visible = standalone || open;
  const contentId = useId();
  const key = `${owner ?? 'session'}:${dataset.year}:${selectedYear}:${dataset.importedAt}:${dataset.registry?.updatedAt ?? ''}`;
  useEffect(() => {
    if (!visible || !selectedYear) return;
    let cancelled = false;
    setLoaded(null);
    if (!owner) { setLoaded({ key, dataset: sessionDatasets.get(selectedYear) ?? null, error: '' }); return; }
    loadWorkspace(owner, selectedYear).then(value => { if (!cancelled) setLoaded({ key, dataset: value?.dataset?.year === selectedYear ? value.dataset : null, error: '' }); }).catch(() => { if (!cancelled) setLoaded({ key, dataset: null, error: 'Não foi possível carregar o ano comparado. Tente novamente ou recarregue o cadastro salvo.' }); });
    return () => { cancelled = true; };
  }, [visible, owner, selectedYear, key, sessionDatasets, dataset]);
  const prior = loaded?.key === key ? loaded.dataset : null;
  const comparison = useMemo(() => prior ? compareYears(dataset, prior, filters, commonOnly) : null, [dataset, prior, filters, commonOnly]);
  const cutoffFor = (side: 'current' | 'previous') => [...new Set<string>((comparison?.rows ?? []).flatMap((row: any) => [row[side]?.cutoffMin, row[side]?.cutoff]).filter((value: unknown): value is string => typeof value === 'string'))].sort();
  const currentCuts = cutoffFor('current'), previousCuts = cutoffFor('previous');
  const cutLabel = (cuts: string[]) => cuts.length ? cuts[0] === cuts.at(-1) ? cuts[0].split('-').reverse().join('/') : `${cuts[0].split('-').reverse().join('/')} a ${cuts.at(-1)!.split('-').reverse().join('/')}` : 'não informado';
  const differentCuts = currentCuts.length > 0 && previousCuts.length > 0 && JSON.stringify([...new Set(currentCuts.map(value => value.slice(5)))]) !== JSON.stringify([...new Set(previousCuts.map(value => value.slice(5)))]);
  return <section className={`panel ${styles.section}`} aria-label="Comparativo entre anos"><div className="panel-heading"><div><h2>Comparativo entre anos</h2>{visible && <p>{periodTitle(filters.period, filters.month, dataset.year)}</p>}</div>{!standalone && <button className="button secondary" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls={contentId}>{open ? 'Fechar comparativo' : 'Comparar anos'}<ChevronDown size={16} className={open ? styles.rotated : undefined} /></button>}{onShare && <button type="button" className="button secondary" aria-label="Compartilhar comparativo" disabled={!comparison?.available || selectedYear == null} onClick={() => { if (comparison?.available && selectedYear != null) onShare(comparison, selectedYear); }}><MessageSquareText size={16} aria-hidden="true" />Compartilhar cenário</button>}</div>
    <div id={contentId} hidden={!visible}>{visible && <><div className={styles.controls}><label>Comparar {dataset.year} com<select value={selectedYear ?? ''} onChange={event => setYear(Number(event.target.value))} disabled={!choices.length}>{!choices.length && <option value="">Nenhum outro ano cadastrado</option>}{choices.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label className={styles.check}><input type="checkbox" checked={commonOnly} onChange={event => setCommonOnly(event.target.checked)} />Somente unidades presentes nos dois anos</label></div>
    {!choices.length ? <p>Use Importar base → Base e produção de outro ano. O cadastro atual não será sobrescrito.</p> : loaded?.key !== key ? <p role="status">Carregando o ano comparado…</p> : loaded.error ? <p role="alert">{loaded.error}</p> : !prior ? <p>Este ano não possui base salva. Importe a base e a produção histórica.</p> : comparison && <>
      <div className={styles.comparisonContext} aria-label="Critério e cortes do comparativo"><p>{comparison.available ? `Mesmos meses fechados: ${MONTHS[comparison.first]} a ${MONTHS[comparison.last]} em ambos os anos. Meses parciais não entram no cálculo.` : 'Não há mês fechado comum no período escolhido. Selecione outro período ou atualize as bases anuais.'}</p><div><span><strong>Corte {dataset.year}</strong> {cutLabel(currentCuts)}</span><span><strong>Corte {selectedYear}</strong> {cutLabel(previousCuts)}</span></div>{differentCuts && <p className={styles.cutoffNotice}>As datas de corte diferem. A comparação usa somente os meses fechados comuns, sem estimar produção histórica diária.</p>}</div>

      {comparison.available && <>
      <ComparisonDashboard comparison={comparison} currentYear={dataset.year} previousYear={selectedYear} />
      <details className={styles.unitDetails}><summary>Detalhar por unidade · {comparison.rows.length} unidades</summary><div className="table-scroll"><table className="comparison-unit-table"><thead><tr><th scope="col">Unidade</th><th scope="col">Presença no cadastro</th><th scope="col">Meta {dataset.year}</th><th scope="col">Produção {dataset.year}</th><th scope="col">Atingimento {dataset.year}</th><th scope="col">GAP {dataset.year}</th><th scope="col">Meta {selectedYear}</th><th scope="col">Produção {selectedYear}</th><th scope="col">Atingimento {selectedYear}</th><th scope="col">GAP {selectedYear}</th><th scope="col">Variação R$</th><th scope="col">Variação %</th><th scope="col">Variação atingimento (p.p.)</th></tr></thead><tbody>{comparison.rows.map((row: any) => <tr key={row.key}><td><strong>{row.name}</strong><small className="cell-note">{row.key}</small></td><td>{row.membership === 'both' ? 'Nos dois anos' : `Somente no cadastro de ${row.membership === 'current' ? dataset.year : selectedYear}`}</td>{[row.current, row.previous].map((value: any, index: number) => <Cells key={index} value={value} fullYear={comparison.first === 0 && comparison.last === 11} />)}<td className="numeric">{money(row.delta)}</td><td className="numeric">{row.growth == null ? 'Sem base' : percent(row.growth)}</td><td className="numeric">{row.attainmentDelta == null ? 'Sem base' : row.attainmentDelta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td></tr>)}</tbody></table>{!comparison.rows.length && <p className="empty">Nenhuma unidade corresponde aos filtros.</p>}</div></details></>}
      {filters.source === "base" && filters.level === "central" && <p className="helper">A composição de cooperativas de uma central pode mudar entre anos. Para isolar unidades comuns, compare no nível Cooperativas e marque a opção de presença nos dois anos.</p>}

    </>}</>}</div>
  </section>;
}
function Cells({ value, fullYear }: { value: any; fullYear: boolean }) {
  // compareYears keeps the annual target and monthly plan for this consistency check.
  const monthlyTargets = value?.targets;
  const monthlyTotal = Array.isArray(monthlyTargets) && monthlyTargets.length === 12 && monthlyTargets.every((target: unknown) => typeof target === 'number' && Number.isFinite(target))
    ? monthlyTargets.reduce((sum: number, target: number) => sum + Math.round(target * 100), 0) / 100 : null;
  const inconsistent = fullYear && (value?.annualConflict || (monthlyTotal != null && typeof value?.annualTarget === 'number' && Math.abs(monthlyTotal - value.annualTarget) > 0.011));
  const band = attainmentBand(value?.complete && !inconsistent ? value.attainment : null);
  return <><td className="numeric">{money(value?.target)}</td><td className="numeric" data-attainment={band.key}>{money(value?.actual)}</td><td className="numeric" data-attainment={band.key}>{percent(value?.attainment)}</td><td className="numeric">{money(value?.gap)}</td></>;
}
function PaVariance({ row }: { row: { actual: number | null; target: number | null; complete: boolean; annualConflict?: boolean } }) {
  const value = goalVariance(row.actual, row.target, row.complete && !row.annualConflict);
  const label = value.kind === 'growth' ? 'Superação' : value.kind === 'met' ? (row.target ?? 0) > 0 ? 'Meta atingida' : 'Meta zero' : value.kind === 'unknown' ? 'Sem avaliação' : 'GAP';
  return <span className={styles.paVariance} title={label} aria-label={`${label}: ${money(value.value)}`}>{value.kind === 'growth' ? '+ ' : value.kind === 'gap' ? '− ' : ''}{money(value.value)}</span>;
}
