import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, summarize } from '../lib/analytics.mjs';
import { attainmentBand } from '../lib/attainment.mjs';
import { buildPeriodPerformance } from '../lib/period-performance.mjs';
import { createEmptyDataset, initializeRegistry, upsertEntity } from '../lib/registry.mjs';
import { scopedAnalyses } from '../lib/scenarios.mjs';

const filters = { source: 'base', metric: 'AR', level: 'cooperative', central: 'all', coop: 'all', pa: 'all', group: 'all', month: 7, period: 'month', uplift: 0 };
function row(changes = {}) {
  const result = { source: 'base', central: '1002', cooperative: '3017', cooperativeName: 'Alfa', pa: null, name: 'Alfa', group: '', metric: 'AR', targets: Array(12).fill(1000), actuals: [690, 700, 1000, 500, 1000, 500, 1000, 700, null, null, null, null], annualTarget: 12000, targetRule: 'registry', cutoff: '2026-08-14', sourceFile: 'fixture.xlsx', sheet: 'Base', sourceRow: 2, ...changes };
  return { ...result, key: `${result.source}:${result.central}:${result.cooperative}:${result.pa ?? ''}:${result.metric}` };
}
const dataset = (rows) => initializeRegistry({ ...createEmptyDataset(2026), rows });
const build = (data, changes = {}, unitIds = ['cooperative:1002:3017']) => buildPeriodPerformance({ dataset: data, filters: { ...filters, ...changes }, unitIds });
const period = (model, type, index = 0) => model.groups.find((group) => group.period === type).rows[index];

test('all 19 periods use the same AR cohort and retain honest future periods', () => {
  const data = dataset([row(), row({ source: 'cadence', metric: 'VN', pa: '0', group: 'P1', actuals: Array(12).fill(99999) })]);
  const before = structuredClone(data), model = build(data);
  assert.deepEqual(model.groups.map((group) => [group.period, group.rows.length]), [['month', 12], ['quarter', 4], ['semester', 2], ['annual', 1]]);
  assert.equal(model.count, 1); assert.equal(model.metric, 'AR');
  assert.deepEqual(model.groups[0].rows.slice(0, 3).map((item) => attainmentBand(item.attainment).key), ['red', 'yellow', 'blue']);
  assert.deepEqual([period(model, 'quarter').target, period(model, 'quarter').actual], [3000, 2390]);
  assert.deepEqual([period(model, 'semester').target, period(model, 'semester').actual], [6000, 4390]);
  assert.deepEqual([period(model, 'annual').target, period(model, 'annual').actual, period(model, 'annual').phase], [12000, 6090, 'partial']);
  const september = period(model, 'month', 8);
  assert.deepEqual([september.target, september.actual, september.projected, september.attainment, september.variance.kind, september.phase], [1000, null, null, null, 'unknown', 'future']);
  assert.equal(period(model, 'month', 1).end, '2026-02-28');
  assert.equal(period(model, 'quarter', 2).start, '2026-07-01');
  assert.deepEqual(data, before);
});

test('displayed IDs fix the cohort across historical status/search changes and empty selections stay empty', () => {
  const data = dataset([row(), row({ cooperative: '3025', actuals: Array(12).fill(8888) })]);
  const model = build(data, { search: 'does not match', status: 'Meta atingida', month: 11, period: 'annual' });
  assert.equal(model.count, 1); assert.equal(period(model, 'month').actual, 690);
  for (const ids of [[], ['central:1002'], ['cooperative:2007:3017']]) {
    const empty = build(data, {}, ids);
    assert.equal(empty.count, 0);
    assert.ok(empty.groups.flatMap((group) => group.rows).every((item) => item.target === null && item.actual === null && item.projected === null));
  }
});

