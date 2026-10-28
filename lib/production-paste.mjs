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

function decodeMarkdownCell(value) {
  return value.replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (all, code) => {
      const value = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1),16) : Number(code);
      return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : all;
    })
    .replace(/&(nbsp|amp|lt|gt|quot|apos);/gi, (all, name) => ({nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[name.toLowerCase()])
    .replace(/\u00a0/g,' ').trim();
}
function readMarkdown(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const input = line.trim();
    if (!input.startsWith('|')) continue;
    const cells = [];
    let cell = '';
    for (let index = 1; index < input.length; index++) {
      const char = input[index];
      if (char === '\\' && input[index + 1] === '|') { cell += '|'; index++; }
      else if (char === '|') { cells.push(decodeMarkdownCell(cell)); cell = ''; }
      else cell += char;
    }
    if (cell || !input.endsWith('|')) cells.push(decodeMarkdownCell(cell));
    if (cells.length > COLUMN_LIMIT) throw new Error('Os dados colados excedem o limite de 300 colunas.');
    if (cells.length && cells.every(value => /^:?-+:?$/.test(value))) continue;
    rows.push(cells);
    if (rows.length > ROW_LIMIT) throw new Error('Os dados colados excedem o limite de 50 mil linhas.');
  }
  return rows;
}

