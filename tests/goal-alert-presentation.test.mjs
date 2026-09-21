import test from 'node:test';
import assert from 'node:assert/strict';
import { money, percent } from '../lib/analytics.mjs';
import { buildMonthlyGoalAlerts } from '../lib/goal-alerts.mjs';
import { buildGoalAlertPresentation, buildGoalAlertsDashboard } from '../lib/goal-alert-presentation.mjs';
import { dashboardImageLayout } from '../lib/portfolio-image.mjs';
import { renderDashboardHtml, validateDashboard } from '../lib/portfolio-presentation.mjs';
import { portfolioFixture } from './portfolio-fixture.mjs';

const sample = (patch = {}) => ({
  key: '2026:8:cooperative:1002:3025:VN', year: 2026, month: 7,
  entity: { id: 'cooperative:1002:3025', kind: 'cooperative', central: '1002', cooperative: '3025', name: 'Cooperativa Beta' },
  metric: 'VN', metricLabel: 'Venda nova', target: 1200, actual: 1500, attainment: 1.25,
  cutoff: '2026-08-20', cutoffMin: '2026-08-20', ...patch,
});
const measure = { font: '', measureText(value) { return { width: [...value].length * Number(this.font.match(/(\d+)px/)?.[1] ?? 27) * 0.55 }; } };
const texts = (dashboard) => dashboardImageLayout(dashboard, measure).commands.filter((command) => command.type === 'text').map((command) => command.value).join('\n');

test('individual presentation mirrors the actual achievement, month, hierarchy and cutoff in email and PNG', () => {
  const alert = buildMonthlyGoalAlerts(portfolioFixture(), 7).find((entry) => entry.entity.id === 'cooperative:1002:3025');
  const before = structuredClone(alert);
  const output = buildGoalAlertPresentation(alert);
  assert.deepEqual(alert, before);
  assert.equal(validateDashboard(output.dashboard), output.dashboard);
  assert.equal(output.dashboard.entityId, alert.entity.id);
  assert.equal(output.html, renderDashboardHtml(output.dashboard, output.subject));
  const imageText = texts(output.dashboard);
  for (const value of ['AGO/2026', 'Cooperativa Beta', 'Central 1002', 'Cooperativa 3025', 'Venda nova', '31/08/2026', 'Parabéns']) {
    assert.ok(output.text.includes(value), value);
    assert.ok(output.html.includes(value), value);
    assert.ok(imageText.includes(value), value);
  }
  for (const value of [money(alert.target), money(alert.actual), percent(alert.attainment)]) {
    assert.ok(output.text.includes(value));
    assert.ok(output.html.includes(value));
    assert.ok(imageText.replace(/\s/g, ' ').includes(value.replace(/\s/g, ' ')));
  }
  assert.doesNotMatch(JSON.stringify(output), /projeção|projetad|annual-support|Apoio anual/i);
  const cards = output.dashboard.blocks.find((block) => block.type === 'cards').items;
  assert.equal(cards[0].label, 'Meta do mês');
  assert.equal(cards[1].label, 'Realizado');
  assert.equal(cards[1].accent, true);
  assert.equal(cards[1].support, '150% da meta');
  assert.equal(cards.length, 3);
  assert.equal(cards[2].label, 'Crescimento sobre a meta');
  assert.equal(cards[2].value, money(50));
  assert.equal(cards[2].support, '50% acima da meta');
  assert.ok(output.text.includes(`Crescimento sobre a meta: ${money(50)}`));
});

test('PA zero and AR keep their correct scope and metric without inheriting another hierarchy', () => {
  const pa = sample({ entity: { id: 'pa:1002:3025:0', kind: 'pa', central: '1002', cooperative: '3025', pa: '0', name: 'PA Centro' } });
  const paOutput = buildGoalAlertPresentation(pa);
  assert.equal(paOutput.dashboard.scope, 'PA 0 · PA Centro');
  assert.equal(paOutput.dashboard.hierarchy, 'Central 1002 · Cooperativa 3025');
  const arOutput = buildGoalAlertPresentation(sample({ metric: 'AR', metricLabel: 'Venda nova' }));
  for (const value of [arOutput.subject, arOutput.text, arOutput.html, texts(arOutput.dashboard)]) {
    assert.match(value, /Arrecadação/);
    assert.doesNotMatch(value, /Venda nova/);
  }
});

