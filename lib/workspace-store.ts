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
        })
      : db
          .from("commercial_workspaces")
          .update({ dataset, revision: expectedRevision + 1 })
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
