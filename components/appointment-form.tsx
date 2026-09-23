'use client';

import { useEffect, type FormEvent, type ReactNode } from 'react';
import { LoaderCircle, Save } from 'lucide-react';
import { APPOINTMENT_KINDS, APPOINTMENT_STATUSES, TIMEZONES } from '@/lib/relationship.mjs';
import type { AppointmentInput } from '@/lib/relationship-store';
import styles from './entity-profile.module.css';

export type AppointmentDraft = AppointmentInput & { startLocal: string; endLocal: string };

export function createAppointmentDraft(day: string): AppointmentDraft {
  return { title: '', kind: 'visit', startsAt: '', endsAt: '', startLocal: `${day}T09:00`, endLocal: `${day}T10:00`, timezone: 'America/Sao_Paulo', location: '', notes: '', status: 'scheduled' };
}

export default function AppointmentForm({ year, draft, onChange, onSubmit, onCancel, disabled = false, saving = false, title = 'Novo compromisso', autoFocusTitle = true, children }: {
  year: number; draft: AppointmentDraft; onChange: (draft: AppointmentDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void;
  disabled?: boolean; saving?: boolean; title?: string; autoFocusTitle?: boolean; children?: ReactNode;
}) {
  useEffect(() => {
    const preventLeave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preventLeave);
    return () => window.removeEventListener('beforeunload', preventLeave);
  }, []);

  return <form aria-label={title} aria-busy={saving} onSubmit={onSubmit}>
    <fieldset disabled={disabled || saving} className="registry-fieldset"><div className={styles.fieldgroup}>
      <h4>{title}</h4>
      {children}
      <div className={styles.grid}>
        <label className={styles.full}>Título do compromisso<input autoFocus={autoFocusTitle} required maxLength={160} value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} placeholder="Ex.: Treinamento sobre seguro prestamista" /></label>
        <label>Tipo de compromisso<select value={draft.kind} onChange={(event) => onChange({ ...draft, kind: event.target.value as AppointmentDraft['kind'] })}>{Object.entries(APPOINTMENT_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Situação do compromisso<select value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value as AppointmentDraft['status'] })}>{Object.entries(APPOINTMENT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Início<input required type="datetime-local" step={60} min={`${year}-01-01T00:00`} max={`${year}-12-31T23:59`} value={draft.startLocal} onChange={(event) => onChange({ ...draft, startLocal: event.target.value })} /></label>
        <label>Fim<input required type="datetime-local" step={60} min={draft.startLocal} value={draft.endLocal} onChange={(event) => onChange({ ...draft, endLocal: event.target.value })} /></label>
        <label>Fuso horário<select value={draft.timezone} onChange={(event) => onChange({ ...draft, timezone: event.target.value })}>{Object.entries(TIMEZONES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Local ou link<input maxLength={500} value={draft.location} onChange={(event) => onChange({ ...draft, location: event.target.value })} placeholder="Endereço, Teams ou telefone" /></label>
        <label className={styles.full}>Observações do compromisso<textarea maxLength={4000} value={draft.notes} onChange={(event) => onChange({ ...draft, notes: event.target.value })} placeholder="Pauta, participantes e próximos passos." /></label>
      </div>
      <div className={styles.actions}><button type="button" className="button secondary" onClick={onCancel}>Cancelar edição</button><button type="submit" className="button primary">{saving ? <LoaderCircle size={17} className="spin" aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}Salvar compromisso</button></div>
    </div></fieldset>
  </form>;
}
