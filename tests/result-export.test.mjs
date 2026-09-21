import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { analyze, aggregate } from '../lib/analytics.mjs';
import { buildResultExport, resultExportCsv, resultExportXlsx } from '../lib/result-export.mjs';

const context = { year: 2026, month: 0, period: 'month', source: 'cadence', metric: 'VN', level: 'pa', scopeLabel: 'Todas as centrais', filterLabel: 'Grupo P1 · busca: ponto', uplift: 0 };
function raw(pa, actual = 100, target = 100, extra = {}) {
  const row = { source: 'cadence', metric: 'VN', central: '1002', cooperative: '3017', cooperativeName: 'Cooperativa Alfa', pa: String(pa), group: 'P1', name: `Ponto ${pa}`, cutoff: '2026-01-31', targets: Array(12).fill(target), actuals: Array(12).fill(actual), annualTarget: target == null ? null : target * 12, targetRule: 'registry', ...extra };
  return { ...row, key: `${row.source}:${row.metric}:${row.central}:${row.cooperative}:${row.pa ?? ''}` };
}
const row = (...args) => analyze(raw(...args), context);
const report = (rows, options = {}) => buildResultExport({ rows, context, ...options });

test('filtered and selected scopes preserve only displayed composite identities including PA zero', () => {
  const rows = [row(0), row(0, 200, 100, { central: '2007' }), row(1)];
  assert.equal(report(rows).rows.length, 3);
  const selected = report(rows, { mode: 'selected', selectedIds: [rows[0].key, rows[0].key, 'hidden:key'] });
  assert.deepEqual(selected.rows.map(item => item.id), [rows[0].key]);
  assert.equal(selected.rows[0].pa, '0');
  assert.match(selected.filename, /2026-month-01-selecionadas/);
  assert.throws(() => report(rows, { mode: 'selected', selectedIds: ['hidden:key'] }), /pelo menos uma/);
  assert.throws(() => report([]), /Não há unidades/);
});

test('totals are sums and ratio of sums, with NET gap/surplus, never an average or sum of individual gaps', () => {
  const output = report([row(1, 150, 100), row(2, 50, 300)]);
  assert.equal(output.rows[0].attainment, 1.5); assert.equal(output.rows[1].attainment, 1 / 6);
  assert.equal(output.totals.actual, 200); assert.equal(output.totals.target, 400); assert.equal(output.totals.attainment, .5);
  assert.equal(output.rows[0].surplus, 50); assert.equal(output.rows[1].gap, 250);
  assert.equal(output.totals.gap, 200); assert.equal(output.totals.surplus, 0);
  assert.equal(report([row(1, .1, .1), row(2, .2, .2)]).totals.actual, .3);
});

test('unknown and zero remain distinct, negatives are adjustments and zero targets never claim success', () => {
  const output = report([row(0, 0, 0), row(1, -25.5, 100), row(2, null, 100), row(3, 50, null)]);
  assert.equal(output.rows[0].actual, 0); assert.equal(output.rows[0].attainment, null); assert.match(output.rows[0].status, /Meta zero/);
  assert.equal(output.rows[1].actual, -25.5); assert.equal(output.rows[1].gap, 125.5);
  assert.equal(output.rows[2].actual, null); assert.equal(output.rows[3].target, null);
  assert.equal(output.totals.actual, null); assert.equal(output.totals.target, null); assert.equal(output.totals.attainment, null);
  assert.equal(output.totals.gap, null); assert.equal(output.totals.projected, null);
  const negative = report([row(0, -1, -10)]);
  assert.equal(negative.rows[0].target, -10); assert.equal(negative.rows[0].attainment, null); assert.equal(negative.rows[0].gap, null); assert.equal(negative.rows[0].projected, null);
  const mixedTarget = report([row(0, -1, -10), row(1, 100, 100)]);
  assert.equal(mixedTarget.totals.target, 90); assert.equal(mixedTarget.totals.actual, 99);
  assert.equal(mixedTarget.totals.attainment, null); assert.equal(mixedTarget.totals.surplus, null);
});

test('projection is separately identified and cannot turn a partial actual into achievement', () => {
  const output = report([row(1, 50, 100, { cutoff: '2026-01-05' })]);
  assert.ok(output.rows[0].projected > output.rows[0].target);
  assert.equal(output.rows[0].actual, 50); assert.equal(output.rows[0].status, 'Abaixo da meta'); assert.equal(output.rows[0].phase, 'Parcial');
  assert.match(output.columns.find(column => column.key === 'projected').label, /estimativa/);
});

test('incomplete rows, mixed partial dates and annual conflicts retain values but suppress derived totals', () => {
  const mixed = report([row(1, 50, 100, { cutoff: '2026-01-05' }), row(2, 50, 100, { cutoff: '2026-01-15' })]);
  assert.equal(mixed.totals.actual, 100); assert.equal(mixed.totals.target, 200); assert.equal(mixed.totals.attainment, null); assert.equal(mixed.totals.projected, null);
  assert.equal(mixed.totals.phase, 'Dados incompletos');
  const closed = report([row(1, 50, 100, { cutoff: '2026-02-05' }), row(2, 50, 100, { cutoff: '2026-02-15' })]);
  assert.equal(closed.totals.attainment, .5); assert.equal(closed.totals.phase, 'Fechado');
  const annualContext = { ...context, period: 'annual', month: 11 };
  const conflict = buildResultExport({ rows: [analyze(raw(0, 100, 100, { annualTarget: 999 }), annualContext)], context: annualContext });
  assert.equal(conflict.rows[0].actual, 100); assert.equal(conflict.rows[0].target, 999); assert.equal(conflict.totals.attainment, null); assert.equal(conflict.totals.surplus, null); assert.equal(conflict.totals.status, 'Metas divergentes');
  const missing = raw(0, 100, 100, { cutoff: '2026-02-28' }); missing.actuals[1] = null;
  const incomplete = buildResultExport({ rows: [analyze(missing, annualContext)], context: annualContext });
  assert.equal(incomplete.totals.actual, 100); assert.equal(incomplete.totals.attainment, null); assert.equal(incomplete.totals.projected, null);
});

