export type ManagementPriorityKind = 'review' | 'pace' | 'near-goal' | 'production';
export type ManagementAnalysis = {
  key: string; source: string; metric: string; name?: string; central?: string;
  cooperative?: string; pa?: string | null; cutoff: string; cutoffMin?: string;
  start: string; end: string; actual: number | null; target: number | null;
  expected: number; complete: boolean; annualConflict?: boolean;
  remainingDays: number; phase: string;
};
export type ManagementPriorityAction = {
  kind: ManagementPriorityKind; keys: string[]; status: 'all';
  sortBy: 'gap' | 'attainment-desc' | 'production' | 'name';
};
export type ManagementPriority = {
  kind: ManagementPriorityKind; title: string; detail: string;
  tone: 'warning' | 'positive' | 'neutral'; notes: string[];
  rows: { key: string; name: string; context: string; cutoff: string; detail: string }[];
  action: ManagementPriorityAction;
};
export function buildManagementPriorities(analyses?: ManagementAnalysis[]): {
  items: ManagementPriority[]; additional: ManagementPriority[]; notes: string[]; empty: string;
};
