import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyDataset, initializeRegistry } from '../lib/registry.mjs';
import { buildCurrentViewModels } from '../lib/current-view.mjs';
import { buildScenarioBundleReport } from '../lib/scenario-share-bundle.mjs';
import { buildCentralScenarioReport } from '../lib/central-scenario-share.mjs';
import { scenarioDisplay } from '../lib/scenario-share-presentation.mjs';
import { paScenarioImageLayout } from '../lib/pa-scenario-image.mjs';
import { money } from '../lib/analytics.mjs';

function row(changes = {}) {
  const value = { source: 'base', central: '1002', cooperative: '3017', cooperativeName: 'Alfa', pa: null, name: 'Alfa', group: 'P1', metric: 'VN', targets: Array(12).fill(1000), actuals: Array(12).fill(700), annualTarget: 12000, targetRule: 'manual', cutoff: '2026-08-14', ...changes };
  return { ...value, key: `${value.source}:${value.central}:${value.cooperative}:${value.pa ?? ''}:${value.metric}` };
}
const data = rows => initializeRegistry({ ...createEmptyDataset(2026), rows });
const filters = { source: 'base', metric: 'VN', level: 'cooperative', central: 'all', coop: 'all', pa: 'all', group: 'all', search: '', status: 'all', month: 7, period: 'month', uplift: 0, sortBy: 'attainment-desc' };
const measure = { font: '', measureText(text) { return { width: [...text].length * Number(this.font.match(/(\d+)px/)?.[1] || 20) * .5 }; } };

test('sharing matches the overview filters, exact priority snapshot and order without expanding the cohort', () => {
  const dataset = data([row(), row({ cooperative: '3025', cooperativeName: 'Beta', name: 'Beta', actuals: Array(12).fill(900) }), row({ central: '2007', name: 'Outra Alfa', actuals: Array(12).fill(5000) })]);
  const options = { ...filters, central: '1002', sortBy: 'attainment', search: 'a' }, unitIdsByMetric = { VN: ['cooperative:1002:3025'] };
  const before = structuredClone(dataset), models = buildCurrentViewModels({ dataset, filters: { ...options, unitIdsByMetric } });
  const report = buildScenarioBundleReport({ dataset, filters: options, kind: 'cooperative', unitIdsByMetric });
  assert.deepEqual(report.rows.map(item => item.id), models[0].unitIds);
  assert.deepEqual(report.rows.map(item => [item.actual, item.target, item.attainment]), models[0].rows.map(item => [item.actual, item.target, item.attainment]));
  assert.equal(report.count, 1); assert.equal(report.rows[0].name, 'Beta');
  assert.equal(report.compact, true); assert.ok(report.parts.every(part => part.compact));
  assert.doesNotMatch(report.html, /Lista filtrada:|Dados de corte/);
  assert.equal((report.html.match(/Corte: 14\/08\/2026/g) || []).length, 1);
  assert.equal(report.scopePartial, true); assert.match(report.html, /Recorte parcial/);
  assert.match(report.text, /Corte: 14\/08\/2026/);
  assert.deepEqual(dataset, before);
  const empty = buildScenarioBundleReport({ dataset, filters: options, kind: 'cooperative', unitIdsByMetric: { VN: [] } });
  assert.equal(empty.count, 0); assert.equal(empty.parts.length, 0); assert.deepEqual(empty.rows, []);
});

