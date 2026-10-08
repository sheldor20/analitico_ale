import test from 'node:test';
import assert from 'node:assert/strict';
import { money } from '../lib/analytics.mjs';
import { attainmentBand } from '../lib/attainment.mjs';
import { goalVariance } from '../lib/goal-variance.mjs';
import { buildPeriodPerformance } from '../lib/period-performance.mjs';
import { createEmptyDataset, initializeRegistry } from '../lib/registry.mjs';
import { periodPerformanceImageLayout, renderPeriodPerformancePng } from '../lib/period-performance-image.mjs';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const amount = value => money(value).replace(/\s+/g, ' ');
const texts = layout => layout.commands.filter(command => command.type === 'text');
function measurement() {
  return { font: '', measureText(value) { return { width: [...value].length * Number(this.font.match(/(\d+)px/)?.[1] ?? 22) * .55 }; } };
}
function row(month = 7, changes = {}) {
  return { id: `month:${month}`, period: 'month', month, label: MONTHS[month], start: '2026-08-01', end: '2026-08-31',
    target: 1000, actual: 700, attainment: .7, projected: 1400, projectedAttainment: 1.4, variance: goalVariance(700, 1000),
    complete: true, annualConflict: false, mixedCutoffs: false, phase: 'partial', phaseLabel: 'Parcial', cutoffMin: '2026-08-14', cutoff: '2026-08-14', ...changes };
}
function part(rows = [row()], changes = {}) {
  return { index: 1, total: 1, from: 1, to: rows.length, rows, year: 2026, metric: 'AR', scopeLabel: 'Cooperativa 3017 · Alfa', centralName: 'Sicoob Central Bahia', unitLabel: 'Cooperativa 3017 · Alfa',
    periodLabel: 'Resultados por período · 2026', cutoffMin: '2026-08-14', cutoff: '2026-08-14', showProjection: false, notes: [], orderLabel: 'Cronológica', ...changes };
}
function geometry(layout, context, width = 1200) {
  assert.equal(layout.width, width);
  assert.ok(layout.height > 0 && layout.height <= 12000);
  for (const command of layout.commands) {
    assert.ok(command.x >= 0 && command.y >= 0);
    if (command.type === 'rect') {
      assert.ok(command.width > 0 && command.height > 0);
      assert.ok(command.x + command.width <= layout.width);
      assert.ok(command.y + command.height <= layout.height);
    } else {
      context.font = `${command.bold ? '700' : '400'} ${command.size}px Arial`;
      const measured = context.measureText(command.value).width;
      assert.ok(measured <= command.maxWidth, `Text exceeds its column: ${command.value}`);
      assert.ok(command.x + measured <= layout.width - 35);
      assert.ok(command.y + Math.ceil(command.size * 1.4) <= layout.height);
    }
  }
  const rowBoxes = layout.commands.filter(command => command.type === 'rect' && command.x === 36 && ['#f0f7f4', '#ffffff'].includes(command.fill));
  for (const box of rowBoxes) {
    const inside = texts(layout).filter(command => command.y >= box.y && command.y < box.y + box.height);
    assert.ok(inside.every(command => command.y + Math.ceil(command.size * 1.4) <= box.y + box.height), 'row text must end before the next row starts');
  }
}

test('period PNG keeps the three-line brand header, exact financial columns and one shared cutoff without mutating input', () => {
  const source = part(), before = structuredClone(source), measure = measurement(), layout = periodPerformanceImageLayout(source, measure);
  const drawn = texts(layout), header = drawn.filter(command => command.y < layout.commands[0].height);
  assert.deepEqual(header.map(command => command.value), ['Gestão comercial · Arrecadação', 'Sicoob Central Bahia', 'Resultados por período · 2026']);
  assert.equal(drawn.filter(command => command.value === source.scopeLabel).length, 1);
  assert.equal(drawn.filter(command => command.value.includes('14/08/2026')).length, 1);
  assert.ok(drawn.some(command => command.value.includes('Parte 1 de 1 · Períodos 1–1')));
  assert.ok(drawn.some(command => command.value.includes('Ordem: Cronológica')));
  const currencies = [1000, 700, 300].map(value => drawn.filter(command => command.value === amount(value)));
  assert.ok(currencies.every(commands => commands.length === 1));
  assert.deepEqual(currencies.map(([command]) => command.x), [388, 638, 898]);
  assert.equal(new Set(currencies.map(([command]) => command.y)).size, 1);
  assert.ok(drawn.some(command => command.value === '70% da meta'));
  assert.ok(drawn.some(command => command.value === 'Parcial'));
  assert.deepEqual(source, before);
  geometry(layout, measure);
});

