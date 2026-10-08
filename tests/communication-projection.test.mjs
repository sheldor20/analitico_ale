import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, money } from '../lib/analytics.mjs';
import { scopedAnalyses, sortAnalysis } from '../lib/scenarios.mjs';
import { filterDashboardRows } from '../lib/dashboard-view.mjs';
import { buildPaScenarioReport } from '../lib/pa-scenario-share.mjs';
import { buildCooperativeScenarioReport } from '../lib/cooperative-scenario-share.mjs';
import { buildEmailFile, buildPortfolioReport, renderPortfolioCommunication } from '../lib/portfolio-communication.mjs';
import { validateDashboard } from '../lib/portfolio-presentation.mjs';
import { projectionDetails } from '../lib/production-projection.mjs';
import { createEmptyDataset, initializeRegistry } from '../lib/registry.mjs';
import { portfolioFixture, unit } from './portfolio-fixture.mjs';
import { attainmentBand } from '../lib/attainment.mjs';

const filters = { central: '1002', coop: 'all', source: 'base', metric: 'AR', level: 'cooperative', period: 'month', month: 7, group: 'all', search: '', status: 'all', sortBy: 'attainment-desc', uplift: 20 };
function sourceRow(cooperative, actual = 50, overrides = {}) {
  const row = { central: '1002', cooperative, cooperativeName: `Coop ${cooperative}`, name: `Coop ${cooperative}`, source: 'base', pa: null, group: '', metric: 'AR', targets: Array(12).fill(100), annualTarget: 1200, actuals: Array(12).fill(actual), cutoff: '2026-08-20', targetRule: 'registry', ...overrides };
  return { ...row, key: `${row.source}:${row.central}:${row.cooperative}:${row.pa ?? ''}:${row.metric}` };
}
const dataset = rows => initializeRegistry({ ...createEmptyDataset(2026), rows });
const stripProjection = rows => rows.map(({ projection, ...row }) => row);

for (const period of ['month', 'quarter', 'semester', 'annual', 'ytd']) {
  test(`${period}: consolidated projection opt-in uses the analytical estimate without altering actuals, order, scope or full EML`, () => {
    const data = dataset([sourceRow('3017'), sourceRow('3025', 85), sourceRow('3030', -25.5)]), before = JSON.stringify(data);
    const scoped = { ...filters, period }, options = { dataset: data, filters: scoped, mode: 'filtered' };
    const hidden = buildCooperativeScenarioReport(options), shown = buildCooperativeScenarioReport({ ...options, showProjection: true });
    assert.equal(hidden.showProjection, false); assert.equal(shown.showProjection, true);
    assert.deepEqual(stripProjection(shown.rows), hidden.rows);
    assert.ok(hidden.rows.every(row => !Object.hasOwn(row, 'projection')));
    for (const text of [hidden.text, hidden.html, hidden.caption]) assert.doesNotMatch(text, /Projeção|projeção|estimativa/);
    const expected = sortAnalysis(scopedAnalyses(data, scoped), scoped.sortBy);
    assert.deepEqual(shown.rows.map(row => row.id), expected.map(row => `cooperative:${row.central}:${row.cooperative}`));
    for (const [index, row] of shown.rows.entries()) {
      assert.deepEqual(row.projection, projectionDetails(expected[index], 20));
      assert.equal(row.actual, hidden.rows[index].actual);
      for (const text of [shown.text, shown.html]) assert.ok(text.includes(money(row.projection.value)));
      assert.match(row.projection.assumption, /Simulação de ritmo \+20%|encerrado|insuficientes/);
    }
    assert.equal(shown.parts.flatMap(part => part.rows).length, shown.count);
    assert.ok(shown.parts.every(part => part.showProjection));
    assert.match(shown.html, /<th[^>]*>Projeção de produção<\/th>/);
    assert.equal((shown.html.match(/data-label="Projeção de produção"/g) || []).length, 3);
    assert.match(shown.caption, /Inclui projeção de produção, separada do realizado/);
    assert.match(shown.text, /não altera o realizado/);
    assert.equal((shown.html.match(/data-projection-assumption/g) || []).length, new Set(shown.rows.map(row => row.projection.assumption)).size);
    const eml = buildEmailFile({ recipients: [], subject: shown.subject, text: shown.text, html: shown.html });
    const encoded = eml.split('Content-Transfer-Encoding: base64\r\n\r\n').slice(1).map(part => part.split('\r\n--portfolio_alternative_v1')[0].replace(/\r\n/g, ''));
    assert.equal(Buffer.from(encoded[0], 'base64').toString('utf8'), shown.text);
    assert.equal(Buffer.from(encoded[1], 'base64').toString('utf8'), shown.html);
    assert.equal(JSON.stringify(data), before);
  });
}

