import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, aggregate } from '../lib/analytics.mjs';
import { attainmentBand } from '../lib/attainment.mjs';
import { buildCurrentViewModels } from '../lib/current-view.mjs';
import { buildUnitScenarioMatrix } from '../lib/unit-scenario-matrix.mjs';
import { createEmptyDataset, initializeRegistry } from '../lib/registry.mjs';

function row(changes = {}) {
  const value = { source: 'base', central: '1002', cooperative: '3017', cooperativeName: 'Cooperativa Alfa', name: 'Cooperativa Alfa', pa: null, group: '', metric: 'VN',
    targets: Array(12).fill(100), annualTarget: 1200, actuals: [50, 50, 0, 50, 50, 50, 50, 50, 25, null, null, null], targetRule: 'registry', cutoff: '2026-09-14', sourceFile: 'fixture.xlsx', sheet: 'Base', sourceRow: 1, ...changes };
  return { ...value, key: `${value.source}:${value.central}:${value.cooperative}:${value.pa ?? ''}:${value.metric}` };
}
const dataset = rows => initializeRegistry({ ...createEmptyDataset(2026), rows });
const filters = { source: 'base', metric: 'VN', level: 'cooperative', central: '1002', coop: 'all', pa: 'all', group: 'all', period: 'month', month: 8, uplift: 0, search: '', status: 'all', sortBy: 'production' };
const view = (rows, changes = {}) => buildCurrentViewModels({ dataset: dataset(rows), filters: { ...filters, ...changes } })[0];

test('matrix preserves the selected cohort, order and original source while reusing exact monthly, quarterly and annual engine values', () => {
  const base = row(), hidden = row({ cooperative: '3025', cooperativeName: 'Outra', name: 'Outra', actuals: Array(12).fill(99999) });
  const pa = row({ source: 'cadence', pa: '0', name: 'PA não agregado', group: 'P1', actuals: Array(12).fill(77777) });
  const model = view([base, hidden, pa], { unitIds: ['cooperative:1002:3017'] });
  model.rows[0].cohort = ['cooperative:1002:3017'];
  const before = structuredClone(model.rows), matrix = buildUnitScenarioMatrix({ rows: model.rows, year: 2026, month: 8 });
  assert.deepEqual(matrix.horizons.map(item => [item.id, item.label]), [['month', 'SET/2026'], ['quarter', '3º trimestre · 2026'], ['annual', '2026']]);
  assert.deepEqual(matrix.rows.map(item => item.id), model.unitIds);
  assert.equal(matrix.rows[0].unit, model.rows[0]);
  assert.equal(matrix.rows[0].unit.source, 'base');
  assert.deepEqual(matrix.rows[0].unit.cohort, ['cooperative:1002:3017']);
  for (const horizon of matrix.horizons) {
    const expected = analyze(model.rows[0], { year: 2026, month: 8, period: horizon.id, uplift: 0 });
    const actual = matrix.rows[0].periods[horizon.id];
    for (const field of ['target', 'actual', 'attainment', 'annualConflict', 'complete', 'expected', 'projected']) assert.equal(actual[field], expected[field]);
  }
  assert.deepEqual(['month', 'quarter', 'annual'].map(period => [matrix.rows[0].periods[period].target, matrix.rows[0].periods[period].actual]), [[100, 25], [300, 125], [1200, 375]]);
  assert.deepEqual(model.rows, before);
});

test('matrix retains zero, missing, future and zero-target states, with no manufactured percentages', () => {
  const zero = row({ cooperative: '3000', actuals: Array(12).fill(0) });
  const missing = row({ cooperative: '3001', actuals: Array(12).fill(null) });
  const future = row({ cooperative: '3002', cutoff: '2026-08-31', actuals: [50, 50, 50, 50, 50, 50, 50, 50, null, null, null, null] });
  const noTarget = row({ cooperative: '3003', targets: Array(12).fill(0), annualTarget: 0, actuals: Array(12).fill(0) });
  const model = view([zero, missing, future, noTarget]);
  const matrix = buildUnitScenarioMatrix({ rows: model.rows, year: 2026, month: 8 });
  const period = code => matrix.rows.find(item => item.unit.cooperative === code).periods.month;
  assert.equal(period('3000').actual, 0); assert.equal(period('3000').attainment, 0);
  assert.equal(period('3001').actual, null); assert.equal(period('3001').phaseKey, 'missing');
  assert.equal(period('3002').actual, null); assert.equal(period('3002').phaseKey, 'future');
  assert.equal(period('3003').target, 0); assert.equal(period('3003').attainment, null);
  assert.equal(attainmentBand(period('3003').attainment).key, 'neutral');
});

