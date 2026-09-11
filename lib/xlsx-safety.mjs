const COMPRESSED_LIMIT = 10 * 1024 * 1024;
const EXPANDED_LIMIT = 64 * 1024 * 1024;
const invalid = () => new Error('Estrutura XLSX inválida, corrompida ou não suportada.');
const limit = () => new Error('Planilha excede o limite de leitura (64 MB descompactados).');
export async function readWorkbookFile(file) {
  if (!file || !/\.xlsx$/i.test(file.name)) throw new Error('Selecione um arquivo .xlsx.');
  if (file.size > COMPRESSED_LIMIT) throw new Error('Cada arquivo pode ter até 10 MB.');
  return file.arrayBuffer();
}
// ZIP metadata is untrusted. Bound ACTUAL streamed expansion before ExcelJS parses XML.
export async function assertSafeXlsx(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.byteLength > COMPRESSED_LIMIT) throw new Error('Cada arquivo pode ter até 10 MB.');
  if (bytes.byteLength < 22) throw invalid();
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50 && i + 22 + v.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  }
  if (end < 0) throw invalid();
  const count = v.getUint16(end + 10, true), directorySize = v.getUint32(end + 12, true), directory = v.getUint32(end + 16, true);
  if (!count || count > 2000 || v.getUint16(end + 4, true) || v.getUint16(end + 6, true) || v.getUint16(end + 8, true) !== count || directory + directorySize !== end) throw invalid();
  const entries = [], names = new Set();
  let at = directory, declared = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || v.getUint32(at, true) !== 0x02014b50) throw invalid();
    const flags = v.getUint16(at + 8, true), method = v.getUint16(at + 10, true), compressed = v.getUint32(at + 20, true), expanded = v.getUint32(at + 24, true);
    const nameLength = v.getUint16(at + 28, true), extra = v.getUint16(at + 30, true), comment = v.getUint16(at + 32, true), local = v.getUint32(at + 42, true);
    const next = at + 46 + nameLength + extra + comment;
    if (next > end || !nameLength || flags & 0x41 || ![0, 8].includes(method) || v.getUint16(at + 34, true) !== 0) throw invalid();
    const nameBytes = bytes.subarray(at + 46, at + 46 + nameLength), name = new TextDecoder().decode(nameBytes);
    if (/[\x00-\x1f\\:]/.test(name) || name.startsWith('/') || name.split('/').includes('..') || names.has(name) || /vbaProject\.bin$/i.test(name)) throw invalid();
    names.add(name); declared += expanded;
    if (declared > EXPANDED_LIMIT) throw limit();
    if (local + 30 > directory || v.getUint32(local, true) !== 0x04034b50 || v.getUint16(local + 6, true) !== flags || v.getUint16(local + 8, true) !== method) throw invalid();
    const localName = v.getUint16(local + 26, true), localExtra = v.getUint16(local + 28, true), dataStart = local + 30 + localName + localExtra;
    if (localName !== nameLength || dataStart + compressed > directory || !nameBytes.every((b, j) => bytes[local + 30 + j] === b)) throw invalid();
    if (!(flags & 8) && (v.getUint32(local + 18, true) !== compressed || v.getUint32(local + 22, true) !== expanded)) throw invalid();
    entries.push({ local, dataStart, compressed, expanded, method }); at = next;
  }
  if (at !== end || !names.has('[Content_Types].xml') || !names.has('xl/workbook.xml')) throw invalid();
  const sorted = entries.slice().sort((a, b) => a.local - b.local);
  for (let i = 1; i < sorted.length; i++) if (sorted[i - 1].dataStart + sorted[i - 1].compressed > sorted[i].local) throw invalid();
  let actualTotal = 0;
  for (const entry of entries) {
    if (entry.method === 0) {
      if (entry.compressed !== entry.expanded) throw invalid();
      actualTotal += entry.expanded; continue;
    }
    if (typeof DecompressionStream === 'undefined') throw new Error('Atualize seu navegador para importar planilhas com verificação de segurança.');
    let reader;
    try {
      reader = new Blob([bytes.subarray(entry.dataStart, entry.dataStart + entry.compressed)]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      let actual = 0;
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        actual += value.byteLength; actualTotal += value.byteLength;
        if (actual > entry.expanded || actualTotal > EXPANDED_LIMIT) { await reader.cancel(); throw limit(); }
      }
      if (actual !== entry.expanded) throw invalid();
    } finally { reader?.releaseLock(); }
  }
}
