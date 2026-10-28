/** One monetary contract for calculations, thresholds and outgoing reports. */
export function cents(value) {
  if (!Number.isFinite(value)) throw new Error('Valor monetário inválido.');
  const scaled=value*100;
  if(Number.isSafeInteger(scaled))return scaled;
  // Round the decimal representation, including ties such as 10.075, symmetrically.
  const [coefficient,exponent='0']=Math.abs(value).toString().split('e');
  const fraction=(coefficient.split('.')[1]||'').length;
  const digits=BigInt(coefficient.replace('.','')),shift=2+Number(exponent)-fraction;
  const divisor=shift<0?10n**BigInt(-shift):1n;
  const rounded=shift>=0?digits*10n**BigInt(shift):(digits+divisor/2n)/divisor;
  if(rounded>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Valor acima do limite de precisão monetária.');
  return (value<0?-1:1)*Number(rounded);
}
export const roundMoney = value => cents(value) / 100;
export function sumMoney(values) {
  const total = values.reduce((total, value) => total + BigInt(cents(value ?? 0)), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('Total acima do limite de precisão monetária.');
  return Number(total) / 100;
}
export function comparableObservation(rows) {
  if (!rows.length) return false;
  const dates = new Set(rows.flatMap(row => [row.cutoffMin || row.cutoff, row.cutoff].map(date => row.end && date > row.end ? row.end : date)));
  return dates.size === 1 && !dates.has(undefined) && !dates.has('');
}
