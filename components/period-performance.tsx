'use client';
import SecondaryInfo from './ui/secondary-info';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChartNoAxesColumnIncreasing, Hourglass, Share2, Target, TrendingUp } from 'lucide-react';
import { centralHeading } from '@/lib/communication-header.mjs';
import type { PeriodShareSelection } from '@/lib/period-performance-share.mjs';
import PeriodScenarioShare from './period-scenario-share';
import { money, percent } from '@/lib/analytics.mjs';
import { attainmentBand } from '@/lib/attainment.mjs';
import { buildPeriodPerformance, type PerformanceFilters, type PerformancePeriod, type PerformanceRow } from '@/lib/period-performance.mjs';
import { PERIOD_ORDER_OPTIONS, sortPerformancePeriods, type PerformanceOrder } from '@/lib/period-performance-order.mjs';
import type { Dataset } from '@/lib/types';
import AttainmentLegend from './ui/attainment-legend';
import PanelToggle from './ui/panel-toggle';
import styles from './period-performance.module.css';

const dateLabel = (date: string | null) => date?.split('-').reverse().join('/') ?? 'não informado';
const varianceLabel = (row: PerformanceRow) => row.variance.kind === 'growth' ? 'Superação' : row.variance.kind === 'gap' ? 'GAP' : row.variance.kind === 'met' ? row.target === 0 ? 'Meta zero' : 'Na meta' : 'Sem avaliação';
const openGroups = (): Record<PerformancePeriod, boolean> => ({ month: true, quarter: true, semester: true, annual: true });
const GROUP_ORDER: PerformancePeriod[] = ['annual', 'month', 'quarter', 'semester'];
const PERIOD_OPTIONS: { value: PerformancePeriod; label: string }[] = [{ value: 'month', label: 'Mensal' }, { value: 'quarter', label: 'Trimestral' }, { value: 'semester', label: 'Semestral' }, { value: 'annual', label: 'Anual' }];
type ChartIndicator = 'actual' | 'target' | 'attainment';
const INDICATORS: Record<ChartIndicator, string> = { actual: 'Realizado', target: 'Meta', attainment: 'Atingimento' };

