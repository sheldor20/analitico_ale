import { normalizeContactEmails } from './contact-utils.mjs';
import { whatsappNumber } from './portfolio-communication.mjs';
import { assertSafeXlsx } from './xlsx-safety.mjs';

export const CONTACT_IMPORT_LIMIT = 1000;
const text = value => String(value ?? '').trim();
const normalized = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const personKey = value => text(value).replace(/\s+/g, ' ').toLowerCase();
const centralKey = value => normalized(value).replace(/^sicoob/, '');
const codeKey = value => /^\d+$/.test(text(value)) ? text(value).replace(/^0+(?=\d)/, '') : null;
const aliases = {
  central: ['central', 'codigocentral', 'codigodacentral', 'codcentral'],
  cooperativeCode: ['n', 'no', 'numero', 'cooperativa', 'codigocooperativa', 'codigodacooperativa', 'codcoop', 'codcooperativa', 'codigosingular'],
  cooperativeName: ['singular', 'nomecooperativa', 'nomedacooperativa', 'nomesingular'],
  name: ['nome', 'responsavel', 'nomeresponsavel', 'nomedoresponsavel', 'contato', 'nomecontato', 'nomedocontato'],
  emailsText: ['email', 'emails', 'emailresponsavel', 'emaildoresponsavel'],
  whatsapp: ['telefone', 'celular', 'whatsapp', 'fone', 'tel', 'telefoneresponsavel', 'telefonedoresponsavel'],
  jobTitle: ['cargo', 'funcao'], teams: ['teams'],
};

function cellText(cell) {
  const value = cell.value;
  if (value == null) return '';
  if (typeof value !== 'object') return text(value);
  if ('formula' in value || 'sharedFormula' in value) {
    if (value.result == null || typeof value.result === 'object') throw new Error('Fórmula sem resultado salvo. Abra e salve a planilha no Excel antes de importar.');
    return text(value.result);
  }
  if (value.richText) return value.richText.map(part => part.text).join('').trim();
  if (value.hyperlink && /^(mailto:|tel:)/i.test(value.hyperlink)) return decodeURIComponent(value.hyperlink.replace(/^(mailto:|tel:)/i, '').split('?')[0]);
  if (value.text != null) return text(value.text);
  throw new Error('Célula com valor não reconhecido. Confira o conteúdo na planilha.');
}

function headerMap(row) {
  const fields = {}, repeated = [];
  row.eachCell((cell, column) => {
    let label; try { label = normalized(cellText(cell)); } catch { return; }
    const field = Object.keys(aliases).find(key => aliases[key].includes(label));
    if (!field) return;
    if (fields[field]) repeated.push(field);
    else fields[field] = column;
  });
  return fields.cooperativeCode && (fields.emailsText || fields.whatsapp) ? { fields, repeated } : null;
}

/** Read only: no workbook data, contacts or source files are persisted here. */
export async function readContactWorkbook(buffer) {
  await assertSafeXlsx(buffer);
  const imported = await import('exceljs'), ExcelJS = imported.default ?? imported;
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); }
  catch { throw new Error('Não foi possível ler a planilha. Confira se o arquivo está íntegro e sem senha.'); }
  const rows = [], sheets = [], warnings = [];
  for (const sheet of workbook.worksheets) {
    if (sheet.rowCount > 10000 || sheet.columnCount > 100) throw new Error('A planilha de contatos pode ter até 10.000 linhas e 100 colunas por aba.');
    let header = null, headerRow = 0;
    for (let index = 1; index <= Math.min(30, sheet.rowCount); index++) {
      header = headerMap(sheet.getRow(index));
      if (header) { headerRow = index; break; }
    }
    if (!header) { warnings.push(`Aba ${sheet.name}: nenhum cabeçalho de contatos reconhecido.`); continue; }
    if (header.repeated.length) throw new Error(`Aba ${sheet.name}: colunas de contatos repetidas. Use uma linha por responsável.`);
    const start = rows.length;
    for (let index = headerRow + 1; index <= sheet.rowCount; index++) {
      const source = sheet.getRow(index);
      if (headerMap(source)) continue;
      const values = {}, issues = [];
      for (const [field, column] of Object.entries(header.fields)) {
        try { values[field] = cellText(source.getCell(column)); }
        catch (reason) { values[field] = ''; issues.push(reason.message); }
      }
      // Ignore totals, footers and rows containing only business metrics.
      if (!values.emailsText && !values.whatsapp && !values.name && !issues.length) continue;
      rows.push({ key: `${sheet.id}:${index}`, sheet: sheet.name, row: index, central: '', cooperativeCode: '', cooperativeName: '', jobTitle: '', teams: '', emailsText: '', whatsapp: '', ...values, name: values.name || 'Contato comercial', nameMissing: !values.name, issues });
      if (rows.length > CONTACT_IMPORT_LIMIT) throw new Error(`Importe até ${CONTACT_IMPORT_LIMIT} contatos por vez.`);
    }
    sheets.push({ name: sheet.name, headerRow, count: rows.length - start, hasResponsibleName: Boolean(header.fields.name) });
  }
  if (!sheets.length) throw new Error('Não encontramos as colunas de contatos. Use Código da cooperativa (ou Nº), E-mail e/ou Telefone; Central e Nome do responsável são opcionais.');
  if (!rows.length) throw new Error('A planilha não contém contatos para importar.');
  return { rows, sheets, warnings };
}

