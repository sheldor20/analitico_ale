import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPaScenarioReport, PA_SCENARIO_PAGE_SIZE } from '../lib/pa-scenario-share.mjs';
import { createEmptyDataset, initializeRegistry } from '../lib/registry.mjs';
import { scopedAnalyses, sortAnalysis } from '../lib/scenarios.mjs';
import { filterDashboardRows } from '../lib/dashboard-view.mjs';

const filters = { central: 'all', coop: 'all', group: 'all', source: 'cadence', metric: 'VN', level: 'pa', period: 'month', month: 0, status: 'all', search: '', sortBy: 'name', uplift: 0 };
function row(pa, actual = 100, target = 100, overrides = {}) {
  const base = { source: 'cadence', central: '1002', cooperative: '3017', cooperativeName: 'Cooperativa Alfa', pa: String(pa), name: `Ponto ${pa}`, group: 'P1', metric: 'VN', targets: Array(12).fill(target), actuals: Array(12).fill(actual), annualTarget: target == null ? null : target * 12, targetRule: 'registry', cutoff: '2026-01-31', sourceFile: 'private-file.xlsx', sheet: 'Private', sourceRow: 1, ...overrides };
  return { ...base, key: `${base.source}:${base.central}:${base.cooperative}:${base.pa ?? ''}:${base.metric}` };
}
const dataset = rows => initializeRegistry({ ...createEmptyDataset(2026), rows });
const report = (data, options = {}) => buildPaScenarioReport({ dataset: data, filters, ...options });

test('all includes every PA in central/cooperative scope despite group, search and status; PA zero stays distinct', () => {
  const data = dataset([row(0), row(1, 20, 100, { group: 'P2' }), row(0, 999, 100, { cooperative: '3025' }), row(0, 888, 100, { central: '2007' })]);
  const scoped = { ...filters, central: '1002', coop: '1002:3017', group: 'P1', search: 'Ponto 0', status: 'ontrack' };
  const result = report(data, { filters: scoped });
  assert.deepEqual(result.rows.map(item => item.id), ['pa:1002:3017:0', 'pa:1002:3017:1']);
  assert.equal(result.count, 2); assert.equal(result.allCount, 2); assert.equal(result.filteredCount, 1);
  assert.match(result.notes[0], /busca, grupo ou situação/);
  assert.match(result.scopeLabel, /Central 1002 · Cooperativa 3017/);
  assert.deepEqual(report(data).rows.filter(item => item.pa === '0').map(item => item.id).sort(), ['pa:1002:3017:0', 'pa:1002:3025:0', 'pa:2007:3017:0']);
});

test('filtered reproduces dashboard text/status/group selection and ordering, including the pace-based filter', () => {
  const data = dataset([row(0, 50, 100, { cutoff: '2026-01-05' }), row(1, 20, 100), row(2, 200, 100, { group: 'P2' })]);
  const selected = { ...filters, central: '1002', group: 'P1', search: 'ponto', status: 'ontrack', sortBy: 'production', uplift: 40 };
  const expected = sortAnalysis(filterDashboardRows(scopedAnalyses(data, selected), selected.search, selected.status), selected.sortBy);
  const result = report(data, { filters: selected, mode: 'filtered' });
  assert.deepEqual(result.rows.map(item => item.id), expected.map(item => `pa:${item.central}:${item.cooperative}:${item.pa}`));
  assert.equal(result.count, 1); assert.equal(result.rows[0].actual, 50);
  assert.equal(result.rows[0].status, 'Abaixo da meta');
  assert.doesNotMatch(result.text, /Em rota|proje[çc]/i);
});

test('exports exact realized, target and monetary variance, preserving negative adjustments, zero and missing data', () => {
  const result = report(dataset([row(0, 1234.56, 1000), row(1, -25.5, 100), row(2, 0, 100), row(3, null, 100), row(4, 50, null), row(5, 50, 0)]));
  assert.deepEqual(result.rows.map(item => [item.actual, item.target, item.variance.value, item.variance.kind]), [
    [1234.56, 1000, 234.56, 'growth'], [-25.5, 100, 125.5, 'gap'], [0, 100, 100, 'gap'], [null, 100, null, 'unknown'], [50, null, null, 'unknown'], [50, 0, 50, 'growth'],
  ]);
  assert.match(result.text, /Crescimento sobre a meta: R\$\s*234,56/);
  assert.match(result.text, /Realizado: -R\$\s*25,50/);
  assert.match(result.text, /Meta: — \| Realizado: R\$\s*50,00/);
  assert.match(result.text, /Realizado: — \(Atingimento sem base\)/);
  assert.equal(result.rows[2].status, 'Abaixo da meta');
  assert.equal(result.rows[3].status, 'Sem realizado');
  assert.equal(result.rows[4].status, 'Sem meta');
  assert.equal(result.rows[5].status, 'Meta zero · sem base percentual');
  assert.equal(result.rows[5].variance.ratio, null); assert.equal(result.rows[5].attainment, null);
});

test('registry-only PA is retained with unknown production and its existing group target', () => {
  const data = dataset([row(0)]);
  data.registry.entities.push({ id: 'pa:1002:3017:97', kind: 'pa', central: '1002', cooperative: '3017', pa: '97', name: 'Ainda sem produção', group: 'P2' });
  const before = JSON.stringify(data);
  const result = report(data);
  const added = result.rows.find(item => item.pa === '97');
  assert.equal(result.count, 2); assert.equal(added.actual, null); assert.equal(added.target, 600);
  assert.equal(added.variance.value, null); assert.equal(added.attainment, null);
  assert.equal(JSON.stringify(data), before);
});

