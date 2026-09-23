import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPortfolioReport, renderPortfolioCommunication } from '../lib/portfolio-communication.mjs';
import { dashboardHeader, renderDashboardHtml, validateDashboard } from '../lib/portfolio-presentation.mjs';
import { dashboardImageLayout } from '../lib/portfolio-image.mjs';
import { buildPaScenarioReport } from '../lib/pa-scenario-share.mjs';
import { buildCooperativeScenarioReport } from '../lib/cooperative-scenario-share.mjs';
import { paScenarioImageLayout } from '../lib/pa-scenario-image.mjs';
import { portfolioFixture, unit } from './portfolio-fixture.mjs';

const measurement = () => ({ font: '', measureText(value) { return { width: [...value].length * Number(this.font.match(/(\d+)px/)?.[1] || 22) * .55 }; } });
const htmlHeader = html => [...html.match(/<td data-communication-header[^>]*>([\s\S]*?)<\/td>/)[1].matchAll(/<(?:p|h1)[^>]*>(.*?)<\/(?:p|h1)>/g)].map(match => match[1]);
function assertImageHeader(layout, expected) {
  const box = layout.commands.find(command => command.type === 'rect');
  assert.ok(box.height <= 180, `three-line header is ${box.height}px`);
  assert.deepEqual(layout.commands.filter(command => command.type === 'text' && command.y < box.height).map(command => command.value), expected);
  return { box, context: layout.commands.filter(command => command.type === 'text' && command.y >= box.height) };
}

for (const [metric, includeBoth, brand] of [['VN', false, 'Gestão comercial · Venda nova'], ['AR', false, 'Gestão comercial · Arrecadação'], ['VN', true, 'Gestão comercial · Venda nova · Arrecadação']]) {
  test(`individual ${metric}/${includeBoth}: header has only the registered central, portfolio and period while cutoff and unit precede the panel`, () => {
    const dataset = portfolioFixture();
    const report = buildPortfolioReport({ dataset, entity: unit(dataset, 'cooperative:1002:3017'), period: 'month', month: 7, metric, includeBoth });
    const output = renderPortfolioCommunication(report, { showAnnual: false });
    const expected = [brand, 'Central Bahia teste', 'Mensal · AGO/2026'];
    assert.deepEqual(htmlHeader(output.html), expected);
    assert.deepEqual(output.text.split('\n').slice(0, 3), expected);
    assert.deepEqual(output.whatsapp.split('\n').slice(0, 3), expected);
    const { context, box } = assertImageHeader(dashboardImageLayout(output.dashboard, measurement()), expected);
    assert.ok(context.some(command => command.value.includes('Cooperativa 3017 · Cooperativa Alfa')));
    assert.ok(context.some(command => command.value.includes('31/08/2026')));
    const firstCard = context.find(command => command.value === 'Meta do período');
    assert.ok(firstCard.y < box.height + 180);
    assert.equal(output.dashboard.blocks.filter(block => block.type === 'heading').length, includeBoth ? 2 : 0);
    assert.equal((context.map(command => command.value).join(' ').match(/31\/08\/2026/g) || []).length, 1);
    assert.match(output.html, /data-communication-context>[\s\S]*Cooperativa 3017 · Cooperativa Alfa[\s\S]*31\/08\/2026/);
  });
}

test('central name is escaped, long header names wrap without clipping, and saved v2 metadata is optional but validated', () => {
  const dataset = portfolioFixture();
  const central = unit(dataset, 'central:1002');
  central.name = '<Central & nome> ' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(12);
  const output = renderPortfolioCommunication(buildPortfolioReport({ dataset, entity: unit(dataset, 'pa:1002:3017:0'), period: 'annual', month: 7 }));
  assert.match(output.html, /&lt;Central &amp; nome&gt;/);
  assert.doesNotMatch(output.html, /<Central/);
  const layout = dashboardImageLayout(output.dashboard, measurement()), box = layout.commands.find(command => command.type === 'rect');
  const wrappedName = layout.commands.filter(command => command.type === 'text' && command.y < box.height && command.size === 30).map(command => command.value).join('');
  assert.equal(wrappedName.replace(/\s/g, ''), central.name.replace(/\s/g, ''));
  assert.ok(box.height > 180);
  assert.ok(layout.commands.filter(command => command.type === 'text' && command.y < box.height).every(command => command.y + Math.ceil(command.size * 1.42) <= box.height));
  const legacy = structuredClone(output.dashboard); delete legacy.header;
  legacy.blocks.unshift({ type: 'heading', text: 'Venda Nova' });
  assert.equal(validateDashboard(legacy), legacy);
  assert.equal(dashboardHeader(legacy).brand, 'Gestão comercial · Venda nova');
  assert.match(renderDashboardHtml(legacy), /Sicoob Central Bahia/);
  for (const header of [null, [], { centralName: 42, metricLabel: 'VN' }, { centralName: 'X'.repeat(5001), metricLabel: 'VN' }, { centralName: 'Central', metricLabel: 'X'.repeat(101) }]) {
    assert.throws(() => validateDashboard({ ...legacy, header }));
  }
});

test('consolidated parts repeat just the compact header and retain cutoff, phase, subset and part metadata below it', () => {
  const dataset = portfolioFixture();
  const filters = { central: '1002', coop: '1002:3017', period: 'month', month: 7, metric: 'VN' };
  for (const [build, metric, entityId] of [[buildPaScenarioReport, 'VN', 'pa:1002:3017:0'], [buildCooperativeScenarioReport, 'AR', 'cooperative:1002:3017']]) {
    const output = build({ dataset, filters: { ...filters, metric }, mode: 'selected', selectedIds: [entityId] });
    const expected = [`Gestão comercial · ${metric === 'VN' ? 'Venda nova' : 'Arrecadação'}`, 'Central Bahia teste', 'Mensal · AGO/2026'];
    assert.deepEqual(htmlHeader(output.html), expected);
    assert.deepEqual(output.text.split('\n').slice(0, 3), expected);
    assert.deepEqual(output.caption.split('\n').slice(0, 3), expected);
    assert.equal(output.phaseLabel, 'Fechado');
    const { context } = assertImageHeader(paScenarioImageLayout(output.parts[0], measurement()), expected);
    const text = context.map(command => command.value).join(' ');
    for (const expectedText of ['31/08/2026', 'Fechado', output.selectionLabel, 'Parte 1 de 1']) assert.ok(text.includes(expectedText), expectedText);
    assert.equal((text.match(/31\/08\/2026/g) || []).length, 1);
    assert.equal((text.match(/Central Bahia teste/g) || []).length, 0);
    const partial = build({ dataset, filters: { ...filters, metric, period: 'annual' } });
    assert.equal(partial.phaseLabel, 'Parcial');
    assert.deepEqual(htmlHeader(partial.html), [expected[0], expected[1], 'Anual · 2026']);
    assert.match(partial.html, /data-communication-context>[\s\S]*31\/08\/2026 · Parcial/);
  }
});