test('central sharing uses central totals from cooperative base only, preserving a narrowed cooperative scope', () => {
  const dataset = data([row(), row({ cooperative: '3025', cooperativeName: 'Beta', name: 'Beta', actuals: Array(12).fill(-25.5) }), row({ cooperative: '', name: 'Central direta', actuals: Array(12).fill(99999) }), row({ source: 'cadence', pa: '0', actuals: Array(12).fill(77777) }), row({ central: '2007', actuals: Array(12).fill(100) })]);
  const report = buildScenarioBundleReport({ dataset, filters: { ...filters, level: 'central' }, kind: 'central', unitIdsByMetric: { VN: ['central:1002'] } });
  assert.equal(report.rows.length, 1); assert.equal(report.rows[0].id, 'central:1002');
  assert.equal(report.rows[0].actual, 674.5); assert.equal(report.rows[0].target, 2000);
  assert.match(report.html, /data-central-scenario/); assert.match(report.html, /data-central-id="central:1002"/);
  assert.doesNotMatch(report.html, /data-cooperative-id|77\.777|99\.999/);
  assert.match(scenarioDisplay(report.parts[0]).groups[0].rows[0].label, /^1002/);
  const narrowed = buildScenarioBundleReport({ dataset, filters: { ...filters, level: 'central', coop: '1002:3025' }, kind: 'central' });
  assert.equal(narrowed.rows[0].actual, -25.5); assert.equal(narrowed.rows[0].target, 1000);
  assert.match(narrowed.unitLabel, /Recorte: Cooperativa 3025/); assert.match(narrowed.html, /Recorte: Cooperativa 3025/);
  assert.equal(buildCentralScenarioReport({ dataset, filters: { ...filters, central: '1002' } }).rows[0].actual, 674.5);
});

test('both portfolios keep independent filters, values, missing data and twelve-unit image pages', () => {
  const records = Array.from({ length: 14 }, (_, i) => row({ cooperative: String(4000 + i), name: `Coop ${i}`, actuals: Array(12).fill(i ? 20 : 0) }));
  records.push(...Array.from({ length: 13 }, (_, i) => row({ metric: 'AR', cooperative: String(4000 + i), name: `Coop ${i}`, actuals: Array(12).fill(i ? -25.5 : null), targets: Array(12).fill(100), annualTarget: 1200 })));
  const dataset = data(records), byMetric = { VN: records.slice(0, 14).map(item => `cooperative:1002:${item.cooperative}`), AR: records.slice(14).map(item => `cooperative:1002:${item.cooperative}`) };
  const report = buildScenarioBundleReport({ dataset, filters: { ...filters, metric: 'both', sortBy: 'name' }, kind: 'cooperative', unitIdsByMetric: byMetric });
  assert.deepEqual(report.reports.map(item => [item.metric, item.rows.length]), [['VN', 14], ['AR', 13]]);
  assert.equal(report.count, 14, 'one unit in two portfolios is not counted as two units');
  assert.deepEqual(report.parts.map(part => [part.metric, part.index, part.total, part.rows.length]), [['VN', 1, 2, 12], ['VN', 2, 2, 2], ['AR', 1, 2, 12], ['AR', 2, 2, 1]]);
  assert.deepEqual([...report.html.matchAll(/data-scenario-metric="(VN|AR)"/g)].map(item => item[1]), ['VN', 'AR']);
  assert.equal((report.html.match(/<!doctype/g) || []).length, 1);
  assert.equal(report.reports[0].rows[0].actual, 0); assert.equal(report.reports[1].rows[0].actual, null);
  assert.equal(report.reports[1].rows[1].actual, -25.5);
  for (const part of report.parts) {
    const text = paScenarioImageLayout(part, measure).commands.filter(command => command.type === 'text').map(command => command.text ?? command.value).join(' ');
    assert.match(text, new RegExp(part.metric === 'AR' ? 'Arrecadação' : 'Venda nova'));
  }
});

test('metric-specific masks are never reused for the other portfolio and PA zero stays scoped by both parents', () => {
  const dataset = data([row(), row({ metric: 'AR', cooperative: '3025', actuals: Array(12).fill(50) }), row({ source: 'cadence', pa: '0', actuals: Array(12).fill(99) }), row({ source: 'cadence', central: '2007', pa: '0', actuals: Array(12).fill(999) })]);
  const dual = buildScenarioBundleReport({ dataset, filters: { ...filters, metric: 'both' }, kind: 'cooperative', unitIdsByMetric: { VN: [], AR: ['cooperative:1002:3025'] } });
  assert.deepEqual(dual.reports.map(report => report.rows.map(row => row.id)), [[], ['cooperative:1002:3025']]);
  assert.equal(dual.parts.length, 1); assert.equal(dual.parts[0].metric, 'AR');
  const pa = buildScenarioBundleReport({ dataset, filters: { ...filters, source: 'cadence', metric: 'both', pa: '1002:3017:0' }, kind: 'pa', unitIdsByMetric: { VN: ['pa:1002:3017:0'] } });
  assert.equal(pa.metric, 'VN'); assert.equal(pa.reports.length, 1); assert.equal(pa.rows[0].pa, '0'); assert.equal(pa.rows[0].actual, 99);
});