test('filter identity is the same in the screen analysis and both PA/cooperative communications with projection enabled', () => {
  const rows = [sourceRow('3017', 50), sourceRow('3025', 150), sourceRow('3017', 999, { central: '2007' }), sourceRow('3017', 777, { metric: 'VN' }),
    sourceRow('3017', 50, { source: 'cadence', metric: 'VN', pa: '0', group: 'P1', name: 'Zero A' }), sourceRow('3017', 150, { source: 'cadence', metric: 'VN', pa: '1', group: 'P1', name: 'One A' }), sourceRow('3025', 125, { source: 'cadence', metric: 'VN', pa: '0', group: 'P2', name: 'Zero B' }), sourceRow('3017', 900, { source: 'cadence', metric: 'VN', pa: '0', central: '2007', group: 'P1', name: 'Other zero' })];
  const data = dataset(rows);
  for (const [build, scoped] of [[buildCooperativeScenarioReport, { ...filters, search: '3025', status: 'track', sortBy: 'production' }], [buildPaScenarioReport, { ...filters, source: 'cadence', metric: 'VN', level: 'pa', coop: '1002:3017', pa: '1002:3017:0', group: 'P1', search: 'zero', status: 'attention', sortBy: 'attainment' }]]) {
    const expected = sortAnalysis(filterDashboardRows(scopedAnalyses(data, scoped), scoped.search, scoped.status), scoped.sortBy);
    const result = build({ dataset: data, filters: scoped, mode: 'filtered', showProjection: true });
    assert.ok(result.count > 0, 'fixture exercises at least one unit');
    assert.deepEqual(result.rows.map(row => [row.central, row.cooperative, row.pa, row.actual, row.target, row.projection.value]), expected.map(row => [row.central, row.cooperative, scoped.level === 'pa' ? row.pa : '', row.actual, row.target, row.projected]));
    assert.ok(result.rows.every(row => row.central === '1002'));
    assert.doesNotMatch(result.text, /999,00|777,00|900,00/);
  }
});

test('unknown and conflicting projection remains unknown; closed negative adjustments remain exact', () => {
  for (const [change, period, expected] of [[{ actuals: Array(12).fill(null) }, 'month', null], [{ annualTarget: 999 }, 'annual', null], [{ actuals: Array(12).fill(-25.5), cutoff: '2026-08-31' }, 'month', -25.5]]) {
    const row = sourceRow('3017', 50, change), data = dataset([row]);
    const result = buildCooperativeScenarioReport({ dataset: data, filters: { ...filters, period }, showProjection: true });
    assert.equal(result.rows[0].projection.value, expected);
    if (expected == null) { assert.equal(result.rows[0].projection.attainment, null); assert.match(result.rows[0].projection.assumption, /insuficientes|divergentes/); }
    else { assert.equal(result.rows[0].actual, expected); assert.equal(result.rows[0].projection.phase, 'Fechado'); assert.match(result.rows[0].projection.assumption, /coincide com o realizado/); }
  }
  const data = dataset([sourceRow('3017', 50, { cutoffMin: '2026-08-01' })]);
  const result = buildCooperativeScenarioReport({ dataset: data, filters, showProjection: true });
  assert.equal(result.rows[0].actual, 50); assert.equal(result.rows[0].projection.value, null);
  assert.throws(() => buildCooperativeScenarioReport({ dataset: data, filters, showProjection: 'yes' }), /opção de projeção/);
});