/** Both clipboard sources share the official XLSX identity/targets contract. */
export function parseProductionPaste(text, config, source) {
  if (!['base','cadence'].includes(source)) throw new Error('Selecione Cooperativas / Centrais ou Cadência PA para os dados colados.');
  const cadence = source === 'cadence';
  const label = cadence ? 'Cadência PA' : 'Cooperativas / Centrais';
  if (typeof text !== 'string' || !text.trim()) throw new Error(`Cole os dados de ${label}, incluindo o cabeçalho.`);
  if (text.length > BYTE_LIMIT || new TextEncoder().encode(text).length > BYTE_LIMIT)
    throw new Error(`Os dados colados excedem o limite de ${PRODUCTION_PASTE_LIMIT_MB} MB.`);
  const input = text.replace(/^\uFEFF/, '');
  const grid = !input.includes('\t') && input.split(/\r?\n/).some(line => line.trim().startsWith('|')) ? readMarkdown(input) : readTsv(input);
  const headerIndex = grid.findIndex((row, index) => index < 20 && row.map(normalize).includes('NCENTRAL') && row.map(normalize).includes('NCOOP'));
  if (headerIndex < 0) throw new Error(`Cabeçalho não reconhecido. Copie a tabela com Nº CENTRAL, Nº COOP${cadence ? ', Nº PA' : ''} e os meses de produção.`);
  // SIGLA CENTRAL is the existing base's display-name column, not a business ID.
  const headers = grid[headerIndex].map(value => normalize(value) === 'SIGLACENTRAL' ? 'CENTRAL' : normalize(value));
  grid[headerIndex] = headers;
  const required = cadence ? ['GRUPO','NCENTRAL','NCOOP','NOMECOOP','NPA','NOMEDOPA'] : ['NCENTRAL','NCOOP','SIGLACOOPERATIVA','GCOOP','META','METAANUAL'];
  for (const column of required) if (!headers.includes(column))
    throw new Error(`Coluna obrigatória de ${label} ausente: ${column}. Cole o cabeçalho junto com os dados.`);
  // Repeated bare META columns are quarterly totals. The first META is VN/AR.
  for (const column of required.filter(value => value !== 'META')) if (headers.filter(value => value === column).length > 1)
    throw new Error(`Coluna repetida em ${label}: ${column}.`);
  const monthColumns = MONTHS.flatMap((name, month) => {
    const columns = headers.flatMap((header, index) => header === `REAL${name}` || cadence && header === name ? [index] : []);
    if (columns.length > 1) throw new Error(`Há mais de uma coluna de produção para ${name}. Mantenha apenas uma.`);
    return columns.length ? [{month,index:columns[0]}] : [];
  });
  if (!monthColumns.length) throw new Error('Nenhuma coluna mensal de produção foi encontrada. Inclua REAL JAN, REAL FEV ou os meses JAN a DEZ.');
  const centralIndex = headers.indexOf('NCENTRAL'), cooperativeIndex = headers.indexOf('NCOOP'), paNameIndex = headers.indexOf('NOMEDOPA');
  const allowed = Array.isArray(config.allowedCentrals) && config.allowedCentrals.length
    ? new Set(config.allowedCentrals.map(value => /^\d+$/.test(String(value).trim()) ? String(Number(value)) : String(value))) : null;
  let observed = 0, inputRowCount = 0;
  for (let index = headerIndex + 1; index < grid.length; index++) {
    const row = grid[index];
    if (row.every(value => !String(value).trim())) { grid[index] = []; continue; }
    const rawCentral = String(row[centralIndex] ?? '').trim();
    if (!rawCentral && /^\d+$/.test(String(row[cooperativeIndex] ?? '').trim()))
      throw new Error(`Linha ${index + 1}: código da central ausente para a cooperativa informada. Cole a tabela completa com Nº CENTRAL.`);
    if (!/^\d+$/.test(rawCentral)) continue; // The shared parser validates identities and recognizes footers.
    inputRowCount++;
    if (allowed && !allowed.has(String(Number(rawCentral)))) continue;
    if (!cadence && !/^\d+$/.test(String(row[cooperativeIndex] ?? '').trim()))
      throw new Error(`Linha ${index + 1}: informe o código da cooperativa. Para atualizar uma central, cole as linhas das cooperativas; o consolidado é recalculado sem somar totais duplicados.`);
    if (row.length > headers.length) throw new Error(`Linha ${index + 1}: há mais valores do que colunas no cabeçalho. Cole a tabela completa novamente.`);
    if (cadence && /^#(?:N\/?[AD]|N\/D|REF!|VALUE!|VALOR!|DIV\/0!|NAME\?|NOME\?)/i.test(String(row[paNameIndex] ?? '').trim())) row[paNameIndex] = '';
    for (const {month,index:column} of monthColumns) {
      const value = String(row[column] ?? '').trim();
      if (!value) { row[column] = null; continue; }
      if (/^[-–—]$/.test(value)) { row[column] = 0; observed++; continue; }
      const accounting = /^\(([^()]+)\)$/.exec(value);
      const numeric = number(accounting ? accounting[1] : value);
      const parsed = accounting ? numeric != null && numeric >= 0 ? -numeric : null : numeric;
      if (parsed == null || !Number.isFinite(parsed)) throw new Error(`Linha ${index + 1}, ${MONTHS[month]}: valor de produção inválido (${value.slice(0,40)}). Use um número, traço para zero ou deixe vazio para preservar.`);
      row[column] = parsed; observed++;
    }
  }
  const parsed = parseCellGrid(grid, `${label} · dados colados`, config);
  if (parsed.source !== source) throw new Error(`Os dados colados não correspondem ao layout de ${label}. Confira a fonte selecionada.`);
  if (!observed) throw new Error('Nenhum valor de produção foi informado. Cole os valores mensais; células vazias preservam a produção salva.');
  const lastMonth = row => Number(row.cutoff.slice(5,7)) - 1;
  if (!parsed.rows.some(row => row.actuals.some((value, month) => month <= lastMonth(row) && value != null)))
    throw new Error('Nenhum valor de produção até a data de corte foi informado. Confira os meses copiados e o corte.');
  const ignoredActualCount = parsed.rows.reduce((count,row) => count + row.actuals.filter((value,month) => month > lastMonth(row) && value != null).length,0);
  if (ignoredActualCount)
    parsed.issues.push({kind:'source',message:'Dados colados: valores de meses posteriores ao corte foram ignorados; atualize o corte para importar esses meses.'});
  // Pasted updates never persist future balances, including the first import.
  parsed.rows = parsed.rows.map(row => ({...row,actuals:row.actuals.map((value, month) => month <= lastMonth(row) ? value : null)}));
  return {...parsed, months:monthColumns.map(column => column.month), inputRowCount, ignoredActualCount};
}
export function parseCadencePaste(text, config) { return parseProductionPaste(text, config, 'cadence'); }
export function parseBasePaste(text, config) { return parseProductionPaste(text, config, 'base'); }
