export type Metric = "VN" | "AR";
export type DataRow = {
  key: string;
  source: "base" | "cadence";
  central: string;
  centralName?: string;
  cooperative: string;
  cooperativeName: string;
  pa: string | null;
  group: string;
  name: string;
  metric: Metric;
  targets: (number | null)[];
  actuals: (number | null)[];
  annualTarget: number | null;
  targetRule?: "source" | "group-fixed" | "manual" | "registry";
  manualActualMonths?: number[];
  cutoffMin?: string;
  sourceMonthlyTarget?: number | null;
  sourceAnnualTarget?: number | null;
  cutoff: string;
  sourceFile: string;
  sheet: string;
  sourceRow: number;
};
export type ImportConfig = {
  year: number;
  vnCutoff: string;
  arCutoff: string;
  cadenceCutoff: string;
  allowedCentrals?: string[];
};
export type RegistryEntity = {
  id: string;
  kind: "central" | "cooperative" | "pa";
  central: string;
  cooperative?: string;
  pa?: string;
  name: string;
  group?: string;
};
export type PlanRowInput = {
  entityId: string;
  metric: Metric;
  annualTarget?: number | null;
  targets?: (number | null)[];
  actuals?: (number | null)[];
  cutoff?: string;
};
export type Issue = {
  kind: string;
  message: string;
  central?: string;
  cooperative?: string;
  month?: number;
  difference?: number;
};
export type Dataset = {
  version: number;
  year: number;
  importedAt: string;
  config: ImportConfig;
  registry?: { version: 1; entities: RegistryEntity[]; updatedAt: string };
  paTargetPolicy?: {
    version: string;
    groups: Record<string, { monthly: number; annual: number }>;
  };
  rows: DataRow[];
  issues: Issue[];
  sources: { filename: string; type: string; rows: number; skipped: number }[];
};
export type ActionState = {
  owner: string;
  due: string;
  status: "Aberta" | "Em andamento" | "Concluída";
  notes: string;
};
