'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, ExternalLink, MapPin, RefreshCw } from 'lucide-react';
import { APPOINTMENT_KINDS, APPOINTMENT_STATUSES, TIMEZONES, calendarDays, zonedDateTimeInput } from '@/lib/relationship.mjs';
import { prepareAgendaEntries, selectAgendaEntries } from '@/lib/consolidated-agenda.mjs';
import { listWorkspaceAppointments, type EntityAppointment } from '@/lib/relationship-store';
import type { RegistryEntity } from '@/lib/types';
import styles from './consolidated-agenda.module.css';

type Props = { entities: RegistryEntity[]; year: number; userId: string; refreshKey: number; onOpenEntity: (entity: RegistryEntity, appointment: EntityAppointment) => void; disabled?: boolean };
type Filters = { scope: string; month: string; date: string; central: string; kind: string; status: string };
type Loaded = { key: string; rows: EntityAppointment[]; error: string };
const monthLabel = (value: string) => new Date(`${value}-01T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dateLabel = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const shiftMonth = (value: string, by: number) => { const date = new Date(`${value}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + by); return date.toISOString().slice(0, 7); };
const emptyRows: EntityAppointment[] = [];

export default function ConsolidatedAgenda({ entities, year, userId, refreshKey, onOpenEntity, disabled = false }: Props) {
  const today = zonedDateTimeInput(new Date().toISOString()).slice(0, 10);
  const scope = `${userId}:${year}`;
  const defaults: Filters = { scope, month: today.startsWith(`${year}-`) ? today.slice(0, 7) : `${year}-01`, date: '', central: 'all', kind: 'all', status: 'scheduled' };
  const [selection, setSelection] = useState<Filters>(defaults);
  const filters = selection.scope === scope ? selection : defaults;
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const requestKey = `${scope}:${refreshKey}:${retry}`;
  const loading = loaded?.key !== requestKey;
  const rows = !loading && !loaded?.error ? loaded?.rows ?? emptyRows : emptyRows;
  const loadError = !loading ? loaded?.error : '';
  const update = (change: Partial<Filters>) => setSelection({ ...filters, ...change, scope });

  useEffect(() => {
    let active = true;
    listWorkspaceAppointments(year, userId).then((appointments) => {
      if (active) setLoaded({ key: requestKey, rows: appointments, error: '' });
    }).catch(() => {
      if (active) setLoaded({ key: requestKey, rows: [], error: 'Não foi possível carregar a agenda consolidada. Tente novamente.' });
    });
    return () => { active = false; };
  }, [year, userId, requestKey]);

  const prepared = useMemo(() => {
    try { return { entries: prepareAgendaEntries(rows, entities), error: '' }; }
    catch (reason) { return { entries: [], error: reason instanceof Error ? reason.message : 'Não foi possível organizar os compromissos.' }; }
  }, [rows, entities]);
  const centralOptions = useMemo(() => {
    const names = new Map(entities.filter((entity) => entity.kind === 'central').map((entity) => [entity.central, entity.name]));
    for (const entry of prepared.entries) if (entry.central && !names.has(entry.central)) names.set(entry.central, 'Central sem cadastro atual');
    return [...names.entries()].sort(([left], [right]) => left.localeCompare(right, 'pt-BR', { numeric: true }));
  }, [entities, prepared.entries]);
  const central = filters.central === 'all' || centralOptions.some(([code]) => code === filters.central) ? filters.central : 'all';
  const agenda = useMemo(() => selectAgendaEntries(prepared.entries, { ...filters, central }), [prepared.entries, filters, central]);
  const days = calendarDays(filters.month);
  const error = loadError || prepared.error;
  const locked = disabled || loading;
  const showMonth = (month: string) => update({ month, date: '' });
  const countLabel = (count: number) => `${count} ${count === 1 ? 'compromisso' : 'compromissos'}`;

  return <section className={styles.section} aria-label="Agenda consolidada" aria-busy={loading}>
    <header className={styles.heading}><div><span className={styles.eyebrow}><CalendarDays size={17} aria-hidden="true" /> Relacionamento</span><h2>Agenda consolidada</h2><p>Visitas, treinamentos, reuniões e ligações de todas as unidades.</p></div><button type="button" className="button secondary" disabled={locked} onClick={() => setRetry((value) => value + 1)}><RefreshCw size={16} aria-hidden="true" /> Atualizar agenda</button></header>
    <div className={styles.filters}>
      <label>Central<select aria-label="Central da agenda" value={central} disabled={disabled} onChange={(event) => update({ central: event.target.value })}><option value="all">Todas as centrais</option>{centralOptions.map(([code, name]) => <option value={code} key={code}>{code} · {name}</option>)}</select></label>
      <label>Tipo de atividade<select aria-label="Tipo de atividade" value={filters.kind} disabled={disabled} onChange={(event) => update({ kind: event.target.value })}><option value="all">Todas as atividades</option>{Object.entries(APPOINTMENT_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Situação<select aria-label="Situação da agenda" value={filters.status} disabled={disabled} onChange={(event) => update({ status: event.target.value })}>{Object.entries(APPOINTMENT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="all">Todas as situações</option></select></label>
    </div>
    {error ? <div className={styles.error} role="alert"><p>{error}</p><button type="button" className="button secondary" disabled={disabled} onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button></div> : <>
      <div className={styles.calendar}>
        <div className={styles.monthNavigation}><button type="button" className="button quiet" aria-label="Mês anterior da agenda" disabled={disabled || filters.month === `${year}-01`} onClick={() => showMonth(shiftMonth(filters.month, -1))}><ChevronLeft size={18} aria-hidden="true" /></button><label className={styles.monthPicker}><span className={styles.srOnly}>Mês da agenda</span><select aria-label="Mês da agenda" value={filters.month} disabled={disabled} onChange={(event) => showMonth(event.target.value)}>{Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`).map((month) => <option value={month} key={month}>{monthLabel(month)}</option>)}</select></label><button type="button" className="button quiet" aria-label="Próximo mês da agenda" disabled={disabled || filters.month === `${year}-12`} onClick={() => showMonth(shiftMonth(filters.month, 1))}><ChevronRight size={18} aria-hidden="true" /></button></div>
        <table className={styles.calendarTable} aria-label="Calendário consolidado"><thead><tr>{[['Seg', 'Segunda-feira'], ['Ter', 'Terça-feira'], ['Qua', 'Quarta-feira'], ['Qui', 'Quinta-feira'], ['Sex', 'Sexta-feira'], ['Sáb', 'Sábado'], ['Dom', 'Domingo']].map(([short, name]) => <th key={short} scope="col"><abbr title={name}>{short}</abbr></th>)}</tr></thead><tbody>{Array.from({ length: 6 }, (_, week) => <tr key={week}>{days.slice(week * 7, week * 7 + 7).map((day) => <td key={day.date}><button type="button" className={styles.day} data-outside={!day.inMonth} data-today={today === day.date} aria-label={`${dateLabel(day.date)}: ${countLabel(agenda.counts[day.date] ?? 0)}`} aria-pressed={filters.date === day.date} disabled={locked || !day.date.startsWith(`${year}-`)} onClick={() => update({ date: day.date, month: day.date.slice(0, 7) })}><span>{day.day}</span>{!!agenda.counts[day.date] && <span className={styles.count} aria-hidden="true">{agenda.counts[day.date]}</span>}</button></td>)}</tr>)}</tbody></table>
      </div>
      <p className={styles.calendarHelp}>Compromissos de vários dias aparecem em cada dia ocupado. Horários no fuso indicado em cada compromisso.</p>
      {loading ? <p className={styles.loading} role="status">Carregando agenda consolidada…</p> : <>
        <div className={styles.listHeading}><div><h3>{filters.date ? `Agenda de ${dateLabel(filters.date)}` : 'Compromissos do mês'}</h3><p aria-live="polite">{countLabel(agenda.visible.length)}{filters.date ? ` neste dia · ${countLabel(agenda.monthEntries.length)} no mês` : ' no período selecionado'}</p></div>{filters.date && <button type="button" className="button secondary" onClick={() => update({ date: '' })}>Ver mês inteiro</button>}</div>
        <div className={styles.appointments}>{agenda.visible.map(({ appointment, entity, hierarchy }) => <article key={appointment.id} className={styles.appointment}>
          <div className={styles.cardHeading}><div><span className={styles.kind}>{APPOINTMENT_KINDS[appointment.kind]}</span><h4>{appointment.title}</h4></div><span className={styles.status} data-status={appointment.status}>{APPOINTMENT_STATUSES[appointment.status]}</span></div>
          <div className={styles.unit}><strong>{entity?.name ?? 'Unidade não encontrada no cadastro atual'}</strong><span>{hierarchy}</span></div>
          <p className={styles.date}><Clock3 size={16} aria-hidden="true" /><span><time dateTime={appointment.startsAt}>{new Date(appointment.startsAt).toLocaleString('pt-BR', { timeZone: appointment.timezone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time> até <time dateTime={appointment.endsAt}>{new Date(appointment.endsAt).toLocaleString('pt-BR', { timeZone: appointment.timezone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time><small>{TIMEZONES[appointment.timezone] ?? appointment.timezone}</small></span></p>
          {appointment.location && <p className={styles.location}><MapPin size={16} aria-hidden="true" /><span>{appointment.location}</span></p>}
          <div className={styles.cardActions}>{entity ? <button type="button" className="button secondary" disabled={disabled} onClick={() => onOpenEntity(entity, appointment)}><ExternalLink size={16} aria-hidden="true" /> Abrir agenda da unidade</button> : <p className={styles.missing}>O compromisso foi preservado. Confira o cadastro da unidade para acessá-lo.</p>}</div>
        </article>)}</div>
        {!agenda.visible.length && <div className={styles.empty}><CalendarDays size={27} aria-hidden="true" /><h4>Nenhum compromisso {filters.date ? 'neste dia' : 'neste mês'}</h4><p>Altere os filtros ou agende uma atividade na ficha da unidade.</p></div>}
      </>}
    </>}
  </section>;
}
