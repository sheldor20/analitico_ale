import { day, money } from './analytics.mjs';
import { normalize, number } from './importer.mjs';
import { cents } from './money.mjs';
import { readClipboardGrid } from './production-paste.mjs';

export const PROPOSAL_LABELS = Object.freeze({
  cancelled: 'Canceladas',
  inReview: 'Em análise',
  pending: 'Pendentes',
  rejected: 'Recusadas',
  accepted: 'Aceitas',
});
export const PROPOSAL_STATUSES = Object.keys(PROPOSAL_LABELS);
export const FORECAST_STATUSES = PROPOSAL_STATUSES.filter(status => status !== 'accepted');
const HEADER_ALIASES = {
  cooperative: ['COOPERATIVA', 'NCOOP', 'NCOOPERATIVA', 'COOP', 'CODCOOPERATIVA', 'CODIGOCOOPERATIVA'],
  accepted: ['ACEITA', 'ACEITAS'],
  cancelled: ['CANCELADA', 'CANCELADAS', 'CANCELADO', 'CANCELADOS'],
  inReview: ['EMANALISE'],
  pending: ['PENDENTE', 'PENDENTES'],
  rejected: ['RECUSADA', 'RECUSADAS', 'RECUSADO', 'RECUSADOS'],
};
const DAY_MS = 86400000;
const MAX_AMOUNT = 9999999999;
const MAX_COOPERATIVES = 1000;

const clean = value => String(value ?? '').trim().replace(/^\*\*(.*?)\*\*$/s, '$1').trim();
const emptyAmounts = () => Object.fromEntries(PROPOSAL_STATUSES.map(status => [status, 0]));

function readAmount(value, line, status, maxAmount) {
  const raw = clean(value).replace(/R\$|\s/gi, '');
  if (!raw || /^[-–—]$/.test(raw)) return 0;
  const grouped = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(raw);
  const valid = grouped || /^\d+(?:[.,]\d{1,2})?$/.test(raw);
  const amount = valid ? number(grouped ? raw.replaceAll('.', '') : raw) : null;
  if (amount === null || amount > maxAmount / 100)
    throw new Error(`Linha ${line}, ${PROPOSAL_LABELS[status]} com valor inválido. Confira o valor em reais.`);
  return cents(amount);
}

export function sumProposalAmounts(amounts) {
  const totals = emptyAmounts();
  for (const row of Object.values(amounts)) {
    for (const status of PROPOSAL_STATUSES) totals[status] += row[status];
  }
  return totals;
}

export function parseProposalPaste(text) {
  if (!text.trim() || text.length > 400000) throw new Error('Cole uma tabela de até 400 mil caracteres, incluindo o cabeçalho.');
  const grid = readClipboardGrid(text);
  const headerIndex = grid.findIndex((row, index) => index < 20 && row.some(cell => HEADER_ALIASES.cooperative.includes(normalize(cell))));
  if (headerIndex < 0) throw new Error('Inclua a coluna Cooperativa com os códigos das unidades.');
  const header = grid[headerIndex].map(normalize);
  const columns = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const matches = header.flatMap((cell, index) => aliases.includes(cell) ? [index] : []);
    if (matches.length > 1) throw new Error(`A coluna ${PROPOSAL_LABELS[key] ?? 'Cooperativa'} está repetida.`);
    if (!matches.length && key !== 'accepted') throw new Error(`Inclua a coluna ${PROPOSAL_LABELS[key] ?? 'Cooperativa'}.`);
    columns[key] = matches[0];
  }

  const amounts = {};
  let reportedTotal;
  for (let index = headerIndex + 1; index < grid.length; index++) {
    const row = grid[index];
    if (row.every(cell => !clean(cell))) continue;
    const line = index + 1;
    const code = clean(row[columns.cooperative]);
    const label = normalize(code);
    const isTotal = label === 'TOTALGERAL' || label === 'TOTAL';
    const maxAmount = isTotal ? MAX_AMOUNT * MAX_COOPERATIVES : MAX_AMOUNT;
    const rowAmounts = Object.fromEntries(PROPOSAL_STATUSES.map(status => [status, readAmount(row[columns[status]], line, status, maxAmount)]));
    if (isTotal) {
      if (reportedTotal) throw new Error('Mantenha apenas uma linha de Total Geral.');
      reportedTotal = rowAmounts;
      continue;
    }
    if ((!code || label === 'VAZIO' || label === 'EMBRANCO') && Object.values(rowAmounts).every(value => value === 0)) continue;
    const cooperative = code.replace(/^0+/, '');
    if (!/^[1-9]\d{0,11}$/.test(cooperative)) throw new Error(`Linha ${line}. Informe um código de cooperativa válido.`);
    if (Object.hasOwn(amounts, cooperative)) throw new Error(`A cooperativa ${cooperative} aparece mais de uma vez. Consolide os valores na planilha.`);
    amounts[cooperative] = rowAmounts;
  }
  const count = Object.keys(amounts).length;
  if (count < 1 || count > MAX_COOPERATIVES) throw new Error('Inclua de 1 a 1.000 cooperativas por ano.');
  if (reportedTotal) {
    const totals = sumProposalAmounts(amounts);
    const mismatch = PROPOSAL_STATUSES.find(status => reportedTotal[status] !== totals[status]);
    if (mismatch) throw new Error(`O Total Geral de ${PROPOSAL_LABELS[mismatch].toLowerCase()} é diferente da soma das cooperativas (${money(totals[mismatch] / 100)}).`);
  }
  return amounts;
}

export function validateProposalDate(year, positionDate, accumulatedSinceJanuary) {
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error('Informe um ano entre 2020 e 2100.');
  if (positionDate) {
    const parsed = day(positionDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(positionDate) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== positionDate || parsed.getUTCFullYear() !== year)
      throw new Error(`Informe uma data-base válida em ${year}.`);
  } else if (accumulatedSinceJanuary) {
    throw new Error('Informe a data-base do acumulado desde janeiro.');
  }
}

function remainingAfterResolution(value) {
  const rate = String(value ?? '').trim().replace(',', '.');
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(rate) || Number(rate) > 100) return null;
  return [10000 - cents(Number(rate)), 10000];
}

export function buildProposalProjection(position, cooperative = 'all', resolution = {}) {
  const { year, positionDate, accumulatedSinceJanuary, amounts } = position;
  const start = day(`${year}-01-01`);
  const end = day(`${year}-12-31`);
  const closed = positionDate === `${year}-12-31`;
  const annual = accumulatedSinceJanuary && positionDate
    ? [(end - start) / DAY_MS + 1, (day(positionDate) - start) / DAY_MS + 1] : null;
  const factors = {
    cancelled: annual,
    inReview: closed ? [1, 1] : remainingAfterResolution(resolution.inReview),
    pending: closed ? [1, 1] : remainingAfterResolution(resolution.pending),
    rejected: annual,
  };
  const selected = cooperative === 'all' ? amounts : Object.hasOwn(amounts, cooperative) ? { [cooperative]: amounts[cooperative] } : {};
  const totals = sumProposalAmounts(selected);
  const projected = Object.fromEntries(FORECAST_STATUSES.map(status => [status, factors[status] ? 0 : null]));
  const rows = Object.entries(selected).map(([code, actual]) => {
    const forecast = Object.fromEntries(FORECAST_STATUSES.map(status => {
      const factor = factors[status];
      if (!factor) return [status, null];
      const value = Math.round(actual[status] * factor[0] / factor[1]);
      projected[status] += value;
      return [status, value];
    }));
    return { code, actual, forecast };
  });
  return { totals, projected, rows, closed };
}
