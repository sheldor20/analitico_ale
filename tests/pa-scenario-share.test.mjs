import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPaScenarioReport, PA_SCENARIO_PAGE_SIZE } from '../lib/pa-scenario-share.mjs';
import { createEmptyDataset, initializeRegistry } from '../lib/registry.mjs';
import { scopedAnalyses, sortAnalysis } from '../lib/scenarios.mjs';
import { filterDashboardRows } from '../lib/dashboard-view.mjs';
import { scenarioDisplay } from '../lib/scenario-share-presentation.mjs';
import { paScenarioImageLayout } from '../lib/pa-scenario-image.mjs';

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
  assert.doesNotMatch(result.text, /filtros de busca|desconsiderados/);
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
  assert.match(result.text, /Crescimento: R\$\s*234,56/);
  assert.match(result.text, /Realizado: -R\$\s*25,50/);
  assert.match(result.text, /Meta: — \| Realizado: R\$\s*50,00/);
  assert.match(result.text, /Realizado: — \(Sem avaliação\)/);
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
  assert.ok(result.notes.some(note => note.includes('Exceções à data de corte')));
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

test('12-PA image parts cover all 46 identities once and keep the full email/text list', () => {
  assert.equal(PA_SCENARIO_PAGE_SIZE, 12);
  const result = report(dataset(Array.from({ length: 46 }, (_, index) => row(index))));
  assert.deepEqual(result.parts.map(part => [part.index, part.total, part.from, part.to, part.rows.length]), [[1, 4, 1, 12, 12], [2, 4, 13, 24, 12], [3, 4, 25, 36, 12], [4, 4, 37, 46, 10]]);
  assert.deepEqual(result.parts.flatMap(part => part.rows.map(item => item.id)), result.rows.map(item => item.id));
  assert.equal((result.html.match(/data-pa-id=/g) || []).length, 46);
  for (const item of result.rows) assert.ok(result.text.includes(`PA ${item.pa} · ${item.name} | Meta:`));
  assert.equal(report(dataset(Array.from({ length: 12 }, (_, index) => row(index)))).parts.length, 1);
  assert.equal(result.whatsapp, result.text);
  assert.ok(result.caption.length < result.text.length / 4);
  assert.doesNotMatch(result.caption, /PA 0 · Ponto 0|Meta:|Realizado:|R\$/);
  assert.equal((result.text.match(/Central 1002/g) || []).length, 1);
  assert.equal((result.text.match(/Cooperativa 3017/g) || []).length, 1);
  assert.equal((result.text.match(/31\/01\/2026/g) || []).length, 1);
  for (const part of result.parts) {
    const display = scenarioDisplay(part);
    assert.match(display.scope, /Central 1002 · Cooperativa 3017/);
    assert.equal(display.cutoffLabel, 'Corte: 31/01/2026');
    assert.ok(display.groups.flatMap(group => group.rows).every(item => !item.exception));
  }
});

test('explicit IDs preserve PA zero, hidden choices and exact scope while identifying the partial selection everywhere', () => {
  const data = dataset([row(0), row(1, -25.5), row(0, 50, null, { cooperative: '3025' }), row(0, 999, 100, { central: '2007' })]);
  const before = JSON.stringify(data), selectedIds = ['pa:1002:3017:0', 'pa:1002:3025:0'];
  const result = report(data, { filters: { ...filters, central: '1002', search: 'inexistente', group: 'P9', status: 'attention' }, mode: 'selected', selectedIds });
  assert.equal(result.allCount, 3); assert.equal(result.filteredCount, 0); assert.equal(result.count, 2);
  assert.deepEqual(result.rows.map(item => item.id), selectedIds);
  assert.deepEqual(result.candidates.map(item => item.id).sort(), ['pa:1002:3017:0', 'pa:1002:3017:1', 'pa:1002:3025:0']);
  assert.equal(result.selectionLabel, 'Seleção parcial: 2 de 3 PAs');
  for (const output of [result.text, result.html, result.caption]) assert.ok(output.includes(result.selectionLabel));
  assert.equal(result.parts[0].selectionLabel, result.selectionLabel);
  assert.deepEqual(result.summary, { achievedCount: 1, gapCount: 0, unknownCount: 1 });
  assert.match(result.scope, /Central 1002/); assert.doesNotMatch(result.scope, /Cooperativa 3017/);
  assert.deepEqual(scenarioDisplay(result).groups.map(group => group.label), ['Cooperativa 3017', 'Cooperativa 3025']);
  assert.doesNotMatch(result.text, /Ponto 1|2007|25,50/);
  assert.throws(() => report(data, { filters: { ...filters, central: '1002' }, mode: 'selected', selectedIds: ['pa:2007:3017:0'] }), /fora deste escopo/);
  assert.throws(() => report(data, { mode: 'selected', selectedIds: [null] }), /fora deste escopo/);
  assert.equal(report(data, { mode: 'selected', selectedIds: [selectedIds[0], selectedIds[0]] }).count, 1);
  const empty = report(data, { mode: 'selected', selectedIds: [] });
  assert.equal(empty.count, 0); assert.deepEqual(empty.parts, []); assert.deepEqual(empty.summary, { achievedCount: 0, gapCount: 0, unknownCount: 0 });
  assert.equal(JSON.stringify(data), before);
});