function FinancialValue({ value, fluid = false }: { value: number | null; fluid?: boolean }) {
  if (value == null) return <span className={styles.unavailable} title="Não disponível"><span aria-hidden="true">—</span><span className="sr-only">Não disponível</span></span>;
  const formatted = money(value);
  return <span className={styles.currency} style={fluid ? { fontSize: `clamp(16px, ${Math.min(12, 145 / formatted.length)}cqi, 28px)` } : undefined}>{formatted}</span>;
}
function Attainment({ row }: { row: PerformanceRow }) {
  const band = attainmentBand(row.attainment);
  return <span className={styles.attainment} data-attainment={band.key} title={band.label}>{row.attainment == null ? 'Sem avaliação' : percent(row.attainment)}</span>;
}
function Phase({ row }: { row: PerformanceRow }) {
  return <span className={styles.phase} data-phase-label={row.phase}>{row.phaseLabel}{row.mixedCutoffs && row.phase !== 'closed' ? ' · cortes diferentes' : ''}</span>;
}
function Balance({ row, fluid = false }: { row: PerformanceRow; fluid?: boolean }) {
  return <span className={styles.balance} data-variance={row.variance.kind}>
    {row.variance.kind !== 'unknown' && <span className="sr-only">{varianceLabel(row)}: </span>}
    {['growth', 'gap'].includes(row.variance.kind) && <span aria-hidden="true" className={styles.sign}>{row.variance.kind === 'growth' ? '+' : '−'}</span>}
    <FinancialValue value={row.variance.value} fluid={fluid} />
  </span>;
}
function AnnualSummary({ row }: { row: PerformanceRow }) {
  const balanceTitle = row.variance.kind === 'growth' ? 'Superação da meta' : row.variance.kind === 'gap' ? 'Falta para a meta' : row.variance.kind === 'met' ? row.target === 0 ? 'Meta zero' : 'Meta atingida' : 'GAP / superação';
  return <article className={styles.annual} data-period={row.period} data-month={row.month} data-phase={row.phase} aria-label="Ano completo">
    <div className={styles.annualGrid}>
      <div className={styles.kpi}><Target size={27} aria-hidden="true" /><dl><dt>Meta anual</dt><dd data-field="target"><FinancialValue value={row.target} fluid /></dd></dl></div>
      <div className={styles.kpi} data-kpi-band={attainmentBand(row.attainment).key}><ChartNoAxesColumnIncreasing size={27} aria-hidden="true" /><dl><dt>Realizado</dt><dd><span data-field="actual"><FinancialValue value={row.actual} fluid /></span><Attainment row={row} /></dd></dl></div>
      <div className={styles.kpi}><Hourglass size={27} aria-hidden="true" /><dl><dt>{balanceTitle}</dt><dd data-field="variance"><Balance row={row} fluid /></dd></dl></div>
      <div className={`${styles.kpi} ${styles.projectionKpi}`}><TrendingUp size={27} aria-hidden="true" /><dl><dt>Projeção anual</dt><dd data-field="projected"><FinancialValue value={row.projected} fluid /></dd></dl></div>
    </div>
  </article>;
}
function PeriodCard({ row }: { row: PerformanceRow }) {
  return <article className={styles.periodCard} data-period={row.period} data-month={row.month} data-phase={row.phase} data-card-band={attainmentBand(row.attainment).key} aria-label={row.label}>
    <header><h4>{row.label}</h4><Phase row={row} /></header>
    <div className={styles.cardMetrics}>
      <dl className={styles.cardActual}><dt>Realizado</dt><dd><span data-field="actual"><FinancialValue value={row.actual} fluid /></span><Attainment row={row} /></dd></dl>
      <dl className={styles.cardDetails}>
        <div><dt>Meta</dt><dd data-field="target"><FinancialValue value={row.target} /></dd></div>
        <div><dt>{varianceLabel(row)}</dt><dd data-field="variance"><Balance row={row} /></dd></div>
        <div><dt>Projeção</dt><dd data-field="projected"><FinancialValue value={row.projected} /></dd></div>
      </dl>
    </div>
  </article>;
}

function PeriodTable({ rows, title, period, indicator }: { rows: PerformanceRow[]; title: string; period: PerformancePeriod; indicator: ChartIndicator }) {
  return <div className={styles.tableScroll} data-indicator={indicator}><table aria-label={title}>
    <thead><tr><th scope="col">{period === 'month' ? 'Mês' : 'Período'}</th><th scope="col">Meta</th><th scope="col">Realizado</th><th scope="col">Atingimento</th><th scope="col">GAP / Superação</th><th scope="col">Projeção do período</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.id} data-period={row.period} data-month={row.month} data-phase={row.phase}>
      <th scope="row"><div className={styles.periodLabel}><strong>{row.label}</strong><Phase row={row} /></div></th>
      <td className={styles.numeric} data-field="target"><FinancialValue value={row.target} />{row.period === 'month' && row.phase === 'partial' && row.expected != null && <small className={styles.proportionalReference} data-field="expected" title="Meta mensal proporcional aos dias úteis até o corte; segunda a sexta, sem descontar feriados">Até o corte: <FinancialValue value={row.expected} /></small>}</td>
      <td className={styles.numeric} data-field="actual"><FinancialValue value={row.actual} /></td>
      <td className={styles.attainmentCell} data-field="attainment"><Attainment row={row} /></td>
      <td className={styles.numeric} data-field="variance"><Balance row={row} /></td>
      <td className={styles.numeric} data-field="projected"><FinancialValue value={row.projected} /></td>
    </tr>)}</tbody>
  </table></div>;
}

