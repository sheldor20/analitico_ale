import { money } from './analytics.mjs';
import { scenarioDisplay } from './scenario-share-presentation.mjs';

const COLORS = Object.freeze({ ink: '#003641', muted: '#435c60', brand: '#00AE9D', pale: '#f0f7f4', line: '#d7e5df', warning: '#704700' });
const AMOUNT_ERROR = 'Um valor é extenso demais para a imagem. Use o painel completo por e-mail para preservar todos os valores.';

function validatePart(part) {
  const string = (value) => typeof value === 'string';
  const number = (value) => value === null || (typeof value === 'number' && Number.isFinite(value));
  if (!part || !Number.isInteger(part.index) || !Number.isInteger(part.total) || part.index < 1 || part.total < part.index ||
    !Number.isInteger(part.from) || !Number.isInteger(part.to) || part.from < 1 || part.to < part.from ||
    !Number.isInteger(part.year) || part.year < 2020 || part.year > 2100 ||
    (part.kind !== undefined && !['pa', 'cooperative'].includes(part.kind)) ||
    (part.metric !== undefined && !['VN', 'AR'].includes(part.metric)) ||
    (part.selectionLabel !== undefined && (typeof part.selectionLabel !== 'string' || part.selectionLabel.length > 300)) ||
    !string(part.scope) || !string(part.periodLabel) || !Array.isArray(part.notes) || !part.notes.every(string) ||
    !Array.isArray(part.rows) || part.rows.length < 1 || part.rows.length > 20 || part.to - part.from + 1 !== part.rows.length) {
    throw new Error('A parte do cenário está incompleta ou inválida. Gere o cenário novamente.');
  }
  const ids = new Set();
  for (const row of part.rows) {
    if (!row || !['id', 'central', 'cooperative', 'pa', 'name', 'group', 'status', 'cutoff', 'cutoffMin'].every((key) => string(row[key])) ||
      !row.id || !row.central || !row.cooperative || (part.kind !== 'cooperative' && !row.pa) || ids.has(row.id) ||
      !['target', 'actual', 'attainment'].every((key) => number(row[key])) ||
      typeof row.complete !== 'boolean' || typeof row.annualConflict !== 'boolean' ||
      !row.variance || !['growth', 'gap', 'met', 'unknown'].includes(row.variance.kind) ||
      !string(row.variance.label) || !number(row.variance.value) || !number(row.variance.ratio)) {
      throw new Error('Uma unidade contém dados inválidos para a imagem. Gere o cenário novamente.');
    }
    ids.add(row.id);
  }
}

const amount = (value) => value === null ? '—' : money(value).replace(/\s+/g, ' ');