test('all nineteen engine periods survive twelve-row parts in their supplied order, including future rows', () => {
  const production = { key: 'base:1002:3017::AR', source: 'base', metric: 'AR', central: '1002', cooperative: '3017', cooperativeName: 'Alfa', pa: null, name: 'Alfa', group: '',
    targets: Array(12).fill(1000), annualTarget: 12000, targetRule: 'registry', actuals: [690, 700, 1000, 500, 1000, 500, 1000, 700, null, null, null, null], cutoff: '2026-08-14' };
  const dataset = initializeRegistry({ ...createEmptyDataset(2026), rows: [production] });
  const model = buildPeriodPerformance({ dataset, filters: { source: 'base', metric: 'AR', level: 'cooperative', central: '1002' }, unitIds: ['cooperative:1002:3017'] });
  const rows = model.groups.flatMap(group => group.rows), seen = [];
  for (let index = 0; index < 2; index++) {
    const slice = rows.slice(index * 12, (index + 1) * 12), measure = measurement();
    const source = part(slice, { index: index + 1, total: 2, from: index * 12 + 1, to: Math.min(rows.length, (index + 1) * 12) });
    const layout = periodPerformanceImageLayout(source, measure), drawn = texts(layout);
    assert.ok(layout.height < 3000);
    const labels = drawn.filter(command => command.x === 52 && command.size === 23).map(command => command.value);
    assert.deepEqual(labels, slice.map(item => item.label)); seen.push(...labels);
    for (const item of slice) {
      const label = drawn.find(command => command.x === 52 && command.size === 23 && command.value === item.label);
      const actual = drawn.find(command => command.x === 638 && command.y === label.y);
      assert.equal(actual.value, item.actual === null ? '—' : amount(item.actual));
    }
    geometry(layout, measure);
  }
  assert.equal(seen.length, 19);
  assert.deepEqual(seen, rows.map(item => item.label));
  assert.equal(rows.find(item => item.id === 'month:8').phase, 'future');
});

test('assumptions stay complete below the results without expanding the compact header or repeating the projection warning', () => {
  const rows = Array.from({ length: 4 }, (_, index) => row(index, { period: 'quarter', label: `${index + 1}º trimestre` }));
  const notes = [
    'Mesmas unidades em todos os períodos: 1 cooperativa. A ordem foi mantida dentro de cada grupo.',
    'Realizado até a data de corte. — indica dado não informado ou sem avaliação.',
    'Projeção de produção é estimativa pelo ritmo até o corte e metas restantes; considera dias úteis, sem descontar feriados. Coincide com o realizado nos períodos fechados.',
  ];
  const withoutNotes = periodPerformanceImageLayout(part(rows, { showProjection: true }), measurement());
  const measure = measurement(), layout = periodPerformanceImageLayout(part(rows, { showProjection: true, notes }), measure), drawn = texts(layout);
  const baselineRows = texts(withoutNotes).filter(command => command.x === 52 && command.size === 23);
  const actualRows = drawn.filter(command => command.x === 52 && command.size === 23);
  assert.deepEqual(actualRows, baselineRows, 'notes must not move the table below its scope and date context');
  const tableBottom = Math.max(...layout.commands.filter(command => command.type === 'rect' && command.x === 36 && ['#f0f7f4', '#ffffff'].includes(command.fill)).map(command => command.y + command.height));
  const footer = drawn.filter(command => command.y > tableBottom);
  assert.equal(footer.map(command => command.value).join(' '), [...notes, 'Valores em reais · Resultados por período.'].join(' '));
  assert.ok(footer.every(command => command.size === 19));
  assert.ok(!drawn.some(command => command.value === 'Projeção é uma estimativa de produção.'));
  geometry(layout, measure, 1440);
});

test('billions, negative adjustments and cents stay indivisible in both four and five-column exports', () => {
  const target = 927_900_000, actual = -12_945_213.17, projected = 1_234_567_890.12;
  const item = row(7, { target, actual, attainment: actual / target, projected, projectedAttainment: projected / target, variance: goalVariance(actual, target) });
  for (const showProjection of [false, true]) {
    const measure = measurement(), layout = periodPerformanceImageLayout(part([item], { showProjection }), measure), drawn = texts(layout);
    const values = [target, actual, item.variance.value, ...(showProjection ? [projected] : [])];
    const currencies = values.map(value => drawn.filter(command => command.value === amount(value)));
    assert.ok(currencies.every(commands => commands.length === 1));
    assert.equal(new Set(currencies.map(([command]) => command.y)).size, 1);
    assert.equal(new Set(currencies.map(([command]) => command.size)).size, 1);
    assert.ok(currencies.every(([command]) => command.size >= 18 && command.size <= 27));
    geometry(layout, measure, showProjection ? 1440 : 1200);
  }
});

test('only actual attainment controls colors; projections remain neutral and disappear completely when disabled', () => {
  const ratios = [null, -.1, .699999, .7, .999999, 1, 1.7];
  const rows = ratios.map((ratio, index) => row(index, { attainment: ratio, actual: ratio === null ? null : ratio * 1000, projected: 2000, projectedAttainment: 2 }));
  const measure = measurement(), layout = periodPerformanceImageLayout(part(rows, { showProjection: true }), measure), drawn = texts(layout);
  for (const [index, ratio] of ratios.entries()) {
    const label = drawn.find(command => command.value === MONTHS[index] && command.x === 52);
    const actual = drawn.find(command => command.x === 638 && command.y === label.y);
    const projection = drawn.find(command => command.x === 1160 && command.y === label.y);
    assert.equal(actual.fill, attainmentBand(ratio).color);
    assert.equal(projection.fill, '#435c60');
    assert.notEqual(projection.fill, attainmentBand(2).color);
  }
  const off = texts(periodPerformanceImageLayout(part(rows), measurement())).map(command => command.value).join(' ');
  assert.doesNotMatch(off, /Projeção|estimativa/);
  assert.ok(!off.includes(amount(2000)));
  geometry(layout, measure, 1440);
});

