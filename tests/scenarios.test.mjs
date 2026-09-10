import test from 'node:test';
import assert from 'node:assert/strict';
import { compareYears, networkSummary, sortAnalysis } from '../lib/scenarios.mjs';
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