test('composite hierarchy isolates repeated cooperative and PA zero codes, with Cadência always VN', () => {
  const data = dataset([
    row(), row({ central: '2007', actuals: Array(12).fill(25) }),
    row({ source: 'cadence', metric: 'VN', pa: '0', group: 'P1', actuals: Array(12).fill(70) }),
    row({ source: 'cadence', metric: 'VN', pa: '97', group: 'P2', actuals: Array(12).fill(90) }),
    row({ source: 'cadence', metric: 'VN', central: '2007', pa: '0', group: 'P1', actuals: Array(12).fill(900) }),
  ]);
  const other = build(data, { central: '2007', coop: '2007:3017' }, ['cooperative:1002:3017', 'cooperative:2007:3017']);
  assert.equal(other.count, 1); assert.equal(period(other, 'month').actual, 25);
  const pa = build(data, { source: 'cadence', metric: 'AR', level: 'cooperative', pa: '1002:3017:0' }, ['pa:1002:3017:0', 'pa:2007:3017:0']);
  assert.equal(pa.level, 'pa'); assert.equal(pa.metric, 'VN'); assert.equal(pa.count, 1); assert.equal(pa.units[0].pa, '0');
  assert.equal(period(pa, 'month').actual, 70);
  assert.equal(build(data, { source: 'cadence', group: 'P2' }, ['pa:1002:3017:0']).count, 0);
});

test('central aggregation uses cooperative production once and direct central only as fallback', () => {
  const data = dataset([row(), row({ cooperative: '3025', actuals: Array(12).fill(100) }), row({ cooperative: '', name: 'Central direta', targets: Array(12).fill(999999), annualTarget: 11999988, actuals: Array(12).fill(999999) })]);
  const model = build(data, { level: 'central' }, ['central:1002']);
  assert.equal(model.count, 1);
  assert.deepEqual([period(model, 'month').target, period(model, 'month').actual], [2000, 790]);
  const direct = build(dataset([row({ cooperative: '', name: 'Central direta' })]), { level: 'central' }, ['central:1002']);
  assert.equal(period(direct, 'month').actual, 690);
});

test('a cooperative grouped by central explicitly labels its partial scope without expanding the fixed cohort', () => {
  const data = dataset([
    row({ group: 'P1' }),
    row({ cooperative: '3025', cooperativeName: 'Beta', group: 'P2', actuals: Array(12).fill(100) }),
    row({ central: '2007', cooperativeName: 'Outra Alfa', group: 'P1', actuals: Array(12).fill(9999) }),
  ]);
  const selected = { central: '1002', coop: '1002:3017', search: 'Alfa', status: 'attention' };
  const partial = build(data, { ...selected, level: 'central' }, ['central:1002']);
  assert.match(partial.scopeLabel, /^Central 1002 · .*Recorte parcial: cooperativa 3017 · Alfa$/);
  assert.doesNotMatch(partial.scopeLabel, /Beta|Outra Alfa/);
  assert.equal(partial.count, 1);
  assert.deepEqual(partial.groups, build(data, selected).groups);
  assert.deepEqual([period(partial, 'month').target, period(partial, 'month').actual], [1000, 690]);
  assert.deepEqual([period(partial, 'annual').target, period(partial, 'annual').actual], [12000, 6090]);
  const whole = build(data, { central: '1002', level: 'central' }, ['central:1002']);
  assert.doesNotMatch(whole.scopeLabel, /Recorte parcial|cooperativa 3017/);
  assert.deepEqual([period(whole, 'month').target, period(whole, 'month').actual], [2000, 790]);
  const groupOnly = build(data, { central: '1002', level: 'central', group: 'P1' }, ['central:1002']);
  assert.match(groupOnly.scopeLabel, /Recorte parcial: grupo P1$/);
  assert.deepEqual(groupOnly.groups, partial.groups);
  assert.equal(build(data, { ...selected, level: 'central' }, []).count, 0);
});

test('PA policy, manual plans and registered units without production retain the shared target rules', () => {
  const data = dataset([row({ source: 'cadence', metric: 'VN', pa: '0', group: 'P3', targetRule: 'group-fixed', targets: Array(12).fill(1), annualTarget: 12 })]);
  const fixed = build(data, { source: 'cadence' }, ['pa:1002:3017:0']);
  assert.equal(period(fixed, 'month').target, 750); assert.equal(period(fixed, 'annual').target, 9000);
  const manual = build(dataset([row({ source: 'cadence', metric: 'VN', pa: '0', group: 'P3', targetRule: 'manual', targets: Array(12).fill(123), annualTarget: 1476 })]), { source: 'cadence' }, ['pa:1002:3017:0']);
  assert.equal(period(manual, 'month').target, 123);
  const registered = upsertEntity(data, { kind: 'pa', central: '1002', cooperative: '3017', pa: '98', name: 'PA sem produção', group: 'P1' });
  const empty = build(registered, { source: 'cadence' }, ['pa:1002:3017:98']);
  assert.equal(empty.count, 1); assert.equal(period(empty, 'month').target, 450);
  assert.equal(period(empty, 'month').actual, null); assert.equal(period(empty, 'annual').attainment, null);
});

