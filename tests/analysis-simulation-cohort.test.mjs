import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCurrentViewModels } from '../lib/current-view.mjs';
import { buildScenarioBundleReport } from '../lib/scenario-share-bundle.mjs';
import { upsertPlanRow } from '../lib/registry.mjs';
import { portfolioFixture } from './portfolio-fixture.mjs';

const filters = { source: 'base', metric: 'VN', level: 'cooperative', central: '1002', coop: 'all', pa: 'all', group: 'all', month: 11, period: 'annual', uplift: 0, search: '', status: 'attention', sortBy: 'production' };
function plan(dataset, entityId, metric, target, actual) {
  return upsertPlanRow(dataset, { entityId, metric, targets: Array(12).fill(target), annualTarget: target * 12,
    actuals: [...Array(8).fill(actual), null, null, null, null], cutoff: '2026-08-31' });
}
function crossingFixture() {
  let dataset = plan(portfolioFixture(), 'cooperative:1002:3017', 'VN', 100, 80);
  dataset = plan(dataset, 'cooperative:1002:3025', 'VN', 100, 125);
  dataset = plan(dataset, 'cooperative:1002:3017', 'AR', 1000, 1100);
  return plan(dataset, 'cooperative:1002:3025', 'AR', 1000, 800);
}
const measured = model => model.rows.map(row => [row.key, row.target, row.actual, row.attainment, row.gap, row.cutoff]);

test('simulation keeps the baseline attention cohort when projected status crosses on-track, including the complete export', () => {
  const dataset = crossingFixture(), before = structuredClone(dataset);
  const [baseline] = buildCurrentViewModels({ dataset, filters });
  const simulatedFilters = { ...filters, uplift: 100 };
  const [simulated] = buildCurrentViewModels({ dataset, filters: simulatedFilters });
  assert.deepEqual(baseline.unitIds, ['cooperative:1002:3017']);
  assert.equal(baseline.rows[0].status, 'Atenção');
  assert.equal(simulated.rows[0].status, 'Em rota');
  assert.deepEqual(simulated.unitIds, baseline.unitIds);
  assert.deepEqual(measured(simulated), measured(baseline));
  assert.deepEqual([baseline.summary.target, baseline.summary.actual, baseline.summary.projected], [1200, 640, 960]);
  assert.deepEqual([simulated.summary.target, simulated.summary.actual, simulated.summary.projected], [1200, 640, 1280]);
  assert.equal(simulated.summary.attainment, baseline.summary.attainment);

  const report = buildScenarioBundleReport({ dataset, filters: simulatedFilters, kind: 'cooperative',
    unitIdsByMetric: { VN: simulated.unitIds }, showProjection: true });
  assert.deepEqual(report.rows.map(row => row.id), baseline.unitIds);
  assert.deepEqual(report.rows.map(row => [row.target, row.actual, row.attainment, row.projection.value]), [[1200, 640, 640 / 1200, 1280]]);
  assert.equal(report.parts.flatMap(part => part.rows).length, 1);
  assert.match(report.text, /Simulação de ritmo \+100%/);
  assert.match(report.text, /31\/08\/2026/);
  assert.doesNotMatch(report.text, /Cooperativa Beta|PA Alfa zero/);
  assert.deepEqual(dataset, before);
});

test('both portfolios preserve independent baseline status selections and simulated export figures', () => {
  const dataset = crossingFixture(), scoped = { ...filters, metric: 'both' };
  for (const status of ['attention', 'track']) {
    const baseline = buildCurrentViewModels({ dataset, filters: { ...scoped, status } });
    const simulated = buildCurrentViewModels({ dataset, filters: { ...scoped, status, uplift: 100 } });
    assert.deepEqual(baseline.map(model => model.metric), ['VN', 'AR']);
    const expected = status === 'attention' ? ['cooperative:1002:3017', 'cooperative:1002:3025'] : ['cooperative:1002:3025', 'cooperative:1002:3017'];
    assert.deepEqual(baseline.map(model => model.unitIds[0]), expected);
    for (let index = 0; index < baseline.length; index++) {
      assert.equal(baseline[index].count, 1);
      assert.deepEqual(simulated[index].unitIds, baseline[index].unitIds);
      assert.deepEqual(measured(simulated[index]), measured(baseline[index]));
      assert.ok(simulated[index].summary.projected > baseline[index].summary.projected);
    }
    const report = buildScenarioBundleReport({ dataset, filters: { ...scoped, status, uplift: 100 }, kind: 'cooperative', showProjection: true,
      unitIdsByMetric: Object.fromEntries(simulated.map(model => [model.metric, model.unitIds])) });
    for (let index = 0; index < simulated.length; index++) {
      assert.equal(report.reports[index].metric, simulated[index].metric);
      assert.deepEqual(report.reports[index].rows.map(row => [row.id, row.target, row.actual, row.projection.value]), simulated[index].rows.map(row => [simulated[index].unitIds[0], row.target, row.actual, row.projected]));
    }
  }
});

test('PA simulation preserves PA zero and its parent scope without mixing cooperative production or an AR portfolio', () => {
  const dataset = plan(crossingFixture(), 'pa:1002:3017:0', 'VN', 450, 360);
  const scoped = { ...filters, source: 'cadence', metric: 'both', level: 'pa', coop: '1002:3017', pa: '1002:3017:0' };
  const baseline = buildCurrentViewModels({ dataset, filters: scoped });
  const simulated = buildCurrentViewModels({ dataset, filters: { ...scoped, uplift: 100 } });
  assert.equal(simulated.length, 1);
  assert.equal(simulated[0].metric, 'VN');
  assert.deepEqual(simulated[0].unitIds, ['pa:1002:3017:0']);
  assert.deepEqual(measured(simulated[0]), measured(baseline[0]));
  assert.deepEqual([baseline[0].summary.projected, simulated[0].summary.projected], [4320, 5760]);
  assert.equal(simulated[0].rows[0].status, 'Em rota');
  const report = buildScenarioBundleReport({ dataset, filters: { ...scoped, uplift: 100 }, kind: 'pa', showProjection: true,
    unitIdsByMetric: { VN: simulated[0].unitIds } });
  assert.equal(report.reports.length, 1);
  assert.deepEqual(report.rows.map(row => [row.id, row.actual, row.target, row.projection.value]), [['pa:1002:3017:0', 2880, 5400, 5760]]);
});
