import test from 'node:test';
import assert from 'node:assert/strict';
import { money } from '../lib/analytics.mjs';
import { goalVariance } from '../lib/goal-variance.mjs';
import { paScenarioImageLayout, renderPaScenarioPng } from '../lib/pa-scenario-image.mjs';

function measurement() {
  return { font: '', measureText(value) { return { width: [...value].length * Number(this.font.match(/(\d+)px/)?.[1] ?? 22) * .55 }; } };
}
function row(index = 0, overrides = {}) {
  const target = 1000, actual = 1250;
  return {
    id: `pa:1002:3017:${index}`, central: '1002', cooperative: '3017', pa: String(index), name: `Unidade ${index}`, group: 'P5',
    target, actual, attainment: actual / target, variance: goalVariance(actual, target),
    status: 'Meta atingida', cutoff: '2026-09-17', cutoffMin: '2026-09-17', complete: true, annualConflict: false, ...overrides,
  };
}
function part(rows = [row()], overrides = {}) {
  return { index: 1, total: 1, from: 1, to: rows.length, rows, scope: 'Central 1002 · Cooperativa 3017', periodLabel: 'Setembro de 2026', notes: [], year: 2026, ...overrides };
}
const amount = (value) => money(value).replace(/\s+/g, ' ');
const textCommands = (layout) => layout.commands.filter((command) => command.type === 'text');
function assertGeometry(layout, measure) {
  assert.equal(layout.width, 1200);
  assert.ok(layout.height > 0 && layout.height <= 12000);
  for (const command of layout.commands) {
    assert.ok(command.x >= 0 && command.y >= 0);
    if (command.type === 'rect') {
      assert.ok(command.width >= 0 && command.height > 0);
      assert.ok(command.x + command.width <= layout.width);
      assert.ok(command.y + command.height <= layout.height);
    } else {
      measure.font = `${command.bold ? '700' : '400'} ${command.size}px Arial`;
      assert.ok(command.x + measure.measureText(command.value).width <= layout.width - 35, `Text crosses the right edge: ${command.value}`);
      assert.ok(command.y + Math.ceil(command.size * 1.4) <= layout.height, `Text crosses the bottom edge: ${command.value}`);
      const column = [36, 372, 622, 882].findIndex((x) => command.x === x + 16);
      if (column >= 0) {
        const right = [372, 622, 882, 1164][column];
        assert.ok(command.x + measure.measureText(command.value).width <= right - 16, `Text crosses table column ${column}: ${command.value}`);
      }
    }
  }
}

test('PA zero and every hierarchy remain identifiable in the table, without mutating the report', () => {
  const source = part(), before = structuredClone(source), measure = measurement();
  const layout = paScenarioImageLayout(source, measure), drawn = textCommands(layout);
  assert.ok(drawn.some((command) => command.value === 'PA 0 · Unidade 0'));
  assert.ok(drawn.some((command) => command.value.includes('Central 1002')));
  assert.ok(drawn.some((command) => command.value.includes('Cooperativa 3017')));
  assert.ok(drawn.some((command) => command.value === 'Dados até 17/09/2026'));
  assert.ok(drawn.some((command) => command.value === 'Parte 1 de 1 · PAs 1–1'));
  assert.equal(drawn.filter((command) => command.value === amount(1000)).length, 1);
  assert.equal(drawn.filter((command) => command.value === amount(1250)).length, 1);
  assert.equal(drawn.filter((command) => command.value === amount(250)).length, 1);
  assert.deepEqual(source, before);
  assertGeometry(layout, measure);
});

test('billions, cents and negative production stay in one complete monetary drawing inside their columns', () => {
  const target = 1_234_567_890.12, actual = -12_945_213.17;
  const source = part([row(0, { target, actual, attainment: actual / target, variance: goalVariance(actual, target), status: 'Abaixo da meta' })]);
  const measure = measurement(), layout = paScenarioImageLayout(source, measure);
  const values = [target, actual, source.rows[0].variance.value];
  const numbers = values.map((value) => textCommands(layout).filter((command) => command.value === amount(value)));
  assert.ok(numbers.every((commands) => commands.length === 1), 'each complete currency must use one fillText command');
  assert.equal(new Set(numbers.map((commands) => commands[0].y)).size, 1, 'currency baselines align across the row');
  assert.equal(new Set(numbers.map((commands) => commands[0].size)).size, 1, 'monetary columns use the same fitted size');
  assert.ok(numbers.every(([command]) => command.size >= 18 && command.size <= 27));
  assert.ok(numbers.some(([command]) => command.size < 27), 'large values reduce the font instead of breaking digits');
  assertGeometry(layout, measure);
});

