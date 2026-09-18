import { money, percent } from './analytics.mjs';
import { filterDashboardRows } from './dashboard-view.mjs';
import { goalVariance } from './goal-variance.mjs';
import { periodTitle } from './periods.mjs';
import { scopedAnalyses, sortAnalysis } from './scenarios.mjs';

export { renderPaScenarioPng } from './pa-scenario-image.mjs';
export const PA_SCENARIO_PAGE_SIZE = 20;

const line = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const amount = value => value == null ? '—' : money(value);
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : 'não informado';
const position = row => row.cutoffMin !== row.cutoff
  ? `Cortes de ${date(row.cutoffMin)} a ${date(row.cutoff)}` : `Corte: ${date(row.cutoff)}`;
const hierarchy = row => `Central ${row.central} · Cooperativa ${row.cooperative}`;
const attainment = row => row.attainment == null ? 'Atingimento sem base' : `${percent(row.attainment)} da meta`;
const varianceLabel = row => row.variance.kind === 'growth' ? 'Crescimento sobre a meta' : 'GAP para a meta';
// Conservative Arial-bold width. The export must also fit Outlook's inline-only layout.
const moneyWidthEm = value => [...value].reduce((width, char) => width + (/\d/.test(char) ? .557 : /[.,\s]/.test(char) ? .279 : /[−-]/.test(char) ? .334 : char === 'R' ? .723 : char === '$' ? .557 : .7), 0) * 1.08;
const moneyFontSize = value => Math.max(12, Math.min(18, Math.floor(220 / Math.max(1, moneyWidthEm(value)))));

function actualStatus(row) {
  if (row.actual == null) return 'Sem realizado';
  if (row.target == null) return 'Sem meta';
  if (row.target < 0) return 'Meta inválida';
  if (row.target === 0) return 'Meta zero · sem base percentual';
  if (row.annualConflict) return 'Metas divergentes';
  if (!row.complete) return 'Dados incompletos';
  return row.actual >= row.target ? 'Meta atingida' : 'Abaixo da meta';
}

function shareRow(row) {
  // Projected values and source-file/private metadata never leave the analytical model.
  return {
    id: `pa:${row.central}:${row.cooperative}:${row.pa}`,
    central: String(row.central), cooperative: String(row.cooperative), pa: String(row.pa),
    name: line(row.name), group: line(row.group),
    target: row.target, actual: row.actual,
    attainment: row.annualConflict ? null : row.attainment,
    variance: goalVariance(row.actual, row.target, row.complete && !row.annualConflict),
    status: actualStatus(row), cutoff: row.cutoff, cutoffMin: row.cutoffMin || row.cutoff,
    complete: row.complete, annualConflict: row.annualConflict,
  };
}

function scopeLabel(dataset, filters) {
  const entities = dataset.registry?.entities || [];
  if (filters.coop && filters.coop !== 'all') {
    const [central, cooperative] = filters.coop.split(':');
    const entity = entities.find(item => item.id === `cooperative:${central}:${cooperative}`);
    return `Central ${central} · Cooperativa ${cooperative}${entity?.name ? ` · ${line(entity.name)}` : ''}`;
  }
  if (filters.central && filters.central !== 'all') {
    const entity = entities.find(item => item.id === `central:${filters.central}`);
    return `Central ${filters.central}${entity?.name ? ` · ${line(entity.name)}` : ''}`;
  }
  return 'Todas as centrais e cooperativas';
}

function rowText(row) {
  return [
    `PA ${row.pa} · ${row.name}`,
    hierarchy(row),
    `Meta: ${amount(row.target)} | Realizado: ${amount(row.actual)} (${attainment(row)})`,
    `${varianceLabel(row)}: ${amount(row.variance.value)}`,
    `${position(row)} · ${row.status}`,
  ].join('\n');
}

