import { money, percent, periodBounds } from './analytics.mjs';
import { filterDashboardRows } from './dashboard-view.mjs';
import { goalVariance } from './goal-variance.mjs';
import { periodTitle } from './periods.mjs';
import { analysisIndicators, scopedAnalyses, sortAnalysis, SORT_OPTIONS } from './scenarios.mjs';
import { centralHeading, communicationBrand, metricHeading } from './communication-header.mjs';

const PAGE_SIZE = 12;
const line = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const amount = value => value == null ? '—' : money(value);
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : 'não informado';
const cutoffLabel = row => row.cutoffMin && row.cutoffMin !== row.cutoff
  ? `Cortes: ${date(row.cutoffMin)} a ${date(row.cutoff)}` : `Corte: ${date(row.cutoff)}`;
const only = values => { const unique = new Set(values); return unique.size === 1 ? [...unique][0] : null; };
const parentKey = (row, kind) => kind === 'pa' ? `${row.central}:${row.cooperative}` : row.central;
const rowId = (row, kind) => kind === 'pa' ? `pa:${row.central}:${row.cooperative}:${row.pa}` : `cooperative:${row.central}:${row.cooperative}`;
function customText(value, field, max, singleLine = false) {
  if (value === undefined) return '';
  if (typeof value !== 'string') throw new Error(`${field} deve ser um texto.`);
  const text = singleLine ? line(value) : value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (text.length > max) throw new Error(`${field} deve ter até ${max} caracteres.`);
  return text;
}
function contextFor(rows) {
  const dates = new Map();
  for (const row of rows) {
    const key = `${row.cutoffMin || row.cutoff}|${row.cutoff}`;
    dates.set(key, (dates.get(key) || 0) + 1);
  }
  const reference = [...dates].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0].split('|') || ['', ''];
  return { central: only(rows.map(row => row.central)), cooperative: only(rows.map(row => `${row.central}:${row.cooperative}`)), cutoffMin: reference[0], cutoff: reference[1], mixedCutoffs: dates.size > 1 };
}

/** Common metadata belongs to the header; each exceptional date/status stays attached to its unit. */
export function scenarioDisplay(part) {
  const kind = part.kind || 'pa', context = part.context || contextFor(part.rows), groups = [];
  for (const row of part.rows) {
    const key = parentKey(row, kind);
    if (groups.at(-1)?.key !== key) {
      const labels = [];
      if (row.central !== context.central) labels.push(`Central ${row.central}`);
      if (kind === 'pa' && `${row.central}:${row.cooperative}` !== context.cooperative) labels.push(`Cooperativa ${row.cooperative}`);
      groups.push({ key, label: labels.join(' · '), rows: [] });
    }
    const exceptions = !['Meta atingida', 'Abaixo da meta'].includes(row.status) ? [row.status] : [];
    if (row.cutoff !== context.cutoff || (row.cutoffMin || row.cutoff) !== context.cutoffMin) exceptions.push(cutoffLabel(row));
    groups.at(-1).rows.push({ row,
      label: kind === 'pa' ? `PA ${row.pa}${row.name ? ` · ${row.name}` : ''}` : `${row.cooperative}${row.name ? ` · ${row.name}` : ''}`,
      exception: exceptions.filter(Boolean).join(' · '),
      varianceLabel: row.variance.kind === 'growth' ? 'Crescimento' : row.variance.kind === 'unknown' ? 'Sem avaliação' : row.variance.kind === 'met' && row.target > 0 ? 'Meta atingida' : 'GAP',
      attainmentLabel: row.attainment == null ? 'Sem avaliação' : percent(row.attainment),
    });
  }
  let cut = part.rows.length ? cutoffLabel(context) : '';
  if (context.mixedCutoffs) cut = cut.replace(/^Corte:/, 'Corte de referência:').replace(/^Cortes:/, 'Cortes de referência:');
  const metricLabel = metricHeading([part.metric || 'VN']);
  const centralName = part.centralName || centralHeading(context.central || part.scope.match(/^Central (\d+)/)?.[1]);
  const unitLabel = part.unitLabel ?? (kind === 'pa' && context.cooperative?.includes(':') ? part.scope.match(/Cooperativa .+$/)?.[0] || `Cooperativa ${context.cooperative.split(':')[1]}` : '');
  return { title: part.title || (kind === 'pa' ? 'Cenário dos PAs' : 'Cenário das cooperativas'), metricLabel, brand: communicationBrand(metricLabel), centralName, unitLabel, scope: part.scope,
    cutoffLabel: cut, groups };
}

