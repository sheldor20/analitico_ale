export type AttainmentBand = Readonly<{
  key: 'red' | 'yellow' | 'blue' | 'neutral';
  label: string;
  color: string;
  background: string;
  border: string;
}>;
/** Observed ratio, where 1 = 100%. Pass null for incomplete/inconsistent data. */
export function attainmentBand(value: unknown): AttainmentBand;
