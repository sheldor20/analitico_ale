export const CALENDAR_TIME_ZONE = 'America/Sao_Paulo';

const calendarDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CALENDAR_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** The calendar's day is always Brasília's day, independent of the device zone. */
export function calendarToday(now = new Date()) {
  const parts = calendarDateFormatter.formatToParts(now instanceof Date ? now : new Date(now));
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function defaultAgendaMonth(year, today) {
  return today.startsWith(`${year}-`) ? today.slice(0, 7) : `${year}-01`;
}

/** Follow the current month only while no explicit calendar selection pins it. */
export function reconcileAgendaMonth(selection, year, today) {
  if (!selection.followCurrentMonth || !today.startsWith(`${year}-`)) return selection;
  const month = today.slice(0, 7);
  return selection.month === month ? selection : { ...selection, month, date: '' };
}
