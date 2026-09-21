import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisIndicators, compareYears, networkSummary, scopedAnalyses, sortAnalysis } from '../lib/scenarios.mjs';
import { analyze } from '../lib/analytics.mjs';
import { filterDashboardRows } from '../lib/dashboard-view.mjs';
import { createEmptyDataset, initializeRegistry, mergeProduction } from '../lib/registry.mjs';
import { applyMessageTemplate, templateHtml } from '../lib/message-template.mjs';
function row(year, coop='3017', pa=null, actual=100, target=100, central='1002', cutoff=`${year}-12-31`) { return { key: `${pa===null?'base':'cadence'}:${central}:${coop}:${pa??''}:VN`, source: pa===null?'base':'cadence', central, cooperative:coop, cooperativeName:`Coop ${coop}`, pa, name:pa===null?`Coop ${coop}`:`PA ${pa}`, group:'P1', metric:'VN', targets:Array(12).fill(target), actuals:Array(12).fill(actual), annualTarget:target==null?null:target*12, targetRule:'registry', cutoff, sourceFile:'synthetic.xlsx',sheet:'Sheet',sourceRow:1 }; }
function dataset(year, rows){return initializeRegistry({...createEmptyDataset(year),rows});}
const filters={central:'all',coop:'all',group:'all',source:'base',metric:'VN',level:'cooperative',period:'annual',month:11,status:'all',search:'',sortBy:'production'};
test('descending attainment and production use different measures and stable null-last ordering',()=>{
 const rows=[{key:'a',name:'a',actual:100,attainment:2},{key:'b',name:'b',actual:200,attainment:1},{key:'c',name:'c',actual:null,attainment:null},{key:'d',name:'d',actual:-10,attainment:-0.1}];
 assert.deepEqual(sortAnalysis(rows,'production').map(r=>r.key),['b','a','d','c']);assert.deepEqual(sortAnalysis(rows,'attainment-desc').map(r=>r.key),['a','b','d','c']);assert.deepEqual(sortAnalysis(rows,'attainment').map(r=>r.key),['d','b','a','c']);assert.equal(rows[0].key,'a');
});
test('network counts distinct PA 0 and 97 and counts delivered, not projected',()=>{
 const d=dataset(2026,[row(2026),row(2026,'3017','0'),row(2026,'3017','97',50,100,'1002','2026-01-10')]);
 const m=networkSummary(d,{...filters,period:'month',month:0});assert.equal(m.cooperativeCount,1);assert.equal(m.paCount,2);assert.equal(m.paAchieved,1);assert.equal(m.cooperativeAchieved,1);
});
test('zero or missing targets never count as delivered',()=>{
 const m=networkSummary(dataset(2026,[row(2026),row(2026,'3017','0',100,0),row(2026,'3017','97',null,null)]),filters);assert.equal(m.paAchieved,0);assert.equal(m.paUnknown,2);
});
test('central/cooperative filters never mix repeated PA codes in other cooperatives',()=>{
 const d=dataset(2026,[row(2026),row(2026,'3017','0'),row(2026,'3025'),row(2026,'3025','0'),row(2026,'3017','0',100,100,'2007')]);
 const m=networkSummary(d,{...filters,central:'1002',coop:'1002:3017'});assert.equal(m.paCount,1);assert.equal(m.cooperativeCount,1);assert.equal(m.centralCount,1);
});
test('group filter includes only corresponding PAs and their parents',()=>{
 const one=row(2026,'3017','0'),two={...row(2026,'3025','97'),group:'P2'};const m=networkSummary(dataset(2026,[one,two]),{...filters,source:'cadence',level:'pa',group:'P2'});assert.equal(m.paCount,1);assert.equal(m.cooperativeCount,1);assert.equal(m.pas[0].pa,'97');
});
test('annual union distinguishes absent units rather than turning absence into zero',()=>{
 const current=dataset(2026,[row(2026,'3017'),row(2026,'3025')]),previous=dataset(2025,[row(2025,'3017'),row(2025,'3030')]);
 const result=compareYears(current,previous,filters);assert.equal(result.common,1);assert.equal(result.currentOnly,1);assert.equal(result.previousOnly,1);assert.equal(result.rows.find(r=>r.membership==='current').delta,null);assert.equal(result.rows.find(r=>r.membership==='previous').current,null);
});
test('renaming does not break identity, separate central does',()=>{
 const current=dataset(2026,[{...row(2026),name:'New name',cooperativeName:'New name'}]),previous=dataset(2025,[row(2025)]);assert.equal(compareYears(current,previous,filters).common,1);
 assert.equal(compareYears(current,dataset(2025,[row(2025,'3017',null,100,100,'2007')]),filters).common,0);
});
test('same closed months exclude the partial month in both years',()=>{
 const a=dataset(2026,[row(2026,'3017',null,100,100,'1002','2026-09-10')]),b=dataset(2025,[row(2025,'3017',null,50)]);
 const result=compareYears(a,b,{...filters,month:8,period:'ytd'});assert.equal(result.last,7);assert.equal(result.rows[0].current.actual,800);assert.equal(result.rows[0].previous.actual,400);assert.equal(result.rows[0].growth,1);
});
test('monthly partial and daily have no manufactured historic daily comparison',()=>{
 const a=dataset(2026,[row(2026,'3017',null,100,100,'1002','2026-09-10')]),b=dataset(2025,[row(2025)]);
 assert.equal(compareYears(a,b,{...filters,month:8,period:'month'}).available,false);assert.equal(compareYears(a,b,{...filters,period:'daily'}).available,false);
});
test('quarter and semester compare the same requested months',()=>{
 const a=dataset(2026,[row(2026)]),b=dataset(2025,[row(2025)]);const q=compareYears(a,b,{...filters,month:7,period:'quarter'});assert.equal(q.first,6);assert.equal(q.last,8);assert.equal(q.rows[0].current.actual,300);assert.equal(compareYears(a,b,{...filters,month:7,period:'semester'}).rows[0].current.actual,600);
});
test('leap-year February is closed at its real final day',()=>{
 const a=dataset(2024,[row(2024,'3017',null,100,100,'1002','2024-02-29')]),b=dataset(2023,[row(2023)]);assert.equal(compareYears(a,b,{...filters,month:1,period:'month'}).available,true);
});
test('missing actuals and zero prior production have no invented percentage',()=>{
 const a=dataset(2026,[row(2026)]),b=dataset(2025,[row(2025,'3017',null,0)]);const item=compareYears(a,b,filters).rows[0];assert.equal(item.growth,null);assert.equal(item.delta,1200);assert.equal(compareYears(a,dataset(2025,[row(2025,'3017',null,null)]),filters).rows[0].delta,null);
});
test('common-units cohort removes composition changes',()=>{
 const a=dataset(2026,[row(2026),row(2026,'3025')]),b=dataset(2025,[row(2025)]);assert.equal(compareYears(a,b,filters,true).rows.length,1);
});
test('PA and cooperative sources are never added together',()=>{
 const d=dataset(2026,[row(2026,'3017',null,100),row(2026,'3017','0',999)]),p=dataset(2025,[row(2025,'3017',null,50),row(2025,'3017','0',200)]);assert.equal(compareYears(d,p,filters).rows[0].current.actual,1200);assert.equal(compareYears(d,p,{...filters,source:'cadence',level:'pa'}).rows[0].current.actual,11988);
});
test('production merge cannot overwrite a different year',()=>assert.throws(()=>mergeProduction(dataset(2026,[row(2026)]),dataset(2025,[row(2025)])),/2026/));
test('text templates use fresh values once and safely preserve special characters',()=>{
 assert.equal(applyMessageTemplate('Olá {{unidade}} / {{ano}}\n{{cenario}}','Dados {{ano}}',{unit:'Coop',year:2026}),'Olá Coop / 2026\nDados {{ano}}');assert.equal(applyMessageTemplate('Texto avulso','Dados'),'Texto avulso');assert.throws(()=>applyMessageTemplate('x'.repeat(12001),''));
});
test('HTML text is escaped, body included once and replacement metacharacters inert',()=>{
 const base='<html><body><table><tr><td>GAP 10</td></tr></table></body></html>';
 const result=templateHtml('<script>alert(1)</script> $& {{unidade}}\n{{cenario}}',base,{unit:'<img src=x>'});assert.ok(result.includes('&lt;script&gt;'));assert.ok(result.includes('$&'));assert.ok(!result.includes('<script>'));assert.equal((result.match(/GAP 10/g)||[]).length,1);assert.equal(templateHtml('{{cenario}}',base),base);
});

