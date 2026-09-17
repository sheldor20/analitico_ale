import { zonedDateTimeInput } from './relationship.mjs';

/** Calendar occupancy uses the appointment's timezone and an exclusive end instant. */
export function appointmentCalendarDays(appointment) {
  const start = Date.parse(appointment.startsAt), end = Date.parse(appointment.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 7 * 24 * 60 * 60 * 1000)
    throw new Error('Há um compromisso com datas inválidas. Revise a agenda da unidade.');
  const first = zonedDateTimeInput(new Date(start).toISOString(), appointment.timezone).slice(0, 10);
  const last = zonedDateTimeInput(new Date(end - 1).toISOString(), appointment.timezone).slice(0, 10);
  const cursor = new Date(`${first}T12:00:00Z`), days = [];
  while (cursor.toISOString().slice(0, 10) <= last) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function identity(entityId) {
  const match = /^(central|cooperative|pa):(\d+)(?::(\d+))?(?::(\d+))?$/.exec(entityId);
  if (!match || match[1] === 'central' && (match[3] || match[4]) || match[1] === 'cooperative' && (!match[3] || match[4]) || match[1] === 'pa' && (!match[3] || match[4] == null)) return null;
  return { kind: match[1], central: match[2], cooperative: match[3], pa: match[4] };
}

export function prepareAgendaEntries(appointments, entities) {
  const registry = new Map(entities.map((entity) => [entity.id, entity]));
  return appointments.map((appointment) => {
    const entity = registry.get(appointment.entityId) ?? null;
    const path = entity ?? identity(appointment.entityId);
    const hierarchy = path ? `Central ${path.central}${path.kind !== 'central' ? ` · Cooperativa ${path.cooperative}` : ''}${path.kind === 'pa' ? ` · PA ${path.pa}` : ''}` : `Código da unidade: ${appointment.entityId}`;
    return { appointment, entity, central: path?.central ?? null, hierarchy, days: appointmentCalendarDays(appointment) };
  }).sort((left, right) => Date.parse(left.appointment.startsAt) - Date.parse(right.appointment.startsAt)
    || left.appointment.title.localeCompare(right.appointment.title, 'pt-BR') || left.appointment.id.localeCompare(right.appointment.id));
}

/** Keep each event once in the month list, while counting it on every occupied day. */
export function selectAgendaEntries(entries, { month, date = '', central = 'all', kind = 'all', status = 'scheduled' }) {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) || date && !date.startsWith(`${month}-`))
    throw new Error('Selecione um mês e um dia válidos para a agenda.');
  const filtered = entries.filter((entry) => (central === 'all' || entry.central === central)
    && (kind === 'all' || entry.appointment.kind === kind)
    && (status === 'all' || entry.appointment.status === status));
  const counts = {};
  for (const entry of filtered) for (const day of entry.days) counts[day] = (counts[day] ?? 0) + 1;
  const monthEntries = filtered.filter((entry) => entry.days.some((day) => day.startsWith(`${month}-`)));
  return { monthEntries, visible: date ? monthEntries.filter((entry) => entry.days.includes(date)) : monthEntries, counts };
}
