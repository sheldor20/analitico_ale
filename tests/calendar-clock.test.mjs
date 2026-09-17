import test from 'node:test';
import assert from 'node:assert/strict';
import { CALENDAR_TIME_ZONE, calendarToday, defaultAgendaMonth, reconcileAgendaMonth } from '../lib/calendar-clock.mjs';

test('calendar uses Brasília midnight instead of UTC midnight', () => {
  assert.equal(CALENDAR_TIME_ZONE, 'America/Sao_Paulo');
  assert.equal(calendarToday('2026-09-18T00:00:00Z'), '2026-09-17');
  assert.equal(calendarToday('2026-09-18T02:59:59.999Z'), '2026-09-17');
  assert.equal(calendarToday('2026-09-18T03:00:00Z'), '2026-09-18');
  assert.equal(calendarToday(new Date('2026-09-18T03:00:00Z')), '2026-09-18');
  assert.equal(calendarToday(Date.parse('2026-09-18T03:00:00Z')), '2026-09-18');
});

test('month, year and leap-day transitions respect the Brasília day', () => {
  for (const [instant, expected] of [
    ['2026-10-01T02:59:59.999Z', '2026-09-30'], ['2026-10-01T03:00:00Z', '2026-10-01'],
    ['2027-01-01T02:59:59.999Z', '2026-12-31'], ['2027-01-01T03:00:00Z', '2027-01-01'],
    ['2028-03-01T02:59:59.999Z', '2028-02-29'], ['2028-03-01T03:00:00Z', '2028-03-01'],
  ]) assert.equal(calendarToday(instant), expected);
});

test('date formatting is independent of the host timezone', () => {
  const previousTimezone = process.env.TZ;
  try {
    for (const timezone of ['UTC', 'Pacific/Auckland', 'America/Los_Angeles']) {
      process.env.TZ = timezone;
      assert.equal(calendarToday('2026-10-01T02:30:00Z'), '2026-09-30');
    }
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('initial calendar month follows today only in the active year', () => {
  assert.equal(defaultAgendaMonth(2026, '2026-09-17'), '2026-09');
  assert.equal(defaultAgendaMonth(2025, '2026-09-17'), '2025-01');
  assert.equal(defaultAgendaMonth(2027, '2026-09-17'), '2027-01');
});

test('a following calendar rolls over and clears the day while preserving other filters', () => {
  const selection = { month: '2026-09', date: '2026-09-17', followCurrentMonth: true, central: '1002', status: 'scheduled' };
  assert.equal(reconcileAgendaMonth(selection, 2026, '2026-09-30'), selection);
  assert.deepEqual(reconcileAgendaMonth(selection, 2026, '2026-10-01'), {
    ...selection, month: '2026-10', date: '',
  });
  assert.equal(selection.month, '2026-09');
  assert.equal(selection.date, '2026-09-17');
});

test('explicitly selected months and days survive clock rollover', () => {
  for (const selection of [
    { month: '2026-07', date: '', followCurrentMonth: false },
    { month: '2026-09', date: '2026-09-30', followCurrentMonth: false },
    { month: '2026-11', date: '', followCurrentMonth: false },
  ]) assert.equal(reconcileAgendaMonth(selection, 2026, '2026-10-01'), selection);
});

test('year rollover never moves a pinned-year calendar back to January', () => {
  const selection = { month: '2026-12', date: '', followCurrentMonth: true };
  assert.equal(reconcileAgendaMonth(selection, 2026, '2027-01-01'), selection);
  const newYear = { month: defaultAgendaMonth(2027, '2027-01-01'), date: '', followCurrentMonth: true };
  assert.equal(reconcileAgendaMonth(newYear, 2027, '2027-01-02'), newYear);
  assert.deepEqual(reconcileAgendaMonth(newYear, 2027, '2027-02-01'), { ...newYear, month: '2027-02' });
});

test('Hoje restores a full month and resumes later month rollover', () => {
  const today = '2026-10-03';
  const pinned = { month: '2026-07', date: '2026-07-20', followCurrentMonth: false, kind: 'training' };
  const restored = { ...pinned, month: defaultAgendaMonth(2026, today), date: '', followCurrentMonth: true };
  assert.deepEqual(reconcileAgendaMonth(restored, 2026, today), { month: '2026-10', date: '', followCurrentMonth: true, kind: 'training' });
  assert.deepEqual(reconcileAgendaMonth(restored, 2026, '2026-11-01'), { ...restored, month: '2026-11' });
});
