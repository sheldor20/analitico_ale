import { money, percent } from './analytics.mjs';
import { attainmentBand } from './attainment.mjs';
import { centralHeading, communicationBrand, metricHeading } from './communication-header.mjs';
import { PERIOD_ORDER_OPTIONS, sortPerformancePeriods } from './period-performance-order.mjs';

export const PERIOD_SHARE_PAGE_SIZE = 12;
const PERIODS = { all: 'Resultados por período', month: 'Resultados mensais', quarter: 'Resultados trimestrais', semester: 'Resultados semestrais', annual: 'Resultado anual' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('/') : 'não informada';
const amount = value => value == null ? '—' : money(value);
export const periodShareCutoff = value => value.cutoffMin && value.cutoffMin !== value.cutoff ? `Cortes: ${date(value.cutoffMin)} a ${date(value.cutoff)}` : `Corte: ${date(value.cutoff)}`;
const differenceLabel = row => row.variance.kind === 'growth' ? 'Superação' : row.variance.kind === 'gap' ? 'GAP' : row.variance.kind === 'met' ? row.target === 0 ? 'Meta zero' : 'Na meta' : 'Sem avaliação';
const attainmentLabel = value => value == null ? 'Sem avaliação' : `${percent(value)} da meta`;
const widthEm = value => [...value].reduce((width, char) => width + (/\d/.test(char) ? .70 : /[.,]/.test(char) ? .38 : /\s/.test(char) ? .35 : char === '−' ? .84 : char === '-' ? .42 : char === 'R' ? .78 : char === '$' ? .70 : .84), 0) * 1.02;
const size = value => Math.max(14, Math.min(18, Math.floor(235 / widthEm(value))));

function renderHtml(report) {
  const numberWidth = report.showProjection ? 19 : 23, identityWidth = report.showProjection ? 24 : 31;
  const moneyValues = report.rows.flatMap(row => [row.target, row.actual, row.variance.value, ...(report.showProjection ? [row.projected] : [])]).map(amount);
  const widest = Math.max(1, ...moneyValues.map(value => widthEm(value) * size(value)));
  const stackAt = Math.max(720, Math.ceil((widest + 24) / (numberWidth / 100) + 64));
  const detail = text => `<div style="font-size:12px;line-height:1.4;margin-top:3px;overflow-wrap:anywhere">${escape(text)}</div>`;
  const cell = (value, label, support = '', band = null) => {
    const formatted = amount(value);
    return `<td class="period-share-number" data-label="${escape(label)}"${band ? ` data-attainment-band="${band.key}"` : ''} style="width:${numberWidth}%;padding:8px 12px;border-bottom:1px solid #dbe8e5;text-align:right;color:${band?.color || '#003641'};background:${band?.background || '#ffffff'}"><span class="period-share-mobile" style="display:none;font-size:12px">${escape(label)}</span><strong data-money="${value != null}" style="font-size:${size(formatted)}px;line-height:1.4;white-space:nowrap;word-break:normal;overflow-wrap:normal;font-variant-numeric:tabular-nums">${escape(formatted)}</strong>${support ? detail(support) : ''}</td>`;
  };
  const rows = report.rows.map(row => `<tr data-period-share-id="${escape(row.id)}"><th scope="row" class="period-share-identity" style="width:${identityWidth}%;padding:8px 12px;text-align:left;vertical-align:top;border-bottom:1px solid #dbe8e5;overflow-wrap:anywhere"><strong style="font-size:15px">${escape(row.label)}</strong>${detail(row.phaseLabel)}${row.cutoff === report.cutoff && row.cutoffMin === report.cutoffMin ? '' : detail(periodShareCutoff(row))}</th>${cell(row.target, 'Meta')}${cell(row.actual, 'Realizado / atingimento', attainmentLabel(row.attainment), attainmentBand(row.attainment))}${cell(row.variance.value, 'GAP ou superação', differenceLabel(row))}${report.showProjection ? cell(row.projected, 'Projeção de produção', attainmentLabel(row.projectedAttainment)) : ''}</tr>`).join('');
  const headers = ['Período', 'Meta', 'Realizado / atingimento', 'GAP ou superação', ...(report.showProjection ? ['Projeção de produção'] : [])];
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(report.subject)}</title><style>@media(max-width:${stackAt}px){.period-share-head{display:none!important}.period-share-table,.period-share-table tbody,.period-share-table tr,.period-share-table th,.period-share-table td{display:block!important;width:auto!important}.period-share-table tr{margin-bottom:10px;border:1px solid #dbe8e5}.period-share-table .period-share-number{text-align:left!important;padding:6px 10px!important}.period-share-table .period-share-identity{padding:10px!important;background:#f0f5f3}.period-share-mobile{display:block!important}.period-share-content{padding:12px!important}}</style></head><body style="margin:0;background:#f0f5f3;color:#003641;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:12px 8px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:${report.showProjection ? 1360 : 1120}px;background:#ffffff"><tr><td data-communication-header style="padding:14px 20px;background:#003641;color:#ffffff"><p style="margin:0 0 5px;font-size:12px;color:#8fdbcf">${escape(report.brand)}</p><h1 style="margin:0 0 5px;font-size:23px;line-height:1.3;overflow-wrap:anywhere">${escape(report.centralName)}</h1><p style="margin:0;font-size:16px;font-weight:bold">${escape(report.periodLabel)}</p></td></tr><tr><td class="period-share-content" style="padding:12px 20px"><div data-communication-context style="font-size:13px;line-height:1.5;overflow-wrap:anywhere"><strong>${escape(report.scopeLabel)}</strong><br>${escape(periodShareCutoff(report))} · ${escape(report.orderLabel)}</div><table data-period-scenario class="period-share-table" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-collapse:collapse;margin-top:12px"><thead class="period-share-head"><tr style="background:#003641;color:#ffffff">${headers.map((label, index) => `<th scope="col" width="${index ? numberWidth : identityWidth}%" align="${index ? 'right' : 'left'}" style="padding:9px 12px;font-size:13px">${escape(label)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>${report.notes.map(note => `<p style="font-size:12px;line-height:1.5;color:#435c60;margin:8px 0 0">${escape(note)}</p>`).join('')}</td></tr></table></td></tr></table></body></html>`;
}

/** Consume the exact displayed cohort and figures; never reapply status/search per period. */
export function buildPeriodPerformanceShare({ model, period = 'all', order = 'chronological', showProjection = false, centralName }) {
  if (!model || !Number.isInteger(model.year) || model.year < 2020 || model.year > 2100 || !['VN', 'AR'].includes(model.metric) || !model.count || !Array.isArray(model.units) || !Array.isArray(model.groups)
    || !Object.hasOwn(PERIODS, period) || !Object.hasOwn(PERIOD_ORDER_OPTIONS, order) || typeof showProjection !== 'boolean') throw new Error('Selecione um cenário por período válido para compartilhar.');
  const selectedGroups = model.groups.filter(group => period === 'all' || group.period === period);
  const rows = selectedGroups.flatMap(group => sortPerformancePeriods(group.rows, order).map(row => ({ ...row, variance: { ...row.variance } })));
  if (!rows.length || rows.length > 19 || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Não há períodos válidos para compartilhar.');
  const centralIds = new Set(model.units.map(unit => unit.central));
  const central = centralIds.size === 1 ? [...centralIds][0] : null;
  const headerName = clean(centralName || centralHeading(central, central ? model.units.find(unit => unit.kind === 'central')?.name : ''));
  const periodLabel = `${PERIODS[period]} · ${model.year}`;
  const notes = [`Mesmas unidades em todos os períodos: ${model.countLabel}. A ordem foi mantida dentro de cada grupo.`, 'Realizado até a data de corte. — indica dado não informado ou sem avaliação.'];
  if (showProjection) notes.push(`Projeção de produção é estimativa pelo ritmo até o corte e metas restantes; considera dias úteis, sem descontar feriados. Coincide com o realizado nos períodos fechados.${model.uplift > 0 ? ` Simulação de ritmo +${model.uplift}% somente na produção futura.` : ''}`);
  const metadata = { year: model.year, metric: model.metric, brand: communicationBrand(metricHeading([model.metric])), centralName: headerName, scopeLabel: clean(model.scopeLabel), unitLabel: clean(model.scopeLabel), periodLabel, period, order, orderLabel: PERIOD_ORDER_OPTIONS[order], notes, cutoffMin: model.cutoffMin, cutoff: model.cutoff, showProjection };
  const total = Math.ceil(rows.length / PERIOD_SHARE_PAGE_SIZE);
  const parts = Array.from({ length: total }, (_, index) => ({ ...metadata, index: index + 1, total, from: index * PERIOD_SHARE_PAGE_SIZE + 1, to: Math.min((index + 1) * PERIOD_SHARE_PAGE_SIZE, rows.length), rows: rows.slice(index * PERIOD_SHARE_PAGE_SIZE, (index + 1) * PERIOD_SHARE_PAGE_SIZE) }));
  const subject = clean(`${periodLabel} · ${model.metric === 'AR' ? 'Arrecadação' : 'Venda nova'} | ${model.scopeLabel}`).slice(0, 300);
  const caption = [metadata.brand, headerName, periodLabel, metadata.scopeLabel, `${periodShareCutoff(model)} · ${metadata.orderLabel}`, `${rows.length} períodos${showProjection ? ' · inclui projeção, separada do realizado' : ''}.`].join('\n');
  const text = [caption, '', ...rows.map(row => `${row.label} · ${row.phaseLabel} | Meta: ${amount(row.target)} | Realizado: ${amount(row.actual)} (${attainmentLabel(row.attainment)}) | ${differenceLabel(row)}: ${amount(row.variance.value)}${showProjection ? ` | Projeção de produção: ${amount(row.projected)} (${attainmentLabel(row.projectedAttainment)})` : ''}${row.cutoff === metadata.cutoff && row.cutoffMin === metadata.cutoffMin ? '' : ` | ${periodShareCutoff(row)}`}`), '', ...notes].join('\n');
  const report = { ...metadata, count: rows.length, rows, parts, subject, caption, text, whatsapp: text };
  return { ...report, html: renderHtml(report) };
}
