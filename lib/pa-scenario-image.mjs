import { money, percent } from './analytics.mjs';

const COLORS = Object.freeze({ ink: '#003641', muted: '#435c60', brand: '#00AE9D', pale: '#f0f7f4', line: '#d7e5df', warning: '#704700' });
const AMOUNT_ERROR = 'Um valor é extenso demais para a imagem. Use o painel completo por e-mail para preservar todos os valores.';

function validatePart(part) {
  const string = (value) => typeof value === 'string';
  const number = (value) => value === null || (typeof value === 'number' && Number.isFinite(value));
  if (!part || !Number.isInteger(part.index) || !Number.isInteger(part.total) || part.index < 1 || part.total < part.index ||
    !Number.isInteger(part.from) || !Number.isInteger(part.to) || part.from < 1 || part.to < part.from ||
    !Number.isInteger(part.year) || part.year < 2020 || part.year > 2100 ||
    !string(part.scope) || !string(part.periodLabel) || !Array.isArray(part.notes) || !part.notes.every(string) ||
    !Array.isArray(part.rows) || part.rows.length < 1 || part.rows.length > 20 || part.to - part.from + 1 !== part.rows.length) {
    throw new Error('A parte do cenário dos PAs está incompleta ou inválida. Gere o cenário novamente.');
  }
  const ids = new Set();
  for (const row of part.rows) {
    if (!row || !['id', 'central', 'cooperative', 'pa', 'name', 'group', 'status', 'cutoff', 'cutoffMin'].every((key) => string(row[key])) ||
      !row.id || !row.central || !row.cooperative || !row.pa || ids.has(row.id) ||
      !['target', 'actual', 'attainment'].every((key) => number(row[key])) ||
      typeof row.complete !== 'boolean' || typeof row.annualConflict !== 'boolean' ||
      !row.variance || !['growth', 'gap', 'met', 'unknown'].includes(row.variance.kind) ||
      !string(row.variance.label) || !number(row.variance.value) || !number(row.variance.ratio)) {
      throw new Error('Um PA contém dados inválidos para a imagem. Gere o cenário novamente.');
    }
    ids.add(row.id);
  }
}

const amount = (value) => value === null ? '—' : money(value).replace(/\s+/g, ' ');
const dateLabel = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value;
function cutoffLabel(row) {
  if (!row.cutoff) return 'Data de atualização não informada';
  if (row.cutoffMin && row.cutoffMin !== row.cutoff) return `Atualizações de ${dateLabel(row.cutoffMin)} a ${dateLabel(row.cutoff)}`;
  return `Dados até ${dateLabel(row.cutoff)}`;
}