test('annual goal conflicts and aggregated mixed cutoffs remain unassessed without duplicating parent production', () => {
  const first = row({ annualTarget: 1500 }), second = row({ cooperative: '3025', cutoff: '2026-09-11' });
  const current = view([first]);
  const annual = buildUnitScenarioMatrix({ rows: current.rows, year: 2026, month: 8 }).rows[0].periods.annual;
  assert.equal(annual.target, 1500); assert.equal(annual.annualConflict, true); assert.equal(annual.phaseKey, 'conflict'); assert.equal(annual.attainment, null);
  const raw = aggregate([row(), second], 'central');
  const matrix = buildUnitScenarioMatrix({ rows: raw, year: 2026, month: 8 });
  assert.equal(matrix.rows.length, 1); assert.equal(matrix.rows[0].id, 'central:1002');
  assert.deepEqual([matrix.rows[0].cutoffMin, matrix.rows[0].cutoff], ['2026-09-11', '2026-09-14']);
  assert.equal(matrix.rows[0].periods.month.actual, 50);
  assert.equal(matrix.rows[0].periods.month.phaseKey, 'incomplete');
  assert.equal(matrix.rows[0].periods.month.attainment, null);
});

test('PA zero keeps composite identity and its fixed target policy, never cooperative or AR production', () => {
  const first = row({ source: 'cadence', pa: '0', group: 'P3', targetRule: 'group-fixed', name: 'PA zero' });
  const other = row({ ...first, central: '2007', actuals: Array(12).fill(99999) });
  const model = view([first, other, row()], { source: 'cadence', metric: 'both', pa: '1002:3017:0' });
  const matrix = buildUnitScenarioMatrix({ rows: model.rows, year: 2026, month: 8 });
  assert.equal(matrix.metric, 'VN'); assert.equal(matrix.source, 'cadence');
  assert.deepEqual(matrix.rows.map(item => item.id), ['pa:1002:3017:0']);
  assert.deepEqual(['month', 'quarter', 'annual'].map(period => matrix.rows[0].periods[period].target), [750, 2250, 9000]);
  assert.equal(matrix.rows[0].periods.month.actual, 25);
});

test('matrix rejects ambiguous portfolios, mixed sources, duplicate units and mismatched years instead of silently merging', () => {
  const base = row();
  assert.throws(() => buildUnitScenarioMatrix({ rows: [base, row({ metric: 'AR' })], year: 2026, month: 8 }), /única fonte e carteira/);
  assert.throws(() => buildUnitScenarioMatrix({ rows: [base, row({ source: 'cadence', pa: '0' })], year: 2026, month: 8 }), /única fonte e carteira/);
  assert.throws(() => buildUnitScenarioMatrix({ rows: [base, { ...base }], year: 2026, month: 8 }), /duplicadas/);
  assert.throws(() => buildUnitScenarioMatrix({ rows: [base], year: 2025, month: 8 }), /ano da matriz/);
  assert.throws(() => buildUnitScenarioMatrix({ rows: [base], year: 2026, month: 12 }), /mês de referência/);
  assert.deepEqual(buildUnitScenarioMatrix({ rows: [], year: 2026, month: 8, metric: 'AR' }).rows, []);
});

test('a January list preserves the original September source cutoff and later-quarter/year observations, including mixed central cutoffs', () => {
  const first = row(), second = row({ cooperative: '3025', cutoff: '2026-09-11' });
  for (const level of ['cooperative', 'central']) {
    const current = view([first, second], { level, month: 0, period: 'month' });
    const matrix = buildUnitScenarioMatrix({ rows: current.rows, year: 2026, month: 0 });
    const original = aggregate([first, second], level);
    assert.ok(matrix.rows.every(item => item.cutoff.startsWith('2026-09-')));
    for (const item of matrix.rows) {
      const source = original.find(unit => unit.key === item.key);
      assert.ok(source);
      assert.deepEqual(item.unit.actuals, source.actuals);
      for (const horizon of matrix.horizons) {
        const expected = analyze(source, { year: 2026, month: 0, period: horizon.id, uplift: 0 });
        assert.deepEqual([item.periods[horizon.id].actual, item.periods[horizon.id].target], [expected.actual, expected.target]);
      }
      assert.ok(item.periods.annual.actual > item.periods.month.actual, 'annual observations must include data after January');
    }
    if (level === 'central') {
      assert.deepEqual([matrix.rows[0].cutoffMin, matrix.rows[0].cutoff], ['2026-09-11', '2026-09-14']);
      assert.equal(matrix.rows[0].periods.month.phaseKey, 'closed');
      assert.equal(matrix.rows[0].periods.annual.phaseKey, 'incomplete');
      assert.equal(matrix.rows[0].periods.annual.attainment, null);
    }
  }
});