test('observed GAP and projected GAP are separate rankings, without a fallback into the other measure', () => {
 const rows = [
  { key:'observed', name:'A', gap:500, projectionGap:0 },
  { key:'estimated', name:'B', gap:50, projectionGap:900 },
  { key:'unknown-actual', name:'C', gap:null, projectionGap:999 },
  { key:'unknown-projection', name:'D', gap:200, projectionGap:null },
 ];
 const before = structuredClone(rows);
 assert.deepEqual(sortAnalysis(rows, 'gap').map(r => r.key), ['observed','unknown-projection','estimated','unknown-actual']);
 assert.deepEqual(sortAnalysis(rows, 'projected-gap').map(r => r.key), ['unknown-actual','estimated','observed','unknown-projection']);
 assert.deepEqual(rows, before);
});

test('contribution and evolution sort descending with signed values before missing measures', () => {
 const rows = [
  { key:'unknown', name:'A', contribution:null, recentGrowth:null },
  { key:'negative', name:'B', contribution:-0.2, recentGrowth:-1.5 },
  { key:'high-production', name:'C', contribution:0.9, recentGrowth:0.2 },
  { key:'high-growth', name:'D', contribution:0.3, recentGrowth:0.8 },
 ];
 assert.deepEqual(sortAnalysis(rows, 'contribution').map(r => r.key), ['high-production','high-growth','negative','unknown']);
 assert.deepEqual(sortAnalysis(rows, 'evolution').map(r => r.key), ['high-growth','high-production','negative','unknown']);
});

