import { supabase } from "./supabase";
import type { Dataset } from "./types";

export type WorkspaceSummary = {
  id: string;
  year: number;
  revision: number;
  updatedAt: string;
};

export type SavedWorkspace = WorkspaceSummary & { dataset: Dataset };

export class WorkspaceConflictError extends Error {
  constructor() {
    super(
      "Esta base foi alterada em outra sessão. Recarregue o cadastro salvo e reaplique os ajustes; este envio não sobrescreveu a outra sessão.",
    );
    this.name = "WorkspaceConflictError";
  }
}

function client() {
  if (!supabase)
    throw new Error("Conecte o Supabase para salvar a base fixa da carteira.");
  return supabase;
}

function summary(row: {
  id: string;
  year: number;
  revision: number;
  updated_at: string;
}): WorkspaceSummary {
  return {
    id: row.id,
    year: row.year,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

export async function listWorkspaces(
  userId: string,
): Promise<WorkspaceSummary[]> {
  const { data, error } = await client()
    .from("commercial_workspaces")
    .select("id,year,revision,updated_at")
    .eq("owner_id", userId)
    .order("year", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(summary);
}

export async function loadWorkspace(
  userId: string,
  year: number,
): Promise<SavedWorkspace | null> {
  const { data, error } = await client()
    .from("commercial_workspaces")
    .select("id,year,dataset,revision,updated_at")
    .eq("owner_id", userId)
    .eq("year", year)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { ...summary(data), dataset: data.dataset as Dataset } : null;
}

/** Save exactly the revision the caller loaded; never upsert over another session. */
export async function saveWorkspace(
  userId: string,
  dataset: Dataset,
  expectedRevision: number | null,
  reason = 'Atualização do cadastro',
): Promise<SavedWorkspace> {
  if (
    expectedRevision !== null &&
    (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
  )
    throw new Error("A revisão da base é inválida. Carregue a base novamente.");

  const db = client();
  const query =
    expectedRevision === null
      ? db.from("commercial_workspaces").insert({
          owner_id: userId,
          year: dataset.year,
          dataset,
          revision: 1,
          change_reason: reason,
        })
      : db
          .from("commercial_workspaces")
          .update({ dataset, revision: expectedRevision + 1, change_reason: reason })
          .eq("owner_id", userId)
          .eq("year", dataset.year)
          .eq("revision", expectedRevision);

  const { data, error } = await query
    .select("id,year,dataset,revision,updated_at")
    .maybeSingle();
  if (error) {
    if (error.code === "23505" || error.code === "40001")
      throw new WorkspaceConflictError();
    throw new Error(error.message);
  }
  if (!data) throw new WorkspaceConflictError();
  return { ...summary(data), dataset: data.dataset as Dataset };
}

export type WorkspaceVersion = {revision:number;saved_at:string;archived_at:string;change_reason:string};
export async function listWorkspaceVersions(owner:string,year:number,before?:number):Promise<WorkspaceVersion[]> {
 let query=client().from('commercial_workspace_versions').select('revision,saved_at,archived_at,change_reason').eq('owner_id',owner).eq('workspace_year',year).order('revision',{ascending:false}).limit(20);
 if(before)query=query.lt('revision',before);
 const {data,error}=await query;if(error)throw new Error(error.message);return data||[];
}
export async function readWorkspaceVersion(owner:string,year:number,revision:number):Promise<Dataset> {
 const {data,error}=await client().from('commercial_workspace_versions').select('dataset').eq('owner_id',owner).eq('workspace_year',year).eq('revision',revision).single();
 if(error)throw new Error(error.message);return data.dataset as Dataset;
}
