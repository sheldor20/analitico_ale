'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, ExternalLink, MapPin, Plus, RefreshCw } from 'lucide-react';
import { APPOINTMENT_KINDS, APPOINTMENT_STATUSES, TIMEZONES, calendarDays, zonedDateTimeISO, zonedDateTimeInput } from '@/lib/relationship.mjs';
import { prepareAgendaEntries, selectAgendaEntries } from '@/lib/consolidated-agenda.mjs';
import { listWorkspaceAppointments, saveEntityAppointment, type EntityAppointment } from '@/lib/relationship-store';
import { defaultAgendaMonth, reconcileAgendaMonth } from '@/lib/calendar-clock.mjs';
import { useCalendarToday } from '@/lib/use-calendar-today';
import type { RegistryEntity } from '@/lib/types';
import AppointmentForm, { createAppointmentDraft, type AppointmentDraft } from './appointment-form';
import styles from './consolidated-agenda.module.css';

type Props = {
  entities: RegistryEntity[]; year: number; userId: string; refreshKey: number;
  onOpenEntity: (entity: RegistryEntity, appointment: EntityAppointment) => void; disabled?: boolean; creationDisabled?: boolean;
  onDirtyChange?: (dirty: boolean) => void; onSavingChange?: (saving: boolean) => void; onAppointmentsChange?: () => void;
};
type AppointmentTarget = { kind: RegistryEntity['kind']; central: string; cooperative: string; pa: string };
type Filters = { scope: string; month: string; date: string; central: string; kind: string; status: string; followCurrentMonth: boolean };
type Loaded = { key: string; rows: EntityAppointment[]; error: string };
const monthLabel = (value: string) => new Date(`${value}-01T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dateLabel = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const shiftMonth = (value: string, by: number) => { const date = new Date(`${value}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + by); return date.toISOString().slice(0, 7); };
const emptyRows: EntityAppointment[] = [];

export default function ConsolidatedAgenda(props: Props) {
  return <Agenda key={`${props.userId}:${props.year}`} {...props} />;
}

