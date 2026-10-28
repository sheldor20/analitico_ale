import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPeriodGoalAlerts, buildMonthlyGoalAlerts, defaultGoalAlertMonth, goalAchievementMessage } from '../lib/goal-alerts.mjs';
import { portfolioFixture } from './portfolio-fixture.mjs';
import { upsertPlanRow } from '../lib/registry.mjs';

test('monthly alerts count exact unit, metric and month using actual production, never projections', () => {
  const dataset = portfolioFixture();
  const alerts = buildMonthlyGoalAlerts(dataset, 7);
  assert.deepEqual(alerts.map((alert) => `${alert.entity.id}:${alert.metric}`).sort(), [
    'central:1002:VN', 'central:2007:VN', 'cooperative:1002:3025:VN', 'cooperative:2007:3017:VN',
  ]);
  assert.equal(defaultGoalAlertMonth(dataset), 7);
  assert.equal(new Set(alerts.map((alert) => alert.key)).size, alerts.length);
  const early = structuredClone(dataset);
  early.rows.forEach((row) => { row.cutoff = '2026-08-05'; row.actuals[7] = row.targets[7] * 0.5; });
  assert.equal(buildMonthlyGoalAlerts(early, 7).length, 0, 'A high projected pace is not an achieved target');
  assert.equal(buildMonthlyGoalAlerts(dataset, 8).length, 0, 'No future goals');
});

test('default month supports large imports without expanding every cell into function arguments', () => {
  const row = { cutoff: '2026-09-17', actuals: [...Array(9).fill(1),null,null,null] };
  assert.equal(defaultGoalAlertMonth({ year: 2026, rows: Array(20000).fill(row) }),8);
});

test('monthly alerts reject zero/missing targets, negative adjustments, incomplete aggregates and date mismatch', () => {
  for (const target of [0, null]) {
    const dataset = portfolioFixture();
    dataset.rows.forEach((row) => { row.targets[7] = target; row.actuals[7] = 100000; });
    assert.equal(buildMonthlyGoalAlerts(dataset, 7).length, 0);
  }
  const incomplete = portfolioFixture();
  incomplete.rows.find((row) => row.source === 'base' && row.central === '1002' && row.cooperative === '3017' && row.metric === 'VN').actuals[7] = null;
  assert.ok(!buildMonthlyGoalAlerts(incomplete, 7).some((alert) => alert.entity.id === 'central:1002'));
  const corrected = portfolioFixture();
  corrected.rows.forEach((row) => { row.actuals[7] = -1; });
  assert.equal(buildMonthlyGoalAlerts(corrected, 7).length, 0);
  const inconsistentCut = portfolioFixture();
  inconsistentCut.rows.find((row) => row.cooperative === '3017' && row.central === '1002' && row.metric === 'VN').cutoff = '2026-08-15';
  assert.ok(!buildMonthlyGoalAlerts(inconsistentCut, 7).some((alert) => alert.entity.id === 'central:1002'));
});

test('AR and PA alerts follow their own goals and refresh after manual corrections; direct central plans never double count', () => {
  let dataset = portfolioFixture();
  for (const [entityId, metric, target] of [['cooperative:1002:3017','AR',1000],['pa:1002:3017:0','VN',450]]) {
    dataset = upsertPlanRow(dataset, { entityId, metric, targets: Array(12).fill(target), annualTarget: target * 12,
      actuals: Array.from({ length: 12 }, (_, month) => month <= 7 ? target : null), cutoff: '2026-08-31' });
  }
  let alerts = buildMonthlyGoalAlerts(dataset, 7);
  assert.ok(alerts.some((alert) => alert.entity.id === 'pa:1002:3017:0' && alert.metric === 'VN'));
  assert.ok(alerts.some((alert) => alert.entity.id === 'cooperative:1002:3017' && alert.metric === 'AR'));
  const central = alerts.find((alert) => alert.entity.id === 'central:1002' && alert.metric === 'VN');
  dataset.rows.push({ ...dataset.rows.find((row) => row.source === 'base' && row.central === '1002' && row.metric === 'VN'), key:'direct-central', cooperative:'', actuals:Array(12).fill(99999),targets:Array(12).fill(1) });
  assert.equal(buildMonthlyGoalAlerts(dataset,7).find((alert) => alert.key === central.key).actual, central.actual);
  dataset.rows.find((row) => row.source === 'cadence' && row.cooperative === '3017').actuals[7] = 449.99;
  alerts = buildMonthlyGoalAlerts(dataset,7);
  assert.ok(!alerts.some((alert) => alert.entity.id === 'pa:1002:3017:0'));
  assert.match(goalAchievementMessage(central), /AGO\/2026/);
  assert.match(goalAchievementMessage(central), /31\/08\/2026/);
});


