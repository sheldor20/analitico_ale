import { periodBounds } from './analytics.mjs';
import { periodTitle } from './periods.mjs';

const PERIODS = ['daily', 'month', 'quarter', 'semester', 'annual', 'ytd'];
const LEVELS = { central: 'Central', cooperative: 'Cooperativa', pa: 'PA' };
const text = value => String(value ?? '').replace(/\u0000/g, '');
const numeric = value => typeof value === 'number' && Number.isFinite(value);
const money = value => {
  if (value == null) return null;
  if (!numeric(value) || !Number.isSafeInteger(Math.round(value * 100))) throw new Error('Há um valor monetário inválido ou acima do limite de precisão. Confira a base.');
  return Math.round(value * 100) / 100;
};
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value : '';
const sourceLabel = source => source === 'cadence' ? 'Cadência dos PAs' : 'Base de cooperativas';

export const RESULT_EXPORT_COLUMNS = Object.freeze([
  ['rowType', 'Tipo de linha', 'text'], ['name', 'Unidade', 'text'],
  ['central', 'Central', 'text'], ['cooperative', 'Cooperativa', 'text'], ['pa', 'PA', 'text'], ['group', 'Grupo do PA', 'text'],
  ['metricLabel', 'Carteira', 'text'], ['sourceLabel', 'Origem dos dados', 'text'], ['year', 'Ano', 'integer'], ['periodLabel', 'Período', 'text'],
  ['cutoffMin', 'Data-base inicial', 'text'], ['cutoff', 'Data-base final', 'text'], ['phase', 'Fechamento do período', 'text'], ['status', 'Situação do realizado', 'text'],
  ['target', 'Meta (R$)', 'money'], ['actual', 'Realizado (R$)', 'money'], ['attainment', 'Atingimento (%)', 'percent'],
  ['gap', 'GAP para a meta (R$)', 'money'], ['surplus', 'Superação da meta (R$)', 'money'],
  ['projected', 'Projeção de fechamento — estimativa (R$)', 'money'], ['projectedAttainment', 'Atingimento projetado — estimativa (%)', 'percent'],
  ['uplift', 'Simulação de ritmo (%)', 'integer'], ['scope', 'Escopo da exportação', 'text'], ['scopeLabel', 'Recorte', 'text'], ['filterLabel', 'Filtros aplicados', 'text'], ['notes', 'Observações', 'text'],
].map(([key, label, type]) => Object.freeze({ key, label, type })));

function sumComplete(rows, key) {
  if (!rows.length || rows.some(row => row[key] == null)) return null;
  const cents = rows.reduce((sum, row) => sum + BigInt(Math.round(row[key] * 100)), 0n);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('O total ultrapassa o limite de precisão da planilha. Exporte um recorte menor.');
  return Number(cents) / 100;
}

function evaluation({ actual, target, complete, conflict }) {
  const valid = complete && !conflict && actual != null && target != null && target >= 0;
  const delta = valid ? (Math.round(actual * 100) - Math.round(target * 100)) / 100 : null;
  const status = conflict ? 'Metas divergentes' : actual == null ? 'Sem realizado' : target == null ? 'Sem meta'
    : target < 0 ? 'Meta inválida' : target === 0 ? 'Meta zero — sem base percentual' : !complete ? 'Dados incompletos'
      : actual >= target ? 'Meta atingida' : 'Abaixo da meta';
  return { status, attainment: valid && target > 0 ? actual / target : null,
    gap: delta == null ? null : Math.max(0, -delta), surplus: delta == null ? null : Math.max(0, delta) };
}

function phase(actual, complete, cutoff, end) {
  return actual == null ? 'Sem realizado' : !complete ? 'Dados incompletos' : cutoff >= end ? 'Fechado' : 'Parcial';
}

function verifyRows(rows, context, bounds) {
  const keys = new Set(), identities = new Set();
  for (const row of rows) {
    const identity = context.level === 'central' ? row.central : context.level === 'cooperative' ? `${row.central}:${row.cooperative}` : `${row.central}:${row.cooperative}:${row.pa}`;
    if (row.source !== context.source || row.metric !== context.metric || !row.central
      || (context.level === 'central' && (row.cooperative || row.pa != null))
      || (context.level === 'cooperative' && row.pa != null)
      || (context.level === 'pa' && (!row.cooperative || row.pa == null))
      || (row.start && row.start !== bounds.start) || (row.end && row.end !== bounds.end)) {
      throw new Error('A lista não corresponde à origem, carteira, nível ou período selecionado. Atualize o recorte.');
    }
    if (!row.key || keys.has(row.key) || identities.has(identity)) throw new Error('Há unidades repetidas no recorte. Confira a lista antes de exportar.');
    if (context.level === 'cooperative' && !row.cooperative && rows.some(other => other.central === row.central && other.cooperative)) throw new Error('A central e suas cooperativas não podem ser somadas no mesmo recorte.');
    keys.add(row.key); identities.add(identity);
  }
}

