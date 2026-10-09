import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCurrentViewModels } from '../lib/current-view.mjs';
import { analysisIndicators, scopedAnalyses, sortAnalysis } from '../lib/scenarios.mjs';
import { filterDashboardRows } from '../lib/dashboard-view.mjs';
import { summarize } from '../lib/analytics.mjs';
import { createEmptyDataset, initializeRegistry } from '../lib/registry.mjs';

const filters = { source:'base',metric:'both',level:'cooperative',central:'all',coop:'all',pa:'all',group:'all',month:0,period:'month',uplift:0,search:'',status:'all',sortBy:'production' };
function row(change={}) {
  const base={source:'base',central:'1002',cooperative:'3017',cooperativeName:'Alfa',pa:null,name:'Alfa',group:'',metric:'VN',targets:Array(12).fill(100),actuals:[100,20,...Array(10).fill(null)],annualTarget:1200,targetRule:'registry',cutoff:'2026-02-10',sourceFile:'synthetic.xlsx',sheet:'Base',sourceRow:1,...change};
  return {...base,key:`${base.source}:${base.central}:${base.cooperative}:${base.pa??''}:${base.metric}`};
}
const dataset = rows => initializeRegistry({...createEmptyDataset(2026),rows});
const mixed = () => dataset([
  row(),
  row({cooperative:'3025',cooperativeName:'Beta',name:'Beta',actuals:[50,30,...Array(10).fill(null)]}),
  row({metric:'AR',targets:Array(12).fill(1000),annualTarget:12000,actuals:[200,300,400,...Array(9).fill(null)],cutoff:'2026-03-15'}),
  row({source:'cadence',pa:'0',name:'PA Alfa zero',metric:'VN',group:'P1',actuals:Array(12).fill(99999)}),
]);
const build=(data,changes={})=>buildCurrentViewModels({dataset:data,filters:{...filters,...changes}});

test('both yields independent portfolios, real cutoffs and unknown registry-only AR without adding PAs', () => {
  const data=mixed(), before=structuredClone(data), [vn,ar]=build(data);
  assert.deepEqual([vn.metric,ar.metric],['VN','AR']); assert.equal(vn.count,2); assert.equal(ar.count,2);
  assert.deepEqual([vn.summary.target,vn.summary.actual,vn.cutoff],[200,150,'2026-02-10']);
  assert.equal(ar.rows[0].actual,200); assert.equal(ar.rows[1].actual,null); assert.equal(ar.rows[1].target,null);
  assert.deepEqual([ar.summary.actual,ar.summary.target,ar.summary.projected,ar.cutoff],[null,null,null,'2026-03-15']);
  assert.equal(ar.attainment,null); assert.equal(ar.variance.kind,'unknown');
  assert.deepEqual(vn.unitIds,['cooperative:1002:3017','cooperative:1002:3025']);
  assert.deepEqual(data,before);
});

test('search and status select each portfolio independently and headline values match its displayed list', () => {
  const [vn,ar]=build(mixed(),{search:'Alfa'});
  assert.equal(vn.count,1); assert.equal(ar.count,1);
  assert.equal(vn.summary.actual,100); assert.equal(ar.summary.actual,200);
  const [trackVn,trackAr]=build(mixed(),{status:'track'});
  assert.equal(trackVn.count,1); assert.equal(trackVn.rows[0].cooperative,'3017');
  assert.equal(trackAr.count,0); assert.equal(trackAr.summary.target,null); assert.equal(trackAr.cutoff,null);
});

test('defaults to descending attainment and keeps unknown units last', () => {
  const data = dataset([row({actuals:Array(12).fill(40)}),row({cooperative:'3025',cooperativeName:'Beta',actuals:Array(12).fill(150)}),row({cooperative:'3030',cooperativeName:'Gama',actuals:Array(12).fill(null)})]);
  for (const sortBy of [undefined, 'invalid']) {
    const [model] = build(data, { metric:'VN', sortBy });
    assert.equal(model.filters.sortBy, 'attainment-desc');
    assert.deepEqual(model.unitIds, ['cooperative:1002:3025','cooperative:1002:3017','cooperative:1002:3030']);
  }
});