/** Local canvas geometry. Monetary values are indivisible; names can occupy any number of lines. */
export function paScenarioImageLayout(part, context) {
  validatePart(part);
  const display = scenarioDisplay(part);
  if (!context || typeof context.measureText !== 'function') throw new Error('Não foi possível medir o texto da imagem.');
  const commands = [], width = 1200, inset = 36, contentWidth = width - inset * 2;
  const columnWidths = [336, 250, 260, 282], padding = 16;
  const columnX = columnWidths.map((_, index) => inset + columnWidths.slice(0, index).reduce((sum, value) => sum + value, 0));
  const step = (size) => Math.ceil(size * 1.4);
  const font = (size, bold) => { context.font = `${bold ? '700' : '400'} ${size}px "Sicoob Sans", Arial`; };
  function measured(value, size, bold) {
    font(size, bold);
    const valueWidth = context.measureText(value).width;
    if (!Number.isFinite(valueWidth) || valueWidth < 0) throw new Error('Não foi possível medir o texto da imagem.');
    return valueWidth;
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
  function moneySize(value, maxWidth) {
    for (let size = 27; size >= 18; size--) if (measured(value, size, true) <= maxWidth) return size;
    throw new Error(AMOUNT_ERROR);
  }
  function moneyText(value, x, y, maxWidth, size, fill = COLORS.ink) {
    if (measured(value, size, true) > maxWidth) throw new Error(AMOUNT_ERROR);
    commands.push({ type: 'text', value, x, y, maxWidth, size, bold: true, fill });
    return step(size);
  }

  const unitLabel = part.kind === 'cooperative' ? 'Cooperativas' : 'PAs';
  let y = 24;
  const header = commands.length;
  rect(0, 0, width, 1, COLORS.ink);
  y += text(`GESTÃO COMERCIAL · ${display.metricLabel.toUpperCase()}`, inset, y, contentWidth, 20, true, '#8fdbcf') + 8;
  y += text(display.title, inset, y, contentWidth, 34, true, '#ffffff') + 8;
  y += text(display.scope, inset, y, contentWidth, 26, true, '#ffffff') + 6;
  y += text([part.periodLabel, display.cutoffLabel].filter(Boolean).join(' · '), inset, y, contentWidth, 22, false, '#ffffff') + 8;
  if (part.selectionLabel) y += text(part.selectionLabel, inset, y, contentWidth, 20, true, '#ffffff') + 6;
  y += text(`Parte ${part.index} de ${part.total} · ${unitLabel} ${part.from}–${part.to}`, inset, y, contentWidth, 20, false, '#ffffff') + 18;
  commands[header].height = y;
  rect(0, y, width, 5, COLORS.brand);
  y += 21;
  for (const note of part.notes) y += text(note, inset, y, contentWidth, 20, false, COLORS.muted) + 8;
  if (part.notes.length) y += 4;

  const headers = [part.kind === 'cooperative' ? 'Cooperativa' : 'PA / unidade', 'Meta', 'Realizado', 'Crescimento / GAP'];
  const headerHeight = Math.max(...headers.map((value, col) => lines(value, columnWidths[col] - padding * 2, 20, true).length * step(20))) + 20;
  rect(inset, y, contentWidth, headerHeight, COLORS.ink);
  headers.forEach((value, col) => text(value, columnX[col] + padding, y + 10, columnWidths[col] - padding * 2, 20, true, '#ffffff'));
  y += headerHeight;

  // All monetary cells share one fitted size so the columns remain easy to scan.
  const valueSize = Math.min(...part.rows.flatMap((row) => [row.target, row.actual, row.variance.value].map((value, col) => moneySize(amount(value), columnWidths[col + 1] - padding * 2))));
  let rowIndex = 0;
  for (const group of display.groups) {
    if (group.label) {
      const groupHeight = lines(group.label, contentWidth - padding * 2, 20, true).length * step(20) + 16;
      rect(inset, y, contentWidth, groupHeight, '#dcefe8');
      text(group.label, inset + padding, y + 8, contentWidth - padding * 2, 20, true);
      y += groupHeight;
    }
    for (const item of group.rows) {
      const row = item.row, rowTop = y, backgroundIndex = commands.length, rowPadding = 10;
      rect(inset, y, contentWidth, 1, rowIndex++ % 2 === 0 ? COLORS.pale : '#ffffff');
      let detailY = y + rowPadding;
      detailY += text(item.label, columnX[0] + padding, detailY, columnWidths[0] - padding * 2, 23, true);
      if (item.exception) detailY += 4 + text(item.exception, columnX[0] + padding, detailY + 4, columnWidths[0] - padding * 2, 18, false, COLORS.warning);

      moneyText(amount(row.target), columnX[1] + padding, y + rowPadding, columnWidths[1] - padding * 2, valueSize);
      let actualY = y + rowPadding + moneyText(amount(row.actual), columnX[2] + padding, y + rowPadding, columnWidths[2] - padding * 2, valueSize);
      if (item.attainmentLabel) actualY += 4 + text(item.attainmentLabel, columnX[2] + padding, actualY + 4, columnWidths[2] - padding * 2, 18, false, COLORS.muted);

      let varianceY = y + rowPadding;
      varianceY += moneyText(amount(row.variance.value), columnX[3] + padding, varianceY, columnWidths[3] - padding * 2, valueSize, row.variance.kind === 'gap' ? COLORS.warning : COLORS.ink);
      if (item.varianceLabel) varianceY += 4 + text(item.varianceLabel, columnX[3] + padding, varianceY + 4, columnWidths[3] - padding * 2, 18, false, COLORS.muted);

      y = Math.max(detailY, actualY, varianceY, rowTop + rowPadding + step(valueSize)) + rowPadding;
      commands[backgroundIndex].height = y - rowTop;
      rect(inset, y - 1, contentWidth, 1, COLORS.line);
    }
  }
  y += 18;
  y += text('Valores em reais · Meta, realizado e diferença por unidade.', inset, y, contentWidth, 19, false, COLORS.muted) + 22;
  const height = Math.ceil(y);
  if (height > 12000) throw new Error('Esta parte do cenário ficou muito longa para uma imagem. Use o painel completo por e-mail para preservar todas as unidades.');
  return { width, height, commands };
}

export async function renderPaScenarioPng(part) {
  // The local font and Canvas keep the complete report in the user's browser.
  if (document.fonts?.load) await Promise.all([document.fonts.load('400 22px "Sicoob Sans"'), document.fonts.load('700 27px "Sicoob Sans"')]);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Este navegador não conseguiu gerar a imagem. Use o painel por e-mail ou outro navegador.');
  const layout = paScenarioImageLayout(part, context);
  canvas.width = layout.width; canvas.height = layout.height;
  try {
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
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Não foi possível gerar a imagem. Tente novamente.')), 'image/png'));
  } finally { canvas.width = 1; canvas.height = 1; }
}