test('individual central uses the visible cooperative scope and PA zero retains cadence independently of same codes', () => {
  const data = portfolioFixture(), central = unit(data, 'central:1002');
  const options = { dataset: data, entity: central, month: 7, period: 'month', metric: 'AR', scopedUnitIds: ['cooperative:1002:3017'] };
  const scoped = buildPortfolioReport(options), whole = buildPortfolioReport({ ...options, metric: 'VN', scopedUnitIds: undefined });
  assert.equal(scoped.sections.length, 1); assert.equal(scoped.sections[0].metric, 'AR');
  assert.equal(scoped.sections[0].current.actual, 700); assert.equal(scoped.sections[0].current.target, 1000);
  const partial = buildPortfolioReport({ ...options, metric: 'VN' });
  assert.equal(partial.sections[0].current.actual, 50); assert.equal(whole.sections[0].current.actual, 200);
  assert.match(partial.scopeNote, /1 de 2 cooperativas/);
  const output = renderPortfolioCommunication(partial, { showProjection: true, showAnnual: false });
  for (const text of [output.html, output.text, output.whatsapp]) assert.match(text, /Recorte da central: 1 de 2 cooperativas/);
  const directOnly = dataset([sourceRow('', 88, { metric: 'VN', name: 'Central direta', cooperativeName: '' })]);
  const direct = buildPortfolioReport({ dataset: directOnly, entity: { id: 'central:1002', kind: 'central', central: '1002', name: 'Central direta' }, period: 'month', month: 7, scopedUnitIds: ['central:1002'] });
  assert.equal(direct.sections[0].current.actual, 88);
  const mixed = dataset([sourceRow('', 8888, { metric: 'VN' }), sourceRow('3017', 50, { metric: 'VN' })]);
  const mixedReport = buildPortfolioReport({ dataset: mixed, entity: central, period: 'month', month: 7, scopedUnitIds: ['central:1002', 'cooperative:1002:3017'] });
  assert.equal(mixedReport.sections[0].current.actual, 50, 'direct central is only a fallback, never added to its child');
  const empty = buildPortfolioReport({ ...options, scopedUnitIds: [] });
  assert.equal(empty.sections[0].available, false);
  const pa = buildPortfolioReport({ dataset: data, entity: unit(data, 'pa:1002:3017:0'), month: 7, period: 'month', metric: 'AR', includeBoth: true, scopedUnitIds: ['pa:1002:3017:0'] });
  assert.equal(pa.source, 'cadence'); assert.equal(pa.sections.length, 1); assert.equal(pa.sections[0].metric, 'VN'); assert.equal(pa.sections[0].current.actual, 225);
  assert.throws(() => buildPortfolioReport({ ...options, scopedUnitIds: [null] }), /escopo/);
});

test('HTML uses unrounded observed attainment bands while projections remain neutral and legacy snapshots remain valid', () => {
  const values = [-.2, .699999, .7, .999999, 1, 1.25, null];
  const data = dataset(values.map((ratio, index) => sourceRow(String(4000 + index), ratio == null ? null : ratio * 100)));
  const output = buildCooperativeScenarioReport({ dataset: data, filters: { ...filters, sortBy: 'name' }, showProjection: true });
  assert.deepEqual([...output.html.matchAll(/data-attainment-band="([^"]+)"/g)].map(match => match[1]), values.map(ratio => attainmentBand(ratio).key));
  for (const rowHtml of output.html.matchAll(/<td class="pa-number" data-label="Projeção de produção"([\s\S]*?)<\/td>/g)) assert.doesNotMatch(rowHtml[0], /data-attainment-band/);
  const fixtures = portfolioFixture(), base = buildPortfolioReport({ dataset: fixtures, entity: unit(fixtures, 'cooperative:1002:3017'), month: 7, period: 'month' });
  for (const ratio of values) {
    base.sections[0].current.attainment = ratio;
    const shown = renderPortfolioCommunication(base, { showAnnual: false, showProjection: true });
    assert.deepEqual([...shown.html.matchAll(/data-attainment-band="([^"]+)"/g)].map(match => match[1]), [attainmentBand(ratio).key]);
    const model = structuredClone(shown.dashboard), card = model.blocks.find(block => block.type === 'cards').items[1];
    assert.equal(card.attainment, ratio); delete card.attainment;
    assert.equal(validateDashboard(model), model);
    for (const invalid of ['0.7', true, NaN, Infinity]) { card.attainment = invalid; assert.throws(() => validateDashboard(model)); }
  }
});