test('zero, missing and negative actuals remain distinct, with no percentage on zero targets', () => {
  const make = (actual, target = 1000) => build(dataset([row({ actuals: Array(12).fill(actual), targets: Array(12).fill(target), annualTarget: target * 12 })]));
  const zero = period(make(0), 'month');
  assert.deepEqual([zero.actual, zero.attainment, zero.variance.kind, zero.variance.value], [0, 0, 'gap', 1000]);
  const missing = period(make(null), 'month');
  assert.deepEqual([missing.actual, missing.attainment, missing.projected, missing.variance.value], [null, null, null, null]);
  const negative = period(make(-100), 'month');
  assert.deepEqual([negative.actual, negative.attainment, negative.projected, negative.variance.value], [-100, -0.1, -100, 1100]);
  const noBase = period(make(0, 0), 'month');
  assert.equal(noBase.target, 0); assert.equal(noBase.attainment, null); assert.equal(noBase.variance.kind, 'met');
  const incomplete = build(dataset([row(), row({ cooperative: '3025', actuals: Array(12).fill(null) })]), {}, ['cooperative:1002:3017', 'cooperative:1002:3025']);
  assert.equal(period(incomplete, 'month').actual, null); assert.equal(period(incomplete, 'month').attainment, null);
});

test('period projections reuse engine outputs, annual plan conflicts cannot earn a band or a variance', () => {
  const data = dataset([row()]), model = build(data, { uplift: 20 });
  const scoped = scopedAnalyses(data, { ...filters, uplift: 20 });
  for (const group of model.groups) for (const item of group.rows) {
    const expected = summarize(scoped.map((unit) => analyze(unit, { year: 2026, month: item.month, period: item.period, uplift: 20 })));
    assert.equal(item.projected, expected.projected); assert.equal(item.actual, expected.actual); assert.equal(item.target, expected.target);
  }
  assert.equal(period(model, 'month').projected, 690);
  assert.ok(period(model, 'month', 7).projected > 700);
  const conflict = build(dataset([row({ annualTarget: 13000 })]));
  const annual = period(conflict, 'annual');
  assert.deepEqual([annual.target, annual.actual, annual.projected, annual.attainment, annual.phase, annual.variance.kind], [13000, 6090, null, null, 'conflict', 'unknown']);
  assert.equal(period(conflict, 'month').attainment, 0.69);
});

test('different source cutoffs block aggregate partial pace and remain comparable after a period closes', () => {
  const data = dataset([row(), row({ cooperative: '3025', cutoff: '2026-08-10' })]);
  const model = build(data, { level: 'central' }, ['central:1002']);
  const partial = period(model, 'month', 7), closed = period(model, 'month', 6);
  assert.equal(partial.mixedCutoffs, true); assert.equal(partial.actual, 1400); assert.equal(partial.phase, 'incomplete');
  assert.equal(partial.attainment, null); assert.equal(partial.projected, null); assert.equal(partial.variance.value, null);
  assert.equal(closed.mixedCutoffs, false); assert.equal(closed.phase, 'closed'); assert.equal(closed.attainment, 1);
});

test('currency precision avoids false outperformance and invalid scope inputs fail clearly', () => {
  const data = dataset([row({ actuals: Array(12).fill(0.1 + 0.2), targets: Array(12).fill(0.3), annualTarget: 3.6 })]);
  const item = period(build(data), 'month');
  assert.equal(item.variance.kind, 'met'); assert.equal(item.variance.value, 0);
  assert.throws(() => buildPeriodPerformance({ dataset: data, unitIds: null }), /Selecione as unidades/);
  assert.throws(() => build(data, { uplift: Infinity }), /aceleração válida/);
  assert.throws(() => build({ ...data, year: NaN }), /Ano da análise inválido/);
});