/** Export the visible analytical rows only. Selection cannot recover a hidden or stale row. */
export function buildResultExport({ rows, context, selectedIds = [], mode = 'filtered' }) {
  if (!context || !Array.isArray(rows) || !Number.isInteger(context.year) || context.year < 2020 || context.year > 2100
    || !Number.isInteger(context.month) || context.month < 0 || context.month > 11 || !PERIODS.includes(context.period)
    || !Object.hasOwn(LEVELS, context.level) || !['base', 'cadence'].includes(context.source) || !['VN', 'AR'].includes(context.metric)
    || (context.source === 'cadence' && (context.metric !== 'VN' || context.level !== 'pa'))
    || (context.source === 'base' && context.level === 'pa') || !['filtered', 'selected'].includes(mode)
    || (context.uplift != null && (!numeric(context.uplift) || context.uplift < 0 || context.uplift > 1000))
    || !Array.isArray(selectedIds) || !selectedIds.every(id => typeof id === 'string')) throw new Error('Selecione um contexto válido para exportação.');
  const bounds = periodBounds(context.year, context.month, context.period);
  verifyRows(rows, context, bounds);
  const selected = new Set(selectedIds), included = mode === 'selected' ? rows.filter(row => selected.has(row.key)) : rows;
  if (!included.length) throw new Error(mode === 'selected' ? 'Selecione pelo menos uma unidade da lista atual.' : 'Não há unidades no recorte atual.');
  const scope = mode === 'selected' ? 'Somente unidades selecionadas' : 'Todas as unidades filtradas';
  const common = { year: context.year, periodLabel: periodTitle(context.period, context.month, context.year), metricLabel: context.metric === 'AR' ? 'Arrecadação' : 'Venda Nova',
    sourceLabel: sourceLabel(context.source), scope, scopeLabel: text(context.scopeLabel), filterLabel: text(context.filterLabel || 'Sem filtros adicionais'), uplift: context.uplift ?? 0 };
  const exported = included.map(row => {
    const actual = money(row.actual), target = money(row.target), conflict = !!row.annualConflict;
    const cutoff = date(row.cutoff), cutoffMin = date(row.cutoffMin) || cutoff;
    const complete = row.complete === true && !!cutoff && !!cutoffMin;
    const evaluationResult = evaluation({ actual, target, complete, conflict });
    const projected = complete && !conflict && target != null && target >= 0 ? money(row.projected) : null;
    return { ...common, id: row.key, rowType: !row.cooperative && context.source === 'base' ? 'Central' : LEVELS[context.level], name: text(row.name), central: text(row.central), cooperative: text(row.cooperative),
      pa: row.pa == null ? '' : text(row.pa), group: context.source === 'cadence' ? text(row.group) : '',
      cutoff, cutoffMin, phase: phase(actual, complete, cutoffMin, bounds.end), ...evaluationResult,
      target, actual, projected, projectedAttainment: projected != null && target > 0 ? projected / target : null, complete, conflict,
      notes: 'Vazio = dado não informado ou sem avaliação; projeção = estimativa.' };
  });
  const cutoffs = exported.flatMap(row => [row.cutoffMin, row.cutoff]).filter(Boolean).sort();
  // A later import of a closed period has the same observation window. Different partial dates do not.
  const observationDates = new Set(exported.map(row => row.cutoffMin < bounds.end ? row.cutoffMin : bounds.end));
  const complete = exported.every(row => row.complete && (row.target == null || row.target >= 0)) && observationDates.size === 1;
  const conflict = exported.some(row => row.conflict), actual = sumComplete(exported, 'actual'), target = sumComplete(exported, 'target');
  const projected = complete && !conflict ? sumComplete(exported, 'projected') : null;
  const totals = { ...common, id: '', rowType: 'TOTAL', name: 'TOTAL DO RECORTE', central: '', cooperative: '', pa: '', group: '',
    cutoffMin: cutoffs[0] || '', cutoff: cutoffs.at(-1) || '', phase: phase(actual, complete, cutoffs[0] || '', bounds.end),
    ...evaluation({ actual, target, complete, conflict }), target, actual, projected,
    projectedAttainment: projected != null && target > 0 ? projected / target : null, complete, conflict,
    notes: 'Meta e realizado somados; coluna com dados ausentes tem total vazio. Atingimento = razão das somas. GAP e superação do total são diferenças líquidas, não somas das diferenças individuais.' };
  const metadata = [
    ['Relatório', 'Resultados comerciais'], ['Ano', context.year], ['Período', common.periodLabel], ['Carteira', common.metricLabel],
    ['Origem', common.sourceLabel], ['Nível', LEVELS[context.level]], ['Recorte', common.scopeLabel], ['Filtros', common.filterLabel],
    ['Escopo da exportação', scope], ['Unidades exportadas', exported.length], ['Unidades filtradas', rows.length],
    ['Data-base inicial', totals.cutoffMin || 'Não informada'], ['Data-base final', totals.cutoff || 'Não informada'],
    ['Fechamento do período', totals.phase], ['Situação do total realizado', totals.status], ['Simulação de ritmo (%)', context.uplift ?? 0],
    ['Valores', 'Reais completos, com centavos. Célula vazia indica dado não informado ou avaliação indisponível; zero é um valor conhecido.'],
    ['Totais', 'Soma dos valores monetários exportados. Se alguma unidade não informa o valor, o total dessa coluna fica vazio.'],
    ['Percentuais', 'Razão entre a soma do realizado e a soma das metas; nunca a média dos percentuais. Excel usa formato %; CSV usa pontos percentuais nas colunas (%).'],
    ['GAP e superação', 'Diferença entre realizado e meta. No total, a diferença é líquida do recorte; não é a soma dos GAPs ou das superações individuais.'],
    ['Avaliação', 'Dados incompletos, metas inválidas, datas parciais diferentes e metas anuais divergentes impedem a avaliação do total. Valores conhecidos permanecem visíveis.'],
    ['Projeção', `Estimativa de fechamento, separada do realizado. Simulação de ritmo: ${context.uplift ?? 0}%. Não representa produção confirmada.`],
    ...(context.period === 'daily' ? [['Base diária', 'A fonte é mensal; não há realizado diário disponível.']] : []),
  ];
  const records = [...exported, totals].map(row => RESULT_EXPORT_COLUMNS.map(column => row[column.key] ?? null));
  if ([...records.flat(), ...metadata.flat()].some(value => typeof value === 'string' && value.length > 32767)) throw new Error('Um texto excede o limite da planilha. Reduza o texto do recorte.');
  const slug = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const filename = `resultados-${context.source}-${context.metric.toLowerCase()}-${context.level}-${context.year}-${context.period}-${String(context.month + 1).padStart(2, '0')}-${mode === 'selected' ? 'selecionadas' : 'filtradas'}-${slug(context.scopeLabel) || 'recorte'}`;
  return { columns: RESULT_EXPORT_COLUMNS, rows: exported, totals, records, metadata, context: { ...context }, mode, filename };
}