test('contribution reconciles to the signed realized total, including positive shares above 100 percent', () => {
 const opts = { year:2026, month:8, period:'month' };
 const analyses = [row(2026,'3017',null,300), row(2026,'3025',null,-100)].map(r => analyze(r, opts));
 const before = structuredClone(analyses), result = analysisIndicators(analyses, opts);
 assert.equal(result[0].contribution, 1.5);
 assert.equal(result[1].contribution, -0.5);
 assert.equal(result.reduce((sum,r) => sum+r.contribution,0), 1);
 assert.deepEqual(analyses,before);
 for (const negative of [-300,-400]) {
  const nonpositive = [analyses[0], analyze(row(2026,'3025',null,negative), opts)];
  assert.ok(analysisIndicators(nonpositive, opts).every(r => r.contribution === null));
 }
});

test('contribution refuses missing actuals, annual target conflict and different partial dates', () => {
 const opts = { year:2026, month:8, period:'month' };
 const current = analyze(row(2026,'3017',null,100,100,'1002','2026-09-10'), opts);
 for (const other of [analyze(row(2026,'3025',null,null,100,'1002','2026-09-10'),opts),
  analyze(row(2026,'3025',null,100,100,'1002','2026-09-11'), opts), { ...current, key:'mixed', complete:false, cutoffMin:'2026-09-01' }]) {
  assert.ok(analysisIndicators([current,other],opts).every(r=>r.contribution===null));
 }
 const annual = { ...opts, period:'annual' };
 const conflict = analyze({...row(2026),annualTarget:5000},annual);
 assert.ok(analysisIndicators([conflict],annual).every(r=>r.contribution===null));
 const closed = [row(2026,'3017',null,100,100,'1002','2026-10-01'),row(2026,'3025',null,300,100,'1002','2026-11-01')].map(r=>analyze(r,opts));
 assert.deepEqual(analysisIndicators(closed,opts).map(r=>r.contribution),[0.25,0.75]);
});