function actualStatus(row) {
  if (row.actual == null) return 'Sem realizado';
  if (row.target == null) return 'Sem meta';
  if (row.target < 0) return 'Meta inválida';
  if (row.target === 0) return 'Meta zero · sem base percentual';
  if (row.annualConflict) return 'Metas divergentes';
  if (!row.complete) return 'Dados incompletos';
  return row.actual >= row.target ? 'Meta atingida' : 'Abaixo da meta';
}

function scenarioCta(rows, context) {
  if (!rows.length) return '';
  if (rows.some(row => row.annualConflict)) return 'Concilie a meta anual com a distribuição mensal antes de avaliar o resultado e combinar a próxima ação.';
  if (rows.some(row => !row.complete || row.actual == null || !(row.target > 0))) return 'Confira os dados pendentes e as metas cadastradas antes de definir a próxima ação.';
  if (context.mixedCutoffs) return 'Confirme as datas de corte das unidades antes de comparar os resultados e combinar os próximos passos.';
  const pending = rows.filter(row => row.actual < row.target);
  if (!pending.length) return 'Sustente a produção e reconheça as ações que contribuíram para o resultado.';
  if (pending.every(row => row.attainment >= .9)) return 'Acompanhe as oportunidades em aberto e combine os próximos retornos para alcançar a meta.';
  return 'Priorize as unidades com maior GAP e combine a próxima ação com cada equipe.';
}

function shareRow(row, kind) {
  return { id: rowId(row, kind),
    central: String(row.central), cooperative: String(row.cooperative), pa: kind === 'pa' ? String(row.pa) : '',
    name: line(row.name), group: line(row.group), target: row.target, actual: row.actual,
    attainment: row.complete && !row.annualConflict ? row.attainment : null,
    variance: goalVariance(row.actual, row.target, row.complete && !row.annualConflict),
    status: actualStatus(row), cutoff: row.cutoff, cutoffMin: row.cutoffMin || row.cutoff,
    complete: row.complete, annualConflict: row.annualConflict };
}

function scopeLabel(dataset, filters, context, kind) {
  const entities = dataset.registry?.entities || [];
  const coop = context.cooperative || (filters.coop !== 'all' ? filters.coop : null);
  if (kind === 'pa' && coop) {
    const [central, cooperative] = coop.split(':');
    const entity = entities.find(item => item.id === `cooperative:${central}:${cooperative}`);
    return `Central ${central} · Cooperativa ${cooperative}${entity?.name ? ` · ${line(entity.name)}` : ''}`;
  }
  const central = context.central || (filters.central !== 'all' ? filters.central : null);
  if (central) {
    const entity = entities.find(item => item.id === `central:${central}`);
    return `Central ${central}${entity?.name ? ` · ${line(entity.name)}` : ''}`;
  }
  return 'Todas as centrais';
}

function reportText(report) {
  const display = scenarioDisplay(report);
  const rows = display.groups.flatMap(group => [
    ...(group.label ? [group.label] : []),
    ...group.rows.map(item => `${item.label} | Meta: ${amount(item.row.target)} | Realizado: ${amount(item.row.actual)} (${item.attainmentLabel}) | ${item.varianceLabel}: ${amount(item.row.variance.value)}${item.exception ? ` | ${item.exception}` : ''}`),
  ]);
  return [display.brand, display.centralName, report.periodLabel,
    [display.unitLabel, display.cutoffLabel, report.phaseLabel, report.selectionLabel].filter(Boolean).join(' · '), ...(report.intro ? ['', report.intro] : []),
    ...report.notes, '', ...rows, ...(report.cta ? ['', report.cta] : [])].join('\n');
}

function reportCaption(report) {
  const display = scenarioDisplay(report);
  return [...(report.intro ? [report.intro, ''] : []), display.brand, display.centralName, report.periodLabel,
    [display.unitLabel, display.cutoffLabel, report.phaseLabel, report.selectionLabel].filter(Boolean).join(' · '), ...(report.cta ? ['', report.cta] : [])].join('\n');
}

