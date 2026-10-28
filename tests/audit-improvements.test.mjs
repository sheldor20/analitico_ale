import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,aggregate,summarize,businessDays} from '../lib/analytics.mjs';
import {buildPeriodGoalAlerts} from '../lib/goal-alerts.mjs';
import {buildResultExport} from '../lib/result-export.mjs';
import {initializeRegistry,createEmptyDataset,upsertEntity,analysisRows} from '../lib/registry.mjs';
import {productionChanges,restoreProduction} from '../lib/production-changes.mjs';
import {issueCategory,groupIssues,actionableIssueCount} from '../lib/issue-presentation.mjs';
import {calendarDates} from '../lib/calendar-policy.mjs';
import {navigationSearch,readNavigation} from '../lib/navigation-state.mjs';
import {sortActionPriority} from '../lib/action-priority.mjs';
import {cents,sumMoney} from '../lib/money.mjs';
import {portfolioFixture} from './portfolio-fixture.mjs';
const row=(changes={})=>({source:'base',metric:'VN',central:'1002',cooperative:'1',pa:null,key:'base:1002:1::VN',name:'Unidade',targetRule:'manual',targets:Array(12).fill(100),annualTarget:1200,actuals:Array(12).fill(100),cutoff:'2026-10-28',...changes});
test('cent-exact thresholds agree across analysis, aggregation, summaries and achievements',()=>{
 for(const [value,expected] of [[10.075,1008],[-10.075,-1008],[1.005,101],[-1.005,-101],[1e-7,0],[9e13,9e15]])assert.equal(cents(value),expected);
 assert.equal(sumMoney([.1,.2,-.3]),0);assert.throws(()=>cents(1e14),/limite/);
 const r=row({targets:[.1,.2,...Array(10).fill(0)],annualTarget:.3,actuals:[.3,0,...Array(10).fill(null)],cutoff:'2026-02-28'});
 const a=analyze(r,{year:2026,month:1,period:'ytd'});assert.equal(a.status,'Meta atingida');assert.equal(a.attainment,1);assert.equal(a.gap,0);
 const d=initializeRegistry({version:2,year:2026,config:{year:2026},rows:[r],sources:[],issues:[]});
 assert.ok(buildPeriodGoalAlerts(d,{period:'ytd',month:1}).every(alert=>alert.attainment===1));
 const combined=aggregate([row({actuals:Array(12).fill(.1)}),row({cooperative:'2',actuals:Array(12).fill(.2)})],'central')[0];assert.equal(combined.actuals[0],.3);
});
test('mixed partial cuts suspend derived totals identically in screen and export; closed cuts remain comparable',()=>{
 const rows=[row({cutoff:'2026-10-15'}),row({cooperative:'2',key:'base:1002:2::VN'})].map(r=>analyze(r,{year:2026,month:9,period:'month'}));
 const screen=summarize(rows);const file=buildResultExport({rows,context:{year:2026,month:9,period:'month',source:'base',metric:'VN',level:'cooperative'}});
 assert.equal(screen.actual,file.totals.actual);for(const key of ['attainment','projected','projectedAttainment','gap'])assert.equal(screen[key],null);
 const closed=rows.map(r=>analyze({...r,cutoff:'2026-12-31'},{year:2026,month:7,period:'month'}));assert.equal(summarize(closed).attainment,1);
});
test('clipboard review describes only effective changes and full restore preserves current goals and membership',()=>{
 const before=row({actuals:[10,20,30,...Array(9).fill(null)],manualActualMonths:[1],cutoff:'2026-03-31'});
 const incoming=row({actuals:[15,99,null,...Array(9).fill(null)],cutoff:'2026-03-31'});
 assert.deepEqual(productionChanges([before],[incoming]).map(c=>[c.month,c.before,c.after,c.delta]),[[0,10,15,5]]);
 const current=portfolioFixture(),snapshot=structuredClone(current);
 current.rows[0].actuals[0]=888;current.rows[0].targets[0]=999;
 const restored=restoreProduction(current,snapshot);assert.equal(restored.rows[0].actuals[0],snapshot.rows[0].actuals[0]);assert.equal(restored.rows[0].targets[0],999);assert.deepEqual(restored.registry.entities,current.registry.entities);
 assert.throws(()=>restoreProduction(current,{...snapshot,year:2025}),/outro ano/);
});
test('informational provenance is grouped without hiding missing names or dropping original records',()=>{
 const notes=[{kind:'source',message:'Linha 1: Há valores após o corte informado.'},{kind:'source',message:'Linha 2: Há valores após o corte informado.'},{kind:'source',message:'Nome do PA ausente; valores preservados.'},{kind:'reconciliation',message:'Diferença'}];
 assert.equal(issueCategory(notes[0]),'information');assert.equal(actionableIssueCount(notes),2);const groups=groupIssues(notes);assert.equal(groups[0].count,2);assert.deepEqual(groups[0].occurrences,notes.slice(0,2));
});
test('navigation serializes allow-listed context only and rejects invalid scopes and private parameters',()=>{
 const value=readNavigation('?area=imports&year=2026&month=9&central=1002&email=private@example.com&tab=invalid');assert.equal(value.area,'imports');assert.equal(value.month,9);assert.equal(value.email,undefined);assert.equal(value.tab,undefined);
 const search=navigationSearch({...value,email:'private@example.com',notes:'private'});assert.ok(!search.includes('private'));assert.equal(readNavigation('?year=1900&month=15&central=invalid').year,undefined);
});
test('validated annual calendars affect effort and projection, never observed production or goals',()=>{
 const holidays=calendarDates('2026-10-28\n2026-10-28\n2026-10-29',2026);assert.equal(holidays.length,2);assert.throws(()=>calendarDates('2026-02-30',2026),/inválida/);assert.throws(()=>calendarDates('2025-01-01',2026),/inválida/);
 const base=analyze(row(),{year:2026,month:9,period:'month'}),custom=analyze(row({calendarHolidays:holidays}),{year:2026,month:9,period:'month'});assert.equal(base.actual,custom.actual);assert.equal(base.target,custom.target);assert.equal(base.remainingDays-1,custom.remainingDays);
 assert.equal(businessDays('2026-10-28','2026-10-29',holidays),0);
});
test('new years require an explicit imported/manual/group policy rather than inheriting group amounts',()=>{
 let d=createEmptyDataset(2027);d=upsertEntity(d,{kind:'central',central:'1002',name:'Central'});d=upsertEntity(d,{kind:'cooperative',central:'1002',cooperative:'1',name:'Cooperativa'});d=upsertEntity(d,{kind:'pa',central:'1002',cooperative:'1',pa:'0',group:'P1',name:'PA'});
 const analyzed=analyze(analysisRows(d).find(row=>row.source==='cadence'),{year:2027,month:0});assert.equal(analyzed.target,null);
 assert.equal(d.config.paTargetMode,'source');
});
test('operational priorities put invalid data, overdue commitments and recovery before delivered goals',()=>{
 const rows=[{key:'delivered',complete:true,target:100,gap:0},{key:'recover',complete:true,target:100,gap:90},{key:'overdue',complete:true,target:100,gap:1},{key:'invalid',complete:false,target:100,gap:null}];
 assert.deepEqual(sortActionPriority(rows,{overdue:{due:'2026-10-01',status:'Aberta'}},'2026-10-28').map(r=>r.key),['invalid','overdue','recover','delivered']);
});