function Agenda({ entities, year, userId, refreshKey, onOpenEntity, disabled = false, creationDisabled = false, onDirtyChange, onSavingChange, onAppointmentsChange }: Props) {
  const today = useCalendarToday();
  const todayInYear = today.startsWith(`${year}-`);
  const scope = `${userId}:${year}`;
  const defaults: Filters = { scope, month: defaultAgendaMonth(year, today), date: '', central: 'all', kind: 'all', status: 'scheduled', followCurrentMonth: true };
  const [selection, setSelection] = useState<Filters>(defaults);
  const filters = reconcileAgendaMonth(selection.scope === scope ? selection : defaults, year, today);
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<AppointmentDraft | null>(null);
  const [target, setTarget] = useState<AppointmentTarget>({ kind: 'central', central: '', cooperative: '', pa: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const createButton = useRef<HTMLButtonElement>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const hadDraft = useRef(false);
  const alive = useRef(true);
  const savingNow = useRef(false);
  const hasDraft = draft !== null;
  const requestKey = `${scope}:${refreshKey}:${retry}`;
  const loading = loaded?.key !== requestKey;
  const rows = !loading && !loaded?.error ? loaded?.rows ?? emptyRows : emptyRows;
  const loadError = !loading ? loaded?.error : '';
  const update = (change: Partial<Filters>) => setSelection({ ...filters, ...change, scope });

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onDirtyChange?.(hasDraft); return () => onDirtyChange?.(false); }, [hasDraft, onDirtyChange]);
  useEffect(() => { onSavingChange?.(saving); return () => onSavingChange?.(false); }, [saving, onSavingChange]);
  useEffect(() => {
    if (hadDraft.current && !hasDraft) (notice ? noticeRef.current : createButton.current)?.focus({ preventScroll: true });
    hadDraft.current = hasDraft;
  }, [hasDraft, notice]);

  useEffect(() => {
    setSelection((previous) => previous.scope === scope ? reconcileAgendaMonth(previous, year, today) : {
      scope, month: defaultAgendaMonth(year, today), date: '', central: 'all', kind: 'all', status: 'scheduled', followCurrentMonth: true,
    });
  }, [scope, year, today]);

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
  const dayEntries = useMemo(() => {
    const result = new Map<string, EntityAppointment[]>();
    for (const entry of agenda.monthEntries) for (const day of entry.days) {
      const events = result.get(day) ?? [];
      if (events.length < 2) events.push(entry.appointment);
      result.set(day, events);
    }
    return result;
  }, [agenda.monthEntries]);
  const days = calendarDays(filters.month);
  const error = loadError || prepared.error;
  const locked = disabled || loading || saving;
  const showMonth = (month: string) => update({ month, date: '', followCurrentMonth: false });
  const countLabel = (count: number) => `${count} ${count === 1 ? 'compromisso' : 'compromissos'}`;
  const targetCentrals = entities.filter((entity) => entity.kind === 'central').sort((a, b) => a.central.localeCompare(b.central, 'pt-BR', { numeric: true }));
  const targetCooperatives = entities.filter((entity) => entity.kind === 'cooperative' && entity.central === target.central).sort((a, b) => (a.cooperative ?? '').localeCompare(b.cooperative ?? '', 'pt-BR', { numeric: true }));
  const targetCentral = targetCentrals.find((entity) => entity.central === target.central);
  const targetCooperative = targetCooperatives.find((entity) => entity.id === target.cooperative);
  const targetPas = entities.filter((entity) => entity.kind === 'pa' && entity.central === target.central && !!targetCooperative && entity.cooperative === targetCooperative.cooperative).sort((a, b) => (a.pa ?? '').localeCompare(b.pa ?? '', 'pt-BR', { numeric: true }));
  const targetEntity = target.kind === 'central' ? targetCentral : target.kind === 'cooperative' ? targetCooperative : targetPas.find((entity) => entity.id === target.pa);

  function startCreate() {
    if (locked || creationDisabled || error || !entities.length) return;
    const day = filters.date || (today.startsWith(filters.month) ? today : `${filters.month}-01`);
    setDraft(createAppointmentDraft(day));
    setTarget({ kind: 'central', central: central === 'all' ? '' : central, cooperative: '', pa: '' });
    setSaveError(''); setNotice('');
  }
  function cancelCreate() {
    if (savingNow.current || disabled || !window.confirm('Descartar este compromisso sem salvar?')) return;
    setDraft(null); setSaveError('');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || locked || creationDisabled || savingNow.current) return;
    if (!targetEntity) { setSaveError('Selecione a unidade do compromisso.'); return; }
    savingNow.current = true;
    setSaving(true); setSaveError(''); setNotice('');
    try {
      const saved = await saveEntityAppointment(year, targetEntity, { ...draft, startsAt: zonedDateTimeISO(draft.startLocal, draft.timezone), endsAt: zonedDateTimeISO(draft.endLocal, draft.timezone) }, userId);
      if (!alive.current) return;
      const day = zonedDateTimeInput(saved.startsAt, saved.timezone).slice(0, 10);
      setLoaded((previous) => ({ key: requestKey, rows: [...(previous?.key === requestKey ? previous.rows.filter((item) => item.id !== saved.id) : []), saved], error: '' }));
      update({ month: day.slice(0, 7), date: day, central: targetEntity.central, kind: 'all', status: 'all', followCurrentMonth: false });
      setDraft(null); setNotice('Compromisso salvo na agenda.');
      setRetry((value) => value + 1);
      onAppointmentsChange?.();
    } catch (reason) {
      if (alive.current) setSaveError(reason instanceof Error ? reason.message : 'Não foi possível salvar o compromisso. Tente novamente.');
    } finally {
      savingNow.current = false;
      if (alive.current) setSaving(false);
    }
  }

  return <section className={styles.section} aria-label="Agenda consolidada" aria-busy={loading}>
    <header className={styles.heading}><div><span className={styles.eyebrow}><CalendarDays size={17} aria-hidden="true" /> Relacionamento</span><h2>Agenda consolidada</h2><p>Visitas, treinamentos, reuniões e ligações de todas as unidades.</p></div><div className={styles.headerActions}>{!draft && <button ref={createButton} type="button" className="button primary" disabled={locked || creationDisabled || !!error || !entities.length} onClick={startCreate}><Plus size={16} aria-hidden="true" />Novo compromisso</button>}<button type="button" className="button secondary" disabled={locked || hasDraft} onClick={() => setRetry((value) => value + 1)}><RefreshCw size={16} aria-hidden="true" /> Atualizar agenda</button></div></header>
    {notice && <p ref={noticeRef} tabIndex={-1} role="status" className={styles.success}><Check size={18} aria-hidden="true" />{notice}</p>}
    {draft && <AppointmentForm year={year} draft={draft} onChange={setDraft} onSubmit={submit} onCancel={cancelCreate} disabled={disabled || creationDisabled || loading} saving={saving} autoFocusTitle={false}>
      <div className={styles.targetFields}>
        <label>Nível da unidade<select autoFocus aria-label="Nível da unidade" value={target.kind} onChange={(event) => { const kind = event.target.value as RegistryEntity['kind']; setTarget({ ...target, kind, cooperative: kind === 'central' ? '' : target.cooperative, pa: '' }); }}><option value="central">Central</option><option value="cooperative">Cooperativa</option><option value="pa">PA</option></select></label>
        <label>Central do compromisso<select required aria-label="Central do compromisso" value={target.central} onChange={(event) => setTarget({ ...target, central: event.target.value, cooperative: '', pa: '' })}><option value="">Selecione a central</option>{targetCentrals.map((entity) => <option key={entity.id} value={entity.central}>{entity.central} · {entity.name}</option>)}</select></label>
        {target.kind !== 'central' && <label>Cooperativa do compromisso<select required aria-label="Cooperativa do compromisso" disabled={!target.central} value={targetCooperative?.id ?? ''} onChange={(event) => setTarget({ ...target, cooperative: event.target.value, pa: '' })}><option value="">Selecione a cooperativa</option>{targetCooperatives.map((entity) => <option key={entity.id} value={entity.id}>{entity.cooperative} · {entity.name}</option>)}</select></label>}
        {target.kind === 'pa' && <label>PA do compromisso<select required aria-label="PA do compromisso" disabled={!targetCooperative} value={targetPas.some((entity) => entity.id === target.pa) ? target.pa : ''} onChange={(event) => setTarget({ ...target, pa: event.target.value })}><option value="">Selecione o PA</option>{targetPas.map((entity) => <option key={entity.id} value={entity.id}>{entity.pa} · {entity.name}</option>)}</select></label>}
      </div>
      {targetEntity && <p className={styles.targetSummary}>Compromisso vinculado a <strong>{targetEntity.name}</strong>.</p>}
      {saveError && <div className={styles.error} role="alert"><p>{saveError}</p></div>}
    </AppointmentForm>}
    <div className={styles.filters}>
      <label>Central<select aria-label="Central da agenda" value={central} disabled={disabled || saving} onChange={(event) => update({ central: event.target.value })}><option value="all">Todas as centrais</option>{centralOptions.map(([code, name]) => <option value={code} key={code}>{code} · {name}</option>)}</select></label>
      <label>Tipo de atividade<select aria-label="Tipo de atividade" value={filters.kind} disabled={disabled || saving} onChange={(event) => update({ kind: event.target.value })}><option value="all">Todas as atividades</option>{Object.entries(APPOINTMENT_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Situação<select aria-label="Situação da agenda" value={filters.status} disabled={disabled || saving} onChange={(event) => update({ status: event.target.value })}>{Object.entries(APPOINTMENT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="all">Todas as situações</option></select></label>
    </div>
    {error ? <div className={styles.error} role="alert"><p>{error}</p><button type="button" className="button secondary" disabled={disabled} onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button></div> : <>
      <div className={styles.calendar}>
        <div className={styles.monthNavigation}>
          <button type="button" className="button quiet" aria-label="Mês anterior da agenda" disabled={disabled || saving || filters.month === `${year}-01`} onClick={() => showMonth(shiftMonth(filters.month, -1))}><ChevronLeft size={18} aria-hidden="true" /></button>
          <label className={styles.monthPicker}><span className={styles.srOnly}>Mês da agenda</span><select aria-label="Mês da agenda" value={filters.month} disabled={disabled || saving} onChange={(event) => showMonth(event.target.value)}>{Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`).map((month) => <option value={month} key={month}>{monthLabel(month)}</option>)}</select></label>
          <button type="button" className="button quiet" aria-label="Próximo mês da agenda" disabled={disabled || saving || filters.month === `${year}-12`} onClick={() => showMonth(shiftMonth(filters.month, 1))}><ChevronRight size={18} aria-hidden="true" /></button>
          <button type="button" className={`button secondary ${styles.todayButton}`} disabled={disabled || saving || !todayInYear} title={todayInYear ? 'Voltar ao mês atual' : `Hoje pertence a ${today.slice(0, 4)}. Altere o ano do cadastro para consultar.`} onClick={() => update({ month: today.slice(0, 7), date: '', followCurrentMonth: true })}>Hoje</button>
        </div>
        <table className={styles.calendarTable} aria-label="Calendário consolidado">
          <thead><tr>{[['Seg', 'Segunda-feira'], ['Ter', 'Terça-feira'], ['Qua', 'Quarta-feira'], ['Qui', 'Quinta-feira'], ['Sex', 'Sexta-feira'], ['Sáb', 'Sábado'], ['Dom', 'Domingo']].map(([short, name]) => <th key={short} scope="col"><abbr title={name}>{short}</abbr></th>)}</tr></thead>
          <tbody>{Array.from({ length: 6 }, (_, week) => <tr key={week}>{days.slice(week * 7, week * 7 + 7).map((day) => <td key={day.date}>
            <button type="button" className={styles.day} data-outside={!day.inMonth} data-today={today === day.date} aria-current={today === day.date ? 'date' : undefined} aria-label={`${dateLabel(day.date)}: ${countLabel(agenda.counts[day.date] ?? 0)}`} aria-pressed={filters.date === day.date} disabled={locked || !day.date.startsWith(`${year}-`)} onClick={() => update({ date: day.date, month: day.date.slice(0, 7), followCurrentMonth: false })}>
              <span className={styles.dayTop}><span className={styles.dayNumber}>{day.day}</span>{!!agenda.counts[day.date] && <span className={styles.count} aria-hidden="true">{agenda.counts[day.date]}</span>}</span>
              {day.inMonth && <span className={styles.dayPreview} aria-hidden="true">{(dayEntries.get(day.date) ?? []).map((appointment) => <span key={appointment.id} title={appointment.title}><strong>{zonedDateTimeInput(appointment.startsAt, appointment.timezone).slice(0, 10) === day.date ? zonedDateTimeInput(appointment.startsAt, appointment.timezone).slice(11) : 'Continua'}</strong> {appointment.title}</span>)}{(agenda.counts[day.date] ?? 0) > 2 && <small>+{(agenda.counts[day.date] ?? 0) - 2} compromissos</small>}</span>}
            </button>
          </td>)}</tr>)}</tbody>
        </table>
      </div>
      <div className={styles.calendarLegend}><span><i aria-hidden="true" />Hoje · {dateLabel(today)}{!todayInYear && ` de ${today.slice(0, 4)}`}</span><p>Horários no fuso de cada compromisso.</p></div>
      {loading ? <p className={styles.loading} role="status">Carregando agenda consolidada…</p> : <>
        <div className={styles.listHeading}><div><h3>{filters.date ? `Agenda de ${dateLabel(filters.date)}` : 'Compromissos do mês'}</h3><p aria-live="polite">{countLabel(agenda.visible.length)}{filters.date ? ` neste dia · ${countLabel(agenda.monthEntries.length)} no mês` : ' no período selecionado'}</p></div>{filters.date && <button type="button" className="button secondary" disabled={disabled || saving} onClick={() => update({ date: '' })}>Ver mês inteiro</button>}</div>
        <div className={styles.appointments}>{agenda.visible.map(({ appointment, entity, hierarchy }) => <article key={appointment.id} className={styles.appointment}>
          <div className={styles.cardHeading}><div><span className={styles.kind}>{APPOINTMENT_KINDS[appointment.kind]}</span><h4>{appointment.title}</h4></div><span className={styles.status} data-status={appointment.status}>{APPOINTMENT_STATUSES[appointment.status]}</span></div>
          <div className={styles.unit}><strong>{entity?.name ?? 'Unidade não encontrada no cadastro atual'}</strong><span>{hierarchy}</span></div>
          <p className={styles.date}><Clock3 size={16} aria-hidden="true" /><span><time dateTime={appointment.startsAt}>{new Date(appointment.startsAt).toLocaleString('pt-BR', { timeZone: appointment.timezone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time> até <time dateTime={appointment.endsAt}>{new Date(appointment.endsAt).toLocaleString('pt-BR', { timeZone: appointment.timezone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time><small>{TIMEZONES[appointment.timezone] ?? appointment.timezone}</small></span></p>
          {appointment.location && <p className={styles.location}><MapPin size={16} aria-hidden="true" /><span>{appointment.location}</span></p>}
          <div className={styles.cardActions}>{entity ? <button type="button" className="button secondary" disabled={disabled || saving} onClick={() => onOpenEntity(entity, appointment)}><ExternalLink size={16} aria-hidden="true" /> Abrir agenda da unidade</button> : <p className={styles.missing}>O compromisso foi preservado. Confira o cadastro da unidade para acessá-lo.</p>}</div>
        </article>)}</div>
        {!agenda.visible.length && <div className={styles.empty}><CalendarDays size={27} aria-hidden="true" /><h4>Nenhum compromisso {filters.date ? 'neste dia' : 'neste mês'}</h4><p>Use Novo compromisso ou altere os filtros.</p></div>}
      </>}
    </>}
  </section>;
}