function resolveEntity(row, entities) {
  const code = codeKey(row.cooperativeCode);
  if (!code) throw new Error('Informe um código numérico de cooperativa na planilha.');
  let matches = entities.filter(entity => entity.kind === 'cooperative' && codeKey(entity.cooperative) === code);
  if (row.central) {
    const centralCode = codeKey(row.central);
    const centrals = entities.filter(entity => entity.kind === 'central' && (centralCode ? codeKey(entity.central) === centralCode : centralKey(entity.name) === centralKey(row.central)));
    if (centrals.length !== 1) throw new Error(centrals.length ? 'Nome de central ambíguo. Informe o código da central.' : 'Central não encontrada no cadastro. Confira o nome ou o código.');
    matches = matches.filter(entity => entity.central === centrals[0].central);
  }
  if (matches.length !== 1) throw new Error(matches.length ? 'Código de cooperativa presente em mais de uma central. Informe a central.' : 'Cooperativa não encontrada no cadastro. Cadastre a unidade antes de importar.');
  return matches[0];
}

export function normalizeImportedPhone(value) {
  const raw = text(value);
  if (!raw) return '';
  if (/[^\d\s()+.\-]/.test(raw)) throw new Error('Informe apenas um celular ou telefone com DDD.');
  try { return `+${whatsappNumber(raw)}`; }
  catch { throw new Error('Confira o telefone: informe apenas um número com DDD. Se há dois números, escolha um.'); }
}
function safePhone(value) { try { return normalizeImportedPhone(value); } catch { return ''; } }
function inputFor(row, existing) {
  const name = text(row.name).replace(/\s+/g, ' ');
  if (!name || name.length > 160) throw new Error('Informe um nome ou rótulo de contato com até 160 caracteres.');
  const emails = normalizeContactEmails(text(row.emailsText).split(/[;,\s]+/).filter(Boolean));
  const whatsapp = normalizeImportedPhone(row.whatsapp);
  const jobTitle = text(row.jobTitle), teams = text(row.teams);
  if (jobTitle.length > 160 || teams.length > 300) throw new Error('Cargo deve ter até 160 caracteres e Teams até 300.');
  return { name, jobTitle: jobTitle || existing?.jobTitle || '', teams: teams || existing?.teams || '', whatsapp: whatsapp || existing?.whatsapp || '', emails: normalizeContactEmails([...new Set([...(existing?.emails || []), ...emails].map(email => text(email).toLowerCase()))]) };
}
const signature = input => JSON.stringify([personKey(input.name), input.jobTitle, input.teams, safePhone(input.whatsapp) || input.whatsapp, [...input.emails].sort()]);

/** Preview and merge against contacts belonging to this workspace only. */
export function buildContactImportPreview({ rows, entities, contacts }) {
  const output = rows.map(row => {
    const item = { key: row.key, source: row, entity: null, input: null, contactId: undefined, expectedUpdatedAt: undefined, status: 'invalid', message: '', issues: [] };
    try {
      if (row.issues?.length) throw new Error(row.issues.join(' '));
      const entity = resolveEntity(row, entities); item.entity = entity;
      const input = inputFor(row), existing = contacts.filter(contact => contact.entityId === entity.id);
      const matches = existing.filter(contact => personKey(contact.name) === personKey(input.name));
      if (matches.length > 1) throw new Error('Há mais de um contato cadastrado com este nome. Revise as duplicatas no cadastro.');
      const channels = existing.filter(contact => input.emails.some(email => contact.emails.some(saved => saved.toLowerCase() === email)) || input.whatsapp && safePhone(contact.whatsapp) === input.whatsapp);
      if (channels.some(contact => contact.id !== matches[0]?.id)) throw new Error(`E-mail ou telefone já associado a outro responsável: ${[...new Set(channels.map(contact => contact.name))].join(', ')}. Confira e ajuste o nome antes de importar.`);
      const saved = matches[0], merged = inputFor(row, saved);
      if (!merged.emails.length && !merged.whatsapp) throw new Error('Informe pelo menos um e-mail ou telefone para o contato.');
      item.input = merged; item.contactId = saved?.id; item.expectedUpdatedAt = saved?.updatedAt;
      item.status = saved ? signature(merged) === signature(saved) ? 'unchanged' : 'update' : 'create';
      item.message = { create: 'Novo contato', update: 'Atualizar contato; campos em branco preservados', unchanged: 'Já cadastrado; sem alterações' }[item.status];
    } catch (reason) { item.message = reason.message; item.issues = [reason.message]; }
    return item;
  });
  const identities = new Map();
  for (const item of output.filter(item => item.input)) {
    const key = `${item.entity.id}:${personKey(item.input.name)}`;
    const previous = identities.get(key);
    if (!previous) { identities.set(key, item); continue; }
    if (signature(item.input) === signature(previous.input)) { item.status = 'duplicate'; item.message = 'Linha repetida na planilha; será ignorada.'; }
    else {
      for (const conflict of [previous, item]) { conflict.status = 'invalid'; conflict.message = 'Mesmo responsável repetido com dados diferentes. Mantenha uma linha completa por responsável.'; conflict.issues = [conflict.message]; }
    }
  }
  const channels = new Map();
  for (const item of output.filter(item => item.input && item.status !== 'duplicate')) {
    const keys = [...item.input.emails.map(email => `email:${email}`), ...(item.input.whatsapp ? [`phone:${safePhone(item.input.whatsapp) || item.input.whatsapp}`] : [])];
    for (const channel of keys) {
      const key = `${item.entity.id}:${channel}`, previous = channels.get(key);
      if (previous && personKey(previous.input.name) !== personKey(item.input.name)) {
        for (const conflict of [previous, item]) { conflict.status = 'invalid'; conflict.message = 'E-mail ou telefone repetido para nomes diferentes nesta cooperativa. Revise as linhas antes de importar.'; conflict.issues = [conflict.message]; }
      } else if (!previous) channels.set(key, item);
    }
  }
  return output;
}
