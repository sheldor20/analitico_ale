import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEmailFile, buildPortfolioReport, renderPortfolioCommunication } from '../lib/portfolio-communication.mjs';
import { validateDashboard, renderDashboardHtml } from '../lib/portfolio-presentation.mjs';
import { money } from '../lib/analytics.mjs';
import { dashboardImageLayout } from '../lib/portfolio-image.mjs';
import { portfolioFixture, unit } from './portfolio-fixture.mjs';
const dataset = portfolioFixture();
const make = (period = 'month', extra = {}) => buildPortfolioReport({ dataset, entity: unit(dataset,'cooperative:1002:3017'), period, month: 7, includeBoth: true, ...extra });
const measure = { font: '', measureText(value) { const size = Number(this.font.match(/(\d+)px/)?.[1] ?? 27); return { width: [...value].length * size * .55 }; } };
for (const period of ['daily','month','quarter','semester','ytd','annual']) {
  test(`${period}: current scenario and annual cards agree across channels without repeated tables`, () => {
    const output = renderPortfolioCommunication(make(period));
    const cards = output.dashboard.blocks.filter((b) => b.type === 'cards');
    assert.equal(cards.length, period === 'annual' ? 2 : 4);
    assert.ok(cards.every((block) => block.items.length === 3));
    assert.equal(output.dashboard.blocks.filter((b) => ['table', 'secondary'].includes(b.type)).length, 0);
    for (const text of [output.html, output.text, output.whatsapp]) {
      assert.doesNotMatch(text, /Apoio anual|annual-support|Evolução do período|projeção|projeções|Fechamento apurado/i);
      if (period === 'annual') assert.doesNotMatch(text, /Cenário anual/);
      else assert.ok(text.indexOf('Venda Nova') < text.indexOf('Cenário anual'));
      assert.doesNotMatch(text, /Foco comercial|Vamos às prioridades|Segue o resultado/);
    }
    if (period === 'annual') assert.match(output.dashboard.periodLabel, /^Anual · 2026$/);
    assert.ok(output.whatsapp.length < 3000); assert.ok(output.text.length < 3400);
    const layout = dashboardImageLayout(output.dashboard, measure);
    assert.equal(layout.width, 1080); assert.ok(layout.height > 500 && layout.height <= 12000);
    assert.ok(layout.commands.every((c) => c.y >= 0 && c.y < layout.height));
    for (const block of cards) for (const card of block.items) {
      assert.ok(layout.commands.some((c) => c.type === 'text' && c.value === card.value.replace(/\s/g, ' ')));
    }
    const rows = [...output.html.matchAll(/<table data-layout="metric-cards" data-columns="3"[^>]*><tr>([\s\S]*?)<\/tr><\/table>/g)];
    assert.equal(rows.length, cards.length);
    assert.ok(rows.every((row) => (row[1].match(/data-metric=/g) || []).length === 3));
  });
}
test('annual scenario uses full-year figures and keeps both current metrics before the annual cards', () => {
  const report = make('quarter');
  const output = renderPortfolioCommunication(report, { names:['Ana'], intro:'Priorize os retornos.',signature:'Equipe comercial' });
  const text = dashboardImageLayout(output.dashboard, measure).commands.filter((c) => c.type === 'text').map((c) => c.value).join('\n');
  assert.ok(text.indexOf('Arrecadação') < text.indexOf('Cenário anual'));
  assert.match(text,/Olá, Ana!/); assert.match(text,/Priorize os retornos/); assert.match(text,/Equipe comercial/);
  const cards = output.dashboard.blocks.filter((b) => b.type === 'cards');
  for (const [index, section] of report.sections.entries()) {
    assert.equal(cards[index + 2].items[0].value, money(section.annual.target));
    assert.equal(cards[index + 2].items[1].value, money(section.annual.actual));
    assert.equal(cards[index + 2].items[0].label, 'Meta anual');
  }
  assert.match(output.text,/3º trimestre/);
});
test('projection opt-in adds it to current and annual cards, both text channels and email export only when requested', () => {
  const report = make('quarter', { uplift: 20 });
  const before = structuredClone(report);
  const hidden = renderPortfolioCommunication(report);
  const shown = renderPortfolioCommunication(report, { showProjection: true });
  assert.deepEqual(report, before, 'presentation must not mutate the calculations or saved report');
  const cards = shown.dashboard.blocks.filter((b) => b.type === 'cards');
  assert.equal(cards.length, 4);
  assert.ok(cards.every((b) => b.items.length === 4));
  for (const field of ['html', 'text', 'whatsapp']) {
    assert.doesNotMatch(hidden[field], /projeç|Simulação/i);
    assert.match(shown[field], /Projeç/);
    assert.match(shown[field], /Simulação de ritmo/);
  }
  for (const [index, card] of hidden.dashboard.blocks.filter((b) => b.type === 'cards').entries()) {
    assert.deepEqual(card.items, cards[index].items.slice(0, 3));
  }
  const rendered = dashboardImageLayout(shown.dashboard, measure).commands.map((c) => c.value ?? '').join('\n');
  assert.match(rendered, /Projeção de\s+fechamento/);
  const email = buildEmailFile({ ...shown, recipients: ['ana@example.com'] });
  const encoded = email.split('Content-Transfer-Encoding: base64\r\n\r\n').slice(1).map((part) => part.split('\r\n--portfolio_alternative_v1')[0].replace(/\r\n/g, ''));
  assert.equal(Buffer.from(encoded[1], 'base64').toString('utf8'), shown.html);
});
test('legacy snapshots retain their saved tables, projections and annual support', () => {
  const model = renderPortfolioCommunication(make()).dashboard;
  model.blocks.push({ type: 'table', title: 'Evolução do período', headers: ['Mês', 'Meta', 'Realizado', 'Posição'], rows: [['Ago', 'R$ 100', 'R$ 50', 'Fechado']] });
  model.blocks.push({ type: 'secondary', title: 'Apoio anual · 2026', lines: ['Projeção salva: R$ 600,00'] });
  assert.equal(validateDashboard(model), model);
  assert.match(renderDashboardHtml(model), /Apoio anual/);
  assert.match(dashboardImageLayout(model, measure).commands.map((c) => c.value ?? '').join('\n'), /Projeção salva/);
});
test('compact text preserves closed, incomplete, met and calculated effort without generic advice', () => {
  let report = make('month',{includeBoth:false});
  assert.match(renderPortfolioCommunication(report).text,/Venda Nova · Fechado/);
  assert.match(renderPortfolioCommunication(report).text,/GAP: R\$/);
  report = make('annual',{includeBoth:false});
  assert.match(renderPortfolioCommunication(report).text,/Necessário por dia útil/);
  assert.doesNotMatch(renderPortfolioCommunication(report).text,/Priorize as oportunidades|Foco comercial/);
  report.sections[0].current.complete = false; report.sections[0].current.attainment = null;
  const output = renderPortfolioCommunication(report);
  assert.match(output.text,/dados incompletos/); assert.doesNotMatch(output.text,/Meta atingida/);
  const met = make('annual',{includeBoth:false,entity:unit(dataset,'cooperative:1002:3025')});
  assert.match(renderPortfolioCommunication(met).text,/Meta atingida/);
});
test('malformed stored dashboards fail safely and content is escaped as text', () => {
  const model = renderPortfolioCommunication(make()).dashboard;
  assert.equal(validateDashboard(model), model);
  for (const bad of [null,{}, {...model,version:3}, {...model,blocks:[{type:'script',text:'alert(1)'}]}, {...model,blocks:[{type:'table',headers:[],rows:[null]}]}]) assert.throws(() => validateDashboard(bad));
  const malicious = renderPortfolioCommunication(make(),{names:['<img src=x>'],intro:'<script>alert(1)</script>'});
  assert.doesNotMatch(malicious.html,/<script|<img/); assert.match(malicious.html,/&lt;script/);
  assert.ok(dashboardImageLayout(malicious.dashboard,measure).commands.some((c) => c.value?.includes('<script>')));
});
test('long names wrap without cropping and huge vertical input fails before canvas allocation', () => {
  const model = renderPortfolioCommunication(make()).dashboard;
  model.scope = 'X'.repeat(240);
  const layout = dashboardImageLayout(model,measure);
  assert.equal(layout.commands.filter((c) => c.value && /^X+$/.test(c.value)).map((c) => c.value).join(''),model.scope);
  model.opening = '\n'.repeat(4000);
  assert.throws(() => dashboardImageLayout(model,measure),/muito longo/);
});


