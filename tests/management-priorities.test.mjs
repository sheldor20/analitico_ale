import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, money } from '../lib/analytics.mjs';
import { buildManagementPriorities } from '../lib/management-priorities.mjs';

const options = { year: 2026, month: 8, period: 'month' };
function row(code = '3017', actual = 100, changes = {}, analysisOptions = {}) {
  return analyze({ key: `base:VN:cooperative:1002:${code}`, source: 'base', metric: 'VN', central: '1002', cooperative: code,
    name: `Coop ${code}`, cooperativeName: `Coop ${code}`, pa: null, targetRule: 'registry', targets: Array(12).fill(2200),
    annualTarget: 26400, actuals: Array(12).fill(actual), cutoff: '2026-09-01', ...changes }, { ...options, ...analysisOptions });
}
const facts = model => [...model.items, ...model.additional, ...(model.review ? [model.review] : [])];
const find = (model, kind) => facts(model).find(item => item.kind === kind);

test('large full-period GAP is not an alert when production meets the elapsed monthly pace', () => {
  const current = row();
  assert.equal(current.expected, 100);
  assert.equal(current.gap, 2100);
  assert.equal(find(buildManagementPriorities([current]), 'pace'), undefined);
  const delayed = buildManagementPriorities([row('3017', 0)]);
  assert.equal(find(delayed, 'pace').rows.length, 1);
  assert.ok(find(delayed, 'pace').detail.includes(money(100)));
  assert.equal(find(delayed, 'review'), undefined); // Known zero is not missing.
});

test('priorities use monthly target weighting and remain identical under projection uplift', () => {
  const targets = [1100, 2200, ...Array(10).fill(0)];
  const changes = { targets, annualTarget: 3300, actuals: [1100, 300, ...Array(10).fill(0)], cutoff: '2026-02-06' };
  const a = row('3017', 0, changes, { month: 1, period: 'annual', uplift: 0 });
  const b = row('3017', 0, changes, { month: 1, period: 'annual', uplift: 200 });
  assert.notEqual(a.projected, b.projected);
  assert.equal(a.expected, 1650);
  assert.deepEqual(buildManagementPriorities([a]), buildManagementPriorities([b]));
  assert.ok(find(buildManagementPriorities([a]), 'pace').detail.includes(money(250)));
});

test('negative actuals remain signed and missing/zero/conflicting goals never become opportunities', () => {
  const rows = [row('negative', -20), row('missing', null), row('zero', 80, { targets: Array(12).fill(0), annualTarget: 0 }),
    row('unknown-target', 80, { targets: Array(12).fill(null), annualTarget: null })];
  const model = buildManagementPriorities(rows);
  assert.equal(find(model, 'review').rows.length, 4);
  assert.match(find(model, 'review').rows[0].detail, /Realizado negativo/);
  assert.ok(find(model, 'review').rows[0].detail.includes(money(-20)));
  assert.deepEqual(find(model, 'pace').action.keys, [rows[0].key]);
  assert.equal(find(model, 'near-goal'), undefined);
  const conflict = row('conflict', 2150, { annualTarget: 30000 }, { period: 'annual' });
  assert.equal(find(buildManagementPriorities([conflict]), 'pace'), undefined);
  assert.match(find(buildManagementPriorities([conflict]), 'review').rows[0].detail, /Meta anual diverge/);
});

test('near-goal is actual 90% to less than 100% with time remaining, not a projected achievement', () => {
  const rows = [row('below', 1979.99), row('near', 1980), row('met', 2200), row('closed', 2090, { cutoff: '2026-09-30' })];
  const model = buildManagementPriorities(rows);
  assert.deepEqual(find(model, 'near-goal').action.keys, [rows[1].key]);
  assert.ok(find(model, 'near-goal').rows[0].detail.includes(money(220)));
  assert.equal(find(buildManagementPriorities([rows[3]]), 'pace').title, 'Recuperar ritmo');
  assert.match(find(buildManagementPriorities([rows[3]]), 'pace').notes[0], /não há cobrança de produção futura/);
});

test('different source positions keep per-unit pace but suppress aggregate deficits and production ranking', () => {
  const a = row('A', 50), b = row('B', 200, { cutoff: '2026-09-07' });
  const model = buildManagementPriorities([a, b]);
  const pace = find(model, 'pace');
  assert.match(pace.detail, /cada uma avaliada na própria data/);
  assert.equal(pace.detail.includes('R$'), false);
  assert.equal(pace.action.sortBy, 'name');
  assert.equal(find(model, 'production'), undefined);
  assert.deepEqual(pace.rows.map(item => item.cutoff), ['01/09/2026', '07/09/2026']);
  assert.match(model.notes[0], /Cortes diferentes/);
});

test('closed source cutoffs compare the same closed period, while mixed partial aggregates require review', () => {
  const closed = buildManagementPriorities([row('A', 3000, { cutoff: '2026-10-01' }), row('B', 4000, { cutoff: '2026-10-15' })]);
  assert.ok(find(closed, 'production'));
  assert.deepEqual(find(closed, 'production').rows.map(item => item.cutoff), ['30/09/2026', '30/09/2026']);
  const mixed = buildManagementPriorities([row('A', 10, { cutoffMin: '2026-09-01', cutoff: '2026-09-07' })]);
  assert.match(find(mixed, 'review').rows[0].detail, /Datas de corte diferentes/);
  assert.equal(find(mixed, 'pace'), undefined);
});

