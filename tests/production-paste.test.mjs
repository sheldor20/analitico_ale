import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCadencePaste } from '../lib/production-paste.mjs';
import { combineImports } from '../lib/importer.mjs';
import { initializeRegistry, mergeProduction, upsertEntity, upsertPlanRow, getPlanRow } from '../lib/registry.mjs';

const config={year:2026,cadenceCutoff:'2026-10-28',vnCutoff:'2026-10-28',arCutoff:'2026-10-28'};
const headers=['GRUPO','Nº CENTRAL','CENTRAL','Nº COOP','NOME COOP','Nº PA','CPA','NOME DO PA','MÊS','ANO',' REAL JAN ','ATINGIU?','REAL FEV','ATINGIU?','REAL MAR','ATINGIU?','ABR','ATINGIU?','MAI','ATINGIU?','JUN','ATINGIU?','JUL','ATINGIU?','AGO','ATINGIU?','SET','ATINGIU?','OUT','ATINGIU?','META PERÍODO','REALIZADO','SUPEROU?','ATINGIU','PROPORÇÃO'];
const row=(changes={})=>['P1','1002','Central exemplo','9999','Cooperativa exemplo','0','9999-0','PA exemplo','450,00','5.400,00','1.234,56','NÃO','-','NÃO','0','NÃO','-12,30','NÃO','','NÃO','45','NÃO','0','NÃO','100,00','NÃO','-','NÃO','20,00','NÃO','99.999,99','999.999,99','SIM','2','2/9'].map((value,index)=>Object.hasOwn(changes,index)?changes[index]:value);
const quote=value=>/[\t\r\n"]/.test(String(value))?'"'+String(value).replaceAll('"','""')+'"':value;
const table=(rows=[row()],head=headers)=>[head,...rows].map(values=>values.map(quote).join('\t')).join('\r\n');
const parse=(text=table(),overrides={})=>parseCadencePaste(text,{...config,...overrides});

test('Cadência clipboard ignores status/totals and treats MÊS/ANO as targets',()=>{
 const parsed=parse();
 assert.equal(parsed.source,'cadence'); assert.equal(parsed.inputRowCount,1);
 assert.deepEqual(parsed.months,[0,1,2,3,4,5,6,7,8,9]);
 const record=parsed.rows[0];
 assert.equal(record.pa,'0'); assert.equal(record.metric,'VN'); assert.equal(record.cutoff,'2026-10-28');
 assert.deepEqual(record.actuals,[1234.56,0,0,-12.3,null,45,0,100,0,20,null,null]);
 assert.deepEqual(record.targets,Array(12).fill(450)); assert.equal(record.annualTarget,5400);
 assert.equal(record.sourceMonthlyTarget,450); assert.equal(record.sourceAnnualTarget,5400);
 assert.equal(record.actuals.reduce((sum,value)=>sum+(value??0),0),1387.26);
});

test('zero dashes replace saved production; blank/absent months and official names/goals survive',()=>{
 const first=combineImports([parse()],config);
 let saved=initializeRegistry(first);
 saved=upsertEntity(saved,{kind:'pa',central:'1002',cooperative:'9999',pa:'0',group:'P1',name:'Nome cadastrado'},'pa:1002:9999:0');
 saved=upsertPlanRow(saved,{entityId:'pa:1002:9999:0',metric:'VN',annualTarget:1200,actuals:[...Array(10).fill(80),null,null],cutoff:'2026-10-28'});
 const partialHeaders=[...headers.slice(0,10),'OUT'];
 const next=parse(table([[...row().slice(0,10),'—']],partialHeaders));
 const updated=mergeProduction(saved,combineImports([next],config));
 const record=getPlanRow(updated,'pa:1002:9999:0','VN');
 assert.equal(record.name,'Nome cadastrado'); assert.equal(record.annualTarget,1200);
 assert.deepEqual(record.targets,Array(12).fill(100));
 // At identical cutoffs, existing manual corrections retain precedence.
 assert.equal(record.actuals[9],80);
 const newer=parse(table([[...row().slice(0,10),'—']],partialHeaders),{cadenceCutoff:'2026-10-29'});
 const newRecord=getPlanRow(mergeProduction(saved,combineImports([newer],config)),'pa:1002:9999:0','VN');
 assert.equal(newRecord.actuals[9],0); assert.equal(newRecord.actuals[0],80); assert.equal(newRecord.actuals[10],null);
 assert.equal(getPlanRow(saved,'pa:1002:9999:0','VN').actuals[9],80);
});

test('quoted TSV preserves names with tabs, newlines and doubled quotes',()=>{
 const parsed=parse(table([row({7:'PA "Centro"\tAnexo\nAtendimento'})]));
 assert.equal(parsed.rows[0].name,'PA "Centro"\tAnexo\nAtendimento');
 assert.throws(()=>parse(table()+'\n"sem fechamento'),/aspas sem fechamento/);
 assert.throws(()=>parse(table()+'\n"célula"inválida'),/Aspas inválidas/);
});

test('invalid monetary production blocks instead of silently preserving the old amount',()=>{
 for(const value of ['R$ inválido','1,2,3','#N/D','SIM']) assert.throws(()=>parse(table([row({28:value})])),/Linha 2, OUT: valor de produção inválido/);
 assert.throws(()=>parse(table([row()], [...headers.slice(0,28),'REAL JAN',...headers.slice(29)])),/mais de uma coluna de produção para JAN/);
 assert.throws(()=>parse(table([row().slice(0,10)],headers.slice(0,10))),/Nenhuma coluna mensal/);
 assert.throws(()=>parse(table([row(Object.fromEntries([10,12,14,16,18,20,22,24,26,28].map(i=>[i,'']))) ])),/Nenhum valor de produção/);
});

test('identities, group and cutoff use the workbook validation and same full business key',()=>{
 assert.throws(()=>parse(table([row(),row()])),/Registro duplicado/);
 assert.throws(()=>parse(table([row({0:'P9'})])),/grupo do PA inválido/);
 assert.throws(()=>parse(table([row({5:'inválido'})])),/código do PA inválido/);
 assert.throws(()=>parse(table(),{cadenceCutoff:''}),/data de corte/);
 assert.throws(()=>parse(table(),{year:2025}),/data de corte/);
 assert.throws(()=>parse(table(),{cadenceCutoff:'2026-02-30'}),/data de corte/);
 const two=parse(table([row(),row({1:'2007',5:'97'})]));
 assert.equal(two.rows.length,2); assert.equal(two.rows[1].pa,'97');
});

test('explicit central scope skips unrelated values and missing/error PA names get a fallback',()=>{
 const parsed=parse(table([row({7:'#N/D'}),row({1:'2007',28:'inválido'})]),{allowedCentrals:['001002']});
 assert.equal(parsed.rows.length,1); assert.equal(parsed.skipped,1); assert.equal(parsed.inputRowCount,2);
 assert.match(parsed.rows[0].name,/PA 0.*nome não informado/);
 assert.ok(parsed.issues.some(issue=>/Nome do PA 0 ausente/.test(issue.message)));
 assert.throws(()=>parse(table(),{allowedCentrals:['9998']}),/Nenhum registro das centrais permitidas/);
 assert.throws(()=>parse(table(),{allowedCentrals:'1002'}),/lista de centrais permitidas/);
});

test('representative 290-row copy includes every PA without using summary totals',()=>{
 const rows=Array.from({length:290},(_,i)=>row({1:i<135?'1002':'2007',5:String(i),6:`9999-${i}`,7:`PA exemplo ${i}`}));
 const parsed=parse(table(rows));
 assert.equal(parsed.rows.length,290); assert.equal(parsed.inputRowCount,290);
 assert.equal(parsed.rows.filter(row=>row.central==='1002').length,135);
 assert.equal(parsed.rows.filter(row=>row.central==='2007').length,155);
 assert.deepEqual(parsed.rows.at(-1).actuals,parsed.rows[0].actuals);
});

test('clipboard bounds, missing header and malformed row shapes fail clearly',()=>{
 assert.throws(()=>parse(''),/Cole os dados/);
 assert.throws(()=>parse(table([[...row().slice(0,10),'9'.repeat(400)]])),/valor de produção inválido/);
 assert.throws(()=>parse('x'.repeat(5*1024*1024+1)),/limite de 5 MB/);
 assert.throws(()=>parse('á'.repeat(3*1024*1024)),/limite de 5 MB/);
 assert.throws(()=>parse('a\t'.repeat(300)+'a'),/300 colunas/);
 assert.throws(()=>parse('a\n'.repeat(50001)),/50 mil linhas/);
 assert.throws(()=>parse('a\tb'),/Cabeçalho não reconhecido/);
 assert.throws(()=>parse(table([row()],[...headers.slice(0,5),'Código PA',...headers.slice(6)])),/NPA/);
 assert.throws(()=>parse(table([[...row(),'excesso']])),/mais valores do que colunas/);
});


test('future months are reported and removed before either an initial or later merge',()=>{
 const parsed=parse(table(),{cadenceCutoff:'2026-09-30'});
 assert.equal(parsed.rows[0].actuals[9],null);
 assert.ok(parsed.issues.some(issue=>/posteriores ao corte foram ignorados/.test(issue.message)));
 const initial=mergeProduction(null,combineImports([parsed],{...config,cadenceCutoff:'2026-09-30'}));
 assert.equal(initial.rows[0].actuals[9],null);
 assert.throws(()=>parse(table([[...row().slice(0,10),'10,00']],[...headers.slice(0,10),'OUT']),{cadenceCutoff:'2026-09-30'}),/Nenhum valor de produção até a data de corte/);
});
