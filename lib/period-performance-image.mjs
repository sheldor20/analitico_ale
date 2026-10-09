import { money, percent } from './analytics.mjs';
import { attainmentBand } from './attainment.mjs';
import { communicationBrand, metricHeading } from './communication-header.mjs';

const COLORS = Object.freeze({ ink: '#003641', muted: '#435c60', brand: '#00AE9D', pale: '#f0f7f4', line: '#d7e5df', warning: '#704700', secondary: '#f4f6f5' });
const PHASES = new Set(['conflict', 'future', 'missing', 'incomplete', 'closed', 'partial']);
const AMOUNT_ERROR = 'Um valor é extenso demais para a imagem. Use o painel completo por e-mail para preservar todos os valores.';
const amount = value => value === null ? '—' : money(value).replace(/\s+/g, ' ');
const date = value => value ? value.split('-').reverse().join('/') : 'não informado';
const cutoffText = row => row.cutoffMin && row.cutoffMin !== row.cutoff
  ? `Cortes: ${date(row.cutoffMin)} a ${date(row.cutoff)}` : `Corte: ${date(row.cutoff)}`;
const attainmentText = value => value === null ? 'Sem avaliação' : `${percent(value)} da meta`;
const varianceText = row => row.variance.kind === 'growth' ? '+ Superação'
  : row.variance.kind === 'gap' ? '− GAP'
    : row.variance.kind === 'met' ? row.target > 0 ? 'Meta atingida' : 'Meta zero · sem base percentual' : 'Sem avaliação';

function validatePart(part) {
  const string = value => typeof value === 'string';
  const number = value => value === null || typeof value === 'number' && Number.isFinite(value);
  const iso = value => value === null || string(value) && /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!part || !Number.isInteger(part.index) || part.index < 1 || !Number.isInteger(part.total) || part.total < part.index ||
    !Number.isInteger(part.from) || part.from < 1 || !Number.isInteger(part.to) || part.to < part.from ||
    !Number.isInteger(part.year) || part.year < 2020 || part.year > 2100 || !['VN', 'AR'].includes(part.metric) ||
    typeof part.showProjection !== 'boolean' || !['scopeLabel', 'centralName', 'unitLabel', 'periodLabel', 'orderLabel'].every(key => string(part[key])) ||
    !iso(part.cutoffMin) || !iso(part.cutoff) || !Array.isArray(part.notes) || !part.notes.every(string) ||
    !Array.isArray(part.rows) || part.rows.length < 1 || part.rows.length > 12 || part.to - part.from + 1 !== part.rows.length) {
    throw new Error('A parte dos resultados por período está incompleta ou inválida. Gere o painel novamente.');
  }
  const ids = new Set();
  for (const row of part.rows) {
    if (!row || !string(row.id) || !row.id || ids.has(row.id) || !['month', 'quarter', 'semester', 'annual'].includes(row.period) ||
      !Number.isInteger(row.month) || row.month < 0 || row.month > 11 || !string(row.label) || !string(row.phaseLabel) || !PHASES.has(row.phase) ||
      !['start', 'end', 'cutoffMin', 'cutoff'].every(key => iso(row[key])) ||
      !['target', 'actual', 'attainment', 'projected', 'projectedAttainment'].every(key => number(row[key])) ||
      !['complete', 'annualConflict', 'mixedCutoffs'].every(key => typeof row[key] === 'boolean') ||
      !row.variance || !['growth', 'gap', 'met', 'unknown'].includes(row.variance.kind) ||
      !string(row.variance.label) || !number(row.variance.value) || !number(row.variance.ratio)) {
      throw new Error('Um período contém dados inválidos para a imagem. Gere o painel novamente.');
    }
    ids.add(row.id);
  }
}