test('exact per-metric cohorts preserve priority filters and recompute contribution within that cohort', () => {
  const [vn,ar]=build(mixed(),{unitIdsByMetric:{VN:['cooperative:1002:3025'],AR:['cooperative:1002:3017']}});
  assert.deepEqual(vn.unitIds,['cooperative:1002:3025']); assert.equal(vn.summary.actual,50); assert.equal(vn.rows[0].contribution,1);
  assert.deepEqual(ar.unitIds,['cooperative:1002:3017']); assert.equal(ar.summary.actual,200); assert.equal(ar.rows[0].contribution,1);
  assert.deepEqual(vn.filters.unitIds,['cooperative:1002:3025']); assert.equal(vn.filters.unitIdsByMetric,undefined);
  const empty=build(mixed(),{unitIdsByMetric:{VN:[],AR:[]}}); assert.ok(empty.every(model=>model.count===0&&model.summary.actual===null));
});

test('matches the dashboard pipeline for every ranking and period rather than recalculating financial values', () => {
  const data=mixed();
  for(const period of ['month','quarter','semester','annual','ytd']) for(const sortBy of ['name','production','attainment','attainment-desc','gap','projected-gap','contribution','evolution']) {
    const opts={...filters,metric:'AR',period,month:2,sortBy,search:'Alfa'};
    const expected=sortAnalysis(analysisIndicators(filterDashboardRows(scopedAnalyses(data,opts),opts.search,opts.status),{year:2026,month:2,period}),sortBy);
    const [actual]=buildCurrentViewModels({dataset:data,filters:opts});
    assert.deepEqual(actual.rows,expected); assert.deepEqual(actual.summary,summarize(expected));
  }
});

test('central grouping retains the cooperative restriction and repeated codes stay isolated', () => {
  const data=dataset([row(),row({cooperative:'3025',cooperativeName:'Beta',actuals:Array(12).fill(1000)}),row({central:'2007',actuals:Array(12).fill(9999)}),row({metric:'AR',actuals:Array(12).fill(400)})]);
  const [vn,ar]=build(data,{level:'central',central:'1002',coop:'1002:3017'});
  assert.deepEqual(vn.unitIds,['central:1002']); assert.equal(vn.summary.actual,100); assert.equal(ar.summary.actual,400);
  const [other]=build(data,{metric:'VN',level:'central',central:'2007',coop:'2007:3017'});
  assert.equal(other.summary.actual,9999); assert.deepEqual(other.unitIds,['central:2007']);
});

test('Cadência forces one VN model, preserves PA zero and cannot fabricate an AR portfolio', () => {
  const data=dataset([row({source:'cadence',pa:'0',group:'P1',actuals:[12,...Array(11).fill(null)]}),row({source:'cadence',pa:'0',central:'2007',group:'P1',actuals:[999,...Array(11).fill(null)]})]);
  for(const metric of ['AR','both']) {
    const models=build(data,{source:'cadence',metric,level:'central',pa:'1002:3017:0'});
    assert.equal(models.length,1); assert.equal(models[0].metric,'VN'); assert.equal(models[0].level,'pa');
    assert.deepEqual(models[0].unitIds,['pa:1002:3017:0']); assert.equal(models[0].summary.actual,12);
  }
});

test('zero, negative and absent production and annual conflicts remain distinct in headlines', () => {
  const [zero]=build(dataset([row({actuals:Array(12).fill(0)})]),{metric:'VN'});
  assert.equal(zero.summary.actual,0); assert.equal(zero.attainment,0); assert.equal(zero.variance.value,100);
  const [negative]=build(dataset([row({actuals:Array(12).fill(-30)})]),{metric:'VN'});
  assert.equal(negative.summary.actual,-30); assert.equal(negative.attainment,-0.3); assert.equal(negative.variance.value,130);
  const [absent]=build(dataset([row({actuals:Array(12).fill(null)})]),{metric:'VN'});
  assert.equal(absent.summary.actual,null); assert.equal(absent.attainment,null); assert.equal(absent.cutoff,null);
  const [conflict]=build(dataset([row({annualTarget:1500})]),{metric:'VN',period:'annual',month:11});
  assert.equal(conflict.summary.target,1500); assert.equal(conflict.summary.projected,null); assert.equal(conflict.attainment,null); assert.equal(conflict.variance.kind,'unknown'); assert.equal(conflict.hasGoalConflict,true);
});

test('future periods retain their real source date while missing portfolios have no claimed update', () => {
  const [vn,ar]=build(dataset([row()]),{month:9});
  assert.equal(vn.summary.actual,null); assert.equal(vn.cutoff,'2026-02-10'); assert.equal(vn.summary.projected,null);
  assert.equal(ar.summary.actual,null); assert.equal(ar.cutoff,null); assert.equal(ar.phaseLabel,'Sem realizado');
  assert.throws(()=>build(mixed(),{unitIds:[123]}),/seleção de unidades/);
});
