import { MONTHS } from './analytics.mjs';
import { normalize, number, parseCellGrid } from './importer.mjs';

export const PRODUCTION_PASTE_LIMIT_MB = 5;
const BYTE_LIMIT = PRODUCTION_PASTE_LIMIT_MB * 1024 * 1024;
const ROW_LIMIT = 50000;
const COLUMN_LIMIT = 300;

// Excel copies quoted TSV when cells contain tabs, line breaks or quote marks.
function readTsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false, closedQuote = false;
  function pushCell() {
    row.push(cell);
    if (row.length > COLUMN_LIMIT) throw new Error('Os dados colados excedem o limite de 300 colunas.');
    cell = ''; closedQuote = false;
  }
  function pushRow() {
    pushCell(); rows.push(row); row = [];
    if (rows.length > ROW_LIMIT) throw new Error('Os dados colados excedem o limite de 50 mil linhas.');
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closedQuote = true; }
      } else cell += char;
    } else if (char === '\t') pushCell();
    else if (char === '\n' || char === '\r') {
      pushRow();
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else if (char === '"' && cell === '' && !closedQuote) quoted = true;
    else {
      if (closedQuote && char.trim()) throw new Error(`Aspas inválidas na linha ${rows.length + 1}. Cole a tabela novamente incluindo o cabeçalho.`);
      if (!closedQuote) cell += char;
    }
  }
  if (quoted) throw new Error('Há uma célula com aspas sem fechamento. Cole novamente o intervalo completo da planilha.');
  if (cell !== '' || row.length || closedQuote) pushRow();
  return rows;
}

/** Cadência clipboard input follows the exact same targets/identity contract as XLSX. */
export function parseCadencePaste(text, config) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Cole os dados da Cadência PA, incluindo o cabeçalho.');
  if (text.length > BYTE_LIMIT || new TextEncoder().encode(text).length > BYTE_LIMIT)
    throw new Error(`Os dados colados excedem o limite de ${PRODUCTION_PASTE_LIMIT_MB} MB.`);
  const grid = readTsv(text.replace(/^\uFEFF/, ''));
  const headerIndex = grid.findIndex((row, index) => index < 20 && row.map(normalize).includes('NCENTRAL') && row.map(normalize).includes('NCOOP'));
  if (headerIndex < 0) throw new Error('Cabeçalho não reconhecido. Copie a tabela com Nº CENTRAL, Nº COOP, Nº PA e os meses de produção.');
  const headers = grid[headerIndex].map(normalize);
  const required = ['GRUPO','NCENTRAL','NCOOP','NOMECOOP','NPA','NOMEDOPA'];
  for (const column of required) if (!headers.includes(column))
    throw new Error(`Coluna obrigatória da Cadência PA ausente: ${column}. Cole o cabeçalho junto com os dados.`);
  for (const column of required) if (headers.filter(value => value === column).length > 1)
    throw new Error(`Coluna repetida na Cadência PA: ${column}.`);
  const monthColumns = MONTHS.flatMap((name, month) => {
    const columns = headers.flatMap((header, index) => header === name || header === `REAL${name}` ? [index] : []);
    if (columns.length > 1) throw new Error(`Há mais de uma coluna de produção para ${name}. Mantenha apenas uma.`);
    return columns.length ? [{month,index:columns[0]}] : [];
  });
  if (!monthColumns.length) throw new Error('Nenhuma coluna mensal de produção foi encontrada. Inclua REAL JAN, REAL FEV ou os meses JAN a DEZ.');
  const centralIndex = headers.indexOf('NCENTRAL'), paNameIndex = headers.indexOf('NOMEDOPA');
  const allowed = Array.isArray(config.allowedCentrals) && config.allowedCentrals.length
    ? new Set(config.allowedCentrals.map(value => /^\d+$/.test(String(value).trim()) ? String(Number(value)) : String(value))) : null;
  let observed = 0, inputRowCount = 0;
  for (let index = headerIndex + 1; index < grid.length; index++) {
    const row = grid[index];
    if (row.every(value => !value.trim())) continue;
    const rawCentral = String(row[centralIndex] ?? '').trim();
    if (!/^\d+$/.test(rawCentral)) continue; // The shared parser validates identities and recognizes footers.
    inputRowCount++;
    if (allowed && !allowed.has(String(Number(rawCentral)))) continue;
    if (row.length > headers.length) throw new Error(`Linha ${index + 1}: há mais valores do que colunas no cabeçalho. Cole a tabela completa novamente.`);
    if (/^#(?:N\/?[AD]|N\/D|REF!|VALUE!|VALOR!|DIV\/0!|NAME\?|NOME\?)/i.test(String(row[paNameIndex] ?? '').trim())) row[paNameIndex] = '';
    for (const {month,index:column} of monthColumns) {
      const value = String(row[column] ?? '').trim();
      if (!value) { row[column] = null; continue; }
      if (/^[-–—]$/.test(value)) { row[column] = 0; observed++; continue; }
      const parsed = number(value);
      if (parsed == null || !Number.isFinite(parsed)) throw new Error(`Linha ${index + 1}, ${MONTHS[month]}: valor de produção inválido (${value.slice(0,40)}). Use um número, traço para zero ou deixe vazio para preservar.`);
      row[column] = parsed; observed++;
    }
  }
  const parsed = parseCellGrid(grid, 'Cadência PA · dados colados', config);
  if (!observed) throw new Error('Nenhum valor de produção foi informado. Cole os valores mensais; células vazias preservam a produção salva.');
  const lastMonth = Number(config.cadenceCutoff.slice(5,7)) - 1;
  if (!parsed.rows.some(row => row.actuals.some((value, month) => month <= lastMonth && value != null)))
    throw new Error('Nenhum valor de produção até a data de corte foi informado. Confira os meses copiados e o corte.');
  const ignoredActualCount = parsed.rows.reduce((count,row) => count + row.actuals.filter((value,month) => month > lastMonth && value != null).length,0);
  if (ignoredActualCount)
    parsed.issues.push({kind:'source',message:'Dados colados: valores de meses posteriores ao corte foram ignorados; atualize o corte para importar esses meses.'});
  // Pasted updates never persist future balances, including the first import.
  parsed.rows = parsed.rows.map(row => ({...row,actuals:row.actuals.map((value, month) => month <= lastMonth ? value : null)}));
  return {...parsed, months:monthColumns.map(column => column.month), inputRowCount, ignoredActualCount};
}