test('cent cancellation never creates a positive denominator for contribution or recent evolution', () => {
 const opts={year:2026,month:8,period:'month'};
 const cancelled=[0.1,0.2,-0.3].map((actual,i)=>analyze(row(2026,String(i+1),null,actual),opts));
 assert.ok(analysisIndicators(cancelled,opts).every(r=>r.contribution===null));
 const previousZero=analyze({...row(2026,'3017',null,1,100,'1002','2026-09-10'),actuals:[0,0,0.1,0.2,-0.3,1,1,1,1,0,0,0]},opts);
 assert.equal(analysisIndicators([previousZero],opts)[0].recentGrowth,null);
});

test('recent evolution uses the same six closed months, excludes partial production and is not a seasonal adjustment', () => {
 const opts={year:2026,month:8,period:'ytd'};
 const seasonal=[20,20,100,200,300,300,400,500,99999,99999,99999,99999];
 const a=analyze({...row(2026,'3017',null,0,100,'1002','2026-09-10'),actuals:seasonal},opts);
 const b=analyze({...row(2026,'3025',null,0,100,'1002','2026-08-31'),actuals:seasonal},opts);
 const result=analysisIndicators([a,b],opts);
 assert.deepEqual(result.map(r=>r.recentGrowth),[1,1]); // Jun–Aug 1200 vs Mar–May 600, not Sep partial.
 assert.ok(result.every(r=>r.recentLabel==='06–08/2026 vs. 03–05/2026'));
 assert.deepEqual(analysisIndicators([{...a,projected:1e12},{...b,projected:-1e12}],opts).map(r=>r.recentGrowth),[1,1]);
 const mixed=analysisIndicators([{...a,cutoffMin:'2026-07-20'},b],opts);
 const growth=(200+300+300-(20+20+100))/(20+20+100);
 assert.deepEqual(mixed.map(r=>r.recentGrowth),[growth,growth]);
 assert.ok(mixed.every(r=>r.recentLabel==='04–06/2026 vs. 01–03/2026'));
});

test('evolution nulls are not zero, prior nonpositive values have no ratio, and negative current production survives', () => {
 const opts={year:2026,month:8,period:'month'};
 const make=(actuals)=>analyze({...row(2026,'3017',null,0,100,'1002','2026-09-10'),actuals},opts);
 const values=[0,0,100,100,100,-50,-50,-50,10,0,0,0];
 assert.equal(analysisIndicators([make(values)],opts)[0].recentGrowth,-1.5);
 for(const previous of [0,-100]) {
  const changed=[...values];changed.splice(2,3,previous,previous,previous);
  assert.equal(analysisIndicators([make(changed)],opts)[0].recentGrowth,null);
 }
 const missing=[...values];missing[4]=null;
 assert.equal(analysisIndicators([make(missing)],opts)[0].recentGrowth,null);
 const unrelated=[...values];unrelated[0]=null;
 assert.equal(analysisIndicators([make(unrelated)],opts)[0].recentGrowth,-1.5);
 assert.equal(analysisIndicators([make(values)],{...opts,period:'daily'})[0].recentGrowth,null);
 assert.equal(analysisIndicators([make(values)],{...opts,month:4})[0].recentGrowth,null);
 assert.match(analysisIndicators([make(values)],{...opts,month:4})[0].recentLabel,/seis meses fechados/);
});

