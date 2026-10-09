import test from 'node:test';
import assert from 'node:assert/strict';
import { money, percent } from '../lib/analytics.mjs';
import { buildPeriodPerformance } from '../lib/period-performance.mjs';
import { buildPeriodPerformanceShare, PERIOD_SHARE_PAGE_SIZE } from '../lib/period-performance-share.mjs';
import { sortPerformancePeriods } from '../lib/period-performance-order.mjs';
import { periodPerformanceImageLayout } from '../lib/period-performance-image.mjs';
import { buildEmailFile } from '../lib/portfolio-communication.mjs';
import { createEmptyDataset, initializeRegistry } from '../lib/registry.mjs';

function production(changes = {}) {
  const row = { source: 'base', central: '1002', cooperative: '3017', cooperativeName: 'Alfa', pa: null, name: 'Alfa', group: '', metric: 'AR', targets: Array(12).fill(1000), actuals: [690, 700, 1000, -25.5, 0, 500, 1000, 700, null, null, null, null], annualTarget: 12000, targetRule: 'registry', cutoff: '2026-08-14', ...changes };
  return { ...row, key: `${row.source}:${row.central}:${row.cooperative}:${row.pa ?? ''}:${row.metric}` };
}
function model(changes = {}, filters = {}, ids = ['cooperative:1002:3017']) {
  const dataset = initializeRegistry({ ...createEmptyDataset(2026), rows: [production(changes), production({ cooperative: '3025', name: 'Oculta', actuals: Array(12).fill(99999) }), production({ central: '2007', name: 'Outra central', actuals: Array(12).fill(88888) }), production({ source: 'cadence', pa: '0', metric: 'VN', actuals: Array(12).fill(77777) })] });
  return buildPeriodPerformance({ dataset, filters: { source: 'base', metric: 'AR', level: 'cooperative', central: '1002', search: 'texto que não corresponde', status: 'track', ...filters }, unitIds: ids });
}
const normalized = value => value.replace(/\s+/g, ' ');
const measure = { font: '', measureText(value) { return { width: [...value].length * Number(this.font.match(/(\d+)px/)?.[1] || 22) * .55 }; } };
const bodyRows = html => [...html.matchAll(/data-period-share-id="([^"]+)"/g)].map(match => match[1]);

test('all 19 periods preserve the displayed fixed AR cohort, user order and every PNG page without mutation', () => {
  const source = model(), before = structuredClone(source);
  const report = buildPeriodPerformanceShare({ model: source, order: 'attainment', centralName: 'Sicoob Central Bahia' });
  const expected = ['annual', 'month', 'quarter', 'semester'].flatMap(period => sortPerformancePeriods(source.groups.find(group => group.period === period).rows, 'attainment'));
  assert.deepEqual(report.rows, expected);
  assert.deepEqual(bodyRows(report.html), expected.map(row => row.id));
  assert.deepEqual(report.parts.map(part => part.rows.length), [12, 7]);
  assert.equal(PERIOD_SHARE_PAGE_SIZE, 12);
  assert.deepEqual(report.parts.flatMap(part => part.rows), expected);
  assert.deepEqual(report.parts.map(part => [part.index, part.total, part.from, part.to]), [[1, 2, 1, 12], [2, 2, 13, 19]]);
  assert.equal(report.rows.find(row => row.id === 'month:0').actual, 690);
  assert.equal(report.rows.find(row => row.id === 'month:3').actual, -25.5);
  assert.equal(report.rows.find(row => row.id === 'month:4').actual, 0);
  assert.equal(report.rows.find(row => row.id === 'month:8').actual, null);
  assert.doesNotMatch(report.text, /Oculta|Outra central|99\.999|77\.777/);
  for (const part of report.parts) {
    const drawn = periodPerformanceImageLayout(part, measure).commands.filter(command => command.type === 'text');
    assert.deepEqual(drawn.filter(command => command.role === 'period-label').map(command => command.value), part.rows.map(row => row.label));
  }
  assert.deepEqual(source, before);
});

