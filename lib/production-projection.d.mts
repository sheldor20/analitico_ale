export type ProductionProjection = { value: number | null; attainment: number | null; phase: string; assumption: string };
export function projectionDetails(values: { complete?: boolean; annualConflict?: boolean; projected?: number | null; projectedAttainment?: number | null; phase?: string }, uplift?: number): ProductionProjection;
