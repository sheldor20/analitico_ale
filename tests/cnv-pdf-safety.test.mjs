import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCnvPdfFile,validateCnvPdfHeader,cnvTextFromItems,CNV_PDF_MAX_BYTES} from '../lib/cnv-pdf-safety.mjs';
test('CNV PDF validates actual header, type, empty files and exact size boundary before extraction',()=>{
  assert.doesNotThrow(()=>validateCnvPdfFile({name:'regulamento.PDF',type:'application/pdf',size:CNV_PDF_MAX_BYTES}));
  for(const file of [{name:'a.png',size:100},{name:'a.pdf',size:0},{name:'a.pdf',size:CNV_PDF_MAX_BYTES+1},{name:'a.pdf',type:'text/html',size:100}]) assert.throws(()=>validateCnvPdfFile(file));
  assert.doesNotThrow(()=>validateCnvPdfHeader(new TextEncoder().encode('%PDF-1.7\n')));
  assert.throws(()=>validateCnvPdfHeader(new TextEncoder().encode('<html>renamed PDF</html>')));
});
test('CNV text preserves page line breaks, accents and values without interpreting markup',()=>{
  assert.equal(cnvTextFromItems([{str:'Ação',hasEOL:false},{str:'R$ 100,00',hasEOL:true},{str:'<script>',hasEOL:false},{type:'other'}]),'Ação R$ 100,00\n<script>');
});
