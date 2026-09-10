import { supabase } from "./supabase";
import { normalizeRecipients, whatsappNumber } from "./portfolio-communication.mjs";
import type { PortfolioMessage, PortfolioReport } from "./portfolio-communication.mjs";

export type PortfolioDraft = {
  id: string; created_at: string; subject: string; email_body: string; whatsapp_body: string;
  recipients: string[]; whatsapp_number: string;
};
function db() {
  if (!supabase) throw new Error("Entre na sua conta para salvar os rascunhos.");
  return supabase;
}
async function verifyOwner(owner: string) {
  const { data, error } = await db().auth.getUser();
  if (error || data.user?.id !== owner) throw new Error("A sessão mudou. Entre novamente antes de salvar ou consultar rascunhos.");
}
export async function listPortfolioDrafts(owner: string, year: number, entityId: string): Promise<PortfolioDraft[]> {
  await verifyOwner(owner);
  const { data, error } = await db().from("commercial_communication_drafts")
    .select("id,created_at,subject,email_body,whatsapp_body,recipients,whatsapp_number")
    .eq("owner_id", owner).eq("year", year).eq("entity_id", entityId)
    .order("created_at", { ascending: false }).limit(10);
  if (error) throw new Error("Não foi possível consultar os rascunhos. Verifique sua conexão e a configuração do banco.");
  return (data ?? []) as PortfolioDraft[];
}
export async function savePortfolioDraft(owner: string, report: PortfolioReport, message: PortfolioMessage, recipients: string[], phone: string): Promise<PortfolioDraft> {
  await verifyOwner(owner);
  if (!message.subject.trim() || message.subject.length > 300 || /[\r\n]/.test(message.subject)) throw new Error("Confira o assunto do e-mail.");
  const { data, error } = await db().from("commercial_communication_drafts").insert({
    owner_id: owner, year: report.year, entity_id: report.entity.id, entity_kind: report.entity.kind,
    subject: message.subject, email_body: message.text, email_html: message.html,
    whatsapp_body: message.whatsapp, recipients: normalizeRecipients(recipients),
    whatsapp_number: whatsappNumber(phone), report,
  }).select("id,created_at,subject,email_body,whatsapp_body,recipients,whatsapp_number").single();
  if (error) throw new Error("Não foi possível salvar o rascunho. Nenhuma mensagem foi enviada. Verifique sua conexão e tente novamente.");
  return data as PortfolioDraft;
}
export async function deletePortfolioDraft(owner: string, id: string): Promise<void> {
  await verifyOwner(owner);
  const { error } = await db().from("commercial_communication_drafts").delete().eq("owner_id", owner).eq("id", id);
  if (error) throw new Error("Não foi possível excluir o rascunho.");
}
