export type Metric = "VN" | "AR";
export type DataRow = {
  key: string;
  source: "base" | "cadence";
  central: string;
  cooperative: string;
  cooperativeName: string;
  pa: string | null;
  group: string;
  name: string;
  metric: Metric;
  targets: (number | null)[];
  actuals: (number | null)[];
  annualTarget: number | null;
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
