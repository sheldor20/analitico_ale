const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
export const DEFAULT_MESSAGE_TEMPLATE = '{{cenario}}';
/** Single-pass substitution: user text and generated values cannot inject more tokens or HTML. */
export function applyMessageTemplate(template, generated, context = {}) {
  const input = String(template ?? DEFAULT_MESSAGE_TEMPLATE);
  if (input.length > 12000) throw new Error('O modelo deve ter até 12 mil caracteres.');
  const values = { cenario: generated, unidade: context.unit || '', ano: String(context.year || ''), periodo: context.period || '' };
  return input.replace(/\{\{(cenario|unidade|ano|periodo)\}\}/g, (_, key) => values[key]);
}
export function templateHtml(template, html, context = {}) {
  if (template === DEFAULT_MESSAGE_TEMPLATE) return html;
  const body = html.match(/(<body\b[^>]*>)([\s\S]*?)(<\/body>)/i);
  if (!body) throw new Error('Painel de e-mail inválido.');
  const content = String(template).split('{{cenario}}').map(part => '<div style="white-space:pre-wrap;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#003641;padding:16px">' + escape(applyMessageTemplate(part, '', context)) + '</div>').join(body[2]);
  return html.replace(body[0], () => body[1] + content + body[3]);
}
