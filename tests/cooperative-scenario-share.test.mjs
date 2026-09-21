import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCooperativeScenarioReport, COOPERATIVE_SCENARIO_PAGE_SIZE } from '../lib/cooperative-scenario-share.mjs';
import { createEmptyDataset, initializeRegistry } from '../lib/registry.mjs';
import { scenarioDisplay } from '../lib/scenario-share-presentation.mjs';
import { paScenarioImageLayout } from '../lib/pa-scenario-image.mjs';

const filters = { central: '1002', coop: 'all', group: 'all', source: 'base', metric: 'VN', level: 'central', period: 'month', month: 0, status: 'all', search: '', sortBy: 'name', uplift: 0 };
function row(cooperative, actual = 100, target = 100, overrides = {}) {
  const value = { source: 'base', central: '1002', cooperative, cooperativeName: `Coop ${cooperative}`, pa: null, name: `Coop ${cooperative}`, group: '', metric: 'VN', targets: Array(12).fill(target), actuals: Array(12).fill(actual), annualTarget: target == null ? null : target * 12, targetRule: 'registry', cutoff: '2026-01-31', sourceFile: 'private.xlsx', sheet: 'Private', sourceRow: 1, ...overrides };
  return { ...value, key: `${value.source}:${value.central}:${value.cooperative}:${value.pa ?? ''}:${value.metric}` };
}
const dataset = rows => initializeRegistry({ ...createEmptyDataset(2026), rows });
const report = (data, options = {}) => buildCooperativeScenarioReport({ dataset: data, filters, ...options });

test('central list includes only its cooperatives, excludes direct central and PA balances, and preserves repeated codes across centrals', () => {
  const data = dataset([row('3017', 10), row('3025', 20), row('3017', 30, 100, { central: '2007' }), row('', 555555, 555555), row('', 888888, 888888, { central: '9000' }), row('3017', 999999, 999999, { source: 'cadence', pa: '0', name: 'PA 0', group: 'P1' })]);
  const result = report(data);
  assert.deepEqual(result.rows.map(item => [item.id, item.actual, item.pa]), [['cooperative:1002:3017', 10, ''], ['cooperative:1002:3025', 20, '']]);
  assert.equal(result.kind, 'cooperative'); assert.equal(result.metric, 'VN');
  assert.doesNotMatch(result.text, /555\.555|888\.888|999\.999|PA 0|proje[çc]/i);
  const all = report(data, { filters: { ...filters, central: 'all' } });
  assert.equal(all.count, 3); assert.equal(all.rows.filter(item => item.cooperative === '3017').length, 2);
  assert.deepEqual(scenarioDisplay(all).groups.map(group => group.label).sort(), ['Central 1002', 'Central 2007']);
});

test('all ignores search/status/PA group; filtered honors search/status/order while group never hides cooperatives', () => {
  const data = dataset([row('3017', 10), row('3025', 200), row('3030', 300)]);
  const selected = { ...filters, search: '3025', status: 'ontrack', group: 'P5', sortBy: 'production' };
  const all = report(data, { filters: selected });
  assert.equal(all.count, 3); assert.equal(all.filteredCount, 1);
  const filtered = report(data, { filters: selected, mode: 'filtered' });
  assert.deepEqual(filtered.rows.map(item => item.cooperative), ['3025']);
  assert.equal(filtered.rows[0].actual, 200);
  const coop = report(data, { filters: { ...selected, coop: '1002:3017' } });
  assert.equal(coop.count, 1); assert.equal(coop.rows[0].cooperative, '3017');
});

test('VN and AR are independent; registered cooperatives without metric data remain unknown instead of zero', () => {
  const data = dataset([row('3017', 12.34), row('3017', 987.65, 2000, { metric: 'AR' }), row('3025', 25)]);
  data.registry.entities.push({ id: 'cooperative:1002:3030', kind: 'cooperative', central: '1002', cooperative: '3030', name: 'Sem produção' });
  const before = JSON.stringify(data), vn = report(data), ar = report(data, { filters: { ...filters, metric: 'AR', source: 'cadence' } });
  assert.equal(vn.rows[0].actual, 12.34); assert.equal(ar.rows[0].actual, 987.65); assert.equal(ar.rows[0].target, 2000);
  assert.equal(ar.metric, 'AR'); assert.match(ar.text, /Arrecadação/); assert.doesNotMatch(ar.text, /Venda Nova/);
  assert.deepEqual(ar.rows.slice(1).map(item => [item.actual, item.target, item.attainment, item.variance.value]), [[null, null, null, null], [null, null, null, null]]);
  assert.equal(ar.count, 3); assert.equal(JSON.stringify(data), before);
});

test('negative actual, actual zero, target zero, missing observations and annual conflicts keep honest differences', () => {
  const data = dataset([row('3017', -25.5), row('3025', 0), row('3030', 50, 0), row('3031', null), row('3032', 100, 100, { annualTarget: 999 })]);
  const monthly = report(data);
  assert.deepEqual(monthly.rows.map(item => [item.actual, item.variance.value, item.variance.kind]), [[-25.5, 125.5, 'gap'], [0, 100, 'gap'], [50, 50, 'growth'], [null, null, 'unknown'], [100, 0, 'met']]);
  assert.equal(monthly.rows[2].attainment, null); assert.match(monthly.rows[2].status, /Meta zero/);
  const annual = report(data, { filters: { ...filters, period: 'annual', month: 11 } });
  const conflict = annual.rows.find(item => item.cooperative === '3032');
  assert.equal(conflict.actual, 100); assert.equal(conflict.target, 999); assert.equal(conflict.annualConflict, true);
  assert.equal(conflict.attainment, null); assert.equal(conflict.variance.value, null);
  assert.match(annual.text, /Metas divergentes/);
});

