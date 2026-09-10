import { validateDashboard } from './portfolio-presentation.mjs';

/** No DOM screenshot, foreignObject, remote rendering, or third-party uploads. */
export function dashboardImageLayout(model, context) {
  validateDashboard(model);
  const commands = [], width = 1080, inset = 48, contentWidth = width - inset * 2;
  let y = 40;
  const rect = (x, top, w, h, fill) => commands.push({ type: 'rect', x, y: top, width: w, height: h, fill });
  function lines(value, maxWidth, size, bold) {
    context.font = `${bold ? '700' : '400'} ${size}px Arial`;
    const result = [];
    for (const paragraph of String(value).split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (context.measureText(`${line}${line ? ' ' : ''}${word}`).width <= maxWidth) { line += `${line ? ' ' : ''}${word}`; continue; }
        if (line) { result.push(line); line = ''; }
        // Split an exceptionally long name/token by code point, never clip it.
        for (const char of word) {
          if (line && context.measureText(line + char).width > maxWidth) { result.push(line); line = ''; }
          line += char;
        }
      }
      result.push(line);
    }
    return result;
  }
  function text(value, x, top, maxWidth, size = 27, bold = false, fill = '#003641') {
    const wrapped = lines(value, maxWidth, size, bold);
    const step = Math.ceil(size * 1.42);
    wrapped.forEach((line, i) => commands.push({ type: 'text', value: line, x, y: top + i * step, size, bold, fill }));
    return wrapped.length * step;
  }
  const headerIndex = commands.length;
  rect(0, 0, width, 100, '#003641');
  y += text('GESTÃO COMERCIAL', inset, y, contentWidth, 22, true, '#8fdbcf') + 18;
  y += text(model.scope, inset, y, contentWidth, 38, true, '#ffffff') + 16;
  y += text(model.periodLabel, inset, y, contentWidth, 32, true, '#ffffff') + 14;
  y += text(model.hierarchy, inset, y, contentWidth, 23, false, '#ffffff') + 30;
  commands[headerIndex].height = y;
  y += 28;
  y += text(model.greeting, inset, y, contentWidth, 29, true) + 12;
  y += text(model.opening, inset, y, contentWidth) + 14;
  for (const note of model.notes) y += text(note, inset, y, contentWidth, 24, false, '#435c60') + 12;
  for (const b of model.blocks) {
    if (b.type === 'heading') { y += 24; y += text(b.text, inset, y, contentWidth, 34, true) + 14; }
    else if (b.type === 'text') {
      const special = ['action', 'warning'].includes(b.tone), padding = special ? 22 : 0, top = y;
      const index = commands.length;
      if (special) rect(inset, y, contentWidth, 1, b.tone === 'action' ? '#e6f6f2' : '#fff8e7');
      y += padding + text(b.text, inset + padding, y + padding, contentWidth - padding * 2, b.tone === 'muted' ? 23 : 27, b.tone === 'action', b.tone === 'warning' ? '#704700' : b.tone === 'muted' ? '#435c60' : '#003641') + padding;
      if (special) commands[index].height = y - top;
      y += 16;
    } else if (b.type === 'cards') {
      const gap = 12, w = (contentWidth - gap) / 2;
      for (let i = 0; i < b.items.length; i += 2) {
        const pair = b.items.slice(i, i + 2);
        const h = Math.max(...pair.map((item) => lines(item.label, w - 36, 23, false).length * 33 + lines(item.value, w - 36, 36, true).length * 52 + 50));
        pair.forEach((item, col) => {
          const x = inset + col * (w + gap);
          rect(x, y, w, h, '#f0f7f4');
          const labelHeight = text(item.label, x + 18, y + 20, w - 36, 23, false, '#435c60');
          text(item.value, x + 18, y + 30 + labelHeight, w - 36, 36, true);
        });
        y += h + gap;
      }
      y += 6;
    } else if (b.type === 'secondary') {
      y += 18; const top = y, index = commands.length;
      rect(inset, y, contentWidth, 1, '#f4f6f5');
      y += 20 + text(b.title, inset + 20, y + 20, contentWidth - 40, 25, true, '#435c60') + 12;
      for (const line of b.lines) y += text(line, inset + 20, y, contentWidth - 40, 23, false, '#435c60') + 10;
      y += 12; commands[index].height = y - top; y += 20;
    } else if (b.type === 'table') {
      y += 12; y += text(b.title, inset, y, contentWidth, 26, true) + 14;
      const widths = [0.12, 0.28, 0.28, 0.32].map((fraction) => fraction * contentWidth);
      [b.headers, ...b.rows].forEach((row, index) => {
        const h = Math.max(...row.map((v, col) => lines(v, widths[col] - 24, 22, index === 0).length * 32 + 26));
        rect(inset, y, contentWidth, h, index === 0 ? '#003641' : index % 2 ? '#f5faf8' : '#ffffff');
        let x = inset;
        row.forEach((v, col) => { text(v, x + 12, y + 13, widths[col] - 24, 22, index === 0, index === 0 ? '#ffffff' : '#003641'); x += widths[col]; });
        y += h;
      });
      y += 18;
    }
  }
  y += text(model.footer, inset, y + 8, contentWidth, 21, false, '#435c60') + 22;
  if (model.signature) y += text(model.signature, inset, y, contentWidth, 25) + 16;
  const height = Math.ceil(y + 32);
  if (height > 12000) throw new Error('O painel ficou muito longo para uma imagem. Reduza a abertura ou a assinatura e tente novamente. O e-mail completo continua disponível.');
  return { width, height, commands };
}

export async function renderDashboardPng(model) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Este navegador não conseguiu gerar a imagem. Use o painel HTML ou outro navegador.');
  const layout = dashboardImageLayout(model, context);
  canvas.width = layout.width; canvas.height = layout.height;
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.textBaseline = 'top';
  for (const c of layout.commands) {
    context.fillStyle = c.fill;
    if (c.type === 'rect') context.fillRect(c.x, c.y, c.width, c.height);
    else { context.font = `${c.bold ? '700' : '400'} ${c.size}px Arial`; context.fillText(c.value, c.x, c.y); }
  }
  try {
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Não foi possível gerar a imagem. Tente novamente.')), 'image/png'));
  } finally { canvas.width = 1; canvas.height = 1; }
}
