import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPortfolioReport, renderPortfolioCommunication } from '../lib/portfolio-communication.mjs';
import { renderDashboardHtml, validateDashboard } from '../lib/portfolio-presentation.mjs';
import { dashboardImageLayout } from '../lib/portfolio-image.mjs';
import { portfolioFixture, unit } from './portfolio-fixture.mjs';

const measure = { font: '', measureText(value) { return { width: [...value].length * Number(this.font.match(/(\d+)px/)?.[1] ?? 27) * .55 }; } };
const primary = [
  { label: 'Meta do período', value: 'R$ 1.000,00', support: 'AGO/2026' },
  { label: 'Realizado informado', value: 'R$ 1.250,00', support: '125% da meta', accent: true },
  { label: 'Crescimento sobre a meta', value: 'R$ 250,00', support: '25% acima da meta' },
];
function model(items) {
  const dataset = portfolioFixture();
  const report = buildPortfolioReport({ dataset, entity: unit(dataset, 'cooperative:1002:3025'), month: 7, period: 'month' });
  const dashboard = renderPortfolioCommunication(report).dashboard;
  dashboard.blocks = [{ type: 'cards', items: structuredClone(items) }];
  return dashboard;
}
const cards = (layout) => layout.commands.filter((command) => command.type === 'rect' && command.x > 0 && ['#003641', '#f0f7f4'].includes(command.fill));

test('three primary cards and their numbers occupy one aligned row in PNG and HTML', () => {
  const dashboard = model(primary), before = structuredClone(dashboard);
  const layout = dashboardImageLayout(dashboard, measure), rectangles = cards(layout);
  assert.equal(rectangles.length, 3);
  assert.equal(new Set(rectangles.map((rectangle) => rectangle.y)).size, 1);
  assert.equal(new Set(rectangles.map((rectangle) => rectangle.height)).size, 1);
  assert.equal(new Set(rectangles.map((rectangle) => rectangle.width)).size, 1);
  for (let index = 1; index < rectangles.length; index++) assert.ok(rectangles[index].x > rectangles[index - 1].x + rectangles[index - 1].width);
  const amounts = primary.map((card) => layout.commands.find((command) => command.type === 'text' && command.value === card.value));
  assert.ok(amounts.every(Boolean));
  assert.equal(new Set(amounts.map((amount) => amount.y)).size, 1, 'wrapped labels must not move realized relative to target');
  assert.ok(amounts.every((amount, index) => amount.x > rectangles[index].x && amount.x < rectangles[index].x + rectangles[index].width));
  const html = renderDashboardHtml(dashboard);
  const row = html.match(/<table data-layout="metric-cards" data-columns="3"[^>]*><tr>([\s\S]*?)<\/tr><\/table>/)?.[1];
  assert.ok(row); assert.equal((row.match(/data-metric=/g) || []).length, 3);
  assert.ok(row.indexOf('Meta do período') < row.indexOf('Realizado informado'));
  assert.ok(row.indexOf('Realizado informado') < row.indexOf('Crescimento sobre a meta'));
  assert.deepEqual(dashboard, before);
});

test('optional projection occupies a compact lower row without moving the three primary cards', () => {
  const dashboard = model([...primary, { label: 'Projeção de fechamento', value: 'R$ 1.400,00', support: '140% da meta · estimativa' }]);
  const rectangles = cards(dashboardImageLayout(dashboard, measure));
  assert.equal(rectangles.length, 4);
  assert.equal(new Set(rectangles.slice(0, 3).map((rectangle) => rectangle.y)).size, 1);
  assert.ok(rectangles[3].y > rectangles[0].y + rectangles[0].height);
  assert.ok(rectangles[3].height < rectangles[0].height);
  assert.ok(rectangles[3].width > rectangles[0].width);
  const html = renderDashboardHtml(dashboard);
  assert.ok(html.indexOf('data-columns="1"') > html.indexOf('data-columns="3"'));
  assert.equal((html.match(/data-metric=/g) || []).length, 4);
});

