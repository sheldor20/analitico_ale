import test from 'node:test';
import assert from 'node:assert/strict';
import { goalVariance } from '../lib/goal-variance.mjs';
import { buildPortfolioReport, renderPortfolioCommunication } from '../lib/portfolio-communication.mjs';
import { validateDashboard, renderDashboardHtml } from '../lib/portfolio-presentation.mjs';
import { dashboardImageLayout } from '../lib/portfolio-image.mjs';
import { portfolioFixture, unit } from './portfolio-fixture.mjs';

test('GAP and growth are measured against the goal, rounded to cents, never another year', () => {
  assert.deepEqual(goalVariance(50,100),{kind:'gap',label:'GAP para a meta',value:50,ratio:.5});
  assert.deepEqual(goalVariance(100,100),{kind:'met',label:'GAP para a meta',value:0,ratio:0});
  const growth=goalVariance(447649.29,399540);
  assert.equal(growth.kind,'growth'); assert.equal(growth.value,48109.29);
  assert.equal(growth.ratio,48109.29/399540);
  assert.equal(goalVariance(.1+.2,.3).kind,'met');
  assert.equal(goalVariance(-50,100).value,150);
});
test('missing or invalid values never claim a delivered goal; zero target has no invented percentage', () => {
  for(const args of [[null,100],[100,null],[NaN,100],[100,Infinity],[100,-1],[100,100,false]]) assert.equal(goalVariance(...args).kind,'unknown');
  assert.deepEqual(goalVariance(50,0),{kind:'growth',label:'Crescimento sobre a meta',value:50,ratio:null});
  assert.equal(goalVariance(0,0).ratio,null);
});
test('HTML and image share four ordered cards, prominent realized and growth support', () => {
  const dataset=portfolioFixture();
  const report=buildPortfolioReport({dataset,entity:unit(dataset,'cooperative:1002:3025'),month:7,period:'month'});
  const {dashboard,html}=renderPortfolioCommunication(report);
  const cards=dashboard.blocks.find(b=>b.type==='cards').items;
  assert.deepEqual(cards.map(c=>c.label),['Meta do período','Realizado informado','Crescimento sobre a meta','Fechamento apurado']);
  assert.equal(cards[1].accent,true); assert.match(cards[1].support,/150%/); assert.match(cards[2].support,/50% acima da meta/);
  assert.ok(html.indexOf('data-metric="Meta do período"')<html.indexOf('data-metric="Realizado informado"'));
  const measure={font:'',measureText(value){return {width:value.length*12};}};
  const texts=dashboardImageLayout(dashboard,measure).commands.filter(c=>c.type==='text').map(c=>c.value).join('\n');
  assert.match(texts,/150% da meta/); assert.match(texts,/50% acima da meta/);
  assert.ok(texts.indexOf('Meta do período')<texts.indexOf('Realizado informado'));
});
test('optional card metadata preserves old models and rejects malformed saved support', () => {
  const dataset=portfolioFixture();
  const model=renderPortfolioCommunication(buildPortfolioReport({dataset,entity:unit(dataset,'cooperative:1002:3017'),month:7,period:'month'})).dashboard;
  for(const block of model.blocks.filter(b=>b.type==='cards')) for(const item of block.items){delete item.support;delete item.accent;}
  assert.equal(validateDashboard(model),model); assert.ok(renderDashboardHtml(model,'Legacy').includes('Meta do período'));
  for(const value of [null,[],true,'a'.repeat(401)]) {
    const bad=structuredClone(model); bad.blocks.find(b=>b.type==='cards').items[0].support=value;
    assert.throws(()=>validateDashboard(bad));
  }
  for(const value of [null,'true',1]) {
    const bad=structuredClone(model); bad.blocks.find(b=>b.type==='cards').items[0].accent=value;
    assert.throws(()=>validateDashboard(bad));
  }
  model.blocks.find(b=>b.type==='cards').items[0].support='<script>test</script>';
  assert.doesNotMatch(renderDashboardHtml(model,'Escaped'),/<script>/);
});