test('month, quarter, semester and annual selections use exactly the corresponding rows, independent of view collapse', () => {
  const source = model();
  for (const group of source.groups) {
    const report = buildPeriodPerformanceShare({ model: source, period: group.period, order: 'production' });
    assert.deepEqual(report.rows, sortPerformancePeriods(group.rows, 'production'));
    assert.equal(report.parts.length, 1);
    assert.deepEqual(bodyRows(report.html), report.rows.map(row => row.id));
    for (const row of report.rows) assert.ok(report.text.includes(`${row.label} · ${row.phaseLabel} | Meta:`));
  }
});

test('reference hierarchy has one annual summary, separated monthly attainment and compact quarter/semester cards', () => {
  const source = model();
  for (const showProjection of [false, true]) {
    const report = buildPeriodPerformanceShare({ model: source, order: 'production', showProjection });
    assert.deepEqual([...report.html.matchAll(/data-period-share-group="([^"]+)"/g)].map(match => match[1]), ['annual', 'month', 'quarter', 'semester']);
    assert.deepEqual(bodyRows(report.html), report.rows.map(row => row.id));
    assert.equal(bodyRows(report.html).length, 19); assert.equal(new Set(bodyRows(report.html)).size, 19);
    assert.equal(report.rows[0].id, 'annual:11');
    assert.equal((report.html.match(/data-period-share-id="annual:11"/g) || []).length, 1);
    const monthly = report.html.match(/data-period-share-group="month"[\s\S]+?<thead[^>]*>([\s\S]+?)<\/thead>/)[1];
    assert.equal((monthly.match(/<th scope="col"/g) || []).length, showProjection ? 6 : 5);
    assert.match(monthly, />Realizado<\/th>.*>Atingimento<\/th>/s);
    assert.match(report.html, /data-period-share-id="month:7" style="background:#edf8f5"/);
    assert.match(report.html, /− GAP/);
    const annualSummary = report.html.split('data-period-share-group="annual"')[1].split('<h2')[0];
    assert.equal((annualSummary.match(/class="period-share-kpi"/g) || []).length, showProjection ? 4 : 3);
    for (const heading of ['Resumo anual', 'Resultados mensais', 'Visão trimestral', 'Visão semestral']) assert.ok(report.html.includes(heading));
    const textRows = report.text.split('\n').filter(line => line.includes(' | Meta:'));
    assert.deepEqual(textRows.map(line => line.split(' · ')[0]), report.rows.map(row => row.label));
    assert.equal((report.html.match(/data-attainment-band=/g) || []).length, 19);
  }
});

test('projection is absent by default and optional outputs retain exact engine figures and assumptions', () => {
  const source = model({}, { uplift: 20 });
  const off = buildPeriodPerformanceShare({ model: source });
  assert.doesNotMatch(off.html + off.text + off.caption, /projeção|estimativa|Simulação/i);
  const on = buildPeriodPerformanceShare({ model: source, showProjection: true });
  assert.equal((on.html.match(/data-label="Projeção de produção"/g) || []).length, 19);
  assert.match(on.notes.join(' '), /dias úteis.*sem descontar feriados.*períodos fechados.*\+20%/);
  assert.deepEqual(on.rows, off.rows);
  const august = source.groups[0].rows[7];
  assert.ok(august.projected > august.actual);
  assert.ok(on.text.includes(`Projeção de produção: ${money(august.projected)}`));
  assert.ok(on.html.includes(money(august.projected)));
  assert.ok(on.parts.every(part => part.showProjection));
  for (const row of on.rows.filter(row => ['quarter', 'semester'].includes(row.period))) {
    const card = on.html.split(`data-period-share-id="${row.id}"`)[1].split('data-period-share-id=')[0];
    const projection = card.match(/<td data-label="Projeção de produção"[^>]*>([\s\S]*?)<\/td>/)[1];
    const evaluation = row.projectedAttainment == null ? 'Sem avaliação' : `${percent(row.projectedAttainment)} da meta`;
    assert.ok(projection.includes(row.projected == null ? '—' : money(row.projected)), `${row.id}: exact projected amount`);
    assert.ok(projection.includes(`>${evaluation}</div>`), `${row.id}: exact projected percentage context`);
    assert.doesNotMatch(projection, /data-attainment-band/, 'projection must not acquire the observed attainment color');
  }
  const eml = buildEmailFile({ recipients: ['pessoa@example.com'], subject: on.subject, text: on.text, html: on.html });
  const encoded = [...eml.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)(?=\r\n--)/g)].map(match => Buffer.from(match[1].replace(/\s/g, ''), 'base64').toString('utf8'));
  assert.ok(encoded.includes(on.text)); assert.ok(encoded.includes(on.html));
});