test('exceptionally large money values receive wider cards and remain one complete PNG command', () => {
  const values = ['R$ 999.999.999.999,99', 'R$ 1.234.567.890.123.456,78', 'R$ 234.567.890.123.456,79'];
  const dashboard = model(primary.map((card, index) => ({ ...card, value: values[index] })));
  const layout = dashboardImageLayout(dashboard, measure);
  for (const [index, rectangle] of cards(layout).entries()) {
    const valueCommands = layout.commands.filter((command) => command.type === 'text' && command.bold && command.x >= rectangle.x && command.x < rectangle.x + rectangle.width && command.y >= rectangle.y && command.y < rectangle.y + rectangle.height && command.fill === (index === 1 ? '#ffffff' : '#003641'));
    // The realized support is bold too; monetary chunks precede it and use the fitted value size.
    const amountCommands = valueCommands.filter((command) => command.size <= 36 && command.size >= 26 && !command.value.includes('da meta'));
    assert.equal(amountCommands.length, 1, 'a monetary value must never split into currency, integer or cents fragments');
    assert.equal(amountCommands[0].value, values[index]);
    for (const command of layout.commands.filter((item) => item.type === 'text' && item.x >= rectangle.x && item.x < rectangle.x + rectangle.width && item.y >= rectangle.y && item.y < rectangle.y + rectangle.height)) {
      measure.font = `${command.bold ? '700' : '400'} ${command.size}px Arial`;
      assert.ok(command.x + measure.measureText(command.value).width <= rectangle.x + rectangle.width - 17, `Text crosses card ${index + 1}: ${command.value}`);
      assert.ok(command.y + Math.ceil(command.size * 1.42) <= rectangle.y + rectangle.height, `Text crosses bottom of card ${index + 1}`);
    }
  }
  const html = renderDashboardHtml(dashboard);
  for (const value of values) assert.ok(html.includes(value));
  for (const element of html.matchAll(/<strong class="metric-value" data-money="true" style="([^"]*)">/g)) {
    assert.match(element[1], /white-space:nowrap/);
    assert.match(element[1], /word-break:normal/);
    assert.doesNotMatch(element[1], /break-word|anywhere/);
  }
});

test('annual millions, hundreds of millions and negative values stay on one line without losing cents', () => {
  for (const values of [
    ['R$ 9.279.000,00', 'R$ 8.391.422,37', 'R$ 887.577,63'],
    ['R$ 927.900.000,00', 'R$ 839.142.237,12', 'R$ 88.757.762,88'],
    ['R$ 927.900.000,00', '-R$ 12.945.213,17', 'R$ 940.845.213,17'],
  ]) {
    const dashboard = model(primary.map((card, index) => ({ ...card, value: values[index] })));
    dashboard.period = 'annual'; dashboard.periodLabel = 'Anual · 2026';
    dashboard.blocks[0].items[0].label = 'Meta anual';
    const before = structuredClone(dashboard), layout = dashboardImageLayout(dashboard, measure);
    const rectangles = cards(layout);
    assert.equal(rectangles.length, 3);
    assert.equal(new Set(rectangles.map((rectangle) => rectangle.y)).size, 1, 'these business amounts should fit side by side');
    for (const [index, value] of values.entries()) {
      const commands = layout.commands.filter((command) => command.type === 'text' && command.value === value);
      assert.equal(commands.length, 1, `expected entire value ${value} in one draw`);
      const command = commands[0]; measure.font = `700 ${command.size}px Arial`;
      assert.ok(command.x + measure.measureText(command.value).width <= rectangles[index].x + rectangles[index].width - 17);
    }
    const html = renderDashboardHtml(dashboard);
    assert.match(html, /data-columns="3"/);
    assert.equal((html.match(/data-money="true"/g) || []).length, 3);
    for (const value of values) assert.ok(html.includes(`>${value}</strong>`));
    assert.doesNotMatch(html, /\.metric-value\{font-size:20px!important\}/, 'mobile must not replace the fitted font with a fixed one');
    assert.deepEqual(dashboard, before);
  }
});

test('legacy one and two card snapshots render without invented variance or changed metadata', () => {
  for (const count of [1, 2]) {
    const dashboard = model(primary.slice(0, count));
    dashboard.blocks[0].items.forEach((item) => { delete item.accent; delete item.support; });
    const before = structuredClone(dashboard);
    assert.equal(validateDashboard(dashboard), dashboard);
    const rectangles = cards(dashboardImageLayout(dashboard, measure));
    assert.equal(rectangles.length, count);
    assert.equal(new Set(rectangles.map((rectangle) => rectangle.y)).size, 1);
    assert.equal((renderDashboardHtml(dashboard).match(/data-metric=/g) || []).length, count);
    assert.deepEqual(dashboard, before);
  }
});