// Conservative Arial-bold width keeps exact currencies readable in inline-only email clients.
const moneyWidthEm = value => [...value].reduce((width, char) => width + (/\d/.test(char) ? .557 : /[.,\s]/.test(char) ? .279 : /[−-]/.test(char) ? .334 : char === 'R' ? .723 : char === '$' ? .557 : .7), 0) * 1.08;
const moneyFontSize = value => Math.max(12, Math.min(18, Math.floor(220 / Math.max(1, moneyWidthEm(value)))));

function reportHtml(report) {
  const display = scenarioDisplay(report);
  const values = report.rows.flatMap(row => [row.target, row.actual, row.variance.value]).map(amount);
  const width = values.reduce((max, value) => Math.max(max, moneyWidthEm(value) * moneyFontSize(value)), 1);
  const stackAt = Math.max(720, Math.ceil((width + 20) / .23 + 56));
  const detail = text => text ? `<div style="font-size:12px;line-height:1.4;color:#435c60;margin-top:3px;overflow-wrap:anywhere">${escape(text)}</div>` : '';
  const valueCell = (value, label, support) => {
    const formatted = amount(value);
    return `<td class="pa-number" data-label="${escape(label)}" valign="top" style="width:23%;padding:8px 10px;border-bottom:1px solid #dbe8e5;text-align:right"><div class="pa-mobile-label" style="display:none;font-size:12px;color:#435c60">${escape(label)}</div><strong data-money="${value != null}" style="font-size:${moneyFontSize(formatted)}px;line-height:1.4;white-space:nowrap;word-break:normal;overflow-wrap:normal;font-variant-numeric:tabular-nums">${escape(formatted)}</strong>${detail(support)}</td>`;
  };
  const unit = report.kind === 'pa' ? 'pa' : 'cooperative';
  const body = display.groups.map(group => `${group.label ? `<tr data-parent-key="${escape(group.key)}"><th colspan="4" scope="rowgroup" style="padding:7px 10px;text-align:left;background:#e6f3ef;font-size:13px">${escape(group.label)}</th></tr>` : ''}${group.rows.map(item => `<tr data-${unit}-id="${escape(item.row.id)}"><td class="pa-identity" valign="top" style="width:31%;padding:8px 10px;border-bottom:1px solid #dbe8e5;overflow-wrap:anywhere"><strong style="font-size:15px;line-height:1.4">${escape(item.label)}</strong>${detail(item.exception)}</td>${valueCell(item.row.target, 'Meta', '')}${valueCell(item.row.actual, 'Realizado / % da meta', item.attainmentLabel)}${valueCell(item.row.variance.value, 'Crescimento ou GAP', item.varianceLabel)}</tr>`).join('')}`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(report.subject)}</title><style>@media(max-width:${stackAt}px){.pa-scenario-head{display:none!important}.pa-scenario-table,.pa-scenario-table tbody,.pa-scenario-table tr,.pa-scenario-table td{display:block!important;width:auto!important}.pa-scenario-table tr{margin-bottom:10px;border:1px solid #dbe8e5}.pa-scenario-table .pa-number{text-align:left!important;padding:6px 10px!important}.pa-scenario-table .pa-identity{padding:10px!important;background:#f0f5f3}.pa-mobile-label{display:block!important}.pa-scenario-content{padding:12px!important}}</style></head><body style="margin:0;background:#f0f5f3;font-family:Arial,sans-serif;color:#003641"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:12px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:1120px;background:#fff"><tr><td data-communication-header style="padding:14px 20px;background:#003641;color:#fff"><p style="margin:0 0 5px;font-size:12px;color:#8fdbcf">${escape(display.brand)}</p><h1 style="margin:0 0 5px;font-size:23px;line-height:1.3;overflow-wrap:anywhere">${escape(display.centralName)}</h1><p style="margin:0;font-size:16px;font-weight:bold">${escape(report.periodLabel)}</p></td></tr><tr><td class="pa-scenario-content" style="padding:12px 20px"><div data-communication-context>${display.unitLabel ? `<p style="margin:0 0 5px;font-size:15px;font-weight:bold;overflow-wrap:anywhere">${escape(display.unitLabel)}</p>` : ''}<p style="margin:0 0 7px;font-size:12px;line-height:1.4;color:#435c60">${escape([display.cutoffLabel, report.phaseLabel, report.selectionLabel].filter(Boolean).join(' · '))}</p></div>${report.intro ? `<p data-communication-intro style="font-size:14px;line-height:1.5;margin:10px 0;overflow-wrap:anywhere">${escape(report.intro).replace(/\n/g, '<br>')}</p>` : ''}${report.notes.map(note => `<p style="font-size:12px;line-height:1.4;margin:4px 0;color:#435c60">${escape(note)}</p>`).join('')}<table data-${unit}-scenario class="pa-scenario-table" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-collapse:collapse;margin-top:10px"><thead class="pa-scenario-head"><tr style="background:#003641;color:#fff">${[report.kind === 'pa' ? 'PA / unidade' : 'Cooperativa', 'Meta', 'Realizado / % da meta', 'Crescimento ou GAP'].map((label, index) => `<th scope="col" width="${index ? 23 : 31}%" align="${index ? 'right' : 'left'}" style="padding:9px 10px;font-size:13px">${label}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>${report.cta ? `<p data-communication-cta style="font-size:14px;line-height:1.5;margin:14px 0 0;font-weight:bold;overflow-wrap:anywhere">${escape(report.cta).replace(/\n/g, '<br>')}</p>` : ''}${!report.count ? `<p>Nenhum${report.kind === 'pa' ? ' PA' : 'a cooperativa'} corresponde a esta seleção.</p>` : ''}</td></tr></table></td></tr></table></body></html>`;
}

/** Only leaf units of the selected source enter the list; image parts never drop a unit. */
export function buildScenarioReport({ dataset, filters = {}, mode = 'all', kind, selectedIds = [], sortBy, customization = {} }) {
  const month = filters.month ?? 0, period = filters.period || 'month', metric = kind === 'pa' ? 'VN' : filters.metric || 'VN';
  if (!dataset || !Array.isArray(dataset.rows) || !Number.isInteger(dataset.year) || dataset.year < 2020 || dataset.year > 2100
    || !Number.isInteger(month) || month < 0 || month > 11 || !['VN', 'AR'].includes(metric)
    || !['daily', 'month', 'quarter', 'semester', 'annual', 'ytd'].includes(period)
    || !['all', 'filtered', 'selected'].includes(mode) || !['pa', 'cooperative'].includes(kind)) throw new Error('Selecione um ano, período e escopo válidos para compartilhar o cenário.');
  if (!customization || typeof customization !== 'object' || Array.isArray(customization)) throw new Error('Informe os textos da comunicação em campos válidos.');
  const subjectEdit = customText(customization.subject, 'O assunto', 300, true);
  const intro = customText(customization.intro, 'A abertura', 1000), customCta = customText(customization.cta, 'A chamada para ação', 1000);
  const order = sortBy ?? filters.sortBy ?? 'attainment-desc';
  if (!Object.hasOwn(SORT_OPTIONS, order)) throw new Error('Selecione uma ordenação válida para o cenário.');
  const analyticalFilters = { ...filters, month, period, source: kind === 'pa' ? 'cadence' : 'base', metric, level: kind, group: 'all' };
  const all = scopedAnalyses(dataset, analyticalFilters).filter(row => kind === 'pa' ? row.pa != null : Boolean(row.cooperative));
  const filtered = filterDashboardRows(all.filter(row => kind !== 'pa' || !filters.group || filters.group === 'all' || row.group === filters.group), filters.search || '', filters.status || 'all');
  const indicatorOptions = { year: dataset.year, month, period };
  const orderedRows = cohort => sortAnalysis(analysisIndicators(cohort, indicatorOptions), order).map(row => shareRow(row, kind));
  const candidates = orderedRows(all);
  const ids = new Set(candidates.map(row => row.id));
  if (ids.size !== candidates.length) throw new Error('Há unidades duplicadas na base. Confira a central e os códigos antes de compartilhar.');
  if (mode === 'selected' && (!Array.isArray(selectedIds) || selectedIds.some(id => typeof id !== 'string' || !ids.has(id)))) throw new Error('A seleção contém unidades fora deste escopo ou que não estão mais na base. Revise as unidades selecionadas.');
  const included = mode === 'selected' ? new Set(selectedIds) : mode === 'filtered' ? new Set(filtered.map(row => rowId(row, kind))) : ids;
  // Date comparability and recent growth depend on the actual export cohort, not hidden candidates.
  const rows = mode === 'all' ? candidates : orderedRows(all.filter(row => included.has(rowId(row, kind))));
  // The denominator and hierarchy refer to the complete scope, even when only one child is selected.
  const scopeContext = contextFor(candidates), context = { ...contextFor(rows), central: scopeContext.central, cooperative: scopeContext.cooperative };
  const scope = scopeLabel(dataset, filters, scopeContext, kind);
  const central = scopeContext.central || (filters.central && filters.central !== 'all' ? filters.central : null);
  const centralName = centralHeading(central, dataset.registry?.entities.find(entity => entity.id === `central:${central}`)?.name);
  const cooperative = scopeContext.cooperative?.split(':')[1];
  const cooperativeName = cooperative ? dataset.registry?.entities.find(entity => entity.id === `cooperative:${scopeContext.cooperative}`)?.name : '';
  const unitLabel = kind === 'pa' && cooperative ? `Cooperativa ${cooperative}${cooperativeName ? ` · ${line(cooperativeName)}` : ''}` : '';
  const periodEnd = periodBounds(dataset.year, month, period).end;
  const phaseLabel = !rows.length ? '' : rows.every(row => row.actual == null) ? 'Sem realizado' : rows.every(row => row.cutoffMin >= periodEnd) ? 'Fechado' : 'Parcial';
  const cta = customization.cta === undefined ? scenarioCta(rows, context) : customCta;
  const parentCount = new Set(rows.map(row => parentKey(row, kind))).size;
  const title = kind === 'pa' ? 'Cenário dos PAs' : 'Cenário das cooperativas', periodLabel = periodTitle(period, month, dataset.year);
  const units = kind === 'pa' ? rows.length === 1 && mode === 'all' ? 'PA' : 'PAs' : rows.length === 1 && mode === 'all' ? 'cooperativa' : 'cooperativas';
  const selectionLabel = mode === 'all' ? `${rows.length} ${units}` : `${mode === 'filtered' ? 'Lista filtrada' : rows.length < all.length ? 'Seleção parcial' : 'Seleção'}: ${rows.length} de ${all.length} ${units}`;
  const notes = [];
  if (rows.some(row => row.actual == null || row.target == null || row.variance.value == null)) notes.push('— Dado não informado ou sem avaliação.');
  if (parentCount > 1) notes.push(`Ordem: ${SORT_OPTIONS[order]}`);
  if (context.mixedCutoffs) notes.push('Exceções à data de corte indicadas nas unidades.');
  if (period === 'daily') notes.push('Base mensal; não há realizado diário disponível.');
  const total = Math.ceil(rows.length / PAGE_SIZE), metadata = { kind, metric, title, scope, centralName, unitLabel, phaseLabel, periodLabel, notes, context, selectionLabel, year: dataset.year };
  const parts = Array.from({ length: total }, (_, index) => ({ ...metadata, notes: [...notes], context: { ...context }, index: index + 1, total,
    from: index * PAGE_SIZE + 1, to: Math.min((index + 1) * PAGE_SIZE, rows.length), rows: rows.slice(index * PAGE_SIZE, (index + 1) * PAGE_SIZE) }));
  const subject = subjectEdit || line(`${title} · ${metric === 'AR' ? 'Arrecadação' : 'Venda Nova'} · ${periodLabel} | ${scope}`).slice(0, 300);
  const achievedCount = rows.filter(row => row.status === 'Meta atingida').length, gapCount = rows.filter(row => row.status === 'Abaixo da meta').length;
  const summary = { achievedCount, gapCount, unknownCount: rows.length - achievedCount - gapCount };
  const report = { ...metadata, mode, count: rows.length, allCount: all.length, filteredCount: filtered.length, scopeLabel: scope, subject, rows, parts, candidates, sortBy: order, intro, cta, summary };
  const text = reportText(report);
  return { ...report, text, whatsapp: text, caption: reportCaption(report), html: reportHtml(report) };
}
