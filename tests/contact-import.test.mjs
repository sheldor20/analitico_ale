import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildContactImportPreview, readContactWorkbook, normalizeImportedPhone, CONTACT_IMPORT_LIMIT } from '../lib/contact-import.mjs';

const entities = [
  { id:'central:1002',kind:'central',central:'1002',name:'Sicoob Central Bahia' },
  { id:'central:2007',kind:'central',central:'2007',name:'Sicoob Central Nordeste' },
  { id:'cooperative:1002:3017',kind:'cooperative',central:'1002',cooperative:'3017',name:'Cooperativa Alfa' },
  { id:'cooperative:2007:3017',kind:'cooperative',central:'2007',cooperative:'3017',name:'Cooperativa Alfa Nordeste' },
  { id:'cooperative:2007:3357',kind:'cooperative',central:'2007',cooperative:'3357',name:'Cooperativa Exemplo' },
];
const source = changes => ({key:'1:3',sheet:'BASE',row:3,central:'1002',cooperativeCode:'3017',cooperativeName:'Alfa',name:'Pessoa Exemplo',nameMissing:false,emailsText:'pessoa@example.test',whatsapp:'',jobTitle:'',teams:'',issues:[],...changes});
const contact = changes => ({ id:'contact-1',ownerId:'owner',workspaceYear:2026,entityId:'cooperative:1002:3017',entityKind:'cooperative',central:'1002',cooperative:'3017',pa:null,name:'Pessoa Exemplo',jobTitle:'Gerente',teams:'equipe-exemplo',whatsapp:'+5571999990001',emails:['anterior@example.test'],createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-02T00:00:00Z',...changes });
const preview = (rows, contacts=[]) => buildContactImportPreview({rows,entities,contacts});
async function workbook(sheets) {
  const book=new ExcelJS.Workbook();
  for(const {name,rows} of sheets){const sheet=book.addWorksheet(name); for(const values of rows)sheet.addRow(values);}
  return book.xlsx.writeBuffer();
}

test('recognizes supplied BASE layout with row-2 header, optional responsible name and financial columns ignored', async () => {
  const parsed=await readContactWorkbook(await workbook([{name:'BASE',rows:[
    ['Contatos regionais'],
    ['Central','Nº','SINGULAR ','QT P.A','KAP 1º TRI','META POR PA','META POR DIA X PA','E-MAIL','TELEFONE'],
    ['CENTRAL NORDESTE',3357,'Cooperativa Exemplo',3,{formula:'10+20'},10,2,'  PESSOA@EXAMPLE.TEST  ','(71) 99999-0001'],
    ['CENTRAL NORDESTE',3017,'Outra cooperativa',4,20,5,1,'outra@example.test','(71) 99999-0002 (71) 99999-0003'],
    [], ['Total',null,null,7,30],
  ]}]));
  assert.equal(parsed.rows.length,2); assert.equal(parsed.sheets[0].headerRow,2); assert.equal(parsed.sheets[0].hasResponsibleName,false);
  assert.ok(parsed.rows.every(row=>row.name==='Contato comercial'&&row.nameMissing));
  const result=preview(parsed.rows);
  assert.equal(result[0].status,'create'); assert.equal(result[0].entity.id,'cooperative:2007:3357');
  assert.deepEqual(result[0].input.emails,['pessoa@example.test']); assert.equal(result[0].input.whatsapp,'+5571999990001');
  assert.equal(result[1].status,'invalid'); assert.match(result[1].message,/dois números|apenas um/);
  assert.match(result[1].source.whatsapp,/0002.*0003/);
});

test('supports reordered headers, multiple worksheets, separate responsible rows, rich text and mail links', async () => {
  const parsed=await readContactWorkbook(await workbook([
    {name:'Instruções',rows:[['Não é uma lista de contatos']]},
    {name:'Contatos',rows:[
      ['E-mail','Código da cooperativa','Nome do responsável','Central','Celular','Cargo','Teams'],
      [{text:'Enviar e-mail',hyperlink:'mailto:um@example.test'},3017,{richText:[{text:'Pessoa '},{text:'Um'}]},1002,'71999990001','Atendimento','equipe'],
      ['dois@example.test; APOIO@example.test',3017,'Pessoa Dois',1002,'71999990002'],
      ['E-mail','Código da cooperativa','Nome do responsável','Central','Celular','Cargo','Teams'],
    ]},
    {name:'Nordeste',rows:[['Nº','Central','Nome','Email'],[3357,2007,'Pessoa Três','tres@example.test']]},
  ]));
  assert.equal(parsed.rows.length,3); assert.equal(parsed.sheets.length,2); assert.equal(parsed.warnings.length,1);
  const rows=preview(parsed.rows); assert.ok(rows.every(row=>row.status==='create'));
  assert.equal(rows[0].input.name,'Pessoa Um'); assert.deepEqual(rows[1].input.emails,['dois@example.test','apoio@example.test']);
  assert.equal(rows[0].input.jobTitle,'Atendimento'); assert.equal(rows[0].input.teams,'equipe');
});

test('resolves composite codes against existing units only, refusing unknown or ambiguous hierarchy', () => {
  assert.equal(preview([source({central:'CENTRAL BAHIA',cooperativeCode:'003017'})])[0].entity.id,'cooperative:1002:3017');
  assert.equal(preview([source({central:'',cooperativeCode:'3357'})])[0].entity.id,'cooperative:2007:3357');
  for(const [change,pattern] of [
    [{central:''},/mais de uma central/],
    [{central:'Central desconhecida'},/Central não encontrada/],
    [{central:'1002',cooperativeCode:'3357'},/Cooperativa não encontrada/],
    [{cooperativeCode:'Cooperativa Alfa'},/código numérico/],
    [{cooperativeCode:'9999'},/Cooperativa não encontrada/],
  ]) { const item=preview([source(change)])[0]; assert.equal(item.status,'invalid'); assert.match(item.message,pattern); }
  assert.equal(entities.length,5);
});

test('merges additions with a named existing contact while preserving blank fields and exact optimistic token', () => {
  const saved=contact(), rows=[source({name:'  pessoa   exemplo ',emailsText:'NOVO@example.test;anterior@example.test'})], before=structuredClone({saved,rows,entities});
  const item=preview(rows,[saved])[0];
  assert.equal(item.status,'update'); assert.equal(item.contactId,saved.id); assert.equal(item.expectedUpdatedAt,saved.updatedAt);
  assert.deepEqual(item.input.emails,['anterior@example.test','novo@example.test']);
  assert.equal(item.input.jobTitle,'Gerente'); assert.equal(item.input.teams,'equipe-exemplo'); assert.equal(item.input.whatsapp,saved.whatsapp);
  assert.deepEqual({saved,rows,entities},before);
  const same=preview([source({emailsText:'anterior@example.test',whatsapp:'(71) 99999-0001'})],[saved])[0];
  assert.equal(same.status,'unchanged');
});

test('ten existing emails can be reimported without duplicates but an eleventh is blocked', () => {
  const emails=Array.from({length:10},(_,i)=>`p${i}@example.test`), saved=contact({emails});
  assert.equal(preview([source({emailsText:'P0@example.test'})],[saved])[0].status,'unchanged');
  const overflow=preview([source({emailsText:'novo@example.test'})],[saved])[0];
  assert.equal(overflow.status,'invalid'); assert.match(overflow.message,/10 e-mails/);
});

test('channels never silently identify a different person and repeated existing names require review', () => {
  const saved=contact();
  const conflict=preview([source({name:'Contato comercial',nameMissing:true,emailsText:'anterior@example.test'})],[saved])[0];
  assert.equal(conflict.status,'invalid'); assert.match(conflict.message,/outro responsável.*Pessoa Exemplo/);
  assert.equal(preview([source({name:'Pessoa Exemplo',emailsText:'anterior@example.test'})],[saved])[0].status,'unchanged');
  const duplicate=preview([source()],[saved,contact({id:'contact-2'})])[0];
  assert.equal(duplicate.status,'invalid'); assert.match(duplicate.message,/mais de um contato/);
  const otherUnit=preview([source({central:'2007',emailsText:'anterior@example.test'})],[saved])[0];
  assert.equal(otherUnit.status,'create');
});

test('exact file duplicates are ignored while conflicting identities or shared channels need correction', () => {
  const same=preview([source(),source({key:'1:4',row:4})]);
  assert.deepEqual(same.map(row=>row.status),['create','duplicate']);
  const conflict=preview([source(),source({key:'1:4',row:4,emailsText:'diferente@example.test'})]);
  assert.ok(conflict.every(row=>row.status==='invalid'));
  const channel=preview([source(),source({key:'1:4',row:4,name:'Outra Pessoa'})]);
  assert.ok(channel.every(row=>row.status==='invalid'));
  const different=preview([source(),source({key:'1:4',row:4,name:'Outra Pessoa',emailsText:'outra@example.test'})]);
  assert.ok(different.every(row=>row.status==='create'));
});

test('validates channels, blank contact data and formulas without a cached value without evaluating anything', async () => {
  assert.equal(normalizeImportedPhone('(71) 3333-0001'),'+557133330001');
  assert.equal(normalizeImportedPhone('+1 202 555 0123'),'+12025550123');
  assert.equal(normalizeImportedPhone(''),'');
  for(const value of ['123','(71) 99999-0001 / (71) 99999-0002','ligar para 71999990001']) assert.throws(()=>normalizeImportedPhone(value));
  for(const change of [{emailsText:'inválido'},{name:''},{emailsText:'',whatsapp:''}]) assert.equal(preview([source(change)])[0].status,'invalid');
  const parsed=await readContactWorkbook(await workbook([{name:'Contatos',rows:[
    ['Central','Nº','Nome','Email'],
    [1002,3017,'Pessoa Teste',{formula:'CONCAT("a","@example.test")'}],
  ]}]));
  assert.equal(preview(parsed.rows)[0].status,'invalid'); assert.match(preview(parsed.rows)[0].message,/Fórmula sem resultado/);
});

test('refuses unsupported workbooks, repeated contact columns, empty sheets and oversized contact batches', async () => {
  await assert.rejects(()=>readContactWorkbook(new Uint8Array([1,2,3])),/XLSX/);
  await assert.rejects(async()=>readContactWorkbook(await workbook([{name:'Base',rows:[['Nome','Valor'],['Exemplo',1]]}])) ,/colunas de contatos/);
  await assert.rejects(async()=>readContactWorkbook(await workbook([{name:'Base',rows:[['Nº','Email','E-mail'],[3017,'um@example.test','dois@example.test']]}])),/colunas.*repetidas/);
  await assert.rejects(async()=>readContactWorkbook(await workbook([{name:'Base',rows:[['Nº','Email']]}])),/não contém contatos/);
  await assert.rejects(async()=>readContactWorkbook(await workbook([{name:'Base',rows:[['Nº','Email'],...Array.from({length:CONTACT_IMPORT_LIMIT+1},()=>[3017,'um@example.test'])]}])),/1?000 contatos|1000 contatos/);
});
