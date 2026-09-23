import { CENTRALS } from './analytics.mjs';

export function centralHeading(central, name = '') {
  return String(name || CENTRALS[central] || (central ? `Central ${central}` : 'Centrais selecionadas')).replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function metricHeading(metrics = []) {
  const codes = new Set(metrics.map(value => /arrecada|^AR$/i.test(value) ? 'AR' : /venda nova|^VN$/i.test(value) ? 'VN' : ''));
  return [codes.has('VN') ? 'Venda nova' : '', codes.has('AR') ? 'Arrecadação' : ''].filter(Boolean).join(' · ');
}
export const communicationBrand = metricLabel => `Gestão comercial${metricLabel ? ` · ${metricLabel}` : ''}`;
