import { supabase } from "./supabase";
import { validateAppointment, validateProfile } from "./relationship.mjs";
import type { RegistryEntity } from "./types";

export type RateTable = { id: string; name: string; rate: number | string; unit: "percent" | "permille" | "brl"; period: "monthly" | "annual" | "single"; validFrom: string; validUntil: string; notes: string };
export type ProfileInput = { capitalModality: string; capitalNotes: string; rateTables: RateTable[]; collectionNotes: string; newSalesNotes: string; generalNotes: string };
export type EntityProfile = ProfileInput & { id: string; updatedAt: string };
export type AppointmentInput = { title: string; kind: "visit" | "training" | "meeting" | "call"; startsAt: string; endsAt: string; timezone: string; location: string; notes: string; status: "scheduled" | "completed" | "cancelled" };
export type EntityAppointment = AppointmentInput & { id: string; entityId: string; updatedAt: string };
type ProfileRow = { id: string; capital_modality: string; capital_notes: string; rate_tables: RateTable[]; collection_notes: string; new_sales_notes: string; general_notes: string; updated_at: string };
type AppointmentRow = { id: string; entity_id: string; title: string; kind: AppointmentInput["kind"]; starts_at: string; ends_at: string; timezone: string; location: string; notes: string; status: AppointmentInput["status"]; updated_at: string };
const PROFILE_COLUMNS = "id,capital_modality,capital_notes,rate_tables,collection_notes,new_sales_notes,general_notes,updated_at";
const APPOINTMENT_COLUMNS = "id,entity_id,title,kind,starts_at,ends_at,timezone,location,notes,status,updated_at";
const blank: ProfileInput = { capitalModality: "Não informado", capitalNotes: "", rateTables: [], collectionNotes: "", newSalesNotes: "", generalNotes: "" };
export const emptyProfile = (): ProfileInput => ({ ...blank, rateTables: [] });
function db() { if (!supabase) throw new Error("Conecte o Supabase para acessar a ficha e a agenda."); return supabase; }
async function ownerId(expectedOwner: string) { const { data, error } = await db().auth.getUser(); if (error || !data.user) throw new Error("Entre na sua conta para acessar a ficha e a agenda."); if (!expectedOwner || data.user.id !== expectedOwner) throw new Error("A sessão mudou. Recarregue a página antes de acessar a ficha ou a agenda."); return data.user.id; }
function identity(owner: string, year: number, entity: RegistryEntity) { return { owner_id: owner, workspace_year: year, entity_id: entity.id, entity_kind: entity.kind, central: entity.central, cooperative: entity.kind === "central" ? null : entity.cooperative ?? null, pa: entity.kind === "pa" ? entity.pa ?? null : null }; }
const profile = (row: ProfileRow): EntityProfile => ({ id: row.id, capitalModality: row.capital_modality, capitalNotes: row.capital_notes, rateTables: row.rate_tables, collectionNotes: row.collection_notes, newSalesNotes: row.new_sales_notes, generalNotes: row.general_notes, updatedAt: row.updated_at });
const appointment = (row: AppointmentRow): EntityAppointment => ({ id: row.id, entityId: row.entity_id, title: row.title, kind: row.kind, startsAt: row.starts_at, endsAt: row.ends_at, timezone: row.timezone, location: row.location, notes: row.notes, status: row.status, updatedAt: row.updated_at });

export async function loadEntityProfile(year: number, entityId: string, expectedOwner: string): Promise<EntityProfile | null> {
  const owner = await ownerId(expectedOwner);
  const { data, error } = await db().from("commercial_entity_profiles").select(PROFILE_COLUMNS).eq("owner_id", owner).eq("workspace_year", year).eq("entity_id", entityId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? profile(data as ProfileRow) : null;
}
export async function saveEntityProfile(year: number, entity: RegistryEntity, input: ProfileInput, expectedOwner: string): Promise<EntityProfile> {
  const clean = validateProfile(input); const owner = await ownerId(expectedOwner);
  const { data, error } = await db().from("commercial_entity_profiles").upsert({ ...identity(owner, year, entity), capital_modality: clean.capitalModality, capital_notes: clean.capitalNotes, rate_tables: clean.rateTables, collection_notes: clean.collectionNotes, new_sales_notes: clean.newSalesNotes, general_notes: clean.generalNotes }, { onConflict: "owner_id,workspace_year,entity_id" }).select(PROFILE_COLUMNS).single();
  if (error) throw new Error(error.message);
  return profile(data as ProfileRow);
}
export async function deleteEntityProfile(year: number, entityId: string, expectedOwner: string): Promise<void> {
  const owner = await ownerId(expectedOwner);
  const { error } = await db().from("commercial_entity_profiles").delete().eq("owner_id", owner).eq("workspace_year", year).eq("entity_id", entityId);
  if (error) throw new Error(error.message);
}
export async function hasEntityRelationships(year: number, entity: RegistryEntity, expectedOwner: string): Promise<boolean> {
  const owner = await ownerId(expectedOwner);
  const results = await Promise.all(["commercial_entity_profiles", "commercial_entity_appointments"].map(async (table) => {
    let query = db().from(table).select("id", { count: "exact", head: true }).eq("owner_id", owner).eq("workspace_year", year).eq("central", entity.central);
    if (entity.kind !== "central") query = query.eq("cooperative", entity.cooperative);
    if (entity.kind === "pa") query = query.eq("pa", entity.pa);
    const { count, error } = await query;
    if (error) throw new Error(error.message);
    return (count ?? 0) > 0;
  }));
  return results.some(Boolean);
}
export async function listEntityAppointments(year: number, entityId: string, expectedOwner: string): Promise<EntityAppointment[]> {
  const owner = await ownerId(expectedOwner);
  const { data, error } = await db().from("commercial_entity_appointments").select(APPOINTMENT_COLUMNS).eq("owner_id", owner).eq("workspace_year", year).eq("entity_id", entityId).order("starts_at");
  if (error) throw new Error(error.message);
  return ((data ?? []) as AppointmentRow[]).map(appointment);
}
export async function saveEntityAppointment(year: number, entity: RegistryEntity, input: AppointmentInput, expectedOwner: string, id?: string): Promise<EntityAppointment> {
  const clean = validateAppointment(input, year); const owner = await ownerId(expectedOwner);
  const payload = { title: clean.title, kind: clean.kind, starts_at: clean.startsAt, ends_at: clean.endsAt, timezone: clean.timezone, location: clean.location, notes: clean.notes, status: clean.status };
  const query = id ? db().from("commercial_entity_appointments").update(payload).eq("owner_id", owner).eq("workspace_year", year).eq("entity_id", entity.id).eq("id", id) : db().from("commercial_entity_appointments").insert({ ...identity(owner, year, entity), ...payload });
  const { data, error } = await query.select(APPOINTMENT_COLUMNS).single(); if (error) throw new Error(error.message);
  return appointment(data as AppointmentRow);
}
export async function deleteEntityAppointment(year: number, entityId: string, id: string, expectedOwner: string): Promise<void> {
  const owner = await ownerId(expectedOwner);
  const { error } = await db().from("commercial_entity_appointments").delete().eq("owner_id", owner).eq("workspace_year", year).eq("entity_id", entityId).eq("id", id);
  if (error) throw new Error(error.message);
}