test('rejects duplicates, mixed metrics/sources and stale periods instead of double-counting', () => {
  assert.throws(() => report([row(1), row(1)]), /repetidas/);
  assert.throws(() => report([row(1), { ...row(1), key: 'different-key' }]), /repetidas/);
  assert.throws(() => report([row(1, 100, 100, { metric: 'AR' })]), /não corresponde/);
  assert.throws(() => report([row(1)], { context: { ...context, month: 2 } }), /não corresponde/);
  assert.throws(() => report([row(1)], { context: { ...context, year: 2101 } }), /válido/);
});

test('base central/cooperative exports keep VN and AR separate and never add PA production', () => {
  for (const metric of ['VN', 'AR']) {
    const baseContext = { ...context, metric, source: 'base', level: 'cooperative' };
    const units = aggregate([raw(null, 123.45, 100, { source: 'base', metric, pa: null })], 'cooperative').map(item => analyze(item, baseContext));
    const result = buildResultExport({ rows: units, context: baseContext });
    assert.equal(result.rows[0].actual, 123.45); assert.equal(result.rows[0].metricLabel, metric === 'AR' ? 'Arrecadação' : 'Venda Nova');
    assert.equal(result.rows[0].pa, '');
    assert.throws(() => buildResultExport({ rows: [...units, row(0, 9999)], context: baseContext }), /não corresponde/);
  }
  const baseContext = { ...context, source: 'base', level: 'cooperative' };
  const fallback = analyze(raw(null, 123.45, 100, { source: 'base', cooperative: '', pa: null, name: 'Plano direto da central' }), baseContext);
  const child = analyze(raw(null, 5, 100, { source: 'base', pa: null }), baseContext);
  assert.equal(buildResultExport({ rows: [fallback], context: baseContext }).rows[0].rowType, 'Central');
  assert.throws(() => buildResultExport({ rows: [fallback, child], context: baseContext }), /não podem ser somadas/);
});

test('CSV is UTF-8 Excel-friendly, protects formula-like text and preserves negative NUMBERS', () => {
  const output = report([row(0, -25.5, 100, { name: ' \t=HYPERLINK("https://example.test";"x")\nOutra linha' }), row(1, null, 100)]);
  const csv = resultExportCsv(output);
  assert.ok(csv.startsWith('\uFEFF"Tipo de linha";"Unidade"'));
  assert.ok(csv.includes('"\' \t=HYPERLINK(""https://example.test"";""x"")\nOutra linha"'));
  assert.ok(csv.includes('"-25,50"')); assert.ok(!csv.includes("'-25,50"));
  assert.match(csv, /"Mensal · JAN\/2026"/); assert.match(csv, /TOTAL DO RECORTE/);
  assert.deepEqual(Object.keys(output.rows[0]).filter(key => /sourceFile|email|phone|owner/i.test(key)), []);
});

test('XLSX round trip keeps numeric currency, numeric percentages, text codes and blank unknowns', async () => {
  const rows = [row('00', 25.5, 100, { name: '=1+1', central: '001', cooperative: '0002' }), row(1, 100, 200, { central: '001', cooperative: '0002' })];
  const output = report(rows), bytes = await resultExportXlsx(output), workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Resultados', 'Contexto']);
  const sheet = workbook.getWorksheet('Resultados');
  const col = key => output.columns.findIndex(column => column.key === key) + 1;
  assert.equal(sheet.getCell(2, col('name')).value, '=1+1'); assert.equal(sheet.getCell(2, col('name')).type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell(2, col('pa')).value, '00'); assert.equal(sheet.getCell(2, col('central')).value, '001');
  assert.equal(sheet.getCell(2, col('actual')).value, 25.5); assert.equal(sheet.getCell(2, col('attainment')).value, .255);
  assert.equal(sheet.getCell(4, col('actual')).value, 125.5); assert.equal(sheet.getCell(4, col('attainment')).value, 125.5 / 300);
  assert.match(sheet.getCell(2, col('attainment')).numFmt, /%/); assert.match(sheet.getCell(2, col('actual')).numFmt, /R\$/);
  assert.equal(sheet.views[0].ySplit, 1); assert.equal(sheet.rowCount, 4);
  const unknown = await resultExportXlsx(report([row(1, null)])), emptyBook = new ExcelJS.Workbook(); await emptyBook.xlsx.load(unknown);
  assert.equal(emptyBook.getWorksheet('Resultados').getCell(2, col('actual')).value, null);
  assert.equal(emptyBook.getWorksheet('Resultados').getCell(3, col('actual')).value, null);
});
