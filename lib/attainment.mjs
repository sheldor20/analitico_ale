/** Presentation bands for observed attainment, expressed as a ratio (1 = 100%).
 * Callers pass null when a result is incomplete or inconsistent. Never use the
 * commercial pace/status or a rounded percentage to choose an attainment band.
 */
const bands = Object.freeze({
  red: Object.freeze({ key: 'red', label: 'Abaixo de 70%', color: '#B42318', background: '#FEF3F2', border: '#FDA29B' }),
  yellow: Object.freeze({ key: 'yellow', label: 'De 70% a menos de 100%', color: '#854D0E', background: '#FEF9C3', border: '#EAB308' }),
  blue: Object.freeze({ key: 'blue', label: '100% ou mais', color: '#175CD3', background: '#EFF8FF', border: '#84CAFF' }),
  neutral: Object.freeze({ key: 'neutral', label: 'Sem avaliação', color: '#526A70', background: '#F3F7F7', border: '#D9E5E6' }),
});

export function attainmentBand(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return bands.neutral;
  return bands[value < 0.7 ? 'red' : value < 1 ? 'yellow' : 'blue'];
}
