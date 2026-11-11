import { supabase } from './supabase';
import { validateProposalDate, type ProposalPosition, type ProposalPositionDraft } from './proposal-status.mjs';

const TABLE = 'commercial_proposal_positions';
const COLUMNS = 'year,position_date,accumulated_since_january,amounts,revision';
type ProposalRow = {
  year: number;
  position_date: string | null;
  accumulated_since_january: boolean;
  amounts: ProposalPosition['amounts'];
  revision: number;
};

function position(row: ProposalRow): ProposalPosition {
  return {
    year: row.year, positionDate: row.position_date, accumulatedSinceJanuary: row.accumulated_since_january,
    amounts: row.amounts, revision: row.revision,
  };
}

async function clientFor(owner: string) {
  if (!supabase) throw new Error('Não foi possível conectar ao painel de propostas.');
  const { data, error } = await supabase.auth.getUser();
  if (error || data.user?.id !== owner) throw new Error('A sessão mudou. Entre novamente para acessar as propostas.');
  return supabase;
}

export async function loadProposalPosition(owner: string, year: number): Promise<ProposalPosition | null> {
  const client = await clientFor(owner);
  const { data, error } = await client.from(TABLE).select(COLUMNS).eq('owner_id', owner).eq('year', year).maybeSingle();
  if (error) throw new Error('Não foi possível carregar a base de propostas. Tente novamente.');
  return data ? position(data) : null;
}

export async function saveProposalPosition(owner: string, draft: ProposalPositionDraft, revision: number | null): Promise<ProposalPosition> {
  validateProposalDate(draft.year, draft.positionDate, draft.accumulatedSinceJanuary);
  const client = await clientFor(owner);
  const values = { position_date: draft.positionDate, accumulated_since_january: draft.accumulatedSinceJanuary, amounts: draft.amounts };
  const table = client.from(TABLE);
  const write = revision === null
    ? table.insert({ ...values, owner_id: owner, year: draft.year })
    : table.update(values).eq('owner_id', owner).eq('year', draft.year).eq('revision', revision);
  const { data, error } = await write.select(COLUMNS).maybeSingle();
  if (error?.code === '23505' || !error && !data) throw new Error('A base foi alterada em outra sessão. Recarregue o painel antes de salvar.');
  if (error || !data) throw new Error('Não foi possível salvar a base de propostas. Tente novamente.');
  return position(data);
}