test('production contribution uses complete positive actuals and never nets a negative into its percentage base', () => {
  const model = buildManagementPriorities([row('A', 300), row('B', 100), row('negative', -200), row('missing', null)]);
  const production = find(model, 'production');
  assert.match(production.detail, /75% da produção positiva/);
  assert.equal(production.rows.length, 2);
  assert.match(production.notes[1], /Valores negativos e informações incompletas ficam fora/);
});

test('never mix sources, metrics, hierarchy, ranges or duplicate identities in a decision total', () => {
  const a = row();
  for (const b of [row('B', 100, { source: 'cadence', pa: '0' }), row('B', 100, { metric: 'AR' }),
    row('B', 100, { cooperative: '', key: 'base:VN:central:1002' }), row('B', 100, {}, { period: 'annual' }), a]) {
    const model = buildManagementPriorities([a, b]);
    assert.equal(facts(model).length, 0);
    assert.match(model.empty, /sem dupla contagem/);
  }
});

test('future periods and empty selections do not manufacture missing information or delayed goals', () => {
  assert.match(buildManagementPriorities([]).empty, /Nenhuma unidade/);
  const future = buildManagementPriorities([row('future', 100, { cutoff: '2026-08-31' })]);
  assert.equal(facts(future).length, 0);
  assert.match(future.empty, /ainda não tem posição/);
});

test('three commercial entries, secondary review, and exact full action identities without truncation', () => {
  const many = Array.from({ length: 150 }, (_, i) => row(`${i}`, 50));
  const rows = [...many, row('near', 2090), row('negative', -5)];
  const before = structuredClone(rows);
  const model = buildManagementPriorities(rows);
  assert.equal(model.items.length, 3);
  assert.equal(model.additional.length, 1);
  assert.equal(model.additional[0].kind, 'production');
  assert.deepEqual(model.items.map(item => item.kind), ['pace', 'near-goal', 'gap']);
  assert.equal(model.review.kind, 'review');
  assert.equal(find(model, 'pace').action.keys.length, 151);
  for (const item of facts(model)) assert.deepEqual(item.action.keys, item.rows.map(unit => unit.key));
  assert.deepEqual(rows, before);
});

test('PA zero and repeated PA codes preserve complete central/cooperative identity in every action', () => {
  const rows = ['3017', '3025'].map(cooperative => row(cooperative, 2090, { source: 'cadence', key: `cadence:1002:${cooperative}:0:VN`, cooperative, pa: '0' }));
  const near = find(buildManagementPriorities(rows), 'near-goal');
  assert.deepEqual(near.action.keys, rows.map(row => row.key));
  assert.equal(near.rows.every(row => row.context.includes('PA 0')), true);
  assert.notEqual(near.rows[0].context, near.rows[1].context);
});

test('PDF check: unit deficits differ from consolidated GAP by the surplus of other units', () => {
  const a = row('A', 229063.87, { targets: Array(12).fill(300000), annualTarget: 3600000, cutoff: '2026-09-30' });
  const b = row('B', 286267.80, { targets: Array(12).fill(277560), annualTarget: 3330720, cutoff: '2026-09-30' });
  const gap = find(buildManagementPriorities([a, b]), 'gap');
  assert.equal(a.target + b.target, 577560);
  assert.equal(Math.round((a.actual + b.actual) * 100), 51533167);
  assert.deepEqual(gap.reconciliation, { consolidated: 62228.33, deficits: 70936.13, surplus: 8707.80 });
  assert.equal(gap.concentration.share, 1);
  assert.deepEqual(gap.action.keys, [a.key]);
  assert.match(gap.notes.join(' '), /A superação de outras unidades reduz o GAP consolidado/);
});

test('deficit concentration names the top three but filters every deficit unit in the same hierarchy', () => {
  const rows = [row('A', 100), row('B', 200), row('C', 300), row('D', 400), row('met', 2300)];
  const gap = find(buildManagementPriorities(rows), 'gap');
  assert.deepEqual(gap.action.keys, rows.slice(0, 4).map(item => item.key));
  assert.deepEqual(gap.concentration.names, ['Coop A', 'Coop B', 'Coop C']);
  assert.equal(gap.concentration.totalUnits, 4);
  assert.equal(gap.concentration.share, (2100 + 2000 + 1900) / (2100 + 2000 + 1900 + 1800));
  assert.equal(gap.reconciliation.deficits, 7800);
  assert.equal(gap.reconciliation.consolidated, 7700);
});

test('different cuts and unevaluable goals cannot produce a comparable consolidated deficit', () => {
  const mixed = find(buildManagementPriorities([row('A', 50), row('B', 200, { cutoff: '2026-09-07' })]), 'gap');
  assert.equal(mixed.concentration, undefined);
  assert.equal(mixed.reconciliation, undefined);
  assert.equal(mixed.action.sortBy, 'name');
  assert.equal(mixed.detail.includes('R$'), false);
  const incomplete = find(buildManagementPriorities([row('A', 50), row('missing', null)]), 'gap');
  assert.equal(incomplete.reconciliation, undefined);
  assert.match(incomplete.notes.join(' '), /1 unidade\(s\) sem avaliação válida/);
});