function achievedDataset(cutMonth=11, ratio=1) {
  const dataset=portfolioFixture();
  const cutoff=new Date(Date.UTC(2026,cutMonth+1,0)).toISOString().slice(0,10);
  for(const row of dataset.rows){
    row.targets=Array(12).fill(10);row.annualTarget=120;row.targetRule='registry';
    row.actuals=Array.from({length:12},(_,month)=>month<=cutMonth?10*ratio:null);
    row.cutoff=cutoff;
  }
  return dataset;
}
const chosen=alerts=>alerts.find(alert=>alert.entity.id==='cooperative:1002:3017'&&alert.metric==='VN');

test('all five goal periods use their complete shared bounds and canonical end-month identity',()=>{
 const dataset=achievedDataset();
 const cases=[
  ['month',1,1,10,'2026-02-01','2026-02-28'],
  ['quarter',0,2,30,'2026-01-01','2026-03-31'],
  ['semester',1,5,60,'2026-01-01','2026-06-30'],
  ['annual',3,11,120,'2026-01-01','2026-12-31'],
  ['ytd',6,6,70,'2026-01-01','2026-07-31'],
 ];
 for(const [period,month,anchor,target,start,end] of cases){
  const alert=chosen(buildPeriodGoalAlerts(dataset,{period,month}));
  assert.ok(alert,period);assert.equal(alert.period,period);assert.equal(alert.month,anchor);
  assert.equal(alert.target,target);assert.equal(alert.actual,target);
  assert.equal(alert.periodStart,start);assert.equal(alert.periodEnd,end);assert.equal(alert.cutoff,end);
  assert.ok(alert.periodLabel);
 }
 assert.match(chosen(buildPeriodGoalAlerts(dataset,{period:'quarter',month:0})).periodLabel,/1º trimestre/);
 assert.match(chosen(buildPeriodGoalAlerts(dataset,{period:'semester',month:7})).periodLabel,/2º semestre/);
 assert.match(chosen(buildPeriodGoalAlerts(dataset,{period:'ytd',month:6})).periodLabel,/JAN–JUL/);
});

test('monthly saved keys remain exact while nonmonthly identities cannot collide across periods/years',()=>{
 const dataset=achievedDataset();
 const monthly=chosen(buildMonthlyGoalAlerts(dataset,2));
 assert.equal(monthly.key,'2026:3:cooperative:1002:3017:VN');
 assert.deepEqual(buildMonthlyGoalAlerts(dataset,2),buildPeriodGoalAlerts(dataset,{period:'month',month:2}));
 const quarterly=chosen(buildPeriodGoalAlerts(dataset,{period:'quarter',month:0}));
 assert.equal(quarterly.key,'2026:quarter:3:cooperative:1002:3017:VN');
 assert.equal(quarterly.key,chosen(buildPeriodGoalAlerts(dataset,{period:'quarter',month:2})).key);
 const keys=['month','quarter','semester','annual','ytd'].map(period=>chosen(buildPeriodGoalAlerts(dataset,{period,month:11})).key);
 assert.equal(new Set(keys).size,5);
 const previous=structuredClone(dataset);previous.year=2025;previous.rows.forEach(row=>row.cutoff='2025-12-31');
 assert.notEqual(chosen(buildPeriodGoalAlerts(previous,{period:'annual',month:11})).key,keys[3]);
 assert.deepEqual(buildPeriodGoalAlerts(dataset,{period:'invalid',month:0}),[]);
 assert.deepEqual(buildPeriodGoalAlerts(dataset,{period:'quarter',month:12}),[]);
 assert.deepEqual(buildPeriodGoalAlerts(null),[]);
});

