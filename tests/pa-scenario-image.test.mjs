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
      assert.ok(measure.measureText(command.value).width <= command.maxWidth, `Text exceeds its available width: ${command.value}`);
    }
  }
}

test('PA zero remains identifiable while shared hierarchy and cutoff appear once, without mutating the report', () => {
  const source = part(), before = structuredClone(source), measure = measurement();
  const layout = paScenarioImageLayout(source, measure), drawn = textCommands(layout);
  assert.ok(drawn.some((command) => command.value === 'PA 0 · Unidade 0'));
  assert.equal(drawn.filter((command) => command.value.includes('Central 1002')).length, 1);
  assert.equal(drawn.filter((command) => command.value.includes('Cooperativa 3017')).length, 1);
  assert.equal(drawn.filter((command) => command.value.includes('Corte: 17/09/2026')).length, 1);
  assert.ok(!drawn.some((command) => command.value.includes('Grupo P5')));
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
  assert.ok(drawn.some((command) => command.value === 'Sem avaliação'));
  assert.ok(drawn.map((command) => command.value).join(' ').match(/Sem dados|Dados não informados/));
  assertGeometry(layout, measure);
});

test('twenty PAs fit below 2600 pixels with no missing rows or repeated shared metadata', () => {
  const rows = Array.from({ length: 20 }, (_, index) => row(index + 20));
  const source = part(rows, { index: 2, total: 3, from: 21, to: 40 });
  const measure = measurement(), layout = paScenarioImageLayout(source, measure), drawn = textCommands(layout);
  assert.ok(drawn.some((command) => command.value === 'Parte 2 de 3 · PAs 21–40'));
  const rowLabels = drawn.filter((command) => /^PA \d+ · Unidade \d+$/.test(command.value));
  assert.equal(rowLabels.length, 20);
  assert.deepEqual(rowLabels.map((command) => command.value), rows.map((item) => `PA ${item.pa} · ${item.name}`));
  assert.ok(layout.height < 2600, `compact twenty-row image is ${layout.height}px tall`);
  for (let index = 1; index < rowLabels.length; index++) assert.ok(rowLabels[index].y > rowLabels[index - 1].y + 50);
  assert.equal(drawn.filter((command) => command.value === amount(1250)).length, 20);
  assert.equal(drawn.filter((command) => command.value.includes('Cooperativa 3017')).length, 1);
  assert.equal(drawn.filter((command) => command.value.includes('17/09/2026')).length, 1);
  assert.equal(drawn.filter((command) => command.value === 'Meta atingida').length, 0, 'normal status is already shown by the variance label');
  assert.ok(!drawn.some((command) => command.value.includes('Grupo P5')));
  const rowBoxes = layout.commands.filter((command) => command.type === 'rect' && command.x === 36 && ['#f0f7f4', '#ffffff'].includes(command.fill));
  assert.equal(rowBoxes.length, 20);
  for (const box of rowBoxes) {
    const rowText = drawn.filter((command) => command.y >= box.y && command.y < box.y + box.height);
    assert.ok(rowText.every((command) => command.y + Math.ceil(command.size * 1.4) <= box.y + box.height), 'all row labels and support fit before the next row');
    const currencies = rowText.filter((command) => command.value.startsWith('R$ '));
    assert.equal(currencies.length, 3);
    assert.deepEqual(currencies.map((command) => command.x), [388, 638, 898]);
    assert.equal(new Set(currencies.map((command) => command.y)).size, 1);
  }
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
  const dates = drawn.map((command) => command.value).join(' ');
  assert.ok(dates.includes('01/09/2026') && dates.includes('17/09/2026'));
  assert.ok(!drawn.some((command) => command.value.includes('…')));
  assertGeometry(layout, measure);
});

test('oversized money, image height, invalid parts and duplicate identities fail explicitly rather than omitting content', () => {
  assert.throws(() => paScenarioImageLayout(part([row(0, { actual: 1e100 })]), measurement()), /valor é extenso demais/);
  assert.throws(() => paScenarioImageLayout(part([row()], { notes: Array.from({ length: 50 }, () => 'Texto completo '.repeat(60)) }), measurement()), /muito longa/);
  assert.throws(() => paScenarioImageLayout(part(Array.from({ length: 21 }, (_, index) => row(index))), measurement()), /parte.*inválida/);
  assert.throws(() => paScenarioImageLayout(part([row(), row()]), measurement()), /unidade contém dados inválidos/);
  assert.throws(() => paScenarioImageLayout(part([row(0, { actual: Infinity })]), measurement()), /unidade contém dados inválidos/);
  assert.throws(() => paScenarioImageLayout(part([row()], { from: 1, to: 2 }), measurement()), /parte.*inválida/);
});

