export const CALENDAR_TIME_ZONE: 'America/Sao_Paulo';
export type AgendaMonthSelection = { month: string; date: string; followCurrentMonth: boolean };
export function calendarToday(now?: Date | string | number): string;
export function defaultAgendaMonth(year: number, today: string): string;
export function reconcileAgendaMonth<T extends AgendaMonthSelection>(selection: T, year: number, today: string): T;
