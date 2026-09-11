export function goalVariance(actual: number | null | undefined, target: number | null | undefined, available?: boolean): {
  kind: 'unknown' | 'growth' | 'gap' | 'met'; label: string; value: number | null; ratio: number | null;
};
