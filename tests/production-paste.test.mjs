import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCadencePaste, parseBasePaste, parseProductionPaste } from '../lib/production-paste.mjs';
import { combineImports } from '../lib/importer.mjs';
import { aggregate } from '../lib/analytics.mjs';
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


const monthNames=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
const baseHeaders=['G .CENTRAL','Nº CENTRAL','SIGLA CENTRAL','G. COOP','Nº COOP','SIGLA COOPERATIVA','META'];
for(let month=0;month<12;month++){
 baseHeaders.push(`META_${monthNames[month]}`,`REAL_${monthNames[month]}`,`% ${monthNames[month]}`);
 if(month%3===2)baseHeaders.push('META','REAL','%');
}
baseHeaders.push('META_ANUAL','REAL_ACUM','% ACUM','META_PER','REAL_PER','% PER','','');
const baseRow=(metric='VENDA NOVA',{cooperative='9999',central='1002',name='Cooperativa exemplo',amounts={},target='100,00'}={})=>{
 const cells=['C1',central,'Central exemplo','S1',cooperative,name,metric];
 for(let month=0;month<12;month++){
  cells.push(target,Object.hasOwn(amounts,month)?amounts[month]:month===1?'-':month===2?'':month===6?'(10,25)':month===9?'25,00':'10,00','99%');
  if(month%3===2)cells.push('999.999,99','999.999,99','999%');
 }
 return [...cells,'1.200,00','999.999,99','999%','999.999,99','999.999,99','999%','',''];
};
const baseText=(rows=[baseRow(),baseRow('ARRECADAÇÃO')],head=baseHeaders)=>table(rows,head);
const markdown=(rows,head=baseHeaders)=>[
 '| Relatório copiado | | |',
 '| --- | --- | --- |',
 '| 1º TRIM | 2º TRIM | 3º TRIM |',
 '| TOTAL | 999.999,99 | 999.999,99 |',
 '| '+head.join(' | ')+' |',
 ...rows.map(row=>'| '+row.map(value=>String(value).replaceAll('|','\\|')).join(' | ')+' |'),
].join('\n');

test('base clipboard reads both portfolios and monthly values without quarterly/annual double counting',()=>{
 const parsed=parseBasePaste(baseText(),config);
 assert.equal(parsed.source,'base');assert.equal(parsed.rows.length,2);assert.equal(parsed.inputRowCount,2);
 assert.deepEqual(parsed.months,Array.from({length:12},(_,i)=>i));
 assert.deepEqual(parsed.rows.map(row=>row.metric),['VN','AR']);
 assert.equal(parsed.rows[0].centralName,'Central exemplo');
 assert.deepEqual(parsed.rows[0].actuals,[10,0,null,10,10,10,-10.25,10,10,25,null,null]);
 assert.deepEqual(parsed.rows[0].targets,Array(12).fill(100));assert.equal(parsed.rows[0].annualTarget,1200);
 assert.equal(parsed.ignoredActualCount,4);
 const source=initializeRegistry(combineImports([parsed],config));
 const consolidated=aggregate(source.rows,'central');
 assert.equal(consolidated.length,2);assert.equal(consolidated[0].actuals[0],10);
});

test('Markdown table decodes entities/NBSP, skips preheader summaries and supports escaped pipes',()=>{
 const cells=baseRow('ARRECADAÇÃO',{name:'Cooperativa | Exemplo',amounts:{0:'\u00a0&#x20;1.234,56&#32;\u00a0'}});
 const parsed=parseProductionPaste(markdown([cells]),config,'base');
 assert.equal(parsed.rows.length,1);assert.equal(parsed.rows[0].actuals[0],1234.56);
 assert.equal(parsed.rows[0].cooperativeName,'Cooperativa | Exemplo');assert.equal(parsed.rows[0].centralName,'Central exemplo');
 const cadence=parseCadencePaste(markdown([row()],headers),config);
 assert.deepEqual(cadence.rows[0].actuals,parse().rows[0].actuals);
});

test('each base portfolio applies its own valid cutoff and rejects missing or obsolete dates',()=>{
 const parsed=parseBasePaste(baseText(),{...config,vnCutoff:'2026-09-30',arCutoff:'2026-10-28'});
 assert.equal(parsed.rows[0].cutoff,'2026-09-30');assert.equal(parsed.rows[0].actuals[9],null);
 assert.equal(parsed.rows[1].cutoff,'2026-10-28');assert.equal(parsed.rows[1].actuals[9],25);
 assert.equal(parsed.ignoredActualCount,5);
 assert.throws(()=>parseBasePaste(baseText(),{...config,arCutoff:''}),/data de corte/);
 assert.throws(()=>parseBasePaste(baseText(),{...config,vnCutoff:'2025-10-28'}),/data de corte/);
});

