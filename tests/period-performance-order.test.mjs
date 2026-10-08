import test from 'node:test';
import assert from 'node:assert/strict';
import { PERIOD_ORDER_OPTIONS, sortPerformancePeriods } from '../lib/period-performance-order.mjs';

const sample = [
  { month: 0, actual: 100, attainment: 1, projected: 100, variance: { kind: 'met', value: 0 } },
  { month: 1, actual: 90, attainment: 0.9, projected: 180, variance: { kind: 'gap', value: 10 } },
  { month: 2, actual: 200, attainment: 2, projected: 220, variance: { kind: 'growth', value: 100 } },
  { month: 3, actual: 150, attainment: 0.5, projected: 100, variance: { kind: 'gap', value: 150 } },
  { month: 4, actual: -25, attainment: -0.25, projected: -25, variance: { kind: 'gap', value: 125 } },
  { month: 5, actual: null, attainment: null, projected: null, variance: { kind: 'unknown', value: null } },
].map(row => Object.freeze({ ...row, variance: Object.freeze(row.variance) }));
const shuffled = Object.freeze([sample[5], sample[4], sample[3], sample[2], sample[1], sample[0]]);
const months = rows => rows.map(row => row.month);

test('period criteria distinguish ratio, realized, GAP, outperformance and projection without mutating rows', () => {
  const expected = {
    chronological: [0, 1, 2, 3, 4, 5],
    'attainment-desc': [2, 0, 1, 3, 4, 5],
    attainment: [4, 3, 1, 0, 2, 5],
    production: [2, 3, 0, 1, 4, 5],
    gap: [3, 4, 1, 0, 2, 5],
    growth: [2, 0, 1, 3, 4, 5],
    projected: [2, 1, 0, 3, 4, 5],
  };
  const before = structuredClone(shuffled);
  assert.deepEqual(Object.keys(PERIOD_ORDER_OPTIONS), Object.keys(expected));
  for (const [order, sequence] of Object.entries(expected)) {
    const sorted = sortPerformancePeriods(shuffled, order);
    assert.deepEqual(months(sorted), sequence, order);
    assert.notEqual(sorted, shuffled);
    for (const row of sorted) assert.equal(row, sample[row.month]);
  }
  assert.deepEqual(shuffled, before);
});

test('missing metrics sort last even before negative or zero values, and ties return to chronology', () => {
  const rows = [
    { month: 9, actual: null, attainment: null, projected: null },
    { month: 7, actual: Infinity, attainment: NaN, projected: undefined },
    { month: 6, actual: 0, attainment: 0, projected: 0 },
    { month: 4, actual: -10, attainment: -1, projected: -10 },
    { month: 2, actual: 0, attainment: 0, projected: 0 },
  ];
  for (const order of ['attainment-desc', 'production', 'projected']) assert.deepEqual(months(sortPerformancePeriods(rows, order)), [2, 6, 4, 7, 9]);
  assert.deepEqual(months(sortPerformancePeriods(rows, 'attainment')), [4, 2, 6, 7, 9]);
  assert.deepEqual(months(sortPerformancePeriods(rows, 'chronological')), [2, 4, 6, 7, 9]);
});

test('unknown evaluation is never interpreted as zero GAP or zero outperformance', () => {
  const rows = [
    { month: 0, variance: { kind: 'unknown', value: null } },
    { month: 1, variance: { kind: 'met', value: 0 } },
    { month: 2, variance: { kind: 'growth', value: 10000 } },
    { month: 3, variance: { kind: 'gap', value: 0.01 } },
  ];
  assert.deepEqual(months(sortPerformancePeriods(rows, 'gap')), [3, 1, 2, 0]);
  assert.deepEqual(months(sortPerformancePeriods(rows, 'growth')), [2, 1, 3, 0]);
});

test('chronology uses period endpoints for quarters and semesters, with a safe fallback for unknown criteria', () => {
  const quarters = [11, 5, 8, 2].map(month => ({ month, actual: 5 }));
  assert.deepEqual(months(sortPerformancePeriods(quarters)), [2, 5, 8, 11]);
  assert.deepEqual(months(sortPerformancePeriods(quarters, 'production')), [2, 5, 8, 11]);
  assert.deepEqual(months(sortPerformancePeriods(quarters, 'invalid')), [2, 5, 8, 11]);
  assert.deepEqual(months(sortPerformancePeriods([{ month: 11, actual: 5 }, { month: 5, actual: 5 }], 'production')), [5, 11]);
  assert.deepEqual(sortPerformancePeriods([], 'growth'), []);
});
