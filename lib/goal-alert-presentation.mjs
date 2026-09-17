import { money, percent, MONTHS } from './analytics.mjs';
import { renderDashboardHtml, validateDashboard } from './portfolio-presentation.mjs';

const LEVELS = { central: 'Central', cooperative: 'Cooperativa', pa: 'PA' };
const METRICS = { VN: 'Venda nova', AR: 'Arrecadação' };
const line = (value) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const dateLabel = (value) => value.split('-').reverse().join('/');
const recognition = 'Meta mensal atingida. Parabéns à equipe pelo resultado!';
const footer = 'Valores realizados informados na base.';

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
  const hierarchy = `Central ${entity.central}${entity.kind !== 'central' ? ` · Cooperativa ${entity.cooperative}` : ''}${entity.kind === 'pa' ? ` · PA ${entity.pa}` : ''}`;
  const cutoff = alert.cutoffMin === alert.cutoff ? `Dados até ${dateLabel(alert.cutoff)}.`
    : `Posições de ${dateLabel(alert.cutoffMin)} a ${dateLabel(alert.cutoff)}; cortes diferentes, sem posição única.`;
  const cards = { type: 'cards', items: [
    { label: 'Meta do mês', value: money(alert.target), support: monthLabel },
    { label: 'Realizado', value: money(alert.actual), support: `${percent(alert.attainment)} da meta`, accent: true },
  ] };
  return { scope, hierarchy, cutoff, cards, monthLabel, metric: METRICS[alert.metric] };
}

/** Safe private presentation, shared by the email HTML and the local PNG renderer. */
export function buildGoalAlertPresentation(alert) {
  const values = detail(alert);
  const subject = line(`Meta atingida · ${values.metric} · ${values.monthLabel} | ${values.scope}`).slice(0, 300);
  const dashboard = validateDashboard({
    version: 2, year: alert.year, period: 'month', entityId: alert.entity.id,
    scope: values.scope, hierarchy: values.hierarchy, periodLabel: `Meta atingida · ${values.monthLabel}`,
    greeting: 'Olá, equipe!', opening: `Confira o resultado de ${values.metric.toLowerCase()} no mês.`, notes: [],
    blocks: [
      { type: 'heading', text: values.metric },
      { type: 'text', text: values.cutoff, tone: 'muted' },
      values.cards,
      { type: 'text', text: recognition, tone: 'action' },
    ], footer, signature: '',
  });
  const text = [dashboard.greeting, '', values.scope, values.hierarchy, `Período: ${values.monthLabel}.`,
    `Carteira: ${values.metric}.`, values.cutoff, '', `Meta do mês: ${money(alert.target)}`,
    `Realizado: ${money(alert.actual)} (${percent(alert.attainment)} da meta)`, '', recognition, '', footer].join('\n');
  return { subject, text, html: renderDashboardHtml(dashboard, subject), dashboard };
}

/** Preserve the caller's filtered list and order. Levels and metrics are never summed. */
export function buildGoalAlertsDashboard(alerts, { year, month, kindLabel = 'Todas as unidades' }) {
  const monthLabel = period(year, month);
  if (!Array.isArray(alerts) || !alerts.length) throw new Error('Não há metas atingidas neste filtro para gerar o painel.');
  // The shared snapshot format allows up to 80 blocks. Fail without dropping any unit.
  if (alerts.length * 3 > 80) throw new Error('Há muitas metas neste painel. Refine o filtro ou copie os painéis individuais. Nenhuma unidade foi removida da seleção.');
  const blocks = alerts.flatMap((alert) => {
    if (alert.year !== year || alert.month !== month) throw new Error('A seleção contém metas de outro período. Atualize o filtro antes de gerar o painel.');
    const values = detail(alert);
    return [
      { type: 'text', text: `${values.scope} · ${values.metric}`, tone: 'action' },
      { type: 'text', text: `${values.hierarchy}. ${values.cutoff}`, tone: 'muted' },
      values.cards,
    ];
  });
  const dashboard = {
    version: 2, year, period: 'month', entityId: `metas-atingidas:${year}:${month + 1}`,
    scope: 'Metas atingidas no mês', hierarchy: line(kindLabel) || 'Todas as unidades', periodLabel: monthLabel,
    greeting: 'Parabéns às equipes!', opening: `${alerts.length} ${alerts.length === 1 ? 'meta atingida' : 'metas atingidas'} na seleção.`,
    notes: ['Resultados apresentados por unidade e carteira, sem somar níveis da mesma hierarquia.'],
    blocks, footer, signature: '',
  };
  if (JSON.stringify(dashboard).length > 120000) throw new Error('O painel ficou muito extenso. Refine o filtro ou copie os painéis individuais.');
  return validateDashboard(dashboard);
}
