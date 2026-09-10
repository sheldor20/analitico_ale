import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parseWorkbook, combineImports } from '../lib/importer.mjs';
import { initializeRegistry, mergeProduction, upsertEntity } from '../lib/registry.mjs';
import { analyze, MONTHS } from '../lib/analytics.mjs';
const config={year:2025,vnCutoff:'2025-12-31',arCutoff:'2025-12-31',cadenceCutoff:'2025-12-31'};
async function workbook({monthly=200,annual=2400,seasonal=false,missing=false}={}) {
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Cadência');
 const headers=['N_CENTRAL','N_COOP','NOME_COOP','GRUPO','N_PA','NOME_DO_PA',...(missing?[]:['MÊS','ANO']),...(seasonal?MONTHS.map(month=>`META_${month}`):[]),...MONTHS];
 sheet.addRow(headers);sheet.addRow([1002,3017,'Histórica','P1',0,'PA histórico',...(missing?[]:[monthly,annual]),...(seasonal?MONTHS.map((_,index)=>100+index):[]),...MONTHS.map(()=>50)]);
 return book.xlsx.writeBuffer();
}
test('historical XLSX preserves its PA goals through parse, registry and every analytic period',async()=>{
 const part=await parseWorkbook(await workbook(),'historico.xlsx',config);const dataset=mergeProduction(null,combineImports([part],config));
 assert.equal(dataset.rows[0].targets[0],200);assert.equal(dataset.rows[0].annualTarget,2400);assert.equal(dataset.rows[0].pa,'0');
 for(const [period,target] of [['month',200],['quarter',600],['semester',1200],['annual',2400]])assert.equal(analyze(dataset.rows[0],{year:2025,month:0,period}).target,target);
});
test('missing historical PA goals do not inherit 2026 policy or become zero',async()=>{
 const part=await parseWorkbook(await workbook({missing:true}),'historico.xlsx',config);const data=initializeRegistry(combineImports([part],config));assert.equal(data.rows[0].annualTarget,null);assert.ok(data.rows[0].targets.every(value=>value===null));assert.equal(analyze(data.rows[0],{year:2025,month:0,period:'month'}).attainment,null);
});
test('historic source seasonal monthly goals are preserved and annual conflicts flagged',async()=>{
 const part=await parseWorkbook(await workbook({seasonal:true}),'historico.xlsx',{...config,paTargetMode:'source'});assert.equal(part.rows[0].targets[11],111);assert.equal(part.rows[0].annualTarget,2400);const row=initializeRegistry(combineImports([part],config)).rows[0];assert.equal(analyze(row,{year:2025,month:0,period:'annual'}).projected,null);
});
test('fixed 2026 policy is only applied to prior years when explicitly selected',async()=>{
 const part=await parseWorkbook(await workbook(),'historico.xlsx',{...config,paTargetMode:'group'});assert.equal(part.rows[0].annualTarget,5400);assert.equal(part.rows[0].targets[0],450);
});
test('annual-only historical goal distributes cents without loss',async()=>{
 const part=await parseWorkbook(await workbook({monthly:null,annual:1000.01}),'historico.xlsx',config);assert.equal(Math.round(part.rows[0].targets.reduce((sum,value)=>sum+value,0)*100),100001);
});

test('historic group changes preserve explicit imported goals rather than applying a newer policy',async()=>{
 const part=await parseWorkbook(await workbook(),'historico.xlsx',config);
 const dataset=mergeProduction(null,combineImports([part],config));
 const entity=dataset.registry.entities.find(value=>value.kind==='pa');
 const changed=upsertEntity(dataset,{...entity,group:'P5'},entity.id);
 assert.equal(changed.rows[0].targets[0],200);assert.equal(changed.rows[0].annualTarget,2400);
 assert.equal(changed.rows[0].group,'P5');assert.equal(dataset.rows[0].group,'P1');
});