test('common metadata is one header; mixed and interval dates remain truthful in the row exceptions', () => {
  const data = dataset([row('3017'), row('3025'), row('3030', 100, 100, { cutoff: '2026-01-15' })]);
  const result = report(data), display = scenarioDisplay(result);
  assert.equal(display.cutoffLabel, 'Corte de referência: 31/01/2026');
  assert.equal((result.text.match(/Central 1002/g) || []).length, 1);
  assert.equal((result.text.match(/31\/01\/2026/g) || []).length, 1);
  assert.deepEqual(display.groups[0].rows.map(item => item.exception), ['', '', 'Corte: 15/01/2026']);
  const interval = report(dataset([row('3017', 100, 100, { cutoffMin: '2026-01-15' })]));
  assert.equal(scenarioDisplay(interval).cutoffLabel, 'Cortes: 15/01/2026 a 31/01/2026');
  assert.equal(interval.rows[0].complete, false); assert.equal(interval.rows[0].attainment, null); assert.equal(interval.rows[0].variance.value, null);
});

test('47 cooperatives remain complete in HTML/text and numbered image parts, with compact shared geometry', () => {
  const result = report(dataset(Array.from({ length: 47 }, (_, index) => row(String(4000 + index)))));
  assert.equal(COOPERATIVE_SCENARIO_PAGE_SIZE, 12);
  assert.deepEqual(result.parts.map(part => [part.index, part.total, part.from, part.to, part.rows.length]), [[1, 4, 1, 12, 12], [2, 4, 13, 24, 12], [3, 4, 25, 36, 12], [4, 4, 37, 47, 11]]);
  assert.deepEqual(result.parts.flatMap(part => part.rows.map(item => item.id)), result.rows.map(item => item.id));
  assert.equal((result.html.match(/data-cooperative-id=/g) || []).length, 47);
  for (const item of result.rows) assert.ok(result.text.includes(`${item.cooperative} · ${item.name} | Meta:`));
  const context = { font: '', measureText(text) { return { width: String(text).length * (Number(this.font.match(/([\d.]+)px/)?.[1]) || 20) * .52 }; } };
  const layout = paScenarioImageLayout(result.parts[0], context);
  assert.equal(layout.width, 1200); assert.ok(layout.height < 1900);
  for (const part of result.parts) { assert.match(part.scope, /Central 1002/); assert.equal(scenarioDisplay(part).cutoffLabel, 'Corte: 31/01/2026'); }
});

test('selected cooperative IDs keep AR isolated and captions identify the exact subset without individual figures', () => {
  const data = dataset([row('3017', 10), row('3017', 150, 100, { metric: 'AR' }), row('3025', -25.5, 100, { metric: 'AR' }), row('3030', null, null, { metric: 'AR' })]);
  const result = report(data, { filters: { ...filters, metric: 'AR', search: '3017' }, mode: 'selected', selectedIds: ['cooperative:1002:3025', 'cooperative:1002:3030'], customization: { subject: 'Plano da equipe', cta: 'Retornem com as ações combinadas.' } });
  assert.equal(result.count, 2); assert.equal(result.allCount, 3); assert.equal(result.filteredCount, 1);
  assert.deepEqual(result.rows.map(item => [item.cooperative, item.actual, item.variance.value]), [['3025', -25.5, 125.5], ['3030', null, null]]);
  assert.deepEqual(result.summary, { achievedCount: 0, gapCount: 1, unknownCount: 1 });
  assert.match(result.caption, /Arrecadação/); assert.match(result.caption, /Seleção parcial: 2 de 3 cooperativas/); assert.match(result.caption, /Retornem/);
  assert.doesNotMatch(result.caption, /125,50|25,50|3017|Venda Nova/);
  assert.doesNotMatch(result.html, /data-cooperative-id="cooperative:1002:3017"/);
  assert.throws(() => report(data, { mode: 'selected', selectedIds: ['pa:1002:3017:0'] }), /fora deste escopo/);
});

test('cooperative HTML escapes names and whole billions fit the responsive layout without leaking metadata', () => {
  const data = dataset([row('3017', -1488000000, 9279000, { cooperativeName: '<img src=x onerror=alert(1)> & Alfa' })]);
  const result = report(data);
  assert.match(result.html, /data-cooperative-scenario/); assert.match(result.html, /&lt;img src=x onerror=alert\(1\)&gt;/); assert.doesNotMatch(result.html, /<img/);
  assert.match(result.html, />-R\$\s*1\.488\.000\.000,00<\/strong>/); assert.match(result.html, />R\$\s*9\.279\.000,00<\/strong>/);
  assert.ok(Number(result.html.match(/@media\(max-width:(\d+)px\)/)[1]) > 768);
  assert.ok(result.subject.length <= 300); assert.doesNotMatch(result.subject, /[\r\n]/);
  assert.doesNotMatch(JSON.stringify(result), /private\.xlsx|sourceFile|projected|phone|email/);
});