function PeriodChart({ rows, indicator, title }: { rows: PerformanceRow[]; indicator: ChartIndicator; title: string }) {
  const chartId = useId();
  const values = rows.map(row => row[indicator]);
  const reference = indicator === 'attainment' ? 1 : null;
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value));
  const min = Math.min(0, ...finite), max = Math.max(indicator === 'attainment' ? 1 : 0, ...finite, 1);
  const spread = max - min || 1;
  const x = (index: number) => rows.length === 1 ? 440 : 88 + index / (rows.length - 1) * 704;
  const y = (value: number) => 228 - (value - min) / spread * 184;
  const compact = (value: number) => indicator === 'attainment' ? percent(value) : new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  let interrupted = true;
  const path = rows.map((row, index) => {
    const value = row[indicator];
    if (value == null) { interrupted = true; return ''; }
    const point = `${interrupted ? 'M' : 'L'}${x(index)},${y(value)}`;
    interrupted = false;
    return point;
  }).join(' ');
  return <figure className={styles.periodChart} aria-labelledby={chartId}>
    <figcaption id={chartId}>{INDICATORS[indicator]} · {title.toLocaleLowerCase('pt-BR')}</figcaption>
    {!finite.length && <p role="status">Nenhum valor disponível para este indicador no recorte. Consulte a tabela para conferir os períodos.</p>}
    <svg viewBox="0 0 850 288" role="img" aria-label={`${INDICATORS[indicator]} por período. ${indicator === 'attainment' ? 'Escala em percentual.' : 'Escala em reais.'} Valores ausentes não são representados como zero.`}>
      {[min, min + spread / 2, max].map((tick, index) => <g key={index}><line className={styles.chartGrid} x1="88" x2="792" y1={y(tick)} y2={y(tick)} /><text x="78" y={y(tick) + 4} textAnchor="end">{compact(tick)}</text></g>)}
      {reference != null && <g><line className={styles.chartReference} x1="88" x2="792" y1={y(reference)} y2={y(reference)} /><text x="792" y={y(reference) - 9} textAnchor="end">Meta · 100%</text></g>}
      <path className={styles.chartLine} d={path} fill="none" strokeWidth="3" />
      {rows.map((row, index) => <g key={row.id}>{row[indicator] != null && <circle className={styles.chartPoint} cx={x(index)} cy={y(row[indicator]!)} r="5" data-phase={row.phase}><title>{row.label}: {indicator === 'attainment' ? percent(row.attainment) : money(row[indicator])} · {row.phaseLabel}</title></circle>}<text x={x(index)} y="254" textAnchor="middle">{row.period === 'month' ? row.label.slice(0, 3) : row.period === 'quarter' ? `${Math.floor(row.month / 3) + 1}º tri.` : row.period === 'semester' ? `${Math.floor(row.month / 6) + 1}º sem.` : 'Ano'}</text>{row.phase === 'partial' && <text className={styles.chartPartial} x={x(index)} y="273" textAnchor="middle">Parcial</text>}</g>)}
    </svg>
    <p>Gráfico em ordem cronológica. Marcas preenchidas representam valores informados, inclusive zero. {indicator === 'target' ? 'Metas planejadas permanecem visíveis nos períodos após o corte.' : 'Períodos após o corte e informações ausentes permanecem sem ponto.'} Use Tabela para consultar valores e situação de cada período.</p>
    {rows.some(row => row.phase === 'partial' && row.expected != null) && <p>Referência proporcional calculada pelos dias úteis até o corte, de segunda a sexta, sem descontar feriados. Consulte “Até o corte” na meta mensal da tabela.</p>}
  </figure>;
}

