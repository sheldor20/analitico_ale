import test from 'node:test';
import assert from 'node:assert/strict';
import { appointmentCalendarDays, prepareAgendaEntries, selectAgendaEntries } from '../lib/consolidated-agenda.mjs';

const entities = [
  { id: 'central:1002', kind: 'central', central: '1002', name: 'Bahia' },
  { id: 'cooperative:1002:3017', kind: 'cooperative', central: '1002', cooperative: '3017', name: 'Cooperativa Bahia' },
  { id: 'pa:1002:3017:0', kind: 'pa', central: '1002', cooperative: '3017', pa: '0', name: 'PA zero Bahia' },
  { id: 'cooperative:2007:3017', kind: 'cooperative', central: '2007', cooperative: '3017', name: 'Outra central' },
];
const appointment = (patch = {}) => ({ id: 'one', entityId: 'cooperative:1002:3017', title: 'Visita comercial', kind: 'visit',
  startsAt: '2026-09-17T12:00:00Z', endsAt: '2026-09-17T13:00:00Z', timezone: 'America/Sao_Paulo',
  status: 'scheduled', notes: '', location: '', updatedAt: '2026-09-16T12:00:00Z', ...patch });

test('calendar days respect each appointment timezone rather than the UTC or device day', () => {
  assert.deepEqual(appointmentCalendarDays(appointment({ startsAt: '2026-09-18T02:00:00Z', endsAt: '2026-09-18T02:30:00Z' })), ['2026-09-17']);
  assert.deepEqual(appointmentCalendarDays(appointment({ startsAt: '2026-09-18T02:00:00Z', endsAt: '2026-09-18T02:30:00Z', timezone: 'America/Noronha' })), ['2026-09-18']);
});

test('multi-day events cover each occupied day and do not occupy an exclusive midnight endpoint', () => {
  const interval = appointment({ startsAt: '2026-08-31T22:00:00Z', endsAt: '2026-09-02T13:00:00Z' });
  assert.deepEqual(appointmentCalendarDays(interval), ['2026-08-31', '2026-09-01', '2026-09-02']);
  assert.deepEqual(appointmentCalendarDays(appointment({ startsAt: '2026-09-17T12:00:00Z', endsAt: '2026-09-19T03:00:00Z' })), ['2026-09-17', '2026-09-18']);
  const entries = prepareAgendaEntries([interval], entities);
  const month = selectAgendaEntries(entries, { month: '2026-09' });
  assert.equal(month.monthEntries.length, 1);
  assert.equal(month.visible.length, 1);
  assert.equal(month.counts['2026-09-01'], 1);
  assert.equal(month.counts['2026-09-02'], 1);
  assert.equal(selectAgendaEntries(entries, { month: '2026-09', date: '2026-09-02' }).visible.length, 1);
  assert.equal(selectAgendaEntries(entries, { month: '2026-09', date: '2026-09-03' }).visible.length, 0);
});

test('central selection includes central, cooperative and PA zero while keeping identical codes in other centrals isolated', () => {
  const rows = entities.map((entity, index) => appointment({ id: String(index), entityId: entity.id }));
  const before = structuredClone(rows), registryBefore = structuredClone(entities);
  const entries = prepareAgendaEntries(rows, entities);
  const result = selectAgendaEntries(entries, { month: '2026-09', central: '1002' });
  assert.deepEqual(result.visible.map((entry) => entry.entity.id), entities.slice(0, 3).map((entity) => entity.id));
  assert.equal(result.counts['2026-09-17'], 3);
  assert.equal(result.visible[2].hierarchy, 'Central 1002 · Cooperativa 3017 · PA 0');
  assert.deepEqual(rows, before); assert.deepEqual(entities, registryBefore);
});

test('status defaults to scheduled and all filters affect both counts and the visible list', () => {
  const entries = prepareAgendaEntries([
    appointment(), appointment({ id: 'training', kind: 'training' }),
    appointment({ id: 'completed', status: 'completed' }), appointment({ id: 'cancelled', status: 'cancelled', kind: 'call' }),
  ], entities);
  const scheduled = selectAgendaEntries(entries, { month: '2026-09' });
  assert.equal(scheduled.visible.length, 2); assert.equal(scheduled.counts['2026-09-17'], 2);
  const training = selectAgendaEntries(entries, { month: '2026-09', kind: 'training' });
  assert.deepEqual(training.visible.map((entry) => entry.appointment.id), ['training']);
  assert.equal(training.counts['2026-09-17'], 1);
  assert.equal(selectAgendaEntries(entries, { month: '2026-09', status: 'all' }).visible.length, 4);
  assert.deepEqual(selectAgendaEntries(entries, { month: '2026-09', status: 'cancelled', kind: 'call' }).visible.map((entry) => entry.appointment.id), ['cancelled']);
});

test('orphaned units stay visible with an explicit fallback and can still be filtered by their stored hierarchy', () => {
  const entries = prepareAgendaEntries([appointment({ entityId: 'pa:2007:9999:0' }), appointment({ id: 'unknown', entityId: 'unknown-legacy-id' })], entities);
  const all = selectAgendaEntries(entries, { month: '2026-09' });
  assert.equal(all.visible.length, 2);
  assert.ok(all.visible.every((entry) => entry.entity === null));
  const central = selectAgendaEntries(entries, { month: '2026-09', central: '2007' });
  assert.equal(central.visible.length, 1);
  assert.equal(central.visible[0].hierarchy, 'Central 2007 · Cooperativa 9999 · PA 0');
  assert.match(entries.find((entry) => entry.appointment.id === 'unknown').hierarchy, /unknown-legacy-id/);
});

test('chronological ordering and month/year boundaries do not duplicate or invent appointments', () => {
  const entries = prepareAgendaEntries([
    appointment({ id: 'future', startsAt: '2026-10-01T13:00:00Z', endsAt: '2026-10-01T14:00:00Z' }),
    appointment({ id: 'previous', startsAt: '2026-08-31T23:00:00Z', endsAt: '2026-09-01T04:00:00Z' }),
    appointment(),
  ], entities);
  assert.deepEqual(selectAgendaEntries(entries, { month: '2026-09' }).visible.map((entry) => entry.appointment.id), ['previous', 'one']);
  assert.deepEqual(selectAgendaEntries(entries, { month: '2026-10' }).visible.map((entry) => entry.appointment.id), ['future']);
  assert.deepEqual(selectAgendaEntries(entries, { month: '2027-09' }).visible, []);
  assert.throws(() => selectAgendaEntries(entries, { month: '2026-13' }), /mês e um dia válidos/);
  assert.throws(() => selectAgendaEntries(entries, { month: '2026-09', date: '2026-10-01' }), /mês e um dia válidos/);
});

test('invalid or unbounded intervals fail explicitly instead of silently fabricating calendar dates', () => {
  for (const patch of [{ startsAt: 'invalid' }, { endsAt: '2026-09-17T12:00:00Z' }, { endsAt: '2026-10-17T13:00:00Z' }]) {
    assert.throws(() => appointmentCalendarDays(appointment(patch)), /datas inválidas/);
  }
});
