import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { assertSafeXlsx, readWorkbookFile, XLSX_FILE_LIMIT_BYTES, XLSX_FILE_LIMIT_MB } from '../lib/xlsx-safety.mjs';
import { sizedXlsx } from './helpers/sized-xlsx.mjs';
function zip({ lie=false, method=8, path='xl/workbook.xml', flags=0, declaredSize, localMismatch=false }={}) {
  const entries=['[Content_Types].xml',path]; let offset=0;
  const local=[],central=[];
  for(const [i,name] of entries.entries()) {
    const raw=Buffer.from(i===1&&lie?'x'.repeat(1000000):'<xml />'),content=method===0?raw:deflateRawSync(raw),n=Buffer.from(name);
    const size=i===1?(declaredSize??(lie?1:raw.length)):raw.length;
    const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(flags,6);l.writeUInt16LE(method,8);l.writeUInt32LE(content.length,18);l.writeUInt32LE(size+(localMismatch?1:0),22);l.writeUInt16LE(n.length,26);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(flags,8);c.writeUInt16LE(method,10);c.writeUInt32LE(content.length,20);c.writeUInt32LE(size,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
    local.push(l,n,content);central.push(c,n);offset+=l.length+n.length+content.length;
  }
  const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(2,8);end.writeUInt16LE(2,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,cd,end]);
}
test('XLSX ZIP: valid stored and deflated streams pass',async()=>{await assertSafeXlsx(zip());await assertSafeXlsx(zip({method:0}));});
test('XLSX ZIP: lying uncompressed sizes cannot bypass real streaming budget',async()=>{await assert.rejects(()=>assertSafeXlsx(zip({lie:true})),/limite/);});
test('XLSX ZIP: declared bombs, encryption, traversal, duplicates and mismatched headers are rejected',async()=>{
  for(const o of [{declaredSize:65*1024*1024},{flags:1},{path:'../outside.xml'},{path:'[Content_Types].xml'},{path:'xl/vbaProject.bin'},{localMismatch:true}])await assert.rejects(()=>assertSafeXlsx(zip(o)));
  await assert.rejects(()=>assertSafeXlsx(new Uint8Array(20)));
  await assert.rejects(()=>assertSafeXlsx(zip().subarray(0,30)));
});
test('XLSX accepts exactly 40 MiB through file reading and ZIP validation', async () => {
  assert.equal(XLSX_FILE_LIMIT_MB, 40);
  assert.equal(XLSX_FILE_LIMIT_BYTES, 40 * 1024 * 1024);
  const book = new ExcelJS.Workbook();
  book.addWorksheet('Dados').addRow(['Planilha de 40 MiB']);
  const buffer = await sizedXlsx(book, 40 * 1024 * 1024);
  let reads = 0;
  const result = await readWorkbookFile({
    name: 'limite.xlsx', size: buffer.byteLength,
    arrayBuffer: async () => { reads++; return buffer; },
  });
  assert.equal(reads, 1);
  assert.equal(result, buffer);
  await assertSafeXlsx(result);
});
test('XLSX rejects 40 MiB plus one byte before reading into memory', async () => {
  let read = false;
  await assert.rejects(() => readWorkbookFile({
    name: 'large.xlsx', size: 40 * 1024 * 1024 + 1,
    arrayBuffer: () => { read = true; },
  }), /40 MB/);
  assert.equal(read, false);
  await assert.rejects(() => assertSafeXlsx(new Uint8Array(40 * 1024 * 1024 + 1)), /40 MB/);
});
