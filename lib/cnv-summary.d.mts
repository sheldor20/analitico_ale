export type CnvSourcePage = { field: string; page: number; excerpt: string };
export type CnvSummaryDraft = {
  title: string; year: number; summary: string; products: string[]; goals: string[];
  startDate: string | null; endDate: string | null; periodLabel: string;
  eligibility: string[]; rewards: string[]; importantRules: string[];
  sourcePages: CnvSourcePage[]; needsReview: true; warnings: string[];
};
export function extractCnvSummary(pages: { number: number; text: string }[], filename?: string): CnvSummaryDraft;
export default extractCnvSummary;
