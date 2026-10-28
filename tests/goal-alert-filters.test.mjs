import test from 'node:test';
import assert from 'node:assert/strict';
import { filterGoalAlerts, goalAlertFilterOptions } from '../lib/goal-alert-filters.mjs';
import { buildMonthlyGoalAlerts } from '../lib/goal-alerts.mjs';
import { portfolioFixture } from './portfolio-fixture.mjs';

test('goal filters include registered parents with no achievement and distinguish repeated cooperative codes', () => {
  const dataset = portfolioFixture();
  const options = goalAlertFilterOptions(dataset);
  assert.deepEqual(options.centrals.map((item) => item.value), ['1002', '2007']);
  assert.deepEqual(options.cooperatives.map((item) => item.value), ['cooperative:1002:3017', 'cooperative:1002:3025', 'cooperative:2007:3017']);
  assert.equal(options.cooperatives[0].name, 'Cooperativa Alfa');
  const alerts = buildMonthlyGoalAlerts(dataset, 7);
  assert.equal(filterGoalAlerts(alerts, { cooperative: 'cooperative:1002:3017' }).length, 0);
  assert.deepEqual(filterGoalAlerts(alerts, { cooperative: 'cooperative:2007:3017' }).map((a) => a.entity.name), ['Outra central']);
  assert.equal(filterGoalAlerts(alerts, { central: '1002', cooperative: 'cooperative:2007:3017' }).length, 0);
});

test('goal filters combine type and both parents while keeping PA zero and the original amounts', () => {
  const dataset = portfolioFixture();
  dataset.rows.filter((row) => row.source === 'cadence').forEach((row) => { row.actuals[7] = 500; });
  const alerts = buildMonthlyGoalAlerts(dataset, 7);
  const copy = structuredClone(alerts);
  assert.deepEqual(filterGoalAlerts(alerts, { kind: 'cooperative', central: '1002' }).map((a) => a.entity.id), ['cooperative:1002:3025']);
  const selected = filterGoalAlerts(alerts, { kind: 'pa', central: '1002', cooperative: 'cooperative:1002:3017' });
  assert.deepEqual(selected.map((a) => a.entity.id), ['pa:1002:3017:0']);
  assert.equal(selected[0].actual, 500);
  assert.equal(selected[0].target, 450);
  assert.equal(filterGoalAlerts(alerts, { kind: 'central', cooperative: 'cooperative:1002:3017' }).length, 0, 'parent aggregates do not masquerade as the selected child');
  assert.deepEqual(alerts, copy);
  assert.deepEqual(filterGoalAlerts(alerts), alerts);
});

test('historical datasets without registry still expose their exact hierarchy and omit unrelated source rows', () => {
  const dataset = portfolioFixture();
  delete dataset.registry;
  const options = goalAlertFilterOptions(dataset);
  assert.deepEqual(options.cooperatives.map((item) => item.value), ['cooperative:1002:3017', 'cooperative:1002:3025', 'cooperative:2007:3017']);
  assert.equal(options.centrals.length, 2);
  assert.deepEqual(goalAlertFilterOptions({ rows: [] }), { centrals: [], cooperatives: [], pas: [] });
});


test('PA cascade options and filters use complete parent identities including PA zero',()=>{
 const dataset=portfolioFixture();
 dataset.registry.entities.push({id:'pa:2007:3017:0',kind:'pa',central:'2007',cooperative:'3017',pa:'0',name:'PA da outra central',group:'P1'});
 const options=goalAlertFilterOptions(dataset);
 assert.deepEqual(options.pas.map(item=>item.value),['pa:1002:3017:0','pa:1002:3025:0','pa:2007:3017:0']);
 assert.equal(options.pas[0].pa,'0');assert.equal(options.pas[0].name,'PA Alfa zero');
 const alerts=options.pas.map(option=>({entity:{id:option.value,kind:'pa',central:option.central,cooperative:option.cooperative,pa:option.pa,name:option.name}}));
 alerts.push({entity:{id:'central:1002',kind:'central',central:'1002'}},{entity:{id:'cooperative:1002:3017',kind:'cooperative',central:'1002',cooperative:'3017'}});
 assert.deepEqual(filterGoalAlerts(alerts,{pa:'pa:1002:3017:0'}).map(alert=>alert.entity.id),['pa:1002:3017:0']);
 assert.equal(filterGoalAlerts(alerts,{central:'2007',pa:'pa:1002:3017:0'}).length,0);
 assert.equal(filterGoalAlerts(alerts,{cooperative:'cooperative:1002:3025',pa:'pa:1002:3017:0'}).length,0);
 assert.equal(filterGoalAlerts(alerts,{kind:'cooperative',pa:'pa:1002:3017:0'}).length,0);
 assert.deepEqual(filterGoalAlerts(alerts,{cooperative:'cooperative:1002:3017'}).map(alert=>alert.entity.id).sort(),['cooperative:1002:3017','pa:1002:3017:0']);
 assert.equal(filterGoalAlerts(alerts,{central:'1002'}).length,4);
 delete dataset.registry;
 const fallback=goalAlertFilterOptions(dataset);
 assert.deepEqual(fallback.pas.map(item=>item.value),['pa:1002:3017:0','pa:1002:3025:0']);
});