test('period alerts never use future/projection values and may recognize an early observed delivery',()=>{
 const dataset=achievedDataset(7,1);
 assert.equal(buildPeriodGoalAlerts(dataset,{period:'quarter',month:9}).length,0,'Fourth quarter has not started');
 assert.equal(buildPeriodGoalAlerts(dataset,{period:'annual',month:11}).length,0,'Annual projection is not annual delivery');
 assert.equal(chosen(buildPeriodGoalAlerts(dataset,{period:'quarter',month:6})),undefined,'Two monthly targets do not deliver the full quarter');
 dataset.rows.forEach(row=>{row.actuals[6]=20;row.actuals[7]=20;row.actuals[11]=1000000;});
 const early=chosen(buildPeriodGoalAlerts(dataset,{period:'quarter',month:6}));
 assert.equal(early.target,30);assert.equal(early.actual,40);assert.equal(early.cutoff,'2026-08-31');
 assert.equal(chosen(buildPeriodGoalAlerts(dataset,{period:'annual',month:11})),undefined,'Future December values stay excluded');
});

test('missing observed data and annual target conflicts block affected period achievements',()=>{
 const missing=achievedDataset();
 missing.rows.find(row=>row.source==='base'&&row.central==='1002'&&row.cooperative==='3017'&&row.metric==='VN').actuals[1]=null;
 for(const period of ['quarter','semester','annual','ytd']){
  const alerts=buildPeriodGoalAlerts(missing,{period,month:2});
  assert.ok(!alerts.some(alert=>alert.entity.id==='cooperative:1002:3017'&&alert.metric==='VN'));
  assert.ok(!alerts.some(alert=>alert.entity.id==='central:1002'&&alert.metric==='VN'));
 }
 assert.ok(chosen(buildPeriodGoalAlerts(missing,{period:'month',month:2})),'A missing February does not block complete March');
 const conflict=achievedDataset();
 const row=conflict.rows.find(row=>row.source==='base'&&row.central==='1002'&&row.cooperative==='3017'&&row.metric==='VN');
 row.annualTarget=100;
 assert.ok(!chosen(buildPeriodGoalAlerts(conflict,{period:'annual',month:11})),'An annual conflict blocks even an observed amount above both targets');
 assert.ok(chosen(buildPeriodGoalAlerts(conflict,{period:'quarter',month:2})),'A quarterly goal uses its valid monthly distribution');
 for(const period of ['month','quarter','semester','annual','ytd']){
  const noGoals=achievedDataset();noGoals.rows.forEach(row=>{row.targets=Array(12).fill(null);row.annualTarget=null;});
  assert.equal(buildPeriodGoalAlerts(noGoals,{period,month:2}).length,0);
 }
});

test('cent precision, zero targets and partial aggregate dates retain existing monthly semantics',()=>{
 const dataset=achievedDataset();
 dataset.rows.forEach(row=>{row.targets=Array(12).fill(0.1);row.actuals=Array(12).fill(0.1);row.annualTarget=1.2;});
 const quarter=chosen(buildPeriodGoalAlerts(dataset,{period:'quarter',month:0}));
 assert.equal(quarter.actual,0.3);assert.equal(quarter.target,0.3);
 const zero=achievedDataset();zero.rows.forEach(row=>{row.targets=Array(12).fill(0);row.annualTarget=0;});
 assert.equal(buildPeriodGoalAlerts(zero,{period:'annual',month:11}).length,0);
 const partial=achievedDataset(8,2);
 partial.rows.find(row=>row.central==='1002'&&row.cooperative==='3017'&&row.source==='base'&&row.metric==='VN').cutoff='2026-08-31';
 assert.ok(!buildPeriodGoalAlerts(partial,{period:'quarter',month:8}).some(alert=>alert.entity.id==='central:1002'&&alert.metric==='VN'));
});

test('achievement messages preserve monthly wording and use period labels for other periods',()=>{
 const dataset=achievedDataset();
 const monthly=chosen(buildMonthlyGoalAlerts(dataset,2));
 const legacy={...monthly};delete legacy.period;delete legacy.periodLabel;
 assert.equal(goalAchievementMessage(monthly),goalAchievementMessage(legacy));
 assert.match(goalAchievementMessage(monthly),/MAR\/2026!\nMeta do mês:/);
 const quarterly=chosen(buildPeriodGoalAlerts(dataset,{period:'quarter',month:0}));
 assert.match(goalAchievementMessage(quarterly),/1º trimestre/);
 assert.match(goalAchievementMessage(quarterly),/Meta do período:/);
 assert.doesNotMatch(goalAchievementMessage(quarterly),/Meta do mês/);
});