function renderHtml(report) {
  const values = report.rows.flatMap(row => [row.target, row.actual, row.variance.value]).map(amount);
  const maxMoneyWidth = values.reduce((width, value) => Math.max(width, moneyWidthEm(value) * moneyFontSize(value)), 1);
  // Cell width is 23% after the outer (16px) and content (40px) padding, less 20px per cell.
  const stackAt = Math.max(720, Math.ceil((maxMoneyWidth + 20) / .23 + 56));
  const detail = text => `<div style="font-size:12px;line-height:1.5;color:#435c60;margin-top:5px;overflow-wrap:anywhere">${escape(text)}</div>`;
  const moneyCell = (value, label, detailText) => {
    const formatted = amount(value);
    const size = moneyFontSize(formatted);
    return `<td class="pa-number" data-label="${escape(label)}" valign="top" style="width:23%;padding:14px 10px;border-bottom:1px solid #dbe8e5;text-align:right"><div class="pa-mobile-label" style="display:none;font-size:12px;color:#435c60">${escape(label)}</div><strong data-money="${value != null}" style="font-size:${size}px;line-height:1.5;white-space:nowrap;word-break:normal;overflow-wrap:normal;font-variant-numeric:tabular-nums">${escape(formatted)}</strong>${detail(detailText)}</td>`;
  };
  const body = report.rows.map(row => `<tr data-pa-id="${escape(row.id)}"><td class="pa-identity" valign="top" style="width:31%;padding:14px 10px;border-bottom:1px solid #dbe8e5;overflow-wrap:anywhere"><strong style="font-size:16px;line-height:1.5">${escape(`PA ${row.pa} · ${row.name}`)}</strong>${detail(hierarchy(row))}${detail(`${position(row)} · ${row.status}`)}</td>${moneyCell(row.target, 'Meta', '')}${moneyCell(row.actual, 'Realizado', attainment(row))}${moneyCell(row.variance.value, 'Crescimento ou GAP', varianceLabel(row))}</tr>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(report.subject)}</title><style>@media(max-width:${stackAt}px){.pa-scenario-head{display:none!important}.pa-scenario-table,.pa-scenario-table tbody,.pa-scenario-table tr,.pa-scenario-table td{display:block!important;width:auto!important}.pa-scenario-table tr{margin-bottom:16px;border:1px solid #dbe8e5}.pa-scenario-table .pa-number{text-align:left!important;padding:8px 12px!important}.pa-scenario-table .pa-identity{padding:12px!important;background:#f0f5f3}.pa-mobile-label{display:block!important}.pa-scenario-content{padding:12px!important}}</style></head><body style="margin:0;background:#f0f5f3;font-family:Arial,sans-serif;color:#003641"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:12px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:1120px;background:#fff"><tr><td style="padding:24px;background:#003641;color:#fff"><p style="margin:0 0 8px;font-size:12px;color:#8fdbcf">GESTÃO COMERCIAL · VENDA NOVA</p><h1 style="margin:0 0 12px;font-size:25px">Cenário dos PAs</h1><p style="margin:0;font-size:18px;line-height:1.5;overflow-wrap:anywhere">${escape(report.scope)}</p><p style="margin:10px 0 0;font-size:18px;font-weight:bold">${escape(report.periodLabel)}</p></td></tr><tr><td class="pa-scenario-content" style="padding:20px"><p style="margin:0 0 12px;font-weight:bold">${report.count} ${report.count === 1 ? 'PA' : 'PAs'} · ${report.mode === 'all' ? 'Todas as unidades do escopo' : 'Lista filtrada'}</p>${report.notes.map(note => `<p style="font-size:12px;line-height:1.5;margin:6px 0;color:#435c60">${escape(note)}</p>`).join('')}<table data-pa-scenario class="pa-scenario-table" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-collapse:collapse;margin-top:16px"><thead class="pa-scenario-head"><tr style="background:#003641;color:#fff">${['PA / unidade', 'Meta', 'Realizado', 'Crescimento ou GAP'].map((label, index) => `<th scope="col" width="${index ? 23 : 31}%" align="${index ? 'right' : 'left'}" style="padding:12px 10px;font-size:14px">${label}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>${!report.count ? '<p>Nenhum PA corresponde a esta seleção.</p>' : ''}</td></tr></table></td></tr></table></body></html>`;
}

/** Share every PA in the scope. Chunk only the images; email and text stay complete. */
export function buildPaScenarioReport({ dataset, filters = {}, mode = 'all' }) {
  const month = filters.month ?? 0, period = filters.period || 'month';
  if (!dataset || !Array.isArray(dataset.rows) || !Number.isInteger(dataset.year) || dataset.year < 2020 || dataset.year > 2100
    || !Number.isInteger(month) || month < 0 || month > 11
    || !['daily', 'month', 'quarter', 'semester', 'annual', 'ytd'].includes(period)
    || !['all', 'filtered'].includes(mode)) throw new Error('Selecione um ano, período e escopo válidos para compartilhar os PAs.');
  const analyticalFilters = { ...filters, month, period, source: 'cadence', metric: 'VN', level: 'pa', group: 'all' };
  const all = scopedAnalyses(dataset, analyticalFilters).filter(row => row.pa != null);
  const filtered = filterDashboardRows(all.filter(row => !filters.group || filters.group === 'all' || row.group === filters.group), filters.search || '', filters.status || 'all');
  const rows = sortAnalysis(mode === 'all' ? all : filtered, filters.sortBy).map(shareRow);
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Há PAs duplicados na base. Confira a central, a cooperativa e o código do PA antes de compartilhar.');
  const scope = scopeLabel(dataset, filters), title = periodTitle(period, month, dataset.year);
  const notes = [mode === 'all' ? 'Todos os PAs da central/cooperativa selecionada, independentemente de busca, grupo ou situação.' : `Lista filtrada: ${rows.length} de ${all.length} PAs no escopo.`, 'Valores de Venda Nova na cadência dos PAs. Dados ausentes aparecem como — e não são zero.'];
  if (period === 'daily') notes.push('Base mensal: visão de esforço diário. Não há realizado diário disponível.');
  const cutoffs = new Set(rows.flatMap(row => [row.cutoffMin, row.cutoff]));
  if (cutoffs.size > 1) notes.push('As unidades têm datas de corte diferentes; consulte o corte de cada PA.');
  const total = Math.ceil(rows.length / PA_SCENARIO_PAGE_SIZE);
  const parts = Array.from({ length: total }, (_, index) => ({ index: index + 1, total,
    from: index * PA_SCENARIO_PAGE_SIZE + 1, to: Math.min((index + 1) * PA_SCENARIO_PAGE_SIZE, rows.length),
    rows: rows.slice(index * PA_SCENARIO_PAGE_SIZE, (index + 1) * PA_SCENARIO_PAGE_SIZE),
    scope, periodLabel: title, notes: [...notes], year: dataset.year,
  }));
  const subject = line(`Cenário dos PAs · ${title} | ${scope}`).slice(0, 300);
  const text = ['Cenário dos PAs · Venda Nova', scope, title, `${rows.length} ${rows.length === 1 ? 'PA' : 'PAs'}`, ...notes, '', ...rows.flatMap(row => [rowText(row), ''])].join('\n').trim();
  const report = { mode, count: rows.length, allCount: all.length, filteredCount: filtered.length,
    scope, scopeLabel: scope, periodLabel: title, notes, subject, text, whatsapp: text, rows, parts };
  return { ...report, html: renderHtml(report) };
}
