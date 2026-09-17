import { validateDashboard } from './portfolio-presentation.mjs';

/** No DOM screenshot, foreignObject, remote rendering, or third-party uploads. */
export function dashboardImageLayout(model, context) {
  validateDashboard(model);
  const commands = [], width = 1080, inset = 48, contentWidth = width - inset * 2;
  let y = 40;
  const rect = (x, top, w, h, fill) => commands.push({ type: 'rect', x, y: top, width: w, height: h, fill });
  function lines(value, maxWidth, size, bold) {
    context.font = `${bold ? '700' : '400'} ${size}px "Sicoob Sans", Arial`;
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
  const monetary = (value) => /^[−-]?R\$\s*[−-]?\d[\d.,]*$/.test(String(value));
  const amountText = (value) => String(value).replace(/\s+/g, ' ');
  function fittedValueSize(items, maxWidth) {
    // A monetary amount is indivisible: add room instead of splitting its cents.
    for (let size = 36; size >= 26; size--) {
      context.font = `700 ${size}px "Sicoob Sans", Arial`;
      if (items.every((item) => !monetary(item.value) || context.measureText(amountText(item.value)).width <= maxWidth)) return size;
    }
    return null;
  }
  function valueText(value, x, top, maxWidth, size, fill) {
    if (!monetary(value)) return text(value, x, top, maxWidth, size, true, fill);
    context.font = `700 ${size}px "Sicoob Sans", Arial`;
    const amount = amountText(value);
    if (context.measureText(amount).width > maxWidth) throw new Error('Um valor é extenso demais para a imagem. Confira o valor cadastrado ou use o painel HTML.');
    commands.push({ type: 'text', value: amount, x, y: top, size, bold: true, fill });
    return Math.ceil(size * 1.42);
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
      const gap = 12;
      for (let i = 0; i < b.items.length;) {
        const groupEnd = i < 3 ? Math.min(3, b.items.length) : b.items.length;
        let columns = Math.min(3, groupEnd - i);
        while (columns > 1 && fittedValueSize(b.items.slice(i, i + columns), (contentWidth - gap * (columns - 1)) / columns - 36) == null) columns--;
        const row = b.items.slice(i, i + columns);
        const projectionSize = fittedValueSize(row, 330);
        if (i >= 3 && row.length === 1 && projectionSize != null) {
          // Optional fourth KPI (projection) is secondary to the three results.
          const item = row[0], top = y, index = commands.length;
          rect(inset, top, contentWidth, 1, item.accent ? '#003641' : '#f0f7f4');
          const widths = [250, 330, contentWidth - 36 - 250 - 330 - 32];
          const labelHeight = text(item.label, inset + 18, top + 18, widths[0], 23, false, item.accent ? '#c4dedf' : '#435c60');
          const valueHeight = valueText(item.value, inset + 18 + widths[0] + 16, top + 18, widths[1], projectionSize, item.accent ? '#ffffff' : '#003641');
          const supportHeight = item.support ? text(item.support, inset + 18 + widths[0] + widths[1] + 32, top + 18, widths[2], 24, !!item.accent, item.accent ? '#ffffff' : '#435c60') : 0;
          const h = Math.max(labelHeight, valueHeight, supportHeight) + 36;
          commands[index].height = h; y += h + gap; i += columns; continue;
        }
        const w = (contentWidth - gap * (row.length - 1)) / row.length;
        const valueSize = fittedValueSize(row, w - 36);
        if (valueSize == null) throw new Error('Um valor é extenso demais para a imagem. Confira o valor cadastrado ou use o painel HTML.');
        const labelHeight = Math.max(...row.map((item) => lines(item.label, w - 36, 23, false).length * Math.ceil(23 * 1.42)));
        const valueHeight = Math.max(...row.map((item) => (monetary(item.value) ? 1 : lines(item.value, w - 36, valueSize, true).length) * Math.ceil(valueSize * 1.42)));
        const supportHeight = Math.max(...row.map((item) => item.support ? lines(item.support, w - 36, 26, !!item.accent).length * Math.ceil(26 * 1.42) : 0));
        const h = 40 + labelHeight + valueHeight + (supportHeight ? supportHeight + 12 : 0);
        row.forEach((item, col) => {
          const x = inset + col * (w + gap);
          rect(x, y, w, h, item.accent ? '#003641' : '#f0f7f4');
          text(item.label, x + 18, y + 18, w - 36, 23, false, item.accent ? '#c4dedf' : '#435c60');
          valueText(item.value, x + 18, y + 26 + labelHeight, w - 36, valueSize, item.accent ? '#ffffff' : '#003641');
          if (item.support) text(item.support, x + 18, y + 40 + labelHeight + valueHeight, w - 36, 26, !!item.accent, item.accent ? '#ffffff' : '#435c60');
        });
        y += h + gap;
        i += columns;
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
  // Local brand font; no external assets or uploads are needed to render the panel.
  if (document.fonts?.load) await Promise.all([document.fonts.load('400 27px "Sicoob Sans"'), document.fonts.load('700 36px "Sicoob Sans"')]);
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
    else { context.font = `${c.bold ? '700' : '400'} ${c.size}px "Sicoob Sans", Arial`; context.fillText(c.value, c.x, c.y); }
  }
  try {
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Não foi possível gerar a imagem. Tente novamente.')), 'image/png'));
  } finally { canvas.width = 1; canvas.height = 1; }
}
