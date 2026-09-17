import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthlyGoalAlerts, defaultGoalAlertMonth, goalAchievementMessage } from '../lib/goal-alerts.mjs';
import { portfolioFixture } from './portfolio-fixture.mjs';
import { upsertPlanRow } from '../lib/registry.mjs';

test('monthly alerts count exact unit, metric and month using actual production, never projections', () => {
  const dataset = portfolioFixture();
  const alerts = buildMonthlyGoalAlerts(dataset, 7);
  assert.deepEqual(alerts.map((alert) => `${alert.entity.id}:${alert.metric}`).sort(), [
    'central:1002:VN', 'central:2007:VN', 'cooperative:1002:3025:VN', 'cooperative:2007:3017:VN',
  ]);
  assert.equal(defaultGoalAlertMonth(dataset), 7);
  assert.equal(new Set(alerts.map((alert) => alert.key)).size, alerts.length);
  const early = structuredClone(dataset);
  early.rows.forEach((row) => { row.cutoff = '2026-08-05'; row.actuals[7] = row.targets[7] * 0.5; });
  assert.equal(buildMonthlyGoalAlerts(early, 7).length, 0, 'A high projected pace is not an achieved target');
  assert.equal(buildMonthlyGoalAlerts(dataset, 8).length, 0, 'No future goals');
});

test('default month supports large imports without expanding every cell into function arguments', () => {
  const row = { cutoff: '2026-09-17', actuals: [...Array(9).fill(1),null,null,null] };
  assert.equal(defaultGoalAlertMonth({ year: 2026, rows: Array(20000).fill(row) }),8);
});

test('monthly alerts reject zero/missing targets, negative adjustments, incomplete aggregates and date mismatch', () => {
  for (const target of [0, null]) {
    const dataset = portfolioFixture();
    dataset.rows.forEach((row) => { row.targets[7] = target; row.actuals[7] = 100000; });
    assert.equal(buildMonthlyGoalAlerts(dataset, 7).length, 0);
  }
  const incomplete = portfolioFixture();
  incomplete.rows.find((row) => row.source === 'base' && row.central === '1002' && row.cooperative === '3017' && row.metric === 'VN').actuals[7] = null;
  assert.ok(!buildMonthlyGoalAlerts(incomplete, 7).some((alert) => alert.entity.id === 'central:1002'));
  const corrected = portfolioFixture();
  corrected.rows.forEach((row) => { row.actuals[7] = -1; });
  assert.equal(buildMonthlyGoalAlerts(corrected, 7).length, 0);
  const inconsistentCut = portfolioFixture();
  inconsistentCut.rows.find((row) => row.cooperative === '3017' && row.central === '1002' && row.metric === 'VN').cutoff = '2026-08-15';
  assert.ok(!buildMonthlyGoalAlerts(inconsistentCut, 7).some((alert) => alert.entity.id === 'central:1002'));
});

test('AR and PA alerts follow their own goals and refresh after manual corrections; direct central plans never double count', () => {
  let dataset = portfolioFixture();
  for (const [entityId, metric, target] of [['cooperative:1002:3017','AR',1000],['pa:1002:3017:0','VN',450]]) {
    dataset = upsertPlanRow(dataset, { entityId, metric, targets: Array(12).fill(target), annualTarget: target * 12,
      actuals: Array.from({ length: 12 }, (_, month) => month <= 7 ? target : null), cutoff: '2026-08-31' });
  }
  let alerts = buildMonthlyGoalAlerts(dataset, 7);
  assert.ok(alerts.some((alert) => alert.entity.id === 'pa:1002:3017:0' && alert.metric === 'VN'));
  assert.ok(alerts.some((alert) => alert.entity.id === 'cooperative:1002:3017' && alert.metric === 'AR'));
  const central = alerts.find((alert) => alert.entity.id === 'central:1002' && alert.metric === 'VN');
  dataset.rows.push({ ...dataset.rows.find((row) => row.source === 'base' && row.central === '1002' && row.metric === 'VN'), key:'direct-central', cooperative:'', actuals:Array(12).fill(99999),targets:Array(12).fill(1) });
  assert.equal(buildMonthlyGoalAlerts(dataset,7).find((alert) => alert.key === central.key).actual, central.actual);
  dataset.rows.find((row) => row.source === 'cadence' && row.cooperative === '3017').actuals[7] = 449.99;
  alerts = buildMonthlyGoalAlerts(dataset,7);
  assert.ok(!alerts.some((alert) => alert.entity.id === 'pa:1002:3017:0'));
  assert.match(goalAchievementMessage(central), /AGO\/2026/);
  assert.match(goalAchievementMessage(central), /31\/08\/2026/);
});