test('base production merge preserves official targets/names, blank months, PAs and other portfolios',()=>{
 const oldConfig={...config,vnCutoff:'2026-09-30',arCutoff:'2026-09-30'};
 let saved=mergeProduction(null,combineImports([parseBasePaste(baseText(),oldConfig),parse()],oldConfig));
 saved=upsertEntity(saved,{kind:'cooperative',central:'1002',cooperative:'9999',name:'Nome oficial',group:'S1'},'cooperative:1002:9999');
 saved=upsertPlanRow(saved,{entityId:'cooperative:1002:9999',metric:'VN',annualTarget:2400});
 const paBefore=structuredClone(saved.rows.find(row=>row.source==='cadence'));
 const arBefore=structuredClone(saved.rows.find(row=>row.metric==='AR'));
 const incoming=parseBasePaste(baseText([baseRow('VENDA NOVA',{amounts:{0:'42,00',1:'-',2:''},target:'999,00'})]),config);
 const updated=mergeProduction(saved,combineImports([incoming],config));
 const vn=updated.rows.find(row=>row.source==='base'&&row.metric==='VN');
 assert.equal(vn.name,'Nome oficial');assert.equal(vn.annualTarget,2400);assert.deepEqual(vn.targets,Array(12).fill(200));
 assert.equal(vn.actuals[0],42);assert.equal(vn.actuals[1],0);assert.equal(vn.actuals[2],null);
 assert.deepEqual(updated.rows.find(row=>row.source==='cadence'),paBefore);
 assert.deepEqual(updated.rows.find(row=>row.metric==='AR'),arBefore);
});

test('base duplicate/invalid rows and explicit central aggregates block instead of doubling totals',()=>{
 assert.throws(()=>parseBasePaste(baseText([baseRow(),baseRow()]),config),/Registro duplicado/);
 assert.throws(()=>parseBasePaste(baseText([baseRow('NOVA MÉTRICA')]),config),/métrica não reconhecida/);
 assert.throws(()=>parseBasePaste(baseText([baseRow(),baseRow('VENDA NOVA',{cooperative:''})]),config),/cole as linhas das cooperativas/);
 assert.throws(()=>parseBasePaste(baseText([baseRow('VENDA NOVA',{cooperative:'TOTAL'})]),config),/cole as linhas das cooperativas/);
 assert.throws(()=>parseBasePaste(baseText([baseRow('VENDA NOVA',{amounts:{0:'(1.234,56'}})]),config),/valor de produção inválido/);
 assert.throws(()=>parseBasePaste(baseText([baseRow('VENDA NOVA',{amounts:{0:'(-1,00)'}})]),config),/valor de produção inválido/);
 const duplicate=[...baseHeaders];duplicate[11]='REAL_JAN';
 assert.throws(()=>parseBasePaste(baseText([baseRow()],duplicate),config),/mais de uma coluna de produção para JAN/);
 assert.throws(()=>parseProductionPaste(baseText(),config,'outro'),/Selecione Cooperativas/);
});

test('representative base Markdown imports 44 rows/22 cooperatives without its preheader totals',()=>{
 const rows=Array.from({length:22},(_,index)=>['VENDA NOVA','ARRECADAÇÃO'].map(metric=>baseRow(metric,{cooperative:String(3000+index),central:index<10?'1002':'2007'}))).flat();
 const parsed=parseBasePaste(markdown(rows),config);
 assert.equal(parsed.rows.length,44);assert.equal(new Set(parsed.rows.map(row=>`${row.central}:${row.cooperative}`)).size,22);
 assert.equal(parsed.rows.filter(row=>row.metric==='VN').length,22);assert.equal(parsed.rows.filter(row=>row.metric==='AR').length,22);
 const scoped=parseBasePaste(markdown(rows),{...config,allowedCentrals:['1002']});
 assert.equal(scoped.rows.length,20);assert.equal(scoped.skipped,24);
});


test('missing central IDs on business rows fail while unkeyed summaries remain ignorable',()=>{
 assert.throws(()=>parse(table([row({1:''})])),/código da central ausente/);
 assert.throws(()=>parseBasePaste(baseText([baseRow('VENDA NOVA',{central:''})]),config),/código da central ausente/);
 const footer=baseRow('VENDA NOVA',{central:'',cooperative:'',name:'TOTAL'});
 const parsed=parseBasePaste(baseText([baseRow(),footer]),config);
 assert.equal(parsed.rows.length,1);
});