test('composite PA filtering isolates PA zero and keeps only its ancestors in the network', () => {
 const d=dataset(2026,[row(2026),row(2026,'3017','0'),row(2026,'3017','97'),row(2026,'3025'),row(2026,'3025','0'),row(2026,'3017','0',100,100,'2007')]);
 const scoped={...filters,source:'cadence',level:'pa',pa:'1002:3017:0'};
 const result=scopedAnalyses(d,scoped);
 assert.equal(result.length,1);
 assert.equal(result[0].central,'1002');assert.equal(result[0].cooperative,'3017');assert.equal(result[0].pa,'0');
 const network=networkSummary(d,scoped);
 assert.equal(network.paCount,1);assert.equal(network.cooperativeCount,1);assert.equal(network.centralCount,1);
 assert.equal(network.pas[0].pa,'0');assert.equal(network.pas[0].cooperative,'3017');
 assert.equal(networkSummary(d,{...scoped,central:'2007'}).paCount,0);
});

test('network unitIds respects exact level identity, empty selections and descendants without sibling leakage', () => {
 const d=dataset(2026,[row(2026),row(2026,'3017','0'),row(2026,'3017','97'),row(2026,'3025'),row(2026,'3025','0'),row(2026,'3017','0',100,100,'2007')]);
 const one=networkSummary(d,{...filters,source:'cadence',level:'pa',unitIds:['pa:1002:3017:0']});
 assert.equal(one.paCount,1);assert.equal(one.cooperativeCount,1);assert.equal(one.centralCount,1);
 assert.equal(one.pas[0].central,'1002');assert.equal(one.pas[0].cooperative,'3017');assert.equal(one.pas[0].pa,'0');
 const cooperative=networkSummary(d,{...filters,unitIds:['cooperative:1002:3017']});
 assert.equal(cooperative.paCount,2);assert.equal(cooperative.cooperativeCount,1);assert.equal(cooperative.centralCount,1);
 const central=networkSummary(d,{...filters,level:'central',unitIds:['central:1002']});
 assert.equal(central.paCount,3);assert.equal(central.cooperativeCount,2);assert.equal(central.centralCount,1);
 for(const unitIds of [[],['pa:1002:9999:0'],['base:1002:3017:0:VN']]) {
  const empty=networkSummary(d,{...filters,source:'cadence',level:'pa',unitIds});
  assert.equal(empty.paCount,0);assert.equal(empty.cooperativeCount,0);assert.equal(empty.centralCount,0);
 }
});

test('central-code search uses the same hierarchy scope in dashboard, network and year comparison', () => {
 const rows=[row(2026,'3017',null,100,100,'1002'),row(2026,'3017',null,100,100,'2007')];
 assert.deepEqual(filterDashboardRows(rows,' 1002 ').map(r=>r.central),['1002']);
 const current=dataset(2026,rows),previous=dataset(2025,[row(2025,'3017',null,50,100,'1002'),row(2025,'3017',null,50,100,'2007')]);
 const network=networkSummary(current,{...filters,search:'1002'});
 assert.equal(network.centralCount,1);assert.equal(network.cooperativeCount,1);
 const comparison=compareYears(current,previous,{...filters,search:'1002'});
 assert.equal(comparison.common,1);assert.equal(comparison.rows[0].current.central,'1002');
 assert.equal(comparison.rows[0].growth,1);
});

test('year comparison preserves closed-month arithmetic under a composite PA filter', () => {
 const current=dataset(2026,[row(2026,'3017','0',200),row(2026,'3025','0',999),row(2026,'3017','0',999,100,'2007')]);
 const previous=dataset(2025,[row(2025,'3017','0',100),row(2025,'3025','0',555),row(2025,'3017','0',555,100,'2007')]);
 const comparison=compareYears(current,previous,{...filters,source:'cadence',level:'pa',pa:'1002:3017:0'});
 assert.equal(comparison.common,1);assert.equal(comparison.rows.length,1);
 assert.equal(comparison.rows[0].current.actual,2400);assert.equal(comparison.rows[0].previous.actual,1200);assert.equal(comparison.rows[0].growth,1);
});
