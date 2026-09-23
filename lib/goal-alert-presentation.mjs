import { money, percent, MONTHS } from './analytics.mjs';
import { dashboardHeader, renderDashboardHtml, validateDashboard } from './portfolio-presentation.mjs';
import { goalVariance } from './goal-variance.mjs';
import { centralHeading, metricHeading } from './communication-header.mjs';

const LEVELS = { central: 'Central', cooperative: 'Cooperativa', pa: 'PA' };
const METRICS = { VN: 'Venda nova', AR: 'Arrecadação' };
const line = (value) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const dateLabel = (value) => value.split('-').reverse().join('/');
const recognition = 'Parabéns à equipe pelo resultado!';

function period(year, month) {
  if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 0 || month > 11)
    throw new Error('Selecione um mês e um ano válidos para o painel de metas atingidas.');
  return `${MONTHS[month]}/${year}`;
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

function detail(alert) {
  const monthLabel = period(alert?.year, alert?.month);
  const entity = alert?.entity;
  if (!entity || !Object.hasOwn(LEVELS, entity.kind) || !Object.hasOwn(METRICS, alert.metric)
    || !line(entity.id) || line(entity.id).length > 240 || !line(entity.name) || line(entity.name).length > 4000
    || !/^\d+$/.test(String(entity.central))
    || (entity.kind !== 'central' && !/^\d+$/.test(String(entity.cooperative)))
    || (entity.kind === 'pa' && !/^\d+$/.test(String(entity.pa)))
    || !Number.isFinite(alert.target) || alert.target <= 0 || !Number.isFinite(alert.actual)
    || Math.round(alert.actual * 100) < Math.round(alert.target * 100)
    || !Number.isFinite(alert.attainment) || alert.attainment < 0
    || !validDate(alert.cutoff) || !validDate(alert.cutoffMin) || alert.cutoffMin > alert.cutoff)
    throw new Error('Não foi possível montar o painel. Atualize os dados da meta atingida.');
  const scope = `${LEVELS[entity.kind]} ${entity.kind === 'central' ? entity.central : entity.kind === 'cooperative' ? entity.cooperative : entity.pa} · ${line(entity.name)}`;
  const hierarchy = entity.kind === 'central' ? '' : `Central ${entity.central}${entity.kind === 'pa' ? ` · Cooperativa ${entity.cooperative}` : ''}`;
  const cutoff = alert.cutoffMin === alert.cutoff ? `Dados até ${dateLabel(alert.cutoff)}.`
    : `Posições de ${dateLabel(alert.cutoffMin)} a ${dateLabel(alert.cutoff)}; cortes diferentes, sem posição única.`;
  const variance = goalVariance(alert.actual, alert.target);
  const cards = { type: 'cards', items: [
    { label: 'Meta do mês', value: money(alert.target) },
    { label: 'Realizado', value: money(alert.actual), support: `${percent(alert.attainment)} da meta`, accent: true },
    { label: variance.label, value: money(variance.value), support: variance.kind === 'growth' ? `${percent(variance.ratio)} acima da meta` : 'Meta do mês atingida' },
  ] };
  return { scope, hierarchy, cutoff, cards, monthLabel, metric: METRICS[alert.metric] };
}

/** Safe private presentation, shared by the email HTML and the local PNG renderer. */
export function buildGoalAlertPresentation(alert) {
  const values = detail(alert);
  const subject = line(`Meta atingida · ${values.metric} · ${values.monthLabel} | ${values.scope}`).slice(0, 300);
  const dashboard = validateDashboard({
    version: 2, year: alert.year, period: 'month', entityId: alert.entity.id,
    scope: values.scope, hierarchy: values.hierarchy, periodLabel: `Mensal · ${values.monthLabel}`,
    header: { centralName: centralHeading(alert.entity.central, alert.centralName || (alert.entity.kind === 'central' ? alert.entity.name : '')), metricLabel: metricHeading([alert.metric]) },
    greeting: '', opening: '', notes: [values.cutoff],
    blocks: [
      values.cards,
    ], footer: recognition, signature: '',
  });
  const header = dashboardHeader(dashboard);
  const text = [header.brand, header.centralName, header.periodLabel, [header.unitLabel, header.unitContext].filter(Boolean).join(' · '),
    values.cutoff, 'Meta mensal atingida.', '', `Meta do mês: ${money(alert.target)}`,
    `Realizado: ${money(alert.actual)} (${percent(alert.attainment)} da meta)`, `${values.cards.items[2].label}: ${values.cards.items[2].value}`, '', recognition].join('\n');
  return { subject, text, html: renderDashboardHtml(dashboard, subject), dashboard };
}

/** Preserve the caller's filtered list and order. Levels and metrics are never summed. */
export function buildGoalAlertsDashboard(alerts, { year, month, kindLabel = 'Todas as unidades' }) {
  const monthLabel = period(year, month);
  if (!Array.isArray(alerts) || !alerts.length) throw new Error('Não há metas atingidas neste filtro para gerar o painel.');
  // Keep the established image bound; a long selection must fail without dropping units.
  if (alerts.length * 3 > 80) throw new Error('Há muitas metas neste painel. Refine o filtro ou copie os painéis individuais. Nenhuma unidade foi removida da seleção.');
  const details = alerts.map((alert) => {
    if (alert.year !== year || alert.month !== month) throw new Error('A seleção contém metas de outro período. Atualize o filtro antes de gerar o painel.');
    return detail(alert);
  });
  const commonCutoff = details.every((values) => values.cutoff === details[0].cutoff) ? details[0].cutoff : '';
  const central = new Set(alerts.map(alert => alert.entity.central)).size === 1 ? alerts[0].entity.central : null;
  const centralName = centralHeading(central, central ? alerts.find(alert => alert.centralName)?.centralName || alerts.find(alert => alert.entity.kind === 'central')?.entity.name : '');
  const blocks = details.flatMap((values) => [
    { type: 'text', text: `${values.scope} · ${values.metric}${values.hierarchy ? ` · ${values.hierarchy}` : ''}`, tone: 'action' },
    ...(!commonCutoff ? [{ type: 'text', text: values.cutoff, tone: 'muted' }] : []),
    values.cards,
  ]);
  const dashboard = {
    version: 2, year, period: 'month', entityId: `metas-atingidas:${year}:${month + 1}`,
    scope: 'Metas atingidas no mês', hierarchy: line(kindLabel) || 'Todas as unidades', periodLabel: `Mensal · ${monthLabel}`,
    header: { centralName, metricLabel: metricHeading(alerts.map(alert => alert.metric)) },
    greeting: '', opening: `${alerts.length} ${alerts.length === 1 ? 'meta atingida' : 'metas atingidas'}.`,
    notes: commonCutoff ? [commonCutoff] : [],
    blocks, footer: 'Parabéns às equipes!', signature: '',
  };
  if (JSON.stringify(dashboard).length > 120000) throw new Error('O painel ficou muito extenso. Refine o filtro ou copie os painéis individuais.');
  return validateDashboard(dashboard);
}
