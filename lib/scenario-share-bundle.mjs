import { buildCurrentViewModels } from './current-view.mjs';
import { buildScenarioReport } from './scenario-share-presentation.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

/** The overview owns the cohort and order. Each portfolio remains an independent report. */
export function buildScenarioBundleReport({ dataset, filters, kind, unitIdsByMetric, showProjection = false, customization = {} }) {
  if (!['central', 'cooperative', 'pa'].includes(kind)) throw new Error('Selecione um nível válido para compartilhar.');
  const models = buildCurrentViewModels({ dataset, filters: { ...filters, source: kind === 'pa' ? 'cadence' : 'base', level: kind, ...(unitIdsByMetric === undefined ? {} : { unitIdsByMetric }) } });
  const dual = models.length > 1;
  const reports = models.map(model => buildScenarioReport({ dataset, filters: model.filters, kind, mode: 'filtered', currentRows: model.rows, currentPhaseLabel: model.phaseLabel, compact: true, showProjection,
    customization: dual ? { ...customization, intro: '', cta: '' } : customization }));
  const first = reports[0];
  const centralIds = [...new Set(reports.flatMap(report => report.rows.map(row => row.central)))];
  const shared = reports.find(report => report.count) || first;
  const centralName = centralIds.length > 1 ? 'Centrais selecionadas' : shared?.centralName;
  const scopeLabel = centralIds.length > 1 ? `Centrais ${centralIds.join(', ')}` : shared?.scopeLabel;
  if (!first) throw new Error('Nenhuma carteira disponível para compartilhar.');
  if (!dual) return { ...first, reports };
  // Reuse field validation and the same decision text without combining financial values.
  const messages = models.map(model => buildScenarioReport({ dataset, filters: model.filters, kind, mode: 'filtered', currentRows: model.rows, currentPhaseLabel: model.phaseLabel, compact: true, showProjection, customization }));
  const texts = messages[0];
  const subject = customization.subject === undefined ? clean(`${first.title} · Venda Nova e Arrecadação · ${first.periodLabel} | ${scopeLabel}`).slice(0, 300) : texts.subject;
  const intro = texts.intro, messagesCta = [...new Set(messages.map(report => report.cta).filter(Boolean))];
  const cta = messagesCta.length > 1 ? messages.map(report => report.cta ? `${report.metric === 'AR' ? 'Arrecadação' : 'Venda Nova'}: ${report.cta}` : '').filter(Boolean).join(' ') : messagesCta[0] || '';
  const parts = reports.flatMap(report => report.parts);
  const count = new Set(reports.flatMap(report => report.rows.map(row => row.id))).size;
  const text = [intro, ...reports.map(report => report.text), cta].filter(Boolean).join('\n\n');
  const caption = [intro, `${first.title} · Venda Nova e Arrecadação`, centralName, scopeLabel, first.periodLabel, cta].filter(Boolean).join('\n\n');
  const styles = reports.map(report => report.html.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '').join('\n');
  const body = reports.map(report => `<div data-scenario-metric="${report.metric}">${report.html.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1] || ''}</div>`).join('');
  const paragraph = (value, attribute) => value ? `<p ${attribute} style="max-width:1120px;margin:14px auto;padding:0 20px;font:14px/1.5 Arial,sans-serif;color:#003641;overflow-wrap:anywhere">${escape(value).replace(/\n/g, '<br>')}</p>` : '';
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title><style>${styles}</style></head><body style="margin:0;background:#f0f5f3">${paragraph(intro, 'data-communication-intro')}${body}${paragraph(cta, 'data-communication-cta')}</body></html>`;
  return { ...first, centralName, scopeLabel, scope: scopeLabel, unitLabel: '', metric: 'both', reports, rows: reports.flatMap(report => report.rows), parts, count, subject, intro, cta, text, whatsapp: text, caption, html };
}
