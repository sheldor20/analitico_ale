import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonDashboard, chartDomain, signedBar } from '../lib/comparison-dashboard.mjs';
import { compareYears } from '../lib/scenarios.mjs';
import { portfolioFixture } from './portfolio-fixture.mjs';
const filters = { central:'1002',coop:'all',group:'all',source:'base',metric:'VN',level:'cooperative',period:'ytd',month:7,status:'all',search:'',sortBy:'production' };
function pair() {
  const current = portfolioFixture();
  const previous = JSON.parse(JSON.stringify(current).replaceAll('2026','2025'));
  previous.rows.forEach(row => { row.actuals = row.actuals.map(value => value == null ? null : value / 2); });
  return [current, previous];
}
test('dashboard uses the exact filtered closed-month comparison without modifying data', () => {
  const [current, previous] = pair(), before = JSON.stringify([current, previous]);
  const comparison = compareYears(current,previous,filters), model = comparisonDashboard(comparison);
  assert.equal(model.current.actual,1600); assert.equal(model.previous.actual,800);
  assert.equal(model.current.target,1600); assert.equal(model.productionDelta,800); assert.equal(model.growth,1);
  assert.equal(model.current.attainment,1); assert.equal(model.previous.attainment,.5); assert.equal(model.attainmentDelta,50);
  assert.equal(model.months.length,8); assert.equal(model.months[7].current,200); assert.equal(model.months[7].previous,100);
  assert.equal(JSON.stringify([current, previous]),before);
});
test('weighted attainment is ratio of totals and not mean of percentages', () => {
  const [current, previous] = pair();
  current.rows.find(row=>row.source==='base' && row.cooperative==='3025' && row.central==='1002' && row.metric==='VN').targets = Array(12).fill(300);
  const model = comparisonDashboard(compareYears(current, previous, filters));
  assert.equal(model.current.attainment,.5); assert.equal(model.current.target,3200);
});
test('composition change is explicit and same-units selection recalculates dashboard and chart',()=>{
  const [current,previous]=pair(); previous.rows=previous.rows.filter(row=>row.cooperative!=='3025');previous.registry.entities=previous.registry.entities.filter(entity=>entity.cooperative!=='3025');
  const all=comparisonDashboard(compareYears(current,previous,filters)), common=comparisonDashboard(compareYears(current,previous,filters,true));
  assert.equal(all.compositionChanged,true); assert.equal(common.compositionChanged,false); assert.equal(all.current.count,2);assert.equal(common.current.count,1);
  assert.equal(common.current.actual,400);assert.equal(common.previous.actual,200);assert.equal(common.months[0].current,50);
});
test('unknown production never becomes zero or a false complete total; the chart retains gaps',()=>{
  const [current,previous]=pair();current.rows.find(row=>row.central==='1002'&&row.source==='base'&&row.metric==='VN').actuals[1]=null;
  const model=comparisonDashboard(compareYears(current,previous,filters));
  assert.equal(model.current.actual,null);assert.equal(model.current.observed,1);assert.equal(model.productionDelta,null);assert.equal(model.current.attainment,null);assert.equal(model.months[1].current,null);assert.equal(model.months[0].current,200);
});
test('zero or negative prior production does not manufacture percentage growth',()=>{
  const [current,previous]=pair();previous.rows.forEach(row=>row.actuals=Array(12).fill(0));
  let model=comparisonDashboard(compareYears(current,previous,filters));assert.equal(model.growth,null);assert.equal(model.productionDelta,1600);
  previous.rows.forEach(row=>row.actuals=Array(12).fill(-10));model=comparisonDashboard(compareYears(current,previous,filters));assert.equal(model.previous.actual,-160);assert.equal(model.growth,null);assert.equal(model.productionDelta,1760);
});
test('unavailable daily or partial-only comparison has no numeric dashboard',()=>{
  const [current,previous]=pair();const model=comparisonDashboard(compareYears(current,previous,{...filters,period:'daily'}));assert.equal(model.current.actual,null);assert.equal(model.growth,null);assert.deepEqual(model.months,[]);
});
test('full-year inconsistent goals suppress attainment without discarding official values',()=>{
  const [current,previous]=pair();for (const data of [current,previous]) data.rows.forEach(row=>{row.cutoff=`${data.year}-12-31`;row.actuals=Array(12).fill(50);});
  current.rows.find(row=>row.central==='1002'&&row.source==='base'&&row.metric==='VN').annualTarget=2400;
  const model=comparisonDashboard(compareYears(current,previous,{...filters,period:'annual',month:11}));assert.equal(model.current.inconsistent,true);assert.equal(model.current.attainment,null);assert.equal(model.attainmentDelta,null);assert.equal(model.current.target,3600);
});
test('chart domain includes signed adjustments and bars share an honest zero baseline',()=>{
  const domain=chartDomain([null,-50,100,0]);assert.deepEqual(domain,{min:-50,max:100});
  const negative=signedBar(-50,domain),positive=signedBar(100,domain);assert.equal(negative.left,0);assert.ok(Math.abs(negative.width-100/3)<1e-10);assert.ok(Math.abs(positive.left-100/3)<1e-10);assert.ok(Math.abs(positive.width-200/3)<1e-10);assert.equal(signedBar(null,domain),null);
  assert.deepEqual(chartDomain([null,0,0]),{min:0,max:1});assert.equal(signedBar(0,chartDomain([0])).width,0);
});
