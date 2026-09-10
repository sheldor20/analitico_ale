"use client";
import { useId } from 'react';
import { MONTHS, money, percent } from '@/lib/analytics.mjs';
import { chartDomain, comparisonDashboard, signedBar } from '@/lib/comparison-dashboard.mjs';
import type { compareYears } from '@/lib/scenarios.mjs';
import styles from './scenario-panels.module.css';
type Comparison = ReturnType<typeof compareYears>;
const points = (value: number | null) => value == null ? 'Sem base' : `${value > 0 ? '+' : ''}${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.`;
const change = (value: number | null) => value == null ? 'Sem base comparável' : value === 0 ? 'Sem variação' : value > 0 ? 'Aumento de produção' : 'Redução de produção';
export default function ComparisonDashboard({ comparison, currentYear, previousYear }: { comparison: Comparison; currentYear: number; previousYear: number }) {
  const model = comparisonDashboard(comparison);
  const titleId = useId();
  const yearSides = [{ year: currentYear, values: model.current }, { year: previousYear, values: model.previous }];
  const bars = yearSides.flatMap(side => [{ label: `Produção ${side.year}`, value: side.values.actual, kind: 'production' }, { label: `Meta ${side.year}`, value: side.values.target, kind: 'target' }]);
  const domain = chartDomain(bars.map(bar => bar.value));
  return <div className={styles.comparisonDashboard} aria-label="Dashboard comparativo">
    <div className={styles.comparisonKpis}>
      {yearSides.map(side => <article key={side.year} aria-label={`Resumo de ${side.year}`}>
        <span>Produção {side.year}</span><strong>{money(side.values.actual)}</strong>
        <small>Meta {money(side.values.target)}</small><small>GAP {money(side.values.gap)}</small>
        {side.values.observed < side.values.count && <small className={styles.warning}>Dados incompletos: {side.values.observed} de {side.values.count} unidades com produção.</small>}
      </article>)}
      <article aria-label="Variação da produção" className={styles.highlightCard}><span>{change(model.productionDelta)}</span><strong>{money(model.productionDelta)}</strong><small>{percent(model.growth)} em relação a {previousYear}</small><small>{model.compositionChanged ? 'Considera a rede de cada ano.' : 'Mesmas unidades nos dois anos.'}</small></article>
      <article aria-label="Comparação do atingimento"><span>Atingimento · {currentYear}</span><strong>{percent(model.current.attainment)}</strong><small>{previousYear}: {percent(model.previous.attainment)} · {points(model.attainmentDelta)}</small><small>Soma da produção ÷ soma das metas.</small></article>
    </div>
    <div className={styles.membership} aria-label="Composição dos anos">
      <span><strong>{comparison.common}</strong> nos dois anos</span>
      <span><strong>{comparison.currentOnly}</strong> somente no cadastro de {currentYear}</span>
      <span><strong>{comparison.previousOnly}</strong> somente no cadastro de {previousYear}</span>
    </div>
    {(model.current.inconsistent || model.previous.inconsistent) && <p role="status" className={styles.warning}>Há divergência entre a meta anual e a distribuição mensal. Confira as metas antes de interpretar o atingimento.</p>}
    <div className={styles.comparisonCharts}>
      <figure className={styles.chartCard} aria-labelledby={titleId}><figcaption id={titleId}>Produção e meta por ano</figcaption><p className="helper">Mesma escala em reais · {MONTHS[comparison.first]} a {MONTHS[comparison.last]}</p>
        <div className={styles.barChart}>{bars.map(bar => {
          const position = signedBar(bar.value, domain);
          return <div className={styles.barRow} key={bar.label}><div><span>{bar.label}</span><strong>{money(bar.value)}</strong></div><div className={styles.barTrack} aria-hidden="true"><i className={styles.zero} style={{ left: `${signedBar(0, domain)!.zero}%` }} />{position && <span className={bar.kind === 'target' ? styles.targetBar : styles.productionBar} style={{ left: `${position.left}%`, width: `${position.width}%` }} />}</div></div>;
        })}</div>
      </figure>
      <MonthlyComparison months={model.months} currentYear={currentYear} previousYear={previousYear} />
    </div>
    <p className="helper">{model.compositionChanged ? 'A variação inclui diferenças no cadastro. Use “Somente unidades presentes nos dois anos” para comparar a mesma seleção. ' : ''}Ausência de informação não é zero. Percentual de variação exige produção anterior positiva.</p>
  </div>;
}
function MonthlyComparison({ months, currentYear, previousYear }: { months: { month: number; current: number | null; previous: number | null }[]; currentYear: number; previousYear: number }) {
  const titleId = useId();
  const domain = chartDomain(months.flatMap(month => [month.current, month.previous]));
  const x = (index: number) => 64 + index / Math.max(1, months.length - 1) * 500;
  const y = (value: number) => 190 - (value - domain.min) / (domain.max - domain.min) * 154;
  const compact = (value: number) => new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  const pathFor = (key: 'current' | 'previous') => {
    let gap = true;
    return months.map((month, index) => { const value = month[key]; if (value == null) { gap = true; return ''; } const point = `${gap ? 'M' : 'L'}${x(index)},${y(value)}`; gap = false; return point; }).join(' ');
  };
  return <figure className={styles.chartCard} aria-labelledby={titleId}><figcaption id={titleId}>Evolução mensal da produção</figcaption><div className={styles.chartLegend}><span><i />{currentYear}</span><span><i className={styles.previousLegend} />{previousYear}</span></div>
    <svg className={styles.monthlyComparison} viewBox="0 0 600 230" role="img" aria-label={`Produção mensal de ${currentYear} e ${previousYear}, em reais. Dados disponíveis também na tabela mensal.`}>
      {[domain.min, (domain.min + domain.max) / 2, domain.max].map((tick, index) => <g key={index}><line x1="64" x2="564" y1={y(tick)} y2={y(tick)} className={styles.gridLine} /><text x="57" y={y(tick) + 4} textAnchor="end">{compact(tick)}</text></g>)}
      <line x1="64" x2="564" y1={y(0)} y2={y(0)} className={styles.zeroLine} />
      {(['current', 'previous'] as const).map(key => <g key={key} className={key === 'current' ? styles.currentLine : styles.previousLine}><path d={pathFor(key)} fill="none" strokeWidth="3" />{months.map((month, index) => month[key] != null && <circle key={month.month} cx={x(index)} cy={y(month[key]!)} r="4"><title>{MONTHS[month.month]}/{key === 'current' ? currentYear : previousYear}: {money(month[key])}</title></circle>)}</g>)}
      {months.map((month, index) => <text key={month.month} x={x(index)} y="216" textAnchor="middle">{MONTHS[month.month]}</text>)}
    </svg>
    <details className={styles.method}><summary>Ver valores mensais</summary><div className="table-scroll"><table><caption className="sr-only">Produção mensal comparada em reais</caption><thead><tr><th scope="col">Mês</th><th scope="col">{currentYear}</th><th scope="col">{previousYear}</th></tr></thead><tbody>{months.map(month => <tr key={month.month}><th scope="row">{MONTHS[month.month]}</th><td className="numeric">{money(month.current)}</td><td className="numeric">{money(month.previous)}</td></tr>)}</tbody></table></div></details>
  </figure>;
}