test('future, missing, incomplete and conflicting results retain their phase and exceptional cutoff without inventing zero', () => {
  const unknown = { actual: null, attainment: null, projected: null, projectedAttainment: null, variance: goalVariance(null, 1000, false), complete: false };
  const rows = [
    row(0, { ...unknown, phase: 'future', phaseLabel: 'Após o corte' }),
    row(1, { ...unknown, phase: 'missing', phaseLabel: 'Sem realizado', cutoff: null, cutoffMin: null }),
    row(2, { ...unknown, phase: 'incomplete', phaseLabel: 'Dados incompletos', mixedCutoffs: true, cutoffMin: '2026-08-10' }),
    row(3, { ...unknown, phase: 'conflict', phaseLabel: 'Metas divergentes', annualConflict: true }),
    row(4, { actual: 0, attainment: 0, projected: 0, projectedAttainment: 0, variance: goalVariance(0, 1000), phase: 'closed', phaseLabel: 'Fechado', cutoffMin: '2026-05-31', cutoff: '2026-05-31' }),
  ];
  const source = part(rows, { showProjection: true }), measure = measurement(), layout = periodPerformanceImageLayout(source, measure), drawn = texts(layout);
  for (const item of rows) assert.ok(drawn.some(command => command.value === item.phaseLabel));
  assert.equal(drawn.filter(command => command.value === '—').length, 12);
  assert.equal(drawn.filter(command => command.value === amount(0)).length, 2);
  const allText = drawn.map(command => command.value).join(' ');
  assert.ok(allText.includes('Corte: não informado'));
  assert.ok(allText.includes('Cortes: 10/08/2026 a 14/08/2026'));
  assert.ok(allText.includes('Corte: 31/05/2026'));
  geometry(layout, measure, 1440);
});

test('long labels and literal markup wrap without clipping or interpreting content', () => {
  const label = '<script>alert(1)</script>' + 'ABCDEFGHIJ'.repeat(12);
  const measure = measurement(), layout = periodPerformanceImageLayout(part([row(7, { label })], { notes: ['<img src=x onerror=alert(1)>'] }), measure);
  const drawn = texts(layout), renderedLabel = drawn.filter(command => command.x === 52 && command.size === 23).map(command => command.value).join('');
  assert.equal(renderedLabel, label);
  assert.ok(drawn.some(command => command.value === '<img src=x onerror=alert(1)>'));
  assert.ok(!drawn.some(command => command.value.includes('…')));
  geometry(layout, measure);
});

test('invalid periods, oversized amounts and excessive height fail explicitly without returning partial images', () => {
  assert.throws(() => periodPerformanceImageLayout(part([row(), row()]), measurement()), /período contém dados inválidos/);
  assert.throws(() => periodPerformanceImageLayout(part(Array.from({ length: 13 }, (_, index) => row(index))), measurement()), /parte.*inválida/);
  assert.throws(() => periodPerformanceImageLayout(part([row(7, { actual: Infinity })]), measurement()), /período contém dados inválidos/);
  assert.throws(() => periodPerformanceImageLayout(part([row(7, { actual: 1e100 })]), measurement()), /valor é extenso demais/);
  assert.throws(() => periodPerformanceImageLayout(part([row()], { showProjection: 'false' }), measurement()), /parte.*inválida/);
  assert.throws(() => periodPerformanceImageLayout(part([row()], { notes: Array.from({ length: 60 }, () => 'Texto completo '.repeat(60)) }), measurement()), /muito longa/);
});

test('renderer loads the local font, encodes full amounts as PNG and releases the canvas even after failure', async () => {
  const previousDocument = globalThis.document, draws = [], fonts = [];
  const context = { ...measurement(), fillRect() {}, fillText(value) { draws.push(value); } };
  const canvas = { width: 0, height: 0, getContext: () => context, toBlob(callback, type) { callback(new Blob(['png'], { type })); } };
  globalThis.document = { fonts: { async load(value) { fonts.push(value); } }, createElement(tag) { assert.equal(tag, 'canvas'); return canvas; } };
  try {
    const blob = await renderPeriodPerformancePng(part());
    assert.equal(blob.type, 'image/png');
    assert.equal(fonts.length, 2); assert.ok(fonts.every(value => value.includes('Sicoob Sans')));
    for (const value of [1000, 700, 300]) assert.equal(draws.filter(text => text === amount(value)).length, 1);
    assert.equal(canvas.width, 1); assert.equal(canvas.height, 1);
    await assert.rejects(renderPeriodPerformancePng(part([row(7, { actual: 1e100 })])), /valor é extenso demais/);
    assert.equal(canvas.width, 1); assert.equal(canvas.height, 1);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
