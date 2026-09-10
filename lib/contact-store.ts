import { supabase } from "./supabase";
import { normalizeContactEmails, normalizeWhatsapp } from "./contact-utils.mjs";
import type { RegistryEntity } from "./types";

export type ResponsibleContact = {
  id: string;
  ownerId: string;
  workspaceYear: number;
  entityId: string;
  entityKind: RegistryEntity["kind"];
  central: string;
  cooperative: string | null;
  pa: string | null;
  name: string;
  jobTitle: string;
  teams: string;
  whatsapp: string;
  emails: string[];
  createdAt: string;
  updatedAt: string;
};

export type ResponsibleContactInput = {
  name: string;
  jobTitle: string;
  teams: string;
  whatsapp: string;
  emails: string[];
};

type ContactRow = {
  id: string;
  owner_id: string;
  workspace_year: number;
  entity_id: string;
  entity_kind: RegistryEntity["kind"];
  central: string;
  cooperative: string | null;
  pa: string | null;
  name: string;
  job_title: string;
  teams: string;
  whatsapp: string;
  emails: string[];
  created_at: string;
  updated_at: string;
};

function db() {
  if (!supabase) throw new Error("Conecte o Supabase para salvar os responsáveis.");
  return supabase;
}

async function ownerId() {
  const { data, error } = await db().auth.getUser();
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Entre na sua conta para cadastrar responsáveis.");
  return data.user.id;
}

function mapRow(row: ContactRow): ResponsibleContact {
  return {
    id: row.id,
    ownerId: row.owner_id,
    workspaceYear: row.workspace_year,
    entityId: row.entity_id,
    entityKind: row.entity_kind,
    central: row.central,
    cooperative: row.cooperative,
    pa: row.pa,
    name: row.name,
    jobTitle: row.job_title,
    teams: row.teams,
    whatsapp: row.whatsapp,
    emails: row.emails ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function clean(input: ResponsibleContactInput) {
  const name = input.name.trim();
  const jobTitle = input.jobTitle.trim();
  const teams = input.teams.trim();
  if (!name) throw new Error("Informe o nome do responsável.");
  if (name.length > 160) throw new Error("Nome deve ter no máximo 160 caracteres.");
  if (jobTitle.length > 160) throw new Error("Cargo deve ter no máximo 160 caracteres.");
  if (teams.length > 300) throw new Error("Teams deve ter no máximo 300 caracteres.");
  return { name, job_title: jobTitle, teams, whatsapp: normalizeWhatsapp(input.whatsapp), emails: normalizeContactEmails(input.emails) };
}

export async function listResponsibleContacts(year: number, entityId: string): Promise<ResponsibleContact[]> {
  const owner = await ownerId();
  const { data, error } = await db()
    .from("commercial_entity_contacts")
    .select("id,owner_id,workspace_year,entity_id,entity_kind,central,cooperative,pa,name,job_title,teams,whatsapp,emails,created_at,updated_at")
    .eq("owner_id", owner)
    .eq("workspace_year", year)
    .eq("entity_id", entityId)
    .order("name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as ContactRow[]).map(mapRow);
}

export async function saveResponsibleContact(year: number, entity: RegistryEntity, input: ResponsibleContactInput, contactId?: string): Promise<ResponsibleContact> {
  const owner = await ownerId();
  const payload = clean(input);
  const query = contactId
    ? db().from("commercial_entity_contacts").update(payload).eq("id", contactId).eq("owner_id", owner).eq("workspace_year", year).eq("entity_id", entity.id)
    : db().from("commercial_entity_contacts").insert({
        owner_id: owner,
        workspace_year: year,
        entity_id: entity.id,
        entity_kind: entity.kind,
        central: entity.central,
        cooperative: entity.kind === "central" ? null : entity.cooperative ?? null,
        pa: entity.kind === "pa" ? entity.pa ?? null : null,
        ...payload,
      });
  const { data, error } = await query
    .select("id,owner_id,workspace_year,entity_id,entity_kind,central,cooperative,pa,name,job_title,teams,whatsapp,emails,created_at,updated_at")
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as ContactRow);
}

export async function deleteResponsibleContact(year: number, entityId: string, contactId: string): Promise<void> {
  const owner = await ownerId();
  const { error } = await db().from("commercial_entity_contacts").delete().eq("id", contactId).eq("owner_id", owner).eq("workspace_year", year).eq("entity_id", entityId);
  if (error) throw new Error(error.message);
}
