import { goalVariance } from './goal-variance.mjs';
import { periodTitle } from './periods.mjs';
import { money, percent } from './analytics.mjs';

const dateLabel = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value.split('-').reverse().join('/') : 'não informada';
const safeName = (value) => String(value ?? '').replace(/[\r\n*_~`]/g, ' ').trim();
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const kindLabel = { central: 'Central', cooperative: 'Cooperativa', pa: 'PA' };
export function scenarioTitle(report) {
  return periodTitle(report.period, report.month, report.year);
}

function cutoff(section) {
  return section.cutoffMin !== section.cutoff
    ? `Dados de ${dateLabel(section.cutoffMin)} a ${dateLabel(section.cutoff)} · cortes diferentes, sem posição única.`
    : `Dados até ${dateLabel(section.cutoff)}.`;
}
function warning(values) {
  if (!values.complete || values.annualConflict) return 'Há dados incompletos ou metas divergentes. Valide a base antes de concluir o resultado.';
  if (!(values.target > 0)) return 'Cadastre uma meta válida para avaliar o atingimento.';
  return '';
}
const attainmentLabel = (values) => values.complete && !values.annualConflict && values.target > 0
  ? `${percent(values.attainment)} da meta` : 'Sem avaliação';
function headline(values) {
  const variance = goalVariance(values.actual, values.target, values.complete && !values.annualConflict);
  const difference = variance.kind === 'met' ? 'Meta atingida'
    : variance.kind === 'unknown' ? 'Diferença sem avaliação'
    : `${variance.kind === 'growth' ? 'Crescimento' : 'GAP'}: ${money(variance.value)}`;
  return `Meta: ${money(values.target)} · Realizado: ${money(values.actual)} (${attainmentLabel(values)}) · ${difference}.`;
}
function projection(values) {
  return values.phase === 'Fechado' ? 'Resultado fechado no período.'
    : `Projeção: ${money(values.projected)} (${percent(values.projectedAttainment)} da meta).`;
}
function metricCards(values, annual, showProjection) {
  const variance = goalVariance(values.actual, values.target, values.complete && !values.annualConflict);
  const varianceSupport = variance.kind === 'growth'
    ? (variance.ratio == null ? 'Meta zero · sem base percentual' : `${percent(variance.ratio)} acima da meta`)
    : variance.kind === 'met' ? 'Meta do período atingida'
    : variance.kind === 'gap' && variance.ratio != null ? `${percent(variance.ratio)} da meta a realizar` : 'Dados insuficientes';
  const items = [
    { label: annual ? 'Meta anual' : 'Meta do período', value: money(values.target), support: values.phase },
    { label: 'Realizado informado', value: money(values.actual), support: attainmentLabel(values), accent: true },
    { label: variance.label, value: money(variance.value), support: varianceSupport },
  ];
  if (showProjection) items.push({ label: values.phase === 'Fechado' ? 'Fechamento apurado' : 'Projeção de fechamento', value: money(values.projected), support: values.phase === 'Fechado' ? 'Resultado fechado' : `${percent(values.projectedAttainment)} da meta · estimativa` });
  return { type: 'cards', items };
}

/** One presentation feeds HTML, text and PNG. Optional annual blocks use the existing v2 snapshot. */
export function buildPortfolioPresentation(report, { names = [], intro = '', signature = '', subject = '', showProjection = false, showAnnual = true } = {}) {
  const entity = report.entity;
  const scope = `${kindLabel[entity.kind]} ${entity.kind === 'central' ? entity.central : entity.kind === 'cooperative' ? entity.cooperative : entity.pa} · ${entity.name}`;
  const hierarchy = entity.kind === 'central' ? '' : `Central ${entity.central}${entity.kind === 'pa' ? ` · Cooperativa ${entity.cooperative}${entity.group ? ` · ${entity.group}` : ''}` : ''}`;
  const people = names.map(safeName).filter(Boolean);
  const greeting = people.length === 1 ? `Olá, ${people[0]}!` : people.length > 1 ? 'Olá, equipe!' : '';
  const selectedTitle = scenarioTitle(report);
  const title = subject.trim() || `${selectedTitle} | ${scope}`;
  const opening = intro.trim();
  const available = report.sections.filter((section) => section.available);
  const sameCutoff = available.length > 0 && available.every((section) => section.cutoff === available[0].cutoff && section.cutoffMin === available[0].cutoffMin);
  const notes = sameCutoff ? [cutoff(available[0])] : available.map((section) => `${section.label}: ${cutoff(section)}`);
  if (showProjection && report.uplift) notes.push(`Simulação de ritmo +${report.uplift}% somente na produção futura.`);
  if (report.period === 'daily') notes.push('Base mensal: visão de esforço diário. Não há realizado diário disponível.');
  const blocks = [], primaryText = [], primaryWhatsapp = [];
  let hasEffort = false;
  for (const section of report.sections) {
    blocks.push({ type: 'heading', text: section.label });
    if (!section.available) {
      const text = 'Sem dados cadastrados para este indicador nesta unidade.';
      blocks.push({ type: 'text', text, tone: 'warning' });
      primaryText.push('', section.label, text); primaryWhatsapp.push('', `*${section.label}*`, text);
      continue;
    }
    const values = section.current;
    const individual = entity.kind === 'central' && section.childCount > 1
      ? `GAP das cooperativas: ${money(section.individualGap)} · sem compensar a superação de outras unidades.` : '';
    const priorities = section.priorities.map((item) => `${item.name}: ${money(item.gap)}`).join('; ');
    const details = [...(individual ? [individual] : []), ...(priorities ? [`Maiores GAPs: ${priorities}.`] : [])];
    if (warning(values)) details.push(warning(values));
    if (values.requiredDaily > 0) {
      details.push(`Necessário por dia útil: ${money(values.requiredDaily)}.`);
      hasEffort = true;
    }
    primaryText.push('', `${section.label} · ${values.phase}`, headline(values), ...(showProjection ? [projection(values)] : []), ...details);
    primaryWhatsapp.push('', `*${section.label} · ${values.phase}*`, headline(values), ...(showProjection ? [projection(values)] : []), ...details);
    blocks.push(metricCards(values, report.period === 'annual', showProjection));
    for (const text of details) blocks.push({ type: 'text', text, tone: text === warning(values) ? 'warning' : 'body' });
  }
  const annual = [];
  if (showAnnual && report.period !== 'annual') {
    blocks.push({ type: 'heading', text: `Cenário anual · ${report.year}` });
    annual.push('', `Cenário anual · ${report.year}`);
    for (const section of report.sections) {
      blocks.push({ type: 'heading', text: `${section.label} · ano` });
      if (!section.available) {
        const text = `${section.label}: sem dados cadastrados.`;
        blocks.push({ type: 'text', text, tone: 'warning' }); annual.push(text); continue;
      }
      const values = section.annual;
      blocks.push(metricCards(values, true, showProjection));
      if (warning(values)) blocks.push({ type: 'text', text: warning(values), tone: 'warning' });
      annual.push(`${section.label} · ${values.phase}`, headline(values), ...(showProjection ? [projection(values)] : []), ...(warning(values) ? [warning(values)] : []));
    }
  }
  const hasMissing = available.some((section) => [section.current, ...(showAnnual && report.period !== 'annual' ? [section.annual] : [])]
    .some((values) => values.target == null || values.actual == null));
  const footer = [showProjection ? 'Projeções são estimativas.' : '', hasEffort ? 'Dias úteis sem descontar feriados.' : '', hasMissing ? '— = dado não informado.' : ''].filter(Boolean).join(' ');
  const dashboard = { version: 2, year: report.year, period: report.period, entityId: entity.id,
    scope, hierarchy, periodLabel: selectedTitle, greeting, opening, notes, blocks, footer, signature: signature.trim() };
  const header = [scope, hierarchy, selectedTitle, ...notes].filter(Boolean);
  const end = [...(footer ? ['', footer] : []), ...(signature.trim() ? ['', signature.trim()] : [])];
  const text = [...(greeting ? [greeting, ''] : []), ...header, ...(opening ? ['', opening] : []), ...primaryText, ...annual, ...end].join('\n');
  const whatsapp = [...(greeting ? [greeting, ''] : []), `*${safeName(scope)}*`, ...(hierarchy ? [hierarchy] : []), `*${selectedTitle}*`, ...notes, ...(opening ? ['', opening] : []), ...primaryWhatsapp, ...annual, ...end].join('\n');
  return { subject: title, text, whatsapp, dashboard, html: renderDashboardHtml(dashboard, title) };
}

/** Bound untrusted saved models before allocating a canvas. Canvas only draws strings. */
export function validateDashboard(model) {
  const string = (v, max = 5000) => typeof v === 'string' && v.length <= max;
  const strings = (v, maxCount, maxLength = 5000) => Array.isArray(v) && v.length <= maxCount && v.every((s) => string(s, maxLength));
  if (!model || model.version !== 2 || !Number.isInteger(model.year) || model.year < 2020 || model.year > 2100
    || !['daily','month','quarter','semester','annual','ytd'].includes(model.period)
    || !string(model.entityId, 240) || !['scope','hierarchy','periodLabel','greeting','opening','footer','signature'].every((key) => string(model[key]))
    || !strings(model.notes, 8) || !Array.isArray(model.blocks) || model.blocks.length > 80 || JSON.stringify(model).length > 120000) throw new Error('Painel salvo inválido. Gere novamente o cenário.');
  for (const b of model.blocks) {
    if (!b || typeof b !== 'object') throw new Error('Bloco de painel inválido.');
    const valid = b.type === 'heading' ? string(b.text, 400)
      : b.type === 'text' ? string(b.text) && ['body','muted','action','warning'].includes(b.tone)
      : b.type === 'cards' ? Array.isArray(b.items) && b.items.length > 0 && b.items.length <= 8 && b.items.every((i) => i && string(i.label, 200) && string(i.value, 400) && (!Object.hasOwn(i, 'support') || string(i.support, 400)) && (!Object.hasOwn(i, 'accent') || typeof i.accent === 'boolean'))
      : b.type === 'table' ? string(b.title, 400) && strings(b.headers, 4, 200) && b.headers.length === 4 && Array.isArray(b.rows) && b.rows.length <= 12 && b.rows.every((row) => strings(row, 4, 400) && row.length === 4)
      : b.type === 'secondary' ? model.period !== 'annual' && string(b.title, 400) && strings(b.lines, 2)
      : false;
    if (!valid) throw new Error('Bloco de painel inválido.');
  }
  return model;
}
const monetaryValue = (value) => /^[−-]?R\$\s*[−-]?\d[\d.,]*$/.test(String(value));
// Conservative Arial-bold width in em; the inline fallback also fits Outlook without head CSS.
function moneyWidthEm(value) {
  return [...String(value)].reduce((width, char) => width + (/\d/.test(char) ? .557 : /[.,\s]/.test(char) ? .279 : /[−-]/.test(char) ? .334 : char === 'R' ? .723 : char === '$' ? .557 : .7), 0) * 1.08;
}
const p = (text, style = '') => `<p style="margin:8px 0;line-height:1.5;${style}">${escape(text).replace(/\n/g, '<br>')}</p>`;
export function renderDashboardHtml(model, subject = '') {
  validateDashboard(model);
  const responsiveStyles = [];
  let rowId = 0;
  const body = model.blocks.map((b) => {
    if (b.type === 'heading') return `<h2 style="font-size:21px;margin:18px 0 8px;color:#003641">${escape(b.text)}</h2>`;
    if (b.type === 'text') return p(b.text, b.tone === 'action' ? 'padding:14px;background:#e6f6f2;border-left:4px solid #00ae9d;font-weight:600;' : b.tone === 'warning' ? 'padding:12px;background:#fff8e7;color:#704700;' : b.tone === 'muted' ? 'font-size:12px;color:#435c60;' : '');
    if (b.type === 'cards') {
      const rows = [];
      for (let index = 0; index < b.items.length;) {
        const groupEnd = index < 3 ? Math.min(3, b.items.length) : b.items.length;
        let columns = Math.min(3, groupEnd - index);
        const widthUnits = (items) => Math.max(1, ...items.filter((item) => monetaryValue(item.value)).map((item) => moneyWidthEm(item.value)));
        // Exceptionally large legacy values receive more room instead of smaller-than-readable type.
        while (columns > 1 && widthUnits(b.items.slice(index, index + columns)) * 18 > 600 / columns - 26) columns--;
        const items = b.items.slice(index, index + columns);
        const units = widthUnits(items);
        const secondary = index >= 3 && items.length === 1 && units * 18 <= 196;
        const available = secondary ? 196 : 600 / columns - 26;
        const rowValueSize = Math.max(18, Math.min(26, Math.floor(available / units)));
        const rowClass = `metric-row-${rowId++}`;
        const stackAt = Math.max(359, Math.ceil(columns * (units * 18 + 18) + 46));
        const fluidVw = (100 / (columns * units)).toFixed(4);
        const fluidPx = ((46 / columns + 18) / units).toFixed(4);
        responsiveStyles.push(`@media(max-width:679px){.${rowClass} .metric-value{font-size:clamp(18px,calc(${fluidVw}vw - ${fluidPx}px),${rowValueSize}px)!important}}`);
        if (columns > 1) responsiveStyles.push(`@media(max-width:${stackAt}px){.${rowClass}>tbody>tr>.metric-cell{display:block!important;width:auto!important}.${rowClass} .metric-label{min-height:0!important}.${rowClass} .metric-value{font-size:clamp(18px,calc(${(100 / units).toFixed(4)}vw - ${(82 / units).toFixed(4)}px),26px)!important}}`);
        const cells = items.map((item) => {
          const money = monetaryValue(item.value);
          const label = `<div class="metric-label" style="${secondary ? '' : 'min-height:36px;'}font-size:13px;line-height:1.35;color:${item.accent ? '#c4dedf' : '#435c60'}">${escape(item.label)}</div>`;
          const value = `<strong class="metric-value"${money ? ' data-money="true"' : ''} style="display:block;margin:${secondary ? '4px' : '6px'} 0;font-size:${money ? rowValueSize : 26}px;line-height:1.2;color:${item.accent ? '#ffffff' : '#003641'};${money ? 'white-space:nowrap;word-break:normal;overflow-wrap:normal;word-wrap:normal;' : 'overflow-wrap:anywhere;word-wrap:break-word;word-break:break-word;'}">${escape(item.value)}</strong>`;
          const support = item.support ? `<div class="metric-support" style="font-size:14px;line-height:1.4;font-weight:${item.accent ? '600' : '400'};color:${item.accent ? '#ffffff' : '#435c60'};overflow-wrap:anywhere">${escape(item.support)}</div>` : '';
          const content = secondary ? `<table class="metric-projection" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed"><tr><td width="30%" valign="top" style="padding-right:12px">${label}</td><td width="38%" valign="top" style="padding-right:12px">${value}</td><td width="32%" valign="top">${support}</td></tr></table>` : `${label}${value}${support}`;
          return `<td class="metric-cell" data-metric="${escape(item.label)}" width="${100 / items.length}%" valign="top" style="width:${100 / items.length}%;padding:${secondary ? '10px 12px' : '12px'};border:1px solid #dbe8e5;background:${item.accent ? '#003641' : '#ffffff'};overflow-wrap:anywhere">${content}</td>`;
        });
        rows.push(`<table data-layout="metric-cards" data-columns="${items.length}" class="${rowClass}" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;table-layout:fixed;${index ? 'margin-top:8px;' : ''}"><tr>${cells.join('')}</tr></table>`);
        index += columns;
      }
      return rows.join('');
    }
    if (b.type === 'secondary') return `<div data-section="annual-support" style="margin-top:26px;padding:14px;background:#f4f6f5;border-top:1px solid #dbe8e5;font-size:12px;color:#435c60"><h3 style="font-size:13px;margin:0 0 8px">${escape(b.title)}</h3>${b.lines.map((line) => p(line)).join('')}</div>`;
    return `<h3 style="font-size:15px;margin:20px 0 8px">${escape(b.title)}</h3><table width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed;border-collapse:collapse;font-size:11px"><thead><tr style="background:#003641;color:#fff">${b.headers.map((label) => `<th align="left" style="padding:8px;overflow-wrap:anywhere">${escape(label)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((row) => `<tr>${row.map((v) => `<td style="padding:8px;border-bottom:1px solid #dbe8e5;overflow-wrap:anywhere">${escape(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject || model.scope)}</title><style>@media(max-width:480px){.panel-content{padding:14px!important}.metric-cell{padding:12px 8px!important}.metric-label{font-size:12px!important;min-height:36px!important}.metric-support{font-size:13px!important}}@media(max-width:620px){.metric-projection td{display:block!important;width:auto!important;padding-right:0!important}.metric-projection .metric-label{min-height:0!important}}${responsiveStyles.join('')}</style></head><body style="margin:0;background:#f0f5f3;font-family:Arial,sans-serif;color:#003641"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:16px 8px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fff"><tr><td style="padding:20px 22px;background:#003641;color:#fff"><p style="font-size:12px;margin:0 0 8px;color:#8fdbcf">GESTÃO COMERCIAL</p><h1 style="font-size:25px;margin:0 0 10px;overflow-wrap:anywhere">${escape(model.scope)}</h1><p style="font-size:19px;margin:0;font-weight:700">${escape(model.periodLabel)}</p>${model.hierarchy ? `<p style="font-size:12px;margin:8px 0 0">${escape(model.hierarchy)}</p>` : ''}${model.notes.map((note) => p(note, 'font-size:12px;color:#c4dedf;margin:6px 0 0;')).join('')}</td></tr><tr><td class="panel-content" style="padding:22px;overflow-wrap:anywhere">${model.greeting ? p(model.greeting) : ''}${model.opening ? p(model.opening) : ''}${body}${model.footer ? p(model.footer, 'font-size:11px;color:#435c60;') : ''}${model.signature ? p(model.signature) : ''}</td></tr></table></td></tr></table></body></html>`;
}