/** Draw supplied period results without recalculating or combining overlapping periods. */
export function periodPerformanceImageLayout(part, context) {
  validatePart(part);
  if (!context || typeof context.measureText !== 'function') throw new Error('Não foi possível medir o texto da imagem.');
  const commands = [], width = part.showProjection ? 1440 : 1200, inset = 36, contentWidth = width - inset * 2;
  const widths = part.showProjection ? [200, 248, 248, 176, 248, 248] : [208, 248, 248, 176, 248], padding = 12;
  const columnX = widths.map((_, index) => inset + widths.slice(0, index).reduce((sum, value) => sum + value, 0));
  const step = size => Math.ceil(size * 1.4);
  function measured(value, size, bold) {
    context.font = `${bold ? '700' : '400'} ${size}px "Sicoob Sans", Arial`;
    const result = context.measureText(value).width;
    if (!Number.isFinite(result) || result < 0) throw new Error('Não foi possível medir o texto da imagem.');
    return result;
  }
  function lines(value, maxWidth, size, bold = false) {
    const result = [];
    for (const paragraph of String(value).split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = `${line}${line ? ' ' : ''}${word}`;
        if (measured(candidate, size, bold) <= maxWidth) { line = candidate; continue; }
        if (line) { result.push(line); line = ''; }
        for (const char of word) {
          if (measured(char, size, bold) > maxWidth) throw new Error('Um caractere não cabe na imagem. Use o painel completo por e-mail.');
          if (line && measured(line + char, size, bold) > maxWidth) { result.push(line); line = ''; }
          line += char;
        }
      }
      result.push(line);
    }
    return result;
  }
  let rowId;
  const rect = (x, y, w, h, fill, role) => commands.push({ type: 'rect', x, y, width: w, height: h, fill, ...(rowId ? { rowId } : {}), ...(role ? { role } : {}) });
  function text(value, x, y, maxWidth, size = 22, bold = false, fill = COLORS.ink, role) {
    const wrapped = lines(value, maxWidth, size, bold);
    wrapped.forEach((line, index) => commands.push({ type: 'text', value: line, x, y: y + index * step(size), maxWidth, size, bold, fill, ...(rowId ? { rowId } : {}), ...(role ? { role } : {}) }));
    return wrapped.length * step(size);
  }
  function fittedSize(value, maxWidth, preferred = 27) {
    for (let size = preferred; size >= 18; size--) if (measured(value, size, true) <= maxWidth) return size;
    throw new Error(AMOUNT_ERROR);
  }
  function moneyText(value, x, top, maxWidth, size, fill = COLORS.ink, role) {
    const formatted = amount(value);
    if (measured(formatted, size, true) > maxWidth) throw new Error(AMOUNT_ERROR);
    commands.push({ type: 'text', value: formatted, x, y: top, maxWidth, size, bold: true, fill, rowId, role });
    return step(size);
  }
  const observed = row => row.complete && !row.annualConflict ? row.attainment : null;
  const hasCutoff = row => row.cutoffMin !== part.cutoffMin || row.cutoff !== part.cutoff || row.mixedCutoffs;
  function badge(row, x, top, maxWidth) {
    const value = observed(row), label = value == null ? 'Sem avaliação' : percent(value), band = attainmentBand(value);
    const h = lines(label, maxWidth - 16, 18, true).length * step(18) + 8;
    rect(x, top, maxWidth, h, band.background, 'attainment-badge');
    text(label, x + 8, top + 4, maxWidth - 16, 18, true, band.color, 'attainment');
    return h;
  }
  function rowContext(row, x, top, maxWidth) {
    const partial = row.phase === 'partial', insetX = partial ? 6 : 0;
    const hPhase = lines(row.phaseLabel, maxWidth - insetX * 2, 17).length * step(17);
    if (partial) rect(x, top, Math.min(maxWidth, measured(row.phaseLabel, 17, false) + 12), hPhase + 4, '#dff5f0', 'phase-badge');
    let h = text(row.phaseLabel, x + insetX, top + (partial ? 2 : 0), maxWidth - insetX * 2, 17, false, ['conflict', 'missing', 'incomplete'].includes(row.phase) ? COLORS.warning : COLORS.muted, 'phase') + (partial ? 4 : 0);
    if (hasCutoff(row)) h += 3 + text(cutoffText(row), x, top + h + 3, maxWidth, 17, false, COLORS.muted, 'cutoff');
    return h;
  }

  let y = 20;
  const headerIndex = commands.length;
  rect(0, 0, width, 1, COLORS.ink);
  y += text(communicationBrand(metricHeading([part.metric])), inset, y, contentWidth, 20, true, '#8fdbcf') + 6;
  y += text(part.centralName, inset, y, contentWidth, 30, true, '#ffffff') + 6;
  y += text(part.periodLabel, inset, y, contentWidth, 23, false, '#ffffff') + 12;
  commands[headerIndex].height = y;
  rect(0, y, width, 5, COLORS.brand);
  y += 17;
  for (const label of [...new Set([part.unitLabel, part.scopeLabel].filter(Boolean))]) y += text(label, inset, y, contentWidth, 22, true) + 5;
  y += text([cutoffText(part), part.orderLabel ? `Ordem: ${part.orderLabel}` : '', `Parte ${part.index} de ${part.total} · Períodos ${part.from}–${part.to}`].filter(Boolean).join(' · '), inset, y, contentWidth, 18, false, COLORS.muted) + 9;

  function monthly(rows) {
    const headers = ['Mês', 'Meta', 'Realizado', 'Atingimento', 'GAP / Superação', ...(part.showProjection ? ['Projeção'] : [])];
    const h = Math.max(...headers.map((value, column) => lines(value, widths[column] - padding * 2, 19, true).length * step(19))) + 16;
    rect(inset, y, contentWidth, h, COLORS.ink, 'monthly-header');
    headers.forEach((value, column) => text(value, columnX[column] + padding, y + 8, widths[column] - padding * 2, 19, true, '#ffffff'));
    y += h;
    const size = Math.min(...rows.flatMap(row => [row.target, row.actual, row.variance.value, ...(part.showProjection ? [row.projected] : [])].map(value => fittedSize(amount(value), 248 - padding * 2))));
    for (const [index, row] of rows.entries()) {
      rowId = row.id;
      const top = y, background = commands.length;
      rect(inset, top, contentWidth, 1, row.phase === 'partial' ? '#edf8f5' : index % 2 ? '#ffffff' : COLORS.pale, 'period-row');
      let labelY = top + 10;
      labelY += text(row.label, inset + padding, labelY, widths[0] - padding * 2, 21, true, COLORS.ink, 'period-label');
      labelY += 3 + rowContext(row, inset + padding, labelY + 3, widths[0] - padding * 2);
      moneyText(row.target, columnX[1] + padding, top + 10, widths[1] - padding * 2, size, COLORS.ink, 'amount-target');
      moneyText(row.actual, columnX[2] + padding, top + 10, widths[2] - padding * 2, size, attainmentBand(observed(row)).color, 'amount-actual');
      const badgeH = badge(row, columnX[3] + padding, top + 10, widths[3] - padding * 2);
      let varianceY = top + 10 + moneyText(row.variance.value, columnX[4] + padding, top + 10, widths[4] - padding * 2, size, row.variance.kind === 'gap' ? COLORS.warning : COLORS.ink, 'amount-variance');
      varianceY += 3 + text(varianceText(row), columnX[4] + padding, varianceY + 3, widths[4] - padding * 2, 17, false, COLORS.muted);
      if (part.showProjection) moneyText(row.projected, columnX[5] + padding, top + 10, widths[5] - padding * 2, size, COLORS.muted, 'amount-projection');
      y = Math.max(labelY, varianceY, top + 10 + badgeH, top + 10 + step(size)) + 10;
      commands[background].height = y - top;
      rect(inset, y - 1, contentWidth, 1, COLORS.line);
      rowId = undefined;
    }
  }
  function metricCards(row, annual) {
    rowId = row.id;
    y += text(row.label, inset, y, contentWidth, 23, true, COLORS.ink, 'period-label') + 3;
    y += rowContext(row, inset, y, contentWidth) + 10;
    const items = [
      { label: annual ? 'Meta anual' : 'Meta', value: row.target, role: 'amount-target' },
      { label: 'Realizado', value: row.actual, role: 'amount-actual' },
      { label: varianceText(row), value: row.variance.value, role: 'amount-variance' },
      ...(part.showProjection ? [{ label: 'Projeção', value: row.projected, role: 'amount-projection' }] : []),
    ];
    const gap = 12, cardW = (contentWidth - gap * (items.length - 1)) / items.length;
    const size = Math.min(...items.map(item => fittedSize(amount(item.value), cardW - 32, 32)));
    const labelH = Math.max(...items.map(item => lines(item.label, cardW - 32, 20).length * step(20)));
    const badgeW = Math.min(cardW - 32, 156), observedValue = observed(row);
    const badgeH = lines(observedValue == null ? 'Sem avaliação' : percent(observedValue), badgeW - 16, 18, true).length * step(18) + 8;
    const supportH = Math.max(badgeH, ...(part.showProjection ? [lines(attainmentText(row.projectedAttainment), cardW - 32, 18).length * step(18)] : []));
    const cardH = 28 + labelH + step(size) + 10 + supportH;
    items.forEach((item, index) => {
      const x = inset + index * (cardW + gap), actual = item.role === 'amount-actual', projection = item.role === 'amount-projection';
      rect(x, y, cardW, cardH, projection ? COLORS.secondary : COLORS.pale, 'metric-card');
      text(item.label, x + 16, y + 12, cardW - 32, 20, false, COLORS.muted);
      moneyText(item.value, x + 16, y + 16 + labelH, cardW - 32, size, actual ? attainmentBand(observed(row)).color : projection ? COLORS.muted : COLORS.ink, item.role);
      if (actual) badge(row, x + 16, y + 22 + labelH + step(size), badgeW);
      if (projection) text(attainmentText(row.projectedAttainment), x + 16, y + 22 + labelH + step(size), cardW - 32, 18, false, COLORS.muted);
    });
    y += cardH + 16;
    rowId = undefined;
  }
  function quarterCard(row, x, top, w) {
    rowId = row.id;
    const background = commands.length, innerW = w - 32;
    rect(x, top, w, 1, COLORS.pale, 'period-card');
    let pos = top + 14;
    pos += text(row.label, x + 16, pos, innerW, 24, true, COLORS.ink, 'period-label') + 4;
    pos += rowContext(row, x + 16, pos, innerW) + 10;
    pos += text('Realizado', x + 16, pos, innerW, 18, false, COLORS.muted) + 4;
    const stackedBadge = measured(amount(row.actual), 18, true) > innerW - 166;
    const realWidth = stackedBadge ? innerW : innerW - 166, realSize = fittedSize(amount(row.actual), realWidth, 30);
    const amountH = moneyText(row.actual, x + 16, pos, realWidth, realSize, attainmentBand(observed(row)).color, 'amount-actual');
    const badgeH = badge(row, stackedBadge ? x + 16 : x + w - 166, pos + (stackedBadge ? amountH + 5 : 0), 150);
    pos += (stackedBadge ? amountH + 5 + badgeH : Math.max(amountH, badgeH)) + 14;
    rect(x + 16, pos, innerW, 1, COLORS.line); pos += 10;
    const items = [{ label: 'Meta', value: row.target, role: 'amount-target' }, { label: varianceText(row), value: row.variance.value, role: 'amount-variance' }];
    let cols = 2;
    if (items.some(item => measured(amount(item.value), 18, true) > (innerW - 12) / 2)) cols = 1;
    const metricW = cols === 2 ? (innerW - 12) / 2 : innerW;
    const valueSize = Math.min(...items.map(item => fittedSize(amount(item.value), metricW)));
    const labelH = Math.max(...items.map(item => lines(item.label, metricW, 18).length * step(18)));
    for (let i = 0; i < items.length; i += cols) {
      items.slice(i, i + cols).forEach((item, column) => {
        const left = x + 16 + column * (metricW + 12);
        text(item.label, left, pos, metricW, 18, false, COLORS.muted);
        moneyText(item.value, left, pos + labelH + 3, metricW, valueSize, COLORS.ink, item.role);
      });
      pos += labelH + step(valueSize) + 12;
    }
    if (part.showProjection) {
      pos += text('Projeção', x + 16, pos, innerW, 18, false, COLORS.muted) + 3;
      pos += moneyText(row.projected, x + 16, pos, innerW, fittedSize(amount(row.projected), innerW), COLORS.muted, 'amount-projection') + 3;
      pos += text(attainmentText(row.projectedAttainment), x + 16, pos, innerW, 18, false, COLORS.muted) + 8;
    }
    const height = pos - top + 8;
    commands[background].height = height;
    rowId = undefined;
    return { height, background };
  }
  const titles = { annual: 'Resumo anual', month: 'Resultados mensais', quarter: 'Visão trimestral', semester: 'Visão semestral' };
  for (let start = 0; start < part.rows.length;) {
    const period = part.rows[start].period;
    let end = start + 1;
    while (end < part.rows.length && part.rows[end].period === period) end++;
    const group = part.rows.slice(start, end);
    y += 14;
    const continued = period === 'month' && start === 0 && part.index > 1;
    y += text(`${titles[period]}${continued ? ' · continuação' : ''}`, inset, y, contentWidth, 27, true, COLORS.ink, 'section-title') + 10;
    if (period === 'month') monthly(group);
    else if (period === 'quarter') {
      const w = (contentWidth - 16) / 2;
      for (let i = 0; i < group.length; i += 2) {
        const cards = group.slice(i, i + 2).map((row, column) => quarterCard(row, inset + column * (w + 16), y, w));
        const h = Math.max(...cards.map(card => card.height));
        cards.forEach(card => { commands[card.background].height = h; });
        y += h + 16;
      }
    } else for (const row of group) metricCards(row, period === 'annual');
    start = end;
  }
  y += 18;
  for (const note of part.notes) y += text(note, inset, y, contentWidth, 19, false, COLORS.muted) + 8;
  if (part.showProjection && !part.notes.some(note => /projeção/i.test(note) && /estimativa/i.test(note))) y += text('Projeção é uma estimativa de produção.', inset, y, contentWidth, 19, false, COLORS.muted) + 6;
  y += text('Valores em reais · Resultados por período.', inset, y, contentWidth, 19, false, COLORS.muted) + 22;
  const height = Math.ceil(y);
  if (height > 12000) throw new Error('Esta parte ficou muito longa para uma imagem. Use o painel completo por e-mail para preservar todos os períodos.');
  return { width, height, commands };
}

export async function renderPeriodPerformancePng(part) {
  if (document.fonts?.load) await Promise.all([document.fonts.load('400 22px "Sicoob Sans"'), document.fonts.load('700 27px "Sicoob Sans"')]);
  const canvas = document.createElement('canvas');
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Este navegador não conseguiu gerar a imagem. Use o painel por e-mail ou outro navegador.');
    const layout = periodPerformanceImageLayout(part, context);
    canvas.width = layout.width; canvas.height = layout.height;
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.textBaseline = 'top';
    for (const command of layout.commands) {
      context.fillStyle = command.fill;
      if (command.type === 'rect') context.fillRect(command.x, command.y, command.width, command.height);
      else {
        context.font = `${command.bold ? '700' : '400'} ${command.size}px "Sicoob Sans", Arial`;
        context.fillText(command.value, command.x, command.y);
      }
    }
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível gerar a imagem. Tente novamente.')), 'image/png'));
  } finally { canvas.width = 1; canvas.height = 1; }
}