test('a shared source date appears once and differing metric dates stay explicitly associated', () => {
  const report = make();
  const common = renderPortfolioCommunication(report);
  for (const content of [common.html.replace(/<head>[\s\S]*?<\/head>/, ''), common.text, common.whatsapp, dashboardImageLayout(common.dashboard, measure).commands.map(item => item.value || '').join('\n')]) {
    assert.equal((content.match(/31\/08\/2026/g) || []).length, 1);
    assert.equal((content.match(/Cooperativa 3017/g) || []).length, 1);
  }
  assert.equal(common.dashboard.opening, '');
  assert.equal(common.dashboard.hierarchy, 'Central 1002');
  assert.equal(common.dashboard.notes.length, 1);
  report.sections[1].cutoff = '2026-08-20';
  report.sections[1].cutoffMin = '2026-08-20';
  const mixed = renderPortfolioCommunication(report);
  assert.deepEqual(mixed.dashboard.notes, ['Venda Nova: Dados até 31/08/2026.', 'Arrecadação: Dados até 20/08/2026.']);
  for (const content of [mixed.html, mixed.text, mixed.whatsapp]) {
    assert.equal((content.match(/31\/08\/2026/g) || []).length, 1);
    assert.equal((content.match(/20\/08\/2026/g) || []).length, 1);
  }
});

test('annual opt-out only removes annual blocks and leaves current figures and custom writing intact', () => {
  const report = make('quarter');
  const options = { names: ['Ana'], intro: 'Abertura revisada pela equipe.', signature: 'Maria · relacionamento' };
  const full = renderPortfolioCommunication(report, options);
  const compact = renderPortfolioCommunication(report, { ...options, showAnnual: false });
  const currentCards = compact.dashboard.blocks.filter(block => block.type === 'cards');
  assert.equal(currentCards.length, report.sections.length);
  assert.deepEqual(currentCards, full.dashboard.blocks.filter(block => block.type === 'cards').slice(0, report.sections.length));
  for (const field of ['html', 'text', 'whatsapp']) {
    assert.doesNotMatch(compact[field], /Cenário anual|Meta anual| · ano/);
    assert.match(compact[field], /Abertura revisada pela equipe/);
    assert.match(compact[field], /Maria · relacionamento/);
    assert.match(compact[field], /Olá, Ana!/);
  }
  const annual = renderPortfolioCommunication(make('annual'), { showAnnual: false });
  assert.equal(annual.dashboard.blocks.filter(block => block.type === 'cards').length, 2, 'the selected annual period itself is never removed');
  assert.equal(validateDashboard(compact.dashboard), compact.dashboard);
  assert.ok(dashboardImageLayout(compact.dashboard, measure).height < dashboardImageLayout(full.dashboard, measure).height);
});