test('annual conflicts and incomplete observations suppress evaluation while retaining known actuals and dates', () => {
  const incomplete = row(1, 100, 100, { cutoff: '2026-02-28' }); incomplete.actuals[1] = null;
  const result = report(dataset([row(0, 100, 100, { cutoff: '2026-02-15', annualTarget: 999 }), incomplete]), { filters: { ...filters, period: 'annual', month: 11 } });
  assert.equal(result.rows[0].actual, 200); assert.equal(result.rows[0].target, 999);
  assert.equal(result.rows[0].annualConflict, true); assert.equal(result.rows[0].variance.value, null); assert.equal(result.rows[0].attainment, null);
  assert.equal(result.rows[0].status, 'Metas divergentes');
  assert.equal(result.rows[1].actual, 100); assert.equal(result.rows[1].complete, false); assert.equal(result.rows[1].status, 'Dados incompletos');
  assert.equal(result.rows[1].variance.value, null); assert.match(result.text, /15\/02\/2026/); assert.match(result.text, /28\/02\/2026/);
  assert.ok(result.notes.some(note => note.includes('datas de corte diferentes')));
});

test('each period uses the same analytical values and never adds cooperative/base or AR totals', () => {
  const data = dataset([row(0, 15.25, 100, { cutoff: '2026-12-31' }), row(null, 999999, 999999, { source: 'base', pa: null, metric: 'VN' }), row(null, 777777, 777777, { source: 'base', pa: null, metric: 'AR' })]);
  for (const [period, month, actual, target] of [['month', 7, 15.25, 100], ['quarter', 7, 45.75, 300], ['semester', 7, 91.5, 600], ['annual', 11, 183, 1200], ['ytd', 7, 122, 800]]) {
    const result = report(data, { filters: { ...filters, source: 'base', metric: 'AR', period, month } });
    assert.equal(result.count, 1); assert.equal(result.rows[0].actual, actual); assert.equal(result.rows[0].target, target);
    assert.doesNotMatch(result.text, /999\.999|777\.777|proje[çc]/i);
    assert.deepEqual(Object.keys(result.rows[0]).filter(key => /project|pace|sourceFile|email|phone|owner/i.test(key)), []);
  }
});

test('20-PA image parts cover all 46 identities once and keep the full email/text list', () => {
  assert.equal(PA_SCENARIO_PAGE_SIZE, 20);
  const result = report(dataset(Array.from({ length: 46 }, (_, index) => row(index))));
  assert.deepEqual(result.parts.map(part => [part.index, part.total, part.from, part.to, part.rows.length]), [[1, 3, 1, 20, 20], [2, 3, 21, 40, 20], [3, 3, 41, 46, 6]]);
  assert.deepEqual(result.parts.flatMap(part => part.rows.map(item => item.id)), result.rows.map(item => item.id));
  assert.equal((result.html.match(/data-pa-id=/g) || []).length, 46);
  for (const item of result.rows) assert.ok(result.text.includes(`PA ${item.pa} · ${item.name}\n`));
  assert.equal(report(dataset(Array.from({ length: 12 }, (_, index) => row(index)))).parts.length, 1);
  assert.equal(result.whatsapp, result.text);
});

test('HTML escapes names, preserves whole monetary values and subject is a bounded single line', () => {
  const data = dataset([row(0, -1488000000, 9279000, { name: '<img src=x onerror=alert(1)> & "PA"' })]);
  data.registry.entities.find(item => item.kind === 'cooperative').name = `Nome\r\nBcc: injected@example.org ${'<script>x</script>'.repeat(60)}`;
  const result = report(data, { filters: { ...filters, coop: '1002:3017' } });
  assert.ok(result.subject.length <= 300); assert.doesNotMatch(result.subject, /[\r\n]/);
  assert.doesNotMatch(result.html, /<img|<script>/); assert.match(result.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(result.html, /white-space:nowrap;word-break:normal;overflow-wrap:normal/);
  assert.match(result.html, />-R\$\s*1\.488\.000\.000,00<\/strong>/);
  assert.match(result.html, />R\$\s*9\.279\.000,00<\/strong>/);
  const responsiveWidth = Number(result.html.match(/@media\(max-width:(\d+)px\)/)[1]);
  assert.ok(responsiveWidth > 768 && responsiveWidth <= 1120, 'Large amounts must stack before the tablet table cells become too narrow');
  assert.match(result.html, /<table data-pa-scenario/);
});

test('empty scopes are honest and invalid period/year/mode fail explicitly', () => {
  const data = dataset([row(0)]);
  const empty = report(data, { filters: { ...filters, search: 'inexistente' }, mode: 'filtered' });
  assert.equal(empty.count, 0); assert.equal(empty.allCount, 1); assert.deepEqual(empty.parts, []);
  assert.match(empty.html, /Nenhum PA corresponde/);
  assert.throws(() => report(data, { filters: { ...filters, month: 12 } }), /válidos/);
  assert.throws(() => report(data, { filters: { ...filters, period: 'unknown' } }), /válidos/);
  assert.throws(() => report(data, { mode: 'unknown' }), /válidos/);
  assert.throws(() => report({ ...data, year: 2019 }), /válidos/);
});
