import type { EntityAppointment } from './relationship-store';
import type { RegistryEntity } from './types';

export type AgendaEntry = { appointment: EntityAppointment; entity: RegistryEntity | null; central: string | null; hierarchy: string; days: string[] };
export function appointmentCalendarDays(appointment: EntityAppointment): string[];
export function prepareAgendaEntries(appointments: EntityAppointment[], entities: RegistryEntity[]): AgendaEntry[];
export function selectAgendaEntries(entries: AgendaEntry[], filters: { month: string; date?: string; central?: string; kind?: string; status?: string }): { monthEntries: AgendaEntry[]; visible: AgendaEntry[]; counts: Record<string, number> };
