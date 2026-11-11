export type ProposalStatus = 'cancelled' | 'inReview' | 'pending' | 'rejected' | 'accepted';
export type ForecastStatus = Exclude<ProposalStatus, 'accepted'>;
export type ProposalAmounts = Record<ProposalStatus, number>;
export type ProposalForecast = Record<ForecastStatus, number | null>;
export type ProposalPositionDraft = {
  year: number;
  positionDate: string | null;
  accumulatedSinceJanuary: boolean;
  amounts: Record<string, ProposalAmounts>;
};
export type ProposalPosition = ProposalPositionDraft & { revision: number };
export type ProposalProjection = {
  totals: ProposalAmounts;
  projected: ProposalForecast;
  rows: { code: string; actual: ProposalAmounts; forecast: ProposalForecast }[];
  closed: boolean;
};
export const PROPOSAL_LABELS: Readonly<Record<ProposalStatus, string>>;
export const PROPOSAL_STATUSES: ProposalStatus[];
export const FORECAST_STATUSES: ForecastStatus[];
export function parseProposalPaste(text: string): Record<string, ProposalAmounts>;
export function sumProposalAmounts(amounts: Record<string, ProposalAmounts>): ProposalAmounts;
export function validateProposalDate(year: number, positionDate: string | null, accumulatedSinceJanuary: boolean): void;
export function buildProposalProjection(position: ProposalPositionDraft, cooperative?: string, resolution?: Partial<Record<'inReview' | 'pending', string>>): ProposalProjection;