/** Quote all fields; guard only text, so negative numeric adjustments stay numeric. */
export function resultExportCsv(report) {
  const quote = value => `"${text(value).replaceAll('"', '""')}"`;
  const cell = (value, type) => {
    if (value == null) return '""';
    if (type === 'money') return quote(value.toFixed(2).replace('.', ','));
    if (type === 'percent') return quote(Number((value * 100).toFixed(8)).toString().replace('.', ','));
    if (typeof value === 'number') return quote(value);
    const safe = /^[\s\u0001-\u001f]*[=+@-]/.test(text(value)) ? `'${text(value)}` : text(value);
    return quote(safe);
  };
  return '\uFEFF' + [report.columns.map(column => quote(column.label)).join(';'), ...report.records.map(record => record.map((value, i) => cell(value, report.columns[i].type)).join(';'))].join('\r\n') + '\r\n';
}

/** ExcelJS is loaded only when the user asks for Excel, never while rendering the dashboard. */
export async function createResultWorkbook(report) {
  const module = await import('exceljs');
  const ExcelJS = module.default || module;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Gestão Comercial';
  const sheet = workbook.addWorksheet('Resultados', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
  sheet.addRow(report.columns.map(column => column.label));
  sheet.addRows(report.records);
  sheet.columns = report.columns.map(column => ({ width: column.key === 'name' ? 38 : ['scope', 'scopeLabel', 'filterLabel'].includes(column.key) ? 38 : column.type === 'money' ? 25 : column.type === 'percent' ? 23 : 22 }));
  const border = { style: 'thin', color: { argb: 'FFD7E5DF' } };
  sheet.eachRow((row, rowNumber) => {
    row.font = { name: 'Arial', size: 11, color: { argb: 'FF003641' } };
    row.alignment = { vertical: 'top', wrapText: true };
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      cell.border = { bottom: border };
      const type = report.columns[column - 1].type;
      if (rowNumber > 1 && type === 'money') cell.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00;"R$" 0.00';
      if (rowNumber > 1 && type === 'percent') cell.numFmt = '0.00%;[Red]-0.00%;0.00%';
      if (rowNumber > 1 && type === 'text') cell.numFmt = '@';
      if (rowNumber > 1 && ['money', 'percent'].includes(type)) cell.alignment = { horizontal: 'right', vertical: 'top' };
    });
    if (rowNumber === 1) { row.height = 44; row.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }; row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003641' } }; }
    else if (rowNumber === sheet.rowCount) { row.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF003641' } }; row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDEDE4' } }; }
    else if (rowNumber % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F7F4' } };
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: report.rows.length + 1, column: report.columns.length } };
  const context = workbook.addWorksheet('Contexto');
  context.columns = [{ width: 31 }, { width: 115 }];
  context.addRow(['Campo', 'Informação']); context.addRows(report.metadata);
  context.eachRow((row, index) => {
    row.font = { name: 'Arial', size: 11, color: { argb: 'FF003641' }, bold: index === 1 };
    row.alignment = { vertical: 'top', wrapText: true };
    row.height = index > 16 ? 44 : 30;
    if (index === 1) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDEDE4' } };
  });
  return workbook;
}

export async function resultExportXlsx(report) {
  const workbook = await createResultWorkbook(report);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
