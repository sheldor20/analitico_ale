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
const varianceText = row => row.variance.kind === 'growth' ? 'Superação da meta'
  : row.variance.kind === 'gap' ? 'GAP para a meta'
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
  const widths = part.showProjection ? [336, 250, 260, 262, 260] : [336, 250, 260, 282], padding = 16;
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
  const rect = (x, y, w, h, fill) => commands.push({ type: 'rect', x, y, width: w, height: h, fill });
  function text(value, x, y, maxWidth, size = 22, bold = false, fill = COLORS.ink) {
    const wrapped = lines(value, maxWidth, size, bold);
    wrapped.forEach((line, index) => commands.push({ type: 'text', value: line, x, y: y + index * step(size), maxWidth, size, bold, fill }));
    return wrapped.length * step(size);
  }
  function fittedSize(value, maxWidth) {
    for (let size = 27; size >= 18; size--) if (measured(value, size, true) <= maxWidth) return size;
    throw new Error(AMOUNT_ERROR);
  }
  function moneyText(value, column, top, size, fill = COLORS.ink) {
    const formatted = amount(value), maxWidth = widths[column] - padding * 2;
    if (measured(formatted, size, true) > maxWidth) throw new Error(AMOUNT_ERROR);
    commands.push({ type: 'text', value: formatted, x: columnX[column] + padding, y: top, maxWidth, size, bold: true, fill });
    return step(size);
  }
  const support = (value, column, top, fill = COLORS.muted) => text(value, columnX[column] + padding, top, widths[column] - padding * 2, 18, false, fill);

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

  const headers = ['Período', 'Meta', 'Realizado', 'GAP / Superação', ...(part.showProjection ? ['Projeção'] : [])];
  const headerHeight = Math.max(...headers.map((value, column) => lines(value, widths[column] - padding * 2, 20, true).length * step(20))) + 20;
  rect(inset, y, contentWidth, headerHeight, COLORS.ink);
  headers.forEach((value, column) => text(value, columnX[column] + padding, y + 10, widths[column] - padding * 2, 20, true, '#ffffff'));
  y += headerHeight;

  const size = Math.min(...part.rows.flatMap(row => [row.target, row.actual, row.variance.value, ...(part.showProjection ? [row.projected] : [])].map((value, column) => fittedSize(amount(value), widths[column + 1] - padding * 2))));
  for (const [index, row] of part.rows.entries()) {
    const top = y, backgroundIndex = commands.length, rowPadding = 10;
    rect(inset, top, contentWidth, 1, index % 2 === 0 ? COLORS.pale : '#ffffff');
    const observedAttainment = row.complete && !row.annualConflict ? row.attainment : null;
    const band = attainmentBand(observedAttainment), actualBackgroundIndex = commands.length;
    rect(columnX[2], top, widths[2], 1, band.background);
    const projectionBackgroundIndex = commands.length;
    if (part.showProjection) rect(columnX[4], top, widths[4], 1, COLORS.secondary);

    let labelY = top + rowPadding;
    labelY += text(row.label, columnX[0] + padding, labelY, widths[0] - padding * 2, 23, true);
    labelY += 4 + support(row.phaseLabel, 0, labelY + 4, ['conflict', 'missing', 'incomplete'].includes(row.phase) ? COLORS.warning : COLORS.muted);
    if (row.cutoffMin !== part.cutoffMin || row.cutoff !== part.cutoff || row.mixedCutoffs) labelY += 4 + support(cutoffText(row), 0, labelY + 4);

    moneyText(row.target, 1, top + rowPadding, size);
    let actualY = top + rowPadding + moneyText(row.actual, 2, top + rowPadding, size, band.color);
    actualY += 4 + support(attainmentText(observedAttainment), 2, actualY + 4, band.color);
    let varianceY = top + rowPadding + moneyText(row.variance.value, 3, top + rowPadding, size, row.variance.kind === 'gap' ? COLORS.warning : COLORS.ink);
    varianceY += 4 + support(varianceText(row), 3, varianceY + 4);
    let projectionY = top + rowPadding;
    if (part.showProjection) {
      projectionY += moneyText(row.projected, 4, projectionY, size, COLORS.muted);
      projectionY += 4 + support(attainmentText(row.projectedAttainment), 4, projectionY + 4);
    }
    y = Math.max(labelY, actualY, varianceY, projectionY, top + rowPadding + step(size)) + rowPadding;
    commands[backgroundIndex].height = y - top;
    commands[actualBackgroundIndex].height = y - top;
    if (part.showProjection) commands[projectionBackgroundIndex].height = y - top;
    rect(inset, y - 1, contentWidth, 1, COLORS.line);
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