export default function PeriodPerformance({ dataset, filters, unitIds, expandRequest, shareRequest, ownerId, sectionId = 'resultados-por-periodo', initialExpanded = true, standalone = false }: { dataset: Dataset; filters: PerformanceFilters; unitIds: string[]; expandRequest?: number; shareRequest?: number; ownerId?: string | null; sectionId?: string; initialExpanded?: boolean; standalone?: boolean }) {
  const contentId = useId();
  const [expanded, setExpanded] = useState(initialExpanded);
  const [groups, setGroups] = useState(openGroups);
  const [order, setOrder] = useState<PerformanceOrder>('chronological');
  const [granularity, setGranularity] = useState<PerformancePeriod>('month');
  const [presentation, setPresentation] = useState<'table' | 'chart'>('table');
  const [indicator, setIndicator] = useState<ChartIndicator>('actual');
  const handledShareRequest = useRef<number | null>(null);
  const [sharing, setSharing] = useState<{ context: string; period: PeriodShareSelection } | null>(null);
  useEffect(() => {
    if (expandRequest == null) return;
    setExpanded(true);
    setGroups(openGroups());
  }, [expandRequest]);
  const result = useMemo(() => {
    try { return { model: buildPeriodPerformance({ dataset, filters, unitIds }), error: '' }; }
    catch (reason) { return { model: null, error: reason instanceof Error ? reason.message : 'Não foi possível preparar os resultados por período.' }; }
  }, [dataset, filters, unitIds]);
  const model = result.model;
  const shareContext = JSON.stringify([ownerId, dataset.year, filters, unitIds, order, model]);
  useEffect(() => { setSharing(null); }, [shareContext]);
  useEffect(() => {
    if (shareRequest == null || shareRequest < 1 || !model?.count || handledShareRequest.current === shareRequest) return;
    handledShareRequest.current = shareRequest;
    setSharing({ context: shareContext, period: standalone ? granularity : 'all' });
  }, [shareRequest, model?.count, shareContext, standalone, granularity]);
  const centralIds = new Set(model?.units.map(unit => unit.central));
  const central = centralIds.size === 1 ? [...centralIds][0] : null;
  const centralName = centralHeading(central, central ? dataset.registry?.entities.find(entity => entity.id === `central:${central}`)?.name : '');
  const selectedGroup = model?.groups.find(group => group.period === granularity);
  const visible = standalone || expanded;
  return <section id={sectionId} tabIndex={-1} aria-label="Resultados por período" className={styles.section} data-standalone={standalone}>
    <header className={styles.heading}>
      <div><h2>Resultados por período</h2><p>{model?.metric === 'AR' ? 'Arrecadação' : 'Venda Nova'} · {dataset.year}{model && <span className={styles.scopeCount}>{model.countLabel}</span>}</p></div>
      <div className={styles.controls}>
        {visible && Boolean(model?.count) && <label className={styles.order}>Ordenar períodos<select aria-label="Ordenar períodos" value={order} onChange={event => setOrder(event.target.value as PerformanceOrder)}>{Object.entries(PERIOD_ORDER_OPTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        {Boolean(model?.count) && <button type="button" className={`button secondary ${styles.shareButton}`} onClick={() => setSharing({ context: shareContext, period: standalone ? granularity : 'all' })}><Share2 size={16} aria-hidden="true" />Compartilhar cenário</button>}
        {!standalone && <PanelToggle expanded={expanded} controls={contentId} label="resultados por período" onToggle={() => setExpanded(value => !value)} />}
      </div>
    </header>
    <div id={contentId} hidden={!visible}>
      {result.error ? <p role="alert" className={styles.empty}>{result.error}</p> : model && !model.count ? <p className={styles.empty}>Nenhuma unidade no recorte atual. Ajuste os filtros para comparar os períodos.</p> : model && <div className={styles.content}>
        <div className={styles.context}>{model.scopeLabel !== model.countLabel && <strong>{model.scopeLabel}</strong>}<span>{model.cutoffMin === model.cutoff ? `Atualizado até ${dateLabel(model.cutoff)}` : `Cortes: ${dateLabel(model.cutoffMin)} a ${dateLabel(model.cutoff)}`}</span></div>
        {standalone ? <>
          <div className={styles.analysisToolbar}>
            <label>Granularidade<select aria-label="Granularidade dos períodos" value={granularity} onChange={event => setGranularity(event.target.value as PerformancePeriod)}>{PERIOD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label>Indicador<select aria-label="Indicador dos períodos" value={indicator} onChange={event => setIndicator(event.target.value as ChartIndicator)}>{Object.entries(INDICATORS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <div className={styles.viewSwitch} role="group" aria-label="Visualização dos períodos"><button type="button" aria-pressed={presentation === 'table'} onClick={() => setPresentation('table')}>Tabela</button><button type="button" aria-pressed={presentation === 'chart'} onClick={() => setPresentation('chart')}>Gráfico</button></div>
          </div>
          {selectedGroup && <section className={styles.group} aria-label={selectedGroup.title} data-period-group={selectedGroup.period}>
            <header className={styles.groupHeading}><h3>{selectedGroup.title}<span className={styles.count}>{selectedGroup.rows.length} {selectedGroup.rows.length === 1 ? 'período' : 'períodos'}{granularity === 'month' ? ' · janeiro a dezembro' : ''}</span></h3></header>
            {presentation === 'table' ? <PeriodTable rows={sortPerformancePeriods(selectedGroup.rows, order)} title={selectedGroup.title} period={granularity} indicator={indicator} /> : <PeriodChart rows={selectedGroup.rows} indicator={indicator} title={selectedGroup.title} />}
          </section>}
          <SecondaryInfo title="Faixas e sinais"><div className={styles.legend}><AttainmentLegend /><span className={styles.balanceLegend}><strong>+</strong> Superação <span>·</span> <strong>−</strong> GAP</span></div></SecondaryInfo>
        </> : GROUP_ORDER.map(period => {
          const group = model.groups.find(item => item.period === period);
          if (!group) return null;
          const isOpen = groups[group.period], groupId = `${contentId}-${group.period}`, rows = sortPerformancePeriods(group.rows, order);
          return <section className={styles.group} key={group.period} aria-label={group.title} data-period-group={group.period}>
            <header className={styles.groupHeading}><h3>{group.period === 'annual' ? 'Resumo anual' : group.title}{group.period === 'annual' && rows[0] ? <Phase row={rows[0]} /> : <span className={styles.count}>{group.rows.length} {group.rows.length === 1 ? 'período' : 'períodos'}</span>}</h3><PanelToggle expanded={isOpen} controls={groupId} label={group.title.toLocaleLowerCase('pt-BR')} onToggle={() => setGroups(value => ({ ...value, [group.period]: !value[group.period] }))} /></header>
            <div id={groupId} hidden={!isOpen}>
              {group.period === 'annual' ? rows.map(row => <AnnualSummary key={row.id} row={row} />) : group.period === 'month' ? <>
                <SecondaryInfo title="Faixas e sinais"><div className={styles.legend}><AttainmentLegend /><span className={styles.balanceLegend}><strong>+</strong> Superação <span>·</span> <strong>−</strong> GAP</span></div></SecondaryInfo>
                <div className={styles.tableScroll}><table aria-label={group.title}>
                  <thead><tr><th scope="col">Mês</th><th scope="col">Meta</th><th scope="col">Realizado</th><th scope="col">Atingimento</th><th scope="col">GAP / Superação</th><th scope="col">Projeção</th></tr></thead>
                  <tbody>{rows.map(row => <tr key={row.id} data-period={row.period} data-month={row.month} data-phase={row.phase}>
                    <th scope="row"><div className={styles.periodLabel}><strong>{row.label}</strong><Phase row={row} /></div></th>
                    <td className={styles.numeric} data-field="target"><FinancialValue value={row.target} /></td>
                    <td className={styles.numeric} data-field="actual"><FinancialValue value={row.actual} /></td>
                    <td className={styles.attainmentCell} data-field="attainment"><Attainment row={row} /></td>
                    <td className={styles.numeric} data-field="variance"><Balance row={row} /></td>
                    <td className={styles.numeric} data-field="projected"><FinancialValue value={row.projected} /></td>
                  </tr>)}</tbody>
                </table></div>
              </> : <div className={group.period === 'quarter' ? styles.quarterGrid : styles.semesterGrid}>{rows.map(row => <PeriodCard key={row.id} row={row} />)}</div>}
            </div>
          </section>;
        })}
        <details className={styles.guide}><summary>Como ler os resultados</summary><p>As mesmas unidades são comparadas em todos os períodos. Realizado até o corte. O sinal + indica superação; − indica o valor que falta para a meta. Projeção estima o fechamento e coincide com o realizado nos períodos fechados. Valores ausentes aparecem como travessão.{model.uplift > 0 ? ` Aceleração considerada: ${model.uplift.toLocaleString('pt-BR')}%.` : ''}</p></details>
      </div>}
    </div>
    {model && sharing?.context === shareContext && <PeriodScenarioShare key={shareContext} model={model} initialPeriod={sharing.period} order={order} centralName={centralName} ownerId={ownerId} onClose={() => setSharing(null)} />}
  </section>;
}