test('exactly met goals show zero GAP while every bulk row keeps its own growth figure', () => {
  const met = sample({ actual: 1200, attainment: 1 });
  const individual = buildGoalAlertPresentation(met);
  const third = individual.dashboard.blocks.find((block) => block.type === 'cards').items[2];
  assert.equal(third.label, 'GAP para a meta');
  assert.equal(third.value, money(0));
  assert.equal(third.support, 'Meta do mês atingida');
  const bulk = buildGoalAlertsDashboard([sample(), met], { year: 2026, month: 7 });
  const cards = bulk.blocks.filter((block) => block.type === 'cards');
  assert.deepEqual(cards.map((block) => block.items[2].value), [money(300), money(0)]);
  assert.deepEqual(cards.map((block) => block.items.length), [3, 3]);
});

test('partial and mixed cutoffs are explicit and never rewritten as a completed month', () => {
  const output = buildGoalAlertPresentation(sample({ cutoffMin: '2026-08-18' }));
  for (const value of [output.text, output.html, texts(output.dashboard)]) {
    assert.match(value, /18\/08\/2026 a 20\/08\/2026/);
    assert.match(value, /cortes diferentes, sem posição única/);
    assert.doesNotMatch(value, /31\/08\/2026|Fechado|fechamento/);
  }
});