test('common dates appear once while closed and mixed-cutoff exceptions remain explicit in all output channels', () => {
  const source = model(), report = buildPeriodPerformanceShare({ model: source, period: 'annual' });
  assert.equal((report.text.match(/14\/08\/2026/g) || []).length, 1);
  assert.equal((report.html.match(/14\/08\/2026/g) || []).length, 1);
  const months = buildPeriodPerformanceShare({ model: source, period: 'month' });
  const january = months.html.match(/<tr data-period-share-id="month:0"[^>]*>(.*?)<\/tr>/s)[1];
  const august = months.html.match(/<tr data-period-share-id="month:7"[^>]*>(.*?)<\/tr>/s)[1];
  assert.match(january, /Corte: 31\/01\/2026/);
  assert.doesNotMatch(august, /Corte:/);
  const mixed = structuredClone(source); mixed.cutoffMin = '2026-08-10';
  mixed.groups[0].rows[7].cutoffMin = '2026-08-10';
  const mixedReport = buildPeriodPerformanceShare({ model: mixed });
  assert.match(mixedReport.text, /Cortes: 10\/08\/2026 a 14\/08\/2026/);
});

test('colors follow real attainment, while future, incomplete and conflicting periods never invent an evaluation', () => {
  const source = model({ annualTarget: 13000 });
  const report = buildPeriodPerformanceShare({ model: source, showProjection: true });
  const band = id => report.html.match(new RegExp(`<tr data-period-share-id="${id}"[^>]*>(.*?)</tr>`, 's'))[1].match(/data-attainment-band="([^"]+)"/)[1];
  assert.equal(band('month:0'), 'red'); assert.equal(band('month:1'), 'yellow'); assert.equal(band('month:2'), 'blue');
  assert.equal(band('month:8'), 'neutral'); assert.equal(band('annual:11'), 'neutral');
  const annual = report.rows.find(row => row.period === 'annual');
  assert.equal(annual.attainment, null); assert.equal(annual.projected, null); assert.equal(annual.variance.value, null);
  assert.match(report.text, /Metas divergentes/);
  assert.equal((report.html.match(/data-attainment-band=/g) || []).length, 19);
});

test('unsafe labels are escaped, subjects are bounded, and long negative currency stays whole in responsive markup', () => {
  const source = model({ actuals: Array(12).fill(-186000000.17), targets: Array(12).fill(9279000), annualTarget: 111348000 });
  source.scopeLabel = '<img src=x onerror=alert(1)>\r\n' + 'nome '.repeat(100);
  const report = buildPeriodPerformanceShare({ model: source, period: 'annual', showProjection: true, centralName: '<script>alert(1)</script>' });
  assert.ok(report.subject.length <= 300); assert.doesNotMatch(report.subject, /[\r\n]/);
  assert.doesNotMatch(report.html, /<img|<script>/); assert.match(report.html, /&lt;script&gt;/);
  for (const value of [report.rows[0].actual, report.rows[0].target, report.rows[0].variance.value]) assert.ok(report.html.includes(money(value)));
  assert.match(report.html, /white-space:nowrap;word-break:normal;overflow-wrap:normal/);
  const breakpoint = Number(report.html.match(/@media\(max-width:(\d+)px\)/)[1]);
  assert.ok(breakpoint > 1000, 'long values stack before narrow numeric columns can collide');
  assert.ok(normalized(report.text).includes(normalized(money(report.rows[0].actual))));
});

test('empty, malformed selections and duplicate periods fail clearly rather than silently dropping data', () => {
  const source = model();
  for (const options of [{ period: 'unknown' }, { order: 'unknown' }, { showProjection: 'yes' }]) assert.throws(() => buildPeriodPerformanceShare({ model: source, ...options }), /Selecione um cenário/);
  assert.throws(() => buildPeriodPerformanceShare({ model: { ...source, count: 0 } }), /Selecione um cenário/);
  assert.throws(() => buildPeriodPerformanceShare({ model: { ...source, groups: [] } }), /Não há períodos/);
  assert.throws(() => buildPeriodPerformanceShare({ model: { ...source, groups: [source.groups[0], source.groups[0]] } }), /Não há períodos/);
});