test('cooperative collection scenarios accept empty PA identifiers and use cooperative/AR labels', () => {
  const source = part([row(0, {
    id: 'cooperative:1002:3017', pa: '', name: 'Cooperativa Vale', group: '', target: 9_279_000,
    actual: 8_391_422.37, attainment: 8_391_422.37 / 9_279_000, variance: goalVariance(8_391_422.37, 9_279_000), status: 'Abaixo da meta',
  })], { kind: 'cooperative', metric: 'AR', title: 'Cenário das cooperativas', scope: 'Central 1002', context: { central: '1002', cooperative: null, cutoff: '2026-09-17', cutoffMin: '2026-09-17' } });
  const measure = measurement(), layout = paScenarioImageLayout(source, measure), drawn = textCommands(layout);
  const fullText = drawn.map((command) => command.value).join(' ');
  assert.ok(fullText.includes('ARRECADAÇÃO'));
  assert.ok(fullText.includes('Cenário das cooperativas'));
  assert.ok(fullText.includes('3017 · Cooperativa Vale'));
  assert.ok(fullText.includes('Cooperativas 1–1'));
  assert.doesNotMatch(fullText, /\bPA\b|\bPAs\b|VENDA NOVA/);
  for (const value of [source.rows[0].target, source.rows[0].actual, source.rows[0].variance.value]) assert.equal(drawn.filter((command) => command.value === amount(value)).length, 1);
  assertGeometry(layout, measure);
});

test('central scope labels each cooperative group once and preserves identical PA numbers under different parents', () => {
  const rows = [row(0), row(1), row(0, { id: 'pa:1002:3018:0', cooperative: '3018' })];
  const source = part(rows, { scope: 'Central 1002', context: { central: '1002', cooperative: null, cutoff: '2026-09-17', cutoffMin: '2026-09-17' } });
  const measure = measurement(), layout = paScenarioImageLayout(source, measure), drawn = textCommands(layout);
  assert.equal(drawn.filter((command) => command.value.includes('Central 1002')).length, 1);
  for (const cooperative of ['3017', '3018']) assert.equal(drawn.filter((command) => command.value.includes(`Cooperativa ${cooperative}`)).length, 1);
  assert.equal(drawn.filter((command) => command.value === 'PA 0 · Unidade 0').length, 2);
  assert.equal(drawn.filter((command) => command.value === amount(1250)).length, 3);
  const continued = part([rows[2]], { index: 2, total: 2, from: 21, to: 21, scope: source.scope, context: source.context });
  const second = textCommands(paScenarioImageLayout(continued, measurement()));
  assert.ok(second.some((command) => command.value.includes('Central 1002')));
  assert.ok(second.some((command) => command.value.includes('Cooperativa 3018')));
  assert.ok(second.some((command) => command.value.includes('Parte 2 de 2')));
  assertGeometry(layout, measure);
});

test('exceptional dates, incomplete data and conflicting targets remain visible without repeating normal status', () => {
  const rows = [row(0), row(1, { complete: false, status: 'Dados incompletos', cutoff: '2026-09-15', cutoffMin: '2026-09-15', attainment: null, variance: goalVariance(1250, 1000, false) }),
    row(2, { annualConflict: true, status: 'Metas divergentes', attainment: null, variance: goalVariance(1250, 1000, false) })];
  const source = part(rows, { context: { central: '1002', cooperative: '3017', cutoff: '2026-09-17', cutoffMin: '2026-09-17' } });
  const measure = measurement(), layout = paScenarioImageLayout(source, measure), drawn = textCommands(layout);
  const fullText = drawn.map((command) => command.value).join(' ');
  assert.ok(fullText.includes('15/09/2026'));
  assert.ok(fullText.includes('Dados incompletos'));
  assert.ok(fullText.includes('Metas divergentes'));
  assert.equal(drawn.filter((command) => command.value.includes('17/09/2026')).length, 1);
  assert.equal(drawn.filter((command) => command.value === 'Meta atingida').length, 0);
  assertGeometry(layout, measure);
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
