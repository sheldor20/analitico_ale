import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPortfolioReport, renderPortfolioCommunication } from '../lib/portfolio-communication.mjs';
import { validateDashboard } from '../lib/portfolio-presentation.mjs';
import { dashboardImageLayout } from '../lib/portfolio-image.mjs';
import { portfolioFixture, unit } from './portfolio-fixture.mjs';
const dataset = portfolioFixture();
const make = (period = 'month', extra = {}) => buildPortfolioReport({ dataset, entity: unit(dataset,'cooperative:1002:3017'), period, month: 7, includeBoth: true, ...extra });
const measure = { font: '', measureText(value) { const size = Number(this.font.match(/(\d+)px/)?.[1] ?? 27); return { width: [...value].length * size * .55 }; } };
for (const [period, rows] of [['daily',1],['month',1],['quarter',3],['semester',6],['ytd',8],['annual',12]]) {
  test(`${period}: selected scenario leads both channels, annual is secondary only when applicable`, () => {
    const output = renderPortfolioCommunication(make(period));
    const support = output.dashboard.blocks.filter((b) => b.type === 'secondary');
    const tables = output.dashboard.blocks.filter((b) => b.type === 'table');
    assert.equal(tables.length, 2); assert.ok(tables.every((b) => b.rows.length === rows));
    if (period === 'annual') {
      assert.equal(support.length, 0);
      for (const text of [output.html, output.text, output.whatsapp]) assert.doesNotMatch(text, /Apoio anual|annual-support/);
      assert.match(output.dashboard.periodLabel, /^Anual · 2026$/);
    } else {
      assert.equal(support.length, 1); assert.equal(output.dashboard.blocks.at(-1).type, 'secondary');
      for (const text of [output.text,output.whatsapp,output.html]) assert.ok(text.lastIndexOf('Foco comercial') < text.indexOf('Apoio anual'));
      assert.equal(support[0].lines.length, 2);
    }
    assert.ok(output.whatsapp.length < 3000); assert.ok(output.text.length < 3400);
    const layout = dashboardImageLayout(output.dashboard, measure);
    assert.equal(layout.width, 1080); assert.ok(layout.height > 500 && layout.height <= 12000);
    assert.ok(layout.commands.every((c) => c.y >= 0 && c.y < layout.height));
    for (const block of output.dashboard.blocks.filter((b) => b.type === 'cards')) {
      for (const card of block.items) assert.ok(layout.commands.some((c) => c.type === 'text' && c.value === card.value.replace(/\s/g, ' ')));
    }
  });
}
test('annual support does not displace primary Arrecadacao; canvas and HTML use the same model', () => {
  const output = renderPortfolioCommunication(make('quarter'),{ names:['Ana'], intro:'Priorize os retornos.',signature:'Equipe comercial' });
  const text = dashboardImageLayout(output.dashboard, measure).commands.filter((c) => c.type === 'text').map((c) => c.value).join('\n');
  assert.ok(text.indexOf('Arrecadação') < text.indexOf('Apoio anual'));
  assert.match(text,/Olá, Ana!/); assert.match(text,/Priorize os retornos/); assert.match(text,/Equipe comercial/);
  assert.match(output.text,/3º trimestre/); assert.doesNotMatch(output.text,/Cenário anual de/);
});
test('commercial text respects closed, incomplete, met and in-progress cases', () => {
  let report = make('month',{includeBoth:false});
  assert.match(renderPortfolioCommunication(report).text,/Período encerrado abaixo da meta/);
  report = make('annual',{includeBoth:false});
  assert.match(renderPortfolioCommunication(report).text,/Priorize as oportunidades/);
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