/** Local canvas geometry. Monetary values are indivisible; names can occupy any number of lines. */
export function paScenarioImageLayout(part, context) {
  validatePart(part);
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
    wrapped.forEach((line, index) => commands.push({ type: 'text', value: line, x, y: y + index * step(size), size, bold, fill }));
    return wrapped.length * step(size);
  }
  function moneySize(value, maxWidth) {
    for (let size = 27; size >= 18; size--) if (measured(value, size, true) <= maxWidth) return size;
    throw new Error(AMOUNT_ERROR);
  }
  function moneyText(value, x, y, maxWidth, size, fill = COLORS.ink) {
    if (measured(value, size, true) > maxWidth) throw new Error(AMOUNT_ERROR);
    commands.push({ type: 'text', value, x, y, size, bold: true, fill });
    return step(size);
  }

  let y = 34;
  const header = commands.length;
  rect(0, 0, width, 1, COLORS.ink);
  y += text('GESTÃO COMERCIAL · VENDA NOVA', inset, y, contentWidth, 20, true, '#8fdbcf') + 18;
  y += text('Cenário dos PAs', inset, y, contentWidth, 38, true, '#ffffff') + 12;
  y += text(part.scope, inset, y, contentWidth, 30, true, '#ffffff') + 10;
  y += text(part.periodLabel, inset, y, contentWidth, 25, false, '#ffffff') + 10;
  y += text(`Parte ${part.index} de ${part.total} · PAs ${part.from}–${part.to}`, inset, y, contentWidth, 22, false, '#ffffff') + 30;
  commands[header].height = y;
  rect(0, y, width, 5, COLORS.brand);
  y += 29;
  for (const note of part.notes) y += text(note, inset, y, contentWidth, 21, false, COLORS.muted) + 12;
  if (part.notes.length) y += 8;

  const headers = ['PA / unidade', 'Meta', 'Realizado', 'Crescimento / GAP'];
  const headerHeight = Math.max(...headers.map((value, col) => lines(value, columnWidths[col] - padding * 2, 22, true).length * step(22))) + padding * 2;
  rect(inset, y, contentWidth, headerHeight, COLORS.ink);
  headers.forEach((value, col) => text(value, columnX[col] + padding, y + padding, columnWidths[col] - padding * 2, 22, true, '#ffffff'));
  y += headerHeight;

  // All monetary cells share one fitted size so the columns remain easy to scan.
  const valueSize = Math.min(...part.rows.flatMap((row) => [row.target, row.actual, row.variance.value].map((value, col) => moneySize(amount(value), columnWidths[col + 1] - padding * 2))));
  part.rows.forEach((row, index) => {
    const rowTop = y, backgroundIndex = commands.length;
    rect(inset, y, contentWidth, 1, index % 2 === 0 ? COLORS.pale : '#ffffff');
    let detailY = y + padding;
    detailY += text(`PA ${row.pa}${row.name ? ` · ${row.name}` : ''}`, columnX[0] + padding, detailY, columnWidths[0] - padding * 2, 23, true) + 9;
    detailY += text(`Central ${row.central} · Cooperativa ${row.cooperative}`, columnX[0] + padding, detailY, columnWidths[0] - padding * 2, 18, false, COLORS.muted) + 7;
    if (row.group) detailY += text(`Grupo ${row.group}`, columnX[0] + padding, detailY, columnWidths[0] - padding * 2, 18, false, COLORS.muted) + 7;
    detailY += text(cutoffLabel(row), columnX[0] + padding, detailY, columnWidths[0] - padding * 2, 18, false, COLORS.muted) + 7;
    detailY += text(row.status || 'Sem avaliação', columnX[0] + padding, detailY, columnWidths[0] - padding * 2, 19, true, !row.complete || row.annualConflict ? COLORS.warning : COLORS.ink);

    moneyText(amount(row.target), columnX[1] + padding, y + padding, columnWidths[1] - padding * 2, valueSize);
    let actualY = y + padding + moneyText(amount(row.actual), columnX[2] + padding, y + padding, columnWidths[2] - padding * 2, valueSize) + 10;
    const attainment = row.attainment === null || !row.complete || row.annualConflict ? 'Sem avaliação' : `${percent(row.attainment)} da meta`;
    actualY += text(attainment, columnX[2] + padding, actualY, columnWidths[2] - padding * 2, 19, false, COLORS.muted);

    let varianceY = y + padding;
    varianceY += moneyText(amount(row.variance.value), columnX[3] + padding, varianceY, columnWidths[3] - padding * 2, valueSize, row.variance.kind === 'gap' ? COLORS.warning : COLORS.ink) + 10;
    varianceY += text(row.variance.label, columnX[3] + padding, varianceY, columnWidths[3] - padding * 2, 19, false, COLORS.muted);
    if (row.variance.ratio !== null) varianceY += 7 + text(`${percent(row.variance.ratio)} ${row.variance.kind === 'growth' ? 'acima da meta' : row.variance.kind === 'gap' ? 'para atingir a meta' : 'de diferença'}`, columnX[3] + padding, varianceY + 7, columnWidths[3] - padding * 2, 18, false, COLORS.muted);

    y = Math.max(detailY, actualY, varianceY, rowTop + padding + step(valueSize)) + padding;
    commands[backgroundIndex].height = y - rowTop;
    rect(inset, y - 1, contentWidth, 1, COLORS.line);
  });
  y += 24;
  y += text('Valores em reais · Venda nova · Meta, realizado e diferença por PA.', inset, y, contentWidth, 20, false, COLORS.muted) + 12;
  y += text(`Parte ${part.index} de ${part.total} · ${part.rows.length} ${part.rows.length === 1 ? 'PA nesta imagem' : 'PAs nesta imagem'}`, inset, y, contentWidth, 20, true) + 28;
  const height = Math.ceil(y);
  if (height > 12000) throw new Error('Esta parte do cenário ficou muito longa para uma imagem. Use o painel completo por e-mail para preservar todos os PAs.');
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
