import { supabase } from './supabase';

export type CnvSourcePage = { field: string; page: number; excerpt: string };
export type CnvDraft = {
  title: string; year: number; summary: string; products: string[]; goals: string[];
  startDate: string | null; endDate: string | null; periodLabel: string;
  eligibility: string[]; rewards: string[]; importantRules: string[];
  sourcePages?: CnvSourcePage[]; needsReview?: boolean; warnings?: string[];
};
export type CnvAction = {
  id: string; details: CnvDraft; filename: string; path: string; fileHash: string;
  pageCount: number; revision: number; createdAt: string; updatedAt: string;
};
type CnvRow = {
  id: string; owner_id: string; details: CnvDraft; filename: string; storage_path: string;
  file_sha256: string; page_count: number; revision: number; created_at: string; updated_at: string;
};

export const CNV_PDF_LIMIT_BYTES = 20 * 1024 * 1024;
export const CNV_STORAGE_BUCKET = 'commercial-cnv-regulations';
const COLUMNS = 'id,owner_id,details,filename,storage_path,file_sha256,page_count,revision,created_at,updated_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ARRAY_FIELDS = ['products', 'goals', 'eligibility', 'rewards', 'importantRules'] as const;

function db() {
  if (!supabase) throw new Error('Conecte o Supabase para acessar as ações CNV.');
  return supabase;
}
async function ownerId(expectedOwner: string) {
  const { data, error } = await db().auth.getUser();
  if (error || !data.user || !UUID.test(expectedOwner) || data.user.id !== expectedOwner)
    throw new Error('A sessão mudou. Entre novamente antes de acessar as ações CNV.');
  return data.user.id;
}
function date(value: string | null) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value)
    throw new Error('Informe uma data válida para o período da ação.');
  return value;
}
function text(value: unknown, label: string, max: number, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    throw new Error(`Revise o campo ${label}.`);
  return value.trim();
}
export function validateCnvDraft(input: CnvDraft): CnvDraft {
  if (!input || !Number.isInteger(input.year) || input.year<2020 || input.year>2100) throw new Error('Informe um ano de campanha entre 2020 e 2100.');
  if (input.needsReview !== false) throw new Error('Revise o resumo e confirme a conferência com o regulamento antes de salvar.');
  const startDate = date(input.startDate), endDate = date(input.endDate);
  if (startDate && endDate && endDate < startDate) throw new Error('O fim da ação deve ser igual ou posterior ao início.');
  const clean: CnvDraft = {
    title: text(input.title, 'nome da ação', 200, true), year: input.year,
    summary: text(input.summary, 'resumo', 6000, true),
    periodLabel: text(input.periodLabel, 'período', 600), startDate, endDate,
    products: [], goals: [], eligibility: [], rewards: [], importantRules: [], needsReview: false,
  };
  for (const field of ARRAY_FIELDS) {
    if (!Array.isArray(input[field]) || input[field].length > 60) throw new Error(`Revise o campo ${field}.`);
    clean[field] = input[field].map(value => text(value, field, 4000, true));
  }
  if (input.warnings) {
    if (!Array.isArray(input.warnings) || input.warnings.length > 30) throw new Error('Há avisos demais no resumo.');
    clean.warnings = input.warnings.map(value => text(value, 'avisos', 4000, true));
  }
  if (input.sourcePages) {
    if (!Array.isArray(input.sourcePages) || input.sourcePages.length > 120) throw new Error('Há referências demais no resumo.');
    clean.sourcePages = input.sourcePages.map(source => {
      if (!source || !Number.isInteger(source.page) || source.page < 1 || source.page > 200) throw new Error('A referência de página é inválida.');
      return { field: text(source.field, 'referência', 100, true), page: source.page, excerpt: text(source.excerpt, 'trecho do regulamento', 1200) };
    });
  }
  if (new TextEncoder().encode(JSON.stringify(clean)).byteLength > 90000) throw new Error('O resumo é muito extenso. Reduza os textos antes de salvar.');
  return clean;
}
function canonicalPath(owner: string, id: string) {
  if (!UUID.test(owner) || !UUID.test(id)) throw new Error('A identificação da ação é inválida.');
  return `${owner}/${id}/regulamento.pdf`;
}
function action(row: CnvRow, owner: string): CnvAction {
  if (row.owner_id !== owner || row.storage_path !== canonicalPath(owner, row.id)) throw new Error('O regulamento não corresponde à sua conta.');
  return { id: row.id, details: row.details, filename: row.filename, path: row.storage_path,
    fileHash: row.file_sha256, pageCount: row.page_count, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at };
}
async function currentAction(expectedOwner: string, item: CnvAction) {
  const owner = await ownerId(expectedOwner);
  if (item.path !== canonicalPath(owner, item.id)) throw new Error('O regulamento não corresponde à sua conta.');
  const { data, error } = await db().from('commercial_cnv_actions').select(COLUMNS).eq('owner_id', owner).eq('id', item.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('A ação não está mais disponível. Atualize a lista.');
  await ownerId(expectedOwner);
  return action(data as CnvRow, owner);
}
export async function listCnvActions(expectedOwner: string): Promise<CnvAction[]> {
  const owner = await ownerId(expectedOwner), items: CnvAction[] = [];
  let cursor = '';
  for (;;) {
    let query = db().from('commercial_cnv_actions').select(COLUMNS).eq('owner_id', owner).order('id').limit(200);
    if (cursor) query = query.gt('id', cursor);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as CnvRow[];
    if (!rows.length) break;
    const next = rows[rows.length - 1].id;
    if (next <= cursor) throw new Error('Não foi possível carregar a lista completa de ações.');
    items.push(...rows.map(row => action(row, owner))); cursor = next;
  }
  await ownerId(expectedOwner);
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function createCnvAction(expectedOwner: string, draft: CnvDraft, file: File, pageCount: number, fileHash: string): Promise<CnvAction> {
  const details = validateCnvDraft(draft), owner = await ownerId(expectedOwner);
  if (!file || !/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf') || !file.size || file.size > CNV_PDF_LIMIT_BYTES)
    throw new Error('Selecione um PDF de até 20 MB.');
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 200) throw new Error('O regulamento deve ter de 1 a 200 páginas.');
  const header = new TextDecoder('ascii').decode(await file.slice(0, 1024).arrayBuffer());
  if (!header.includes('%PDF-')) throw new Error('O arquivo selecionado não é um PDF válido.');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), value => value.toString(16).padStart(2, '0')).join('');
  if (!/^[a-f0-9]{64}$/.test(fileHash) || hash !== fileHash) throw new Error('O arquivo mudou durante a importação. Selecione o PDF novamente.');
  const { data: duplicate, error: duplicateError } = await db().from('commercial_cnv_actions').select('id').eq('owner_id', owner).eq('file_sha256', hash).maybeSingle();
  if (duplicateError) throw new Error(duplicateError.message);
  if (duplicate) throw new Error('Este regulamento já foi cadastrado nesta conta. Abra a ação existente para revisá-la.');
  await ownerId(expectedOwner);
  const id = crypto.randomUUID(), path = canonicalPath(owner, id);
  const { error: uploadError } = await db().storage.from(CNV_STORAGE_BUCKET).upload(path, file, { contentType: 'application/pdf', cacheControl: '0', upsert: false });
  if (uploadError) throw new Error(uploadError.message);
  let inserted = false, insertStarted = false, definitelyRejected = false;
  try {
    await ownerId(expectedOwner);
    const filename = file.name.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 220);
    insertStarted = true;
    const { data, error } = await db().from('commercial_cnv_actions').insert({ id, owner_id: owner, year: details.year, title: details.title, details, filename,
      storage_path: path, file_sha256: hash, page_count: pageCount }).select(COLUMNS).single();
    if (error) {
      // A PostgreSQL rejection aborts the write. A lost HTTP response does not
      // establish whether the insert committed, so its original is retained.
      definitelyRejected = /^[0-9A-Z]{5}$/.test(error.code ?? '');
      throw new Error(error.code === '23505' ? 'Este regulamento já foi cadastrado nesta conta.' : error.message);
    }
    inserted = true;
    await ownerId(expectedOwner);
    return action(data as CnvRow, owner);
  } catch (error) {
    if (!inserted) {
      try {
        await ownerId(expectedOwner);
        const { data: committed, error: lookupError } = await db().from('commercial_cnv_actions').select('id')
          .eq('owner_id', owner).eq('id', id).maybeSingle();
        await ownerId(expectedOwner);
        // Retain private files whenever read/write outcome or session is ambiguous.
        if (!lookupError && !committed && (!insertStarted || definitelyRejected))
          await db().storage.from(CNV_STORAGE_BUCKET).remove([path]);
      } catch { /* A private orphan is preferable to deleting a committed original. */ }
    }
    throw error;
  }
}
export async function updateCnvAction(expectedOwner: string, item: CnvAction, draft: CnvDraft): Promise<CnvAction> {
  const details = validateCnvDraft(draft), owner = await ownerId(expectedOwner);
  if (item.path !== canonicalPath(owner, item.id)) throw new Error('A ação não corresponde à sua conta.');
  const { data, error } = await db().from('commercial_cnv_actions').update({ title: details.title, details, revision: item.revision + 1 })
    .eq('owner_id', owner).eq('id', item.id).eq('revision', item.revision).select(COLUMNS).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Esta ação foi alterada em outra janela. Recarregue a lista antes de salvar.');
  await ownerId(expectedOwner);
  return action(data as CnvRow, owner);
}
export async function deleteCnvAction(expectedOwner: string, item: CnvAction): Promise<void> {
  const owner = await ownerId(expectedOwner);
  const path = canonicalPath(owner, item.id);
  if (item.path !== path) throw new Error('A ação não corresponde à sua conta.');
  const { data, error } = await db().from('commercial_cnv_actions').delete().eq('owner_id', owner).eq('id', item.id).eq('revision', item.revision).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) {
    // A prior attempt may have deleted the row and failed during Storage cleanup.
    // An existing row instead means the supplied revision is stale: keep its PDF.
    await ownerId(expectedOwner);
    const { data: existing, error: lookupError } = await db().from('commercial_cnv_actions').select('id,revision')
      .eq('owner_id', owner).eq('id', item.id).maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    await ownerId(expectedOwner);
    if (existing) throw new Error('Esta ação mudou em outra janela. Atualize a lista antes de excluir.');
  }
  await ownerId(expectedOwner);
  try {
    const { error: cleanupError } = await db().storage.from(CNV_STORAGE_BUCKET).remove([path]);
    if (cleanupError) throw new Error(cleanupError.message);
  } catch {
    throw new Error('A ação foi excluída, mas a limpeza do PDF não terminou. Clique em Confirmar exclusão novamente para tentar remover o arquivo.');
  }
  await ownerId(expectedOwner);
}
export async function getCnvPdf(expectedOwner: string, item: CnvAction): Promise<Blob> {
  const current = await currentAction(expectedOwner, item);
  const { data, error } = await db().storage.from(CNV_STORAGE_BUCKET).download(current.path);
  if (error || !data) throw new Error(error?.message ?? 'Não foi possível abrir o regulamento.');
  await ownerId(expectedOwner);
  return data;
}
/** Called only after the user explicitly chooses to share the private PDF. */
export async function createCnvShareLink(expectedOwner: string, item: CnvAction): Promise<{ url: string; expiresAt: string }> {
  const current = await currentAction(expectedOwner, item);
  const seconds = 24 * 60 * 60, expiresAt = new Date(Date.now() + seconds * 1000).toISOString();
  const { data, error } = await db().storage.from(CNV_STORAGE_BUCKET).createSignedUrl(current.path, seconds, { download: current.filename });
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Não foi possível preparar o link do regulamento.');
  await ownerId(expectedOwner);
  return { url: data.signedUrl, expiresAt };
}