test('untrusted names are escaped in HTML and subjects stay bounded without control characters', () => {
  const original = sample();
  const attack = '<img src=x onerror=alert(1)>\r\nBcc: somebody@example.com\u0000';
  const output = buildGoalAlertPresentation({ ...original, entity: { ...original.entity, name: `${attack}${'Nome'.repeat(100)}` } });
  assert.ok(output.subject.length <= 300);
  assert.doesNotMatch(output.subject, /[\u0000-\u001f\u007f]/);
  assert.doesNotMatch(output.html, /<img|<script/);
  assert.match(output.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(texts(output.dashboard), /<img src=x/);
});

test('output uses only commercial result fields and excludes contact, ownership and read states', () => {
  const output = buildGoalAlertPresentation(sample({ owner_id: 'private-owner', readAt: 'private-read', notifiedAt: 'private-notified', contacts: [{ email: 'private@example.com' }] }));
  assert.doesNotMatch(JSON.stringify(output), /private-owner|private-read|private-notified|private@example/);
});

test('filtered dashboard preserves every received unit and metric in order without sums or implicit filtering', () => {
  const base = sample();
  const selection = [
    sample({ entity: { id: 'central:1002', kind: 'central', central: '1002', name: 'Central Bahia' }, target: 2000, actual: 2500, attainment: 1.25 }),
    sample({ metric: 'AR', metricLabel: 'Arrecadação', actual: 1560, attainment: 1.3 }),
    base,
    sample({ entity: { id: 'pa:1002:3025:0', kind: 'pa', central: '1002', cooperative: '3025', pa: '0', name: 'PA Zero' }, target: 450, actual: 600, attainment: 600 / 450 }),
  ];
  const before = structuredClone(selection);
  const dashboard = buildGoalAlertsDashboard(selection, { year: 2026, month: 7, kindLabel: 'Seleção atual' });
  assert.deepEqual(selection, before);
  assert.equal(dashboard.hierarchy, 'Seleção atual');
  assert.equal(dashboard.blocks.length, 8);
  assert.deepEqual(dashboard.notes, ['Dados até 20/08/2026.']);
  const cards = dashboard.blocks.filter((block) => block.type === 'cards');
  assert.equal(cards.length, selection.length);
  for (const [index, alert] of selection.entries()) {
    assert.equal(cards[index].items[0].value, money(alert.target));
    assert.equal(cards[index].items[1].value, money(alert.actual));
  }
  const captions = dashboard.blocks.filter((block) => block.type === 'text' && block.tone === 'action').map((block) => block.text);
  assert.deepEqual(captions, ['Central 1002 · Central Bahia · Venda nova', 'Cooperativa 3025 · Cooperativa Beta · Arrecadação · Central 1002', 'Cooperativa 3025 · Cooperativa Beta · Venda nova · Central 1002', 'PA 0 · PA Zero · Venda nova · Central 1002 · Cooperativa 3025']);
  const text = texts(dashboard);
  assert.match(text, /4 metas atingidas/);
  assert.doesNotMatch(text, /Projeç|Total realizado|Total da meta/);
  assert.ok(!cards.some((block) => block.items.some((card) => card.value === money(selection.reduce((total, alert) => total + alert.actual, 0)))));
  const onlyAr = buildGoalAlertsDashboard([selection[1]], { year: 2026, month: 7 });
  assert.equal(onlyAr.blocks.filter((block) => block.type === 'cards').length, 1);
  assert.doesNotMatch(texts(onlyAr), /Central Bahia|PA Zero|Venda nova/);
});

test('empty, stale-period and excessive selections fail explicitly without silently omitting rows', () => {
  assert.throws(() => buildGoalAlertsDashboard([], { year: 2026, month: 7 }), /Não há metas/);
  assert.throws(() => buildGoalAlertsDashboard([sample()], { year: 2026, month: 8 }), /outro período/);
  assert.throws(() => buildGoalAlertsDashboard([sample()], { year: 2025, month: 7 }), /outro período/);
  assert.throws(() => buildGoalAlertsDashboard(Array(27).fill(sample()), { year: 2026, month: 7 }), /muitas metas.*Nenhuma unidade foi removida/);
  const complete = buildGoalAlertsDashboard(Array(26).fill(sample()), { year: 2026, month: 7 });
  assert.equal(complete.blocks.filter((block) => block.type === 'cards').length, 26);
  const longNamed = sample({ entity: { ...sample().entity, name: 'Cooperativa regional '.repeat(30).trim() } });
  const oversized = buildGoalAlertsDashboard(Array(26).fill(longNamed), { year: 2026, month: 7 });
  assert.throws(() => dashboardImageLayout(oversized, measure), /muito longo/);
});

test('invalid achievements and unsupported context do not produce a shareable recognition panel', () => {
  for (const change of [{ year: 2019 }, { month: 12 }, { month: -1 }, { metric: 'OTHER' }, { actual: 1100 }, { target: 0 }, { actual: NaN }, { attainment: Infinity }, { cutoff: '2026-02-31' }, { cutoffMin: '2026-08-31' }]) {
    assert.throws(() => buildGoalAlertPresentation(sample(change)));
  }
});


test('recognition exports repeat neither the source date nor the same identity fields', () => {
  const individual = buildGoalAlertPresentation(sample());
  for (const content of [individual.text, individual.html.replace(/<head>[\s\S]*?<\/head>/, ''), texts(individual.dashboard)]) {
    assert.equal((content.match(/20\/08\/2026/g) || []).length, 1);
    assert.equal((content.match(/Cooperativa 3025/g) || []).length, 1);
    assert.equal((content.match(/AGO\/2026/g) || []).length, 1);
    assert.doesNotMatch(content, /Confira o resultado|Valores realizados informados/);
  }
  const common = buildGoalAlertsDashboard([sample(), sample({ metric: 'AR' })], { year: 2026, month: 7 });
  assert.equal((texts(common).match(/20\/08\/2026/g) || []).length, 1);
  const different = buildGoalAlertsDashboard([sample(), sample({ metric: 'AR', cutoff: '2026-08-19', cutoffMin: '2026-08-19' })], { year: 2026, month: 7 });
  assert.equal(different.notes.length, 0);
  const positions = different.blocks.filter(block => block.type === 'text' && block.tone === 'muted');
  assert.deepEqual(positions.map(block => block.text), ['Dados até 20/08/2026.', 'Dados até 19/08/2026.']);
});
