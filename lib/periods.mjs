import { MONTHS, periodBounds } from './analytics.mjs';

// These are the five selectable periods. Legacy daily snapshots remain readable.
export const PERIOD_OPTIONS = Object.freeze({
  month: 'Mensal',
  quarter: 'Trimestral',
  semester: 'Semestral',
  annual: 'Anual',
  ytd: 'Acumulado (janeiro ao mês atual)',
});

function validMonth(value) {
  if (!Number.isInteger(value) || value < 0 || value > 11)
    throw new Error('Informe um mês válido.');
  return value;
}

export function currentCalendarMonth(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw new Error('Data de referência inválida.');
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', month: 'numeric',
  }).format(now)) - 1;
}

/** Use an unambiguous end-month anchor without changing the calculation engine. */
export function analysisMonth(period, referenceMonth, calendarMonth) {
  if (!Object.hasOwn(PERIOD_OPTIONS, period)) throw new Error('Período inválido.');
  validMonth(referenceMonth);
  validMonth(calendarMonth);
  if (period === 'ytd') return calendarMonth;
  if (period === 'annual') return 11;
  if (period === 'quarter') return Math.floor(referenceMonth / 3) * 3 + 2;
  if (period === 'semester') return Math.floor(referenceMonth / 6) * 6 + 5;
  return referenceMonth;
}

export function periodCoverage(period, month, year) {
  const { first, last } = periodBounds(year, validMonth(month), period);
  return `${first === last ? MONTHS[first] : `${MONTHS[first]}–${MONTHS[last]}`}/${year}`;
}

/** Shared by the screen, message, saved report, image and CSV. No clock reads here. */
export function periodTitle(period, month, year) {
  validMonth(month);
  if (period === 'annual') return `Anual · ${year}`;
  if (period === 'quarter') return `${Math.floor(month / 3) + 1}º trimestre · ${year}`;
  if (period === 'semester') return `${Math.floor(month / 6) + 1}º semestre · ${year}`;
  if (period === 'ytd') return `Acumulado · JAN–${MONTHS[month]}/${year}`;
  return `${period === 'daily' ? 'Esforço diário' : 'Mensal'} · ${MONTHS[month]}/${year}`;
}