test('unknown amounts remain dashes while actual zero remains currency zero', () => {
  const source = part([
    row(0, { target: null, actual: null, attainment: null, variance: goalVariance(null, null, false), complete: false, cutoff: '', cutoffMin: '', status: 'Dados não informados' }),
    row(1, { target: 0, actual: 0, attainment: null, variance: goalVariance(0, 0), status: 'Meta atingida' }),
  ]);
  const measure = measurement(), layout = paScenarioImageLayout(source, measure), drawn = textCommands(layout);
  assert.equal(drawn.filter((command) => command.value === '—').length, 3);
  assert.equal(drawn.filter((command) => command.value === amount(0)).length, 3);
  assert.equal(drawn.filter((command) => command.value === 'Sem avaliação').length, 2);
  assert.ok(drawn.map((command) => command.value).join(' ').includes('Data de atualização não informada'));
  assertGeometry(layout, measure);
});

test('twenty PAs fit a numbered part with no missing rows or vertical overlap', () => {
  const rows = Array.from({ length: 20 }, (_, index) => row(index + 20));
  const source = part(rows, { index: 2, total: 3, from: 21, to: 40 });
  const measure = measurement(), layout = paScenarioImageLayout(source, measure), drawn = textCommands(layout);
  assert.ok(drawn.some((command) => command.value === 'Parte 2 de 3 · PAs 21–40'));
  const rowLabels = drawn.filter((command) => /^PA \d+ · Unidade \d+$/.test(command.value));
  assert.equal(rowLabels.length, 20);
  assert.deepEqual(rowLabels.map((command) => command.value), rows.map((item) => `PA ${item.pa} · ${item.name}`));
  for (let index = 1; index < rowLabels.length; index++) assert.ok(rowLabels[index].y > rowLabels[index - 1].y + 100);
  assert.equal(drawn.filter((command) => command.value === amount(1250)).length, 20);
  assertGeometry(layout, measure);
});

test('long names wrap completely, and strings containing markup are drawn as literal text', () => {
  const name = '<script>alert(1)</script>';
  const longToken = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(5);
  const source = part([row(0, { name }), row(1, { name: longToken, cutoffMin: '2026-09-01' })], { notes: ['<img src=x onerror=alert(1)>'] });
  const measure = measurement(), layout = paScenarioImageLayout(source, measure), drawn = textCommands(layout);
  const label = drawn.filter((command) => command.x === 52 && command.size === 23).map((command) => command.value).join('');
  assert.ok(label.includes(name));
  assert.ok(label.includes(longToken), 'every character of a long unbroken PA name must remain present');
  assert.ok(drawn.some((command) => command.value === '<img src=x onerror=alert(1)>'));
  assert.ok(drawn.map((command) => command.value).join(' ').includes('Atualizações de 01/09/2026 a 17/09/2026'));
  assert.ok(!drawn.some((command) => command.value.includes('…')));
  assertGeometry(layout, measure);
});

test('oversized money, image height, invalid parts and duplicate identities fail explicitly rather than omitting content', () => {
  assert.throws(() => paScenarioImageLayout(part([row(0, { actual: 1e100 })]), measurement()), /valor é extenso demais/);
  assert.throws(() => paScenarioImageLayout(part([row()], { notes: Array.from({ length: 50 }, () => 'Texto completo '.repeat(60)) }), measurement()), /muito longa/);
  assert.throws(() => paScenarioImageLayout(part(Array.from({ length: 21 }, (_, index) => row(index))), measurement()), /parte.*inválida/);
  assert.throws(() => paScenarioImageLayout(part([row(), row()]), measurement()), /PA contém dados inválidos/);
  assert.throws(() => paScenarioImageLayout(part([row(0, { actual: Infinity })]), measurement()), /PA contém dados inválidos/);
  assert.throws(() => paScenarioImageLayout(part([row()], { from: 1, to: 2 }), measurement()), /parte.*inválida/);
});

test('PNG renderer loads the local font, draws complete currencies and releases its canvas', async () => {
  const previousDocument = globalThis.document, draws = [], fonts = [];
  const context = { ...measurement(), fillRect() {}, fillText(value) { draws.push(value); } };
  const canvas = { width: 0, height: 0, getContext: () => context, toBlob(callback, type) { callback(new Blob(['png'], { type })); } };
  globalThis.document = { fonts: { async load(value) { fonts.push(value); } }, createElement(tag) { assert.equal(tag, 'canvas'); return canvas; } };
  try {
    const blob = await renderPaScenarioPng(part());
    assert.equal(blob.type, 'image/png');
    assert.equal(fonts.length, 2);
    assert.ok(fonts.every((value) => value.includes('Sicoob Sans')));
    for (const value of [1000, 1250, 250]) assert.equal(draws.filter((text) => text === amount(value)).length, 1);
    assert.equal(canvas.width, 1); assert.equal(canvas.height, 1);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