test('explicit ordering is identical in selected HTML, text and images with complete monetary values', () => {
  const data = dataset([row(0, 150), row(1, -10), row(2, 75)]);
  const selectedIds = ['pa:1002:3017:0', 'pa:1002:3017:1', 'pa:1002:3017:2'];
  const result = report(data, { mode: 'selected', selectedIds, sortBy: 'attainment' });
  assert.deepEqual(result.rows.map(item => item.pa), ['1', '2', '0']);
  assert.equal(result.sortBy, 'attainment');
  assert.deepEqual([...result.html.matchAll(/data-pa-id="([^"]+)"/g)].map(match => match[1]), result.rows.map(item => item.id));
  assert.deepEqual(result.text.split('\n').filter(text => /^PA \d+ ·/.test(text)).map(text => text.split(' | ')[0]), result.rows.map(item => `PA ${item.pa} · ${item.name}`));
  const context = { font: '', measureText(text) { return { width: String(text).length * Number(this.font.match(/([\d.]+)px/)?.[1] || 20) * .52 }; } };
  const drawn = paScenarioImageLayout(result.parts[0], context).commands.filter(command => command.type === 'text');
  assert.deepEqual(drawn.filter(command => /^PA \d+ ·/.test(command.value)).map(command => command.value), result.rows.map(item => `PA ${item.pa} · ${item.name}`));
  assert.ok(drawn.some(command => command.value === result.selectionLabel));
  assert.throws(() => report(data, { sortBy: 'not-an-order' }), /ordenação válida/);
});

test('contribution and evolution recompute the comparable cohort after filtering or choosing explicit IDs', () => {
  const alpha = row(0, 90, 100, { name: 'Alpha', cutoff: '2026-09-30' });
  const zulu = row(1, 100, 100, { name: 'Zulu', cutoff: '2026-09-30' });
  alpha.actuals.splice(3, 3, 100, 100, 100);
  zulu.actuals.splice(3, 3, 10, 10, 10);
  const older = row(2, 100, 100, { name: 'Older', group: 'P2', cutoff: '2026-05-31' });
  const data = dataset([alpha, zulu, older]), before = JSON.stringify(data);
  for (const sortBy of ['contribution', 'evolution']) {
    const options = { filters: { ...filters, month: 8, group: 'P1' }, sortBy };
    const full = report(data, options);
    assert.equal(full.rows[0].pa, '0', 'the old cutoff makes the whole scope incomparable and sorting falls back to names');
    for (const mode of ['filtered', 'selected']) {
      const result = report(data, { ...options, mode, selectedIds: ['pa:1002:3017:0', 'pa:1002:3017:1'] });
      assert.deepEqual(result.rows.map(item => item.pa), ['1', '0'], `${mode}/${sortBy} must compare only the two September units`);
      assert.deepEqual(result.rows.map(item => item.actual), [100, 90]);
      assert.equal(result.allCount, 3); assert.equal(result.count, 2);
      assert.deepEqual([...result.html.matchAll(/data-pa-id="([^"]+)"/g)].map(match => match[1]), result.rows.map(item => item.id));
    }
  }
  assert.equal(JSON.stringify(data), before);
});

test('editable subject, opening and CTA are escaped, bounded, and independent of the calculated indicators', () => {
  const data = dataset(Array.from({ length: 15 }, (_, index) => row(index, index * 12.34)));
  const baseline = report(data), customization = { subject: 'Revisão\r\nSicoob', intro: 'Olá, equipe!\n<img src=x onerror=alert(1)>', cta: 'Vamos combinar o retorno? <script>x</script>' };
  const edited = report(data, { customization });
  assert.equal(edited.subject, 'Revisão Sicoob'); assert.equal(edited.intro, customization.intro); assert.equal(edited.cta, customization.cta);
  assert.deepEqual(edited.rows, baseline.rows); assert.deepEqual(edited.parts, baseline.parts);
  assert.match(edited.html, /data-communication-intro/); assert.match(edited.html, /data-communication-cta/);
  assert.match(edited.html, /Olá, equipe!<br>&lt;img/); assert.match(edited.html, /&lt;script&gt;x&lt;\/script&gt;/); assert.doesNotMatch(edited.html, /<img|<script>/);
  for (const text of [edited.text, edited.caption]) { assert.ok(text.includes(customization.intro)); assert.ok(text.includes(customization.cta)); }
  assert.doesNotMatch(edited.caption, /Meta:|Realizado:|R\$/);
  assert.equal(edited.whatsapp, edited.text);
  assert.equal(report(data, { customization: { cta: '' } }).cta, '', 'an intentionally empty CTA must override the suggestion');
  for (const [field, limit] of [['subject', 300], ['intro', 1000], ['cta', 1000]]) assert.throws(() => report(data, { customization: { [field]: 'x'.repeat(limit + 1) } }), /caracteres/);
});

test('suggested next steps follow observed results and incomplete data without calling a partial GAP late', () => {
  assert.match(report(dataset([row(0, null)])).cta, /Confira os dados pendentes/);
  assert.match(report(dataset([row(0, 50, null)])).cta, /metas cadastradas/);
  assert.match(report(dataset([row(0, 20, 100, { cutoff: '2026-01-05' })])).cta, /maior GAP/);
  assert.match(report(dataset([row(0, 95, 100, { cutoff: '2026-01-05' })])).cta, /oportunidades em aberto/);
  assert.match(report(dataset([row(0, 150)])).cta, /Sustente a produção/);
  assert.match(report(dataset([row(0), row(1, 20, 100, { cutoff: '2026-01-05' })])).cta, /datas de corte/);
  assert.match(report(dataset([row(0, 100, 100, { annualTarget: 999 })]), { filters: { ...filters, period: 'annual' } }).cta, /Concilie a meta anual/);
  const partial = report(dataset([row(0, 20, 100, { cutoff: '2026-01-05' })]));
  assert.doesNotMatch(partial.caption, /atras|ritmo|proje[çc]|parabéns/i);
});

test('mixed parents are grouped once with explicit ordering and only exceptional dates on their PA', () => {
  const result = report(dataset([row(0, 100), row(1, 200), row(2, 150, 100, { cooperative: '3025', cutoff: '2026-01-15' }), row(3, 250, 100, { cooperative: '3025' })]), { filters: { ...filters, sortBy: 'production' } });
  assert.deepEqual(result.rows.map(item => item.pa), ['3', '2', '1', '0']);
  assert.ok(result.notes.includes('Por cooperativa · Maior produção'));
  const display = scenarioDisplay(result);
  assert.equal(display.cutoffLabel, 'Corte de referência: 31/01/2026');
  assert.deepEqual(display.groups.map(group => group.label), ['Cooperativa 3025', 'Cooperativa 3017']);
  assert.deepEqual(display.groups.flatMap(group => group.rows).filter(item => item.exception).map(item => [item.row.pa, item.exception]), [['2', 'Corte: 15/01/2026']]);
  assert.equal((result.text.match(/Cooperativa 3025/g) || []).length, 1);
  assert.equal((result.text.match(/31\/01\/2026/g) || []).length, 1);
  assert.equal((result.text.match(/15\/01\/2026/g) || []).length, 1);
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
