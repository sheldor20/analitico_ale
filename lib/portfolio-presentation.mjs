import { money, percent, MONTHS } from './analytics.mjs';

const dateLabel = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value.split('-').reverse().join('/') : 'não informada';
const safeName = (value) => String(value ?? '').replace(/[\r\n*_~`]/g, ' ').trim();
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const kindLabel = { central: 'Central', cooperative: 'Cooperativa', pa: 'PA' };
const method = 'Projeções são estimativas. Dias úteis sem feriados. Dados ausentes não são zero.';

export function scenarioTitle(report) {
  const { period, month, year } = report;
  if (period === 'annual') return `Anual · ${year}`;
  if (period === 'quarter') return `${Math.floor(month / 3) + 1}º trimestre · ${year}`;
  if (period === 'semester') return `${Math.floor(month / 6) + 1}º semestre · ${year}`;
  if (period === 'ytd') return `Acumulado · JAN–${MONTHS[month]}/${year}`;
  return `${period === 'daily' ? 'Esforço diário' : 'Mensal'} · ${MONTHS[month]}/${year}`;
}
function cutoff(section) {
  return section.cutoffMin !== section.cutoff
    ? `Posições de ${dateLabel(section.cutoffMin)} a ${dateLabel(section.cutoff)}; cortes diferentes, sem posição única.`
    : `Posição em ${dateLabel(section.cutoff)}.`;
}
function warning(values) {
  if (!values.complete || values.annualConflict) return 'Há dados incompletos ou metas divergentes. Valide a base antes de concluir o resultado.';
  if (!(values.target > 0)) return 'Cadastre uma meta válida para avaliar o atingimento.';
  return '';
}
export function commercialAction(section, kind) {
  const v = section.current;
  if (warning(v)) return 'Atualize os dados pendentes para direcionar a atuação comercial.';
  if (v.gap === 0) return kind === 'central' && section.individualGap > 0
    ? 'Consolidado na meta. Concentre a atuação nas cooperativas que ainda têm saldo a produzir.'
    : 'Meta atingida. Mantenha as ofertas e avance nas oportunidades para ampliar o resultado.';
  if (v.phase === 'Fechado') return 'Período encerrado abaixo da meta. Retome as propostas pendentes e priorize a recuperação no próximo ciclo.';
  const effort = v.requiredDaily > 0 ? ` Busque ${money(v.requiredDaily)} por dia útil restante.` : '';
  return v.projectedAttainment >= 1
    ? 'Mantenha o ritmo de ofertas e acompanhe as propostas até a conclusão.'
    : `Priorize as oportunidades em negociação e os retornos pendentes.${effort}`;
}
function headline(v) {
  if (!v.complete || v.annualConflict || !(v.target > 0)) return `Realizado informado: ${money(v.actual)}. Meta: ${money(v.target)}. Atingimento: ${percent(v.attainment)}.`;
  return `Realizamos ${money(v.actual)} de ${money(v.target)} (${percent(v.attainment)}). ${v.gap === 0 ? 'Meta atingida.' : `Faltam ${money(v.gap)} para a meta.`}`;
}
function projection(v) {
  // Closed periods have no future production to project.
  return v.phase === 'Fechado' ? 'Resultado fechado no período.'
    : `Projeção: ${money(v.projected)} (${percent(v.projectedAttainment)} da meta).`;
}
function annualLine(section) {
  if (!section.available) return `${section.label}: sem dados cadastrados.`;
  const a = section.annual;
  return `${section.label}: meta ${money(a.target)}; realizado ${money(a.actual)} (${percent(a.attainment)}); projeção ${money(a.projected)}; saldo ${money(a.gap)}.${warning(a) ? ` ${warning(a)}` : ''}`;
}

/** A single safe presentation model feeds email HTML and the WhatsApp PNG. No HTML is stored in it. */
export function buildPortfolioPresentation(report, { names = [], intro = '', signature = '', subject = '' } = {}) {
  const entity = report.entity;
  const scope = `${kindLabel[entity.kind]} ${entity.kind === 'central' ? entity.central : entity.kind === 'cooperative' ? entity.cooperative : entity.pa} · ${entity.name}`;
  const hierarchy = `Central ${entity.central}${entity.cooperative ? ` · Cooperativa ${entity.cooperative}` : ''}${entity.kind === 'pa' ? ` · PA ${entity.pa}${entity.group ? ` · ${entity.group}` : ''}` : ''}`;
  const people = names.map(safeName).filter(Boolean);
  const greeting = people.length === 1 ? `Olá, ${people[0]}!` : 'Olá, equipe!';
  const selectedTitle = scenarioTitle(report);
  const title = subject.trim() || `${selectedTitle} | ${scope}`;
  const opening = intro.trim() || `Segue o resultado de ${scope}. Vamos às prioridades comerciais do período.`;
  const notes = [];
  if (report.uplift) notes.push(`Simulação de ritmo +${report.uplift}% somente na produção futura.`);
  if (report.period === 'daily') notes.push('Base mensal: visão de esforço diário. Não há realizado diário disponível.');
  const blocks = [];
  const primaryText = [];
  const primaryWhatsapp = [];
  for (const section of report.sections) {
    blocks.push({ type: 'heading', text: section.label });
    if (!section.available) {
      const text = 'Sem dados cadastrados para este indicador nesta unidade.';
      blocks.push({ type: 'text', text, tone: 'warning' });
      primaryText.push('', section.label, text); primaryWhatsapp.push('', `*${section.label}*`, text);
      continue;
    }
    const v = section.current;
    const position = `${cutoff(section)} ${v.phase}.`;
    const action = `Foco comercial: ${commercialAction(section, entity.kind)}`;
    const individual = entity.kind === 'central' && section.childCount > 1
      ? `Saldo para todas as ${section.childCount} cooperativas: ${money(section.individualGap)} (não compensado pela superação de outras unidades).` : '';
    const priorities = section.priorities.map((item) => `${item.name}: ${money(item.gap)}`).join('; ');
    const details = [projection(v), ...(individual ? [individual] : []), ...(priorities ? [`Priorize: ${priorities}.`] : [])];
    if (warning(v)) details.push(warning(v));
    primaryText.push('', section.label, position, headline(v), ...details, action);
    primaryWhatsapp.push('', `*${section.label}*`, position, headline(v), ...details, action);
    blocks.push({ type: 'text', text: position, tone: 'muted' });
    blocks.push({ type: 'cards', items: [
      { label: report.period === 'annual' ? 'Meta anual' : 'Meta do período', value: money(v.target) },
      { label: 'Realizado informado', value: money(v.actual) },
      { label: 'Atingimento', value: percent(v.attainment) },
      { label: v.phase === 'Fechado' ? 'Fechamento apurado' : 'Projeção de fechamento', value: money(v.projected) },
      { label: 'Saldo para a meta', value: money(v.gap) },
      { label: 'Necessário por dia útil', value: money(v.requiredDaily) },
    ] });
    for (const text of details) blocks.push({ type: 'text', text, tone: text === warning(v) ? 'warning' : 'body' });
    blocks.push({ type: 'text', text: action, tone: 'action' });
    const first = Number(v.start.slice(5, 7)) - 1, last = Number(v.end.slice(5, 7));
    blocks.push({ type: 'table', title: 'Evolução do período', headers: ['Mês', 'Meta', 'Realizado', 'Posição'],
      rows: section.monthly.slice(first, last).map((m) => [m.label, money(m.target), money(m.actual), m.phase]) });
  }
  // All primary indicators precede the annual support, including when both metrics are selected.
  const annual = report.period === 'annual' ? [] : report.sections.map(annualLine);
  if (annual.length) blocks.push({ type: 'secondary', title: `Apoio anual · ${report.year}`, lines: annual });
  const dashboard = { version: 2, year: report.year, period: report.period, entityId: entity.id,
    scope, hierarchy, periodLabel: selectedTitle, greeting, opening, notes, blocks, footer: method, signature: signature.trim() };
  const support = annual.length ? ['', `Apoio anual · ${report.year}`, ...annual] : [];
  const end = ['', method, ...(signature.trim() ? ['', signature.trim()] : [])];
  const text = [greeting, '', opening, hierarchy, `Período: ${selectedTitle}.`, ...notes, ...primaryText, ...support, ...end].join('\n');
  const whatsapp = [greeting, '', `*${safeName(scope)}*`, hierarchy, `*${selectedTitle}*`, ...(intro.trim() ? [intro.trim()] : []), ...notes, ...primaryWhatsapp, ...support, ...end].join('\n');
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
      : b.type === 'cards' ? Array.isArray(b.items) && b.items.length > 0 && b.items.length <= 8 && b.items.every((i) => i && string(i.label, 200) && string(i.value, 400))
      : b.type === 'table' ? string(b.title, 400) && strings(b.headers, 4, 200) && b.headers.length === 4 && Array.isArray(b.rows) && b.rows.length <= 12 && b.rows.every((row) => strings(row, 4, 400) && row.length === 4)
      : b.type === 'secondary' ? model.period !== 'annual' && string(b.title, 400) && strings(b.lines, 2)
      : false;
    if (!valid) throw new Error('Bloco de painel inválido.');
  }
  return model;
}
const p = (text, style = '') => `<p style="margin:10px 0;line-height:1.55;${style}">${escape(text).replace(/\n/g, '<br>')}</p>`;
export function renderDashboardHtml(model, subject = '') {
  validateDashboard(model);
  const body = model.blocks.map((b) => {
    if (b.type === 'heading') return `<h2 style="font-size:23px;margin:26px 0 10px;color:#003641">${escape(b.text)}</h2>`;
    if (b.type === 'text') return p(b.text, b.tone === 'action' ? 'padding:14px;background:#e6f6f2;border-left:4px solid #00ae9d;font-weight:600;' : b.tone === 'warning' ? 'padding:12px;background:#fff8e7;color:#704700;' : b.tone === 'muted' ? 'font-size:12px;color:#435c60;' : '');
    if (b.type === 'cards') {
      const cells = b.items.map((i) => `<td width="50%" valign="top" style="padding:14px;border:1px solid #dbe8e5;background:#f5faf8"><div style="font-size:12px;color:#435c60">${escape(i.label)}</div><strong style="display:block;font-size:22px;line-height:1.4;color:#003641;overflow-wrap:anywhere">${escape(i.value)}</strong></td>`);
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;table-layout:fixed">${cells.map((c, i) => i % 2 === 0 ? `<tr>${c}${cells[i + 1] || '<td></td>'}</tr>` : '').join('')}</table>`;
    }
    if (b.type === 'secondary') return `<div data-section="annual-support" style="margin-top:26px;padding:14px;background:#f4f6f5;border-top:1px solid #dbe8e5;font-size:12px;color:#435c60"><h3 style="font-size:13px;margin:0 0 8px">${escape(b.title)}</h3>${b.lines.map((line) => p(line)).join('')}</div>`;
    return `<h3 style="font-size:15px;margin:20px 0 8px">${escape(b.title)}</h3><table width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed;border-collapse:collapse;font-size:11px"><thead><tr style="background:#003641;color:#fff">${b.headers.map((label) => `<th align="left" style="padding:8px;overflow-wrap:anywhere">${escape(label)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((row) => `<tr>${row.map((v) => `<td style="padding:8px;border-bottom:1px solid #dbe8e5;overflow-wrap:anywhere">${escape(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject || model.scope)}</title></head><body style="margin:0;background:#f0f5f3;font-family:Arial,sans-serif;color:#003641"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:16px 8px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fff"><tr><td style="padding:24px;background:#003641;color:#fff"><p style="font-size:12px;margin:0 0 8px;color:#8fdbcf">GESTÃO COMERCIAL</p><h1 style="font-size:25px;margin:0 0 10px;overflow-wrap:anywhere">${escape(model.scope)}</h1><p style="font-size:19px;margin:0;font-weight:700">${escape(model.periodLabel)}</p><p style="font-size:12px;margin:10px 0 0">${escape(model.hierarchy)}</p></td></tr><tr><td style="padding:22px;overflow-wrap:anywhere">${p(model.greeting)}${p(model.opening)}${model.notes.map((n) => p(n, 'font-size:12px;')).join('')}${body}${p(model.footer, 'font-size:11px;color:#435c60;')}${model.signature ? p(model.signature) : ''}</td></tr></table></td></tr></table></body></html>`;
}