test('compact optional projections and edited messages preserve exact numbers and HTML escaping', () => {
  const dataset = data([row(), row({ metric: 'AR', actuals: Array(12).fill(100) })]);
  const off = buildScenarioBundleReport({ dataset, filters: { ...filters, metric: 'both' }, kind: 'cooperative' });
  assert.doesNotMatch(off.html, /Projeção de produção|data-projection-assumption/);
  const customization = { subject: 'Resumo\r\nseguro', intro: '<script>alert(1)</script>', cta: 'Próxima ação <equipe>' };
  const on = buildScenarioBundleReport({ dataset, filters: { ...filters, metric: 'both' }, kind: 'cooperative', showProjection: true, customization });
  assert.equal(on.subject, 'Resumo seguro'); assert.doesNotMatch(on.html, /<script>/);
  assert.equal((on.html.match(/data-communication-intro/g) || []).length, 1); assert.equal((on.html.match(/data-communication-cta/g) || []).length, 1);
  assert.match(on.html, /&lt;script&gt;/); assert.match(on.html, /Projeção: estimativa para o encerramento do período/);
  assert.doesNotMatch(on.html, /Premissa:|sem descontar feriados|Lista filtrada:/);
  for (const item of on.reports) assert.ok(on.html.includes(money(item.rows[0].projection.value)));
  assert.deepEqual(on.reports.map(report => report.rows.map(row => [row.actual, row.target])), off.reports.map(report => report.rows.map(row => [row.actual, row.target])));
});

test('registry-only portfolios never promote their placeholder cutoff to an update date', () => {
  const dataset = data([row({ cutoff: '2026-01-15' }), row({ cooperative: '3025', cutoff: '2026-01-15' }), row({ cooperative: '3099', cutoff: '2026-01-15' })]);
  const empty = buildScenarioBundleReport({ dataset, filters: { ...filters, metric: 'both' }, kind: 'cooperative' }).reports[1];
  assert.ok(empty.rows.every(row => row.actual === null && row.cutoff === ''));
  assert.equal(empty.context.cutoff, ''); assert.match(empty.html, /Sem data de atualização/);
  const withActual = data([...dataset.rows, row({ metric: 'AR', cutoff: '2026-07-10', actuals: [50, null, null, null, null, null, null, null, null, null, null, null] })]);
  const mixed = buildScenarioBundleReport({ dataset: withActual, filters: { ...filters, metric: 'AR' }, kind: 'cooperative' });
  assert.equal(mixed.context.cutoff, '2026-07-10');
  assert.equal(mixed.rows.find(row => row.cooperative === '3017').cutoff, '2026-07-10', 'a future period preserves the known historical update');
  assert.ok(mixed.rows.filter(row => row.cooperative !== '3017').every(row => row.cutoff === ''));
  assert.match(mixed.html, /Sem data de atualização/);
});

test('dual metadata describes the union of metric-specific central scopes, including an empty first portfolio', () => {
  const dataset = data([row(), row({ metric: 'AR', central: '2007', actuals: Array(12).fill(25) })]);
  const options = { dataset, filters: { ...filters, metric: 'both' }, kind: 'cooperative' };
  const dual = buildScenarioBundleReport({ ...options, unitIdsByMetric: { VN: ['cooperative:1002:3017'], AR: ['cooperative:2007:3017'] } });
  assert.equal(dual.scopeLabel, 'Centrais 1002, 2007'); assert.equal(dual.centralName, 'Centrais selecionadas');
  assert.match(dual.subject, /Centrais 1002, 2007/); assert.match(dual.caption, /Centrais 1002, 2007/);
  assert.equal(dual.reports[0].rows[0].central, '1002'); assert.equal(dual.reports[1].rows[0].central, '2007');
  const onlyAr = buildScenarioBundleReport({ ...options, unitIdsByMetric: { VN: [], AR: ['cooperative:2007:3017'] } });
  assert.equal(onlyAr.scopeLabel, onlyAr.reports[1].scopeLabel); assert.equal(onlyAr.centralName, onlyAr.reports[1].centralName);
  assert.match(onlyAr.subject, /2007/);
});
