import { upsertEntity, upsertPlanRow } from '../../lib/registry.mjs';
import { money } from '../../lib/analytics.mjs';
import { captureScenarioDocument } from './scenario-artifacts.mjs';

const select = (root, name) => root.getByRole('combobox', { name, exact: true });
const results = page => page.getByRole('region', { name: 'Lista de unidades', exact: true });
const periods = page => page.getByRole('region', { name: 'Resultados por período', exact: true });
const periodRow = (page, period, month) => periods(page).locator(`[data-period="${period}"][data-month="${month}"]`);
const financial = (page, period, month, field) => periodRow(page, period, month).locator(`[data-field="${field}"]`);
const frame = page => page.frameLocator('iframe[title="Painel do e-mail da carteira"]');
const share = page => page.getByRole('dialog', { name: 'Compartilhar cenário das cooperativas', exact: true });
const projection = root => root.getByRole('checkbox', { name: 'Incluir projeção de produção', exact: true });
const exportedRows = page => frame(page).locator('tr[data-cooperative-id]');
const exportedRow = (page, id) => frame(page).locator(`tr[data-cooperative-id="${id}"]`);
const pngMagic = [137, 80, 78, 71, 13, 10, 26, 10];

export function managementFixture(dataset) {
  dataset = { ...dataset, rows: dataset.rows.map(row => ({ ...row, cutoff: '2026-08-14' })) };
  dataset = upsertEntity(dataset, { kind: 'cooperative', central: '1002', cooperative: '3030', name: 'Cooperativa Delta' });
  dataset = upsertEntity(dataset, { kind: 'pa', central: '2007', cooperative: '3017', pa: '0', name: 'PA Nordeste zero', group: 'P1' });
  for (const [entityId, metric, target, actuals] of [
    ['cooperative:1002:3017', 'AR', 1000, [690, 700, 1000, 500, 1000, 500, 1000, 700]],
    ['cooperative:1002:3025', 'AR', 1000, Array(8).fill(100)],
    ['cooperative:1002:3030', 'AR', 1000, Array(8).fill(200)],
    ['cooperative:2007:3017', 'AR', 9000, Array(8).fill(9000)],
    ['pa:1002:3017:0', 'VN', 100, [10, 20, 30, 40, 50, 60, 70, 80]],
    ['pa:2007:3017:0', 'VN', 5000, Array(8).fill(4000)],
  ]) dataset = upsertPlanRow(dataset, { entityId, metric, targets: Array(12).fill(target), annualTarget: target * 12,
    actuals: [...actuals, null, null, null, null], cutoff: '2026-08-14' });
  return dataset;
}

function orderedPeriodFixture(dataset) {
  dataset = { ...dataset, rows: dataset.rows.map(row => ({ ...row, cutoff: '2026-08-14' })) };
  const targets = [100, 200, 50, 100, 300, 100, 100, 200, 100, 100, 100, 100];
  return upsertPlanRow(dataset, { entityId: 'cooperative:1002:3017', metric: 'AR', targets,
    annualTarget: 1550, actuals: [80, 100, 75, 110, 90, 180, 30, 250, null, null, null, null], cutoff: '2026-08-14' });
}

async function captureCopies(page) {
  await page.addInitScript(() => {
    window.__managementCopies = { png: [], drawings: [] };
    const paint = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (value, ...args) {
      this.canvas.__managementText ??= [];
      this.canvas.__managementText.push(String(value));
      return paint.call(this, value, ...args);
    };
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      const text = [...(this.__managementText || [])];
      return toBlob.call(this, blob => {
        if (blob) window.__managementCopies.drawings.push(text);
        callback(blob);
      }, ...args);
    };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      write: async items => {
        for (const item of items) if (item.types.includes('image/png')) {
          const blob = await item.getType('image/png');
          const bytes = new Uint8Array(await blob.arrayBuffer()), dimensions = new DataView(bytes.buffer);
          window.__managementCopies.png.push({ bytes: [...bytes.slice(0, 8)], width: dimensions.getUint32(16), height: dimensions.getUint32(20) });
        }
      },
    } });
  });
}

export function registerManagementPeriodTests({ test, expect, setup }) {
  test('management periods: all 19 periods reconcile to the current portfolio and compound unit without inventing future production', async ({ page }, info) => {
    const { errors, writes, relationshipWrites } = await setup(page, managementFixture);
    await select(page, 'Central').selectOption('1002');
    await select(page, 'Cooperativa').selectOption('1002:3017');
    await select(page, 'Carteira').selectOption('AR');
    await select(page, 'Período').selectOption('month');
    await select(page, 'Mês de referência').selectOption('7');
    await page.getByRole('button', { name: 'Ver todos os períodos', exact: true }).click();
    const panel = periods(page);
    await expect(panel.getByRole('table', { name: 'Resultados mensais', exact: true }).getByRole('columnheader')).toHaveText(['Mês', 'Meta', 'Realizado', 'Atingimento', 'GAP / Superação', 'Projeção']);
    for (const [kind, count] of [['month', 12], ['quarter', 4], ['semester', 2], ['annual', 1]]) {
      await expect(panel.locator(`[data-period="${kind}"][data-month]`)).toHaveCount(count);
    }
    const displayOrder = await panel.locator('[data-period][data-month]').evaluateAll(nodes => nodes.map(node => node.dataset.period));
    expect(displayOrder).toEqual(['annual', ...Array(12).fill('month'), ...Array(4).fill('quarter'), ...Array(2).fill('semester')]);
    for (const [month, name, actual, band] of [[0, 'Janeiro', 690, 'red'], [1, 'Fevereiro', 700, 'yellow'], [2, 'Março', 1000, 'blue']]) {
      const row = periodRow(page, 'month', month);
      await expect(row.getByRole('rowheader')).toContainText(name);
      await expect(row.locator('[data-field="target"]')).toContainText(money(1000));
      await expect(row.locator('[data-field="actual"]')).toContainText(money(actual));
      await expect(row.locator('[data-attainment]')).toHaveAttribute('data-attainment', band);
    }
    const missing = periodRow(page, 'month', 8);
    await expect(missing.getByRole('rowheader')).toContainText('Setembro');
    await expect(missing.locator('[data-field="actual"]')).not.toContainText('0,00');
    await expect(missing.locator('[data-attainment]')).toHaveAttribute('data-attainment', 'neutral');
    for (const [kind, month, target, actual] of [['quarter', 2, 3000, 2390], ['semester', 5, 6000, 4390], ['annual', 11, 12000, 6090]]) {
      const row = periodRow(page, kind, month);
      await expect(row.locator('[data-field="target"]')).toContainText(money(target));
      await expect(row.locator('[data-field="actual"]')).toContainText(money(actual));
    }
    await expect(periodRow(page, 'month', 7)).toContainText('Parcial');
    await expect(panel).not.toContainText('PA Alfa zero');
    await panel.screenshot({ path: info.outputPath('management-periods-desktop.png') });
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await panel.evaluate(node => [...node.querySelectorAll('table')].every(table => {
      const style = getComputedStyle(table.parentElement);
      return !['auto', 'scroll'].includes(style.overflowY) || table.parentElement.scrollHeight <= table.parentElement.clientHeight + 1;
    }))).toBe(true);
    // Fixed navigation must not cover a stitched screenshot of the long region.
    await panel.screenshot({ path: info.outputPath('management-periods-320.png'), style: '.sidebar, .skip-link { visibility: hidden !important; }' });
    const monthly = panel.getByRole('table', { name: 'Resultados mensais', exact: true });
    await periodRow(page, 'month', 2).locator('[data-attainment]').scrollIntoViewIfNeeded();
    for (const [month, color] of [[0, 'rgb(180, 35, 24)'], [1, 'rgb(133, 77, 14)'], [2, 'rgb(23, 92, 211)']]) {
      const badge = periodRow(page, 'month', month).locator('[data-attainment]');
      await expect(badge).toHaveCSS('color', color);
      const bounds = await badge.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    }
    await monthly.locator('..').screenshot({ path: info.outputPath('management-periods-values-320.png'), style: '.sidebar, .skip-link { visibility: hidden !important; }' });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await select(page, 'Central').selectOption('2007');
    await select(page, 'Cooperativa').selectOption('2007:3017');
    await expect(financial(page, 'quarter', 2, 'actual')).toContainText(money(27000));
    await expect(financial(page, 'quarter', 2, 'actual')).not.toContainText(money(2390));
    await page.getByRole('navigation', { name: 'Navegação principal', exact: true }).getByRole('button', { name: 'Cadência dos PAs', exact: true }).click();
    await select(page, 'PA').selectOption('2007:3017:0');
    await expect(financial(page, 'month', 0, 'actual')).toContainText(money(4000));
    await select(page, 'Central').selectOption('1002');
    await select(page, 'Cooperativa').selectOption('1002:3017');
    await select(page, 'PA').selectOption('1002:3017:0');
    await expect(financial(page, 'month', 0, 'actual')).toContainText(money(10));
    await expect(financial(page, 'annual', 11, 'actual')).toContainText(money(360));
    expect(writes).toEqual([]); expect(relationshipWrites).toEqual([]); expect(errors).toEqual([]);
  });

  test('compact periods: every criterion orders each group, unknown values stay last and the shortcut restores collapsed groups', async ({ page }, info) => {
    const { errors, writes, relationshipWrites } = await setup(page, orderedPeriodFixture);
    await select(page, 'Central').selectOption('1002');
    await select(page, 'Cooperativa').selectOption('1002:3017');
    await select(page, 'Carteira').selectOption('AR');
    await select(page, 'Período').selectOption('month');
    await select(page, 'Mês de referência').selectOption('7');
    await page.getByRole('button', { name: 'Ver todos os períodos', exact: true }).click();
    const panel = periods(page), order = select(panel, 'Ordenar períodos');
    const groupRows = kind => panel.locator(`[data-period="${kind}"][data-month]`);
    const months = kind => groupRows(kind).evaluateAll(rows => rows.map(row => Number(row.dataset.month)));
    await expect(order).toHaveValue('chronological');
    expect(await months('month')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const unknown = [8, 9, 10, 11];
    const criteria = [
      ['attainment-desc', [5, 2, 7, 3, 0, 1, 4, 6], [5, 2, 8, 11], [5, 11]],
      ['attainment', [4, 6, 1, 0, 3, 7, 2, 5], [8, 2, 5, 11], [11, 5]],
      ['production', [7, 5, 3, 1, 4, 0, 2, 6], [5, 8, 2, 11], [5, 11]],
      ['gap', [4, 1, 6, 0, 2, 3, 5, 7], [5, 8, 2, 11], [11, 5]],
      ['growth', [5, 7, 2, 3, 0, 1, 4, 6], [2, 5, 8, 11], [5, 11]],
      ['projected', [7, 5, 3, 1, 4, 0, 2, 6], [8, 5, 2, 11], [11, 5]],
    ];
    for (const [criterion, monthly, quarterly, halfYear] of criteria) {
      await order.selectOption(criterion);
      expect(await months('month')).toEqual([...monthly, ...unknown]);
      expect(await months('quarter')).toEqual(quarterly);
      expect(await months('semester')).toEqual(halfYear);
      expect(await months('annual')).toEqual([11]);
      await expect(periodRow(page, 'month', 8).locator('[data-attainment]')).toHaveAttribute('data-attainment', 'neutral');
    }
    await expect(financial(page, 'month', 7, 'actual')).toContainText(money(250));
    await expect(financial(page, 'month', 7, 'projected')).toContainText(money(525));
    await expect(financial(page, 'annual', 11, 'actual')).toContainText(money(915));
    await order.selectOption('attainment');
    for (const label of ['resultados mensais', 'resultados trimestrais', 'resultados semestrais', 'resultado anual']) {
      const toggle = panel.getByRole('button', { name: `Recolher ${label}`, exact: true });
      await toggle.focus();
      await toggle.press('Enter');
      await expect(panel.getByRole('button', { name: `Expandir ${label}`, exact: true })).toHaveAttribute('aria-expanded', 'false');
    }
    for (const period of await panel.locator('[data-period][data-month]').all()) await expect(period).toBeHidden();
    await panel.getByRole('button', { name: 'Recolher resultados por período', exact: true }).click();
    await expect(order).toBeHidden();
    await expect(panel.getByRole('button', { name: 'Expandir resultados por período', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: 'Ver todos os períodos', exact: true }).click();
    await expect(panel).toBeFocused();
    await expect(order).toHaveValue('attainment');
    for (const period of await panel.locator('[data-period][data-month]').all()) await expect(period).toBeVisible();
    expect(await months('month')).toEqual([4, 6, 1, 0, 3, 7, 2, 5, ...unknown]);
    await expect(select(page, 'Cooperativa')).toHaveValue('1002:3017');
    await expect(select(page, 'Carteira')).toHaveValue('AR');
    await expect(select(page, 'Mês de referência')).toHaveValue('7');
    await panel.screenshot({ path: info.outputPath('compact-periods-desktop.png') });
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const moneyLines = await panel.locator('[data-field]').evaluateAll(cells => {
      const values = cells.flatMap(cell => {
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT), nodes = [];
        while (walker.nextNode()) if (/^(?:[-−]\s*)?R\$/.test(walker.currentNode.textContent.trim())) nodes.push(walker.currentNode);
        return nodes;
      });
      return { count: values.length, wrapped: values.filter(node => { const range = document.createRange(); range.selectNodeContents(node); return range.getClientRects().length !== 1; }).length };
    });
    expect(moneyLines.count).toBeGreaterThan(40);expect(moneyLines.wrapped).toBe(0);
    await panel.screenshot({ path: info.outputPath('compact-periods-320.png'), style: '.sidebar, .skip-link { visibility: hidden !important; }' });
    await order.selectOption('chronological');
    expect(await months('month')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(await months('quarter')).toEqual([2, 5, 8, 11]);
    expect(await months('semester')).toEqual([5, 11]);
    expect(writes).toEqual([]); expect(relationshipWrites).toEqual([]); expect(errors).toEqual([]);
  });

  test('reference periods: annual summary and period cards retain exact large, negative and unknown amounts across desktop and mobile', async ({ page }, info) => {
    const { errors, writes, relationshipWrites } = await setup(page, dataset => upsertPlanRow(dataset, {
      entityId: 'cooperative:1002:3017', metric: 'AR', targets: Array(12).fill(9279000), annualTarget: 111348000,
      actuals: [12345000, 6495300, 6495299.99, -12945213.17, 0, 0, 186000000, 1, null, null, null, null], cutoff: '2026-08-14',
    }));
    await select(page, 'Central').selectOption('1002');
    await select(page, 'Cooperativa').selectOption('1002:3017');
    await select(page, 'Carteira').selectOption('AR');
    await select(page, 'Período').selectOption('month');
    await select(page, 'Mês de referência').selectOption('7');
    await page.getByRole('button', { name: 'Ver todos os períodos', exact: true }).click();
    const panel = periods(page), annual = periodRow(page, 'annual', 11);
    await expect(panel.locator('[data-period][data-month]')).toHaveCount(19);
    await expect(annual.locator('[data-field]')).toHaveCount(4);
    await expect(financial(page, 'annual', 11, 'target')).toContainText(money(111348000));
    await expect(financial(page, 'annual', 11, 'actual')).toContainText(money(198390387.82));
    await expect(financial(page, 'annual', 11, 'variance')).toContainText(money(87042387.82));
    await expect(financial(page, 'annual', 11, 'variance')).toContainText('Superação');
    await expect(financial(page, 'quarter', 5, 'actual')).toContainText(money(-12945213.17));
    await expect(periodRow(page, 'quarter', 5).locator('[data-attainment]')).toHaveAttribute('data-attainment', 'red');
    await expect(financial(page, 'quarter', 5, 'variance')).toContainText('GAP');
    await expect(financial(page, 'quarter', 8, 'actual')).toContainText(money(186000001));
    await expect(periodRow(page, 'quarter', 8).locator('[data-attainment]')).toHaveAttribute('data-attainment', 'blue');
    await expect(periodRow(page, 'month', 1).locator('[data-attainment]')).toHaveAttribute('data-attainment', 'yellow');
    await expect(periodRow(page, 'month', 2).locator('[data-attainment]')).toHaveAttribute('data-attainment', 'red');
    const future = periodRow(page, 'quarter', 11);
    await expect(future).toHaveAttribute('data-phase', 'future');
    await expect(future.locator('[data-attainment]')).toHaveAttribute('data-attainment', 'neutral');
    await expect(future.locator('[data-field="actual"]')).toContainText('Não disponível');
    await expect(future.locator('[data-field="actual"]')).not.toContainText('0,00');
    for (const width of [1440, 1280, 960, 390, 320]) {
      await page.setViewportSize({ width, height: width > 960 ? 1100 : 844 });
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `page overflow at ${width}`).toBe(true);
      const geometry = await panel.locator('[data-field]').evaluateAll(fields => fields.flatMap(field => {
        const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT), values = [];
        const container = field.closest('td, dd') || field;
        const bounds = container.getBoundingClientRect(), style = getComputedStyle(container);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!/^(?:[-−]\s*)?R\$/.test(node.textContent.trim())) continue;
          const range = document.createRange(); range.selectNodeContents(node);
          const lines = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
          const box = range.getBoundingClientRect();
          values.push({ text: node.textContent, lines: lines.length, left: box.left, right: box.right,
            availableLeft: bounds.left + parseFloat(style.paddingLeft), availableRight: bounds.right - parseFloat(style.paddingRight) });
        }
        return values;
      }));
      expect(geometry.length).toBeGreaterThan(40);
      for (const amount of geometry) {
        expect(amount.lines, `${width}: ${amount.text}`).toBe(1);
        expect(amount.left, `${width}: left ${amount.text}`).toBeGreaterThanOrEqual(amount.availableLeft - 1);
        expect(amount.right, `${width}: right ${amount.text}`).toBeLessThanOrEqual(amount.availableRight + 1);
      }
      // Monthly data may scroll horizontally, while the summary and cards must fit the viewport.
      const cardBounds = await panel.locator('article[data-period][data-month]').evaluateAll(cards => cards.map(card => {
        const box = card.getBoundingClientRect(); return { left: box.left, right: box.right, width: box.width, scroll: card.scrollWidth, client: card.clientWidth };
      }));
      expect(cardBounds).toHaveLength(7);
      for (const bounds of cardBounds) {
        expect(bounds.left).toBeGreaterThanOrEqual(0);expect(bounds.right).toBeLessThanOrEqual(width + 1);
        expect(bounds.scroll).toBeLessThanOrEqual(bounds.client + 1);
      }
      if ([1440, 390, 320].includes(width)) await panel.screenshot({ path: info.outputPath(`reference-periods-large-${width}.png`), style: '.sidebar, .skip-link { visibility: hidden !important; }' });
    }
    // Keyboard activation keeps the annual data and filter state intact when reopened.
    const toggle = panel.getByRole('button', { name: 'Recolher resultado anual', exact: true });
    await toggle.focus();await toggle.press('Space');
    await expect(annual).toBeHidden();
    await expect(panel.getByRole('button', { name: 'Expandir resultado anual', exact: true })).toBeFocused();
    await panel.getByRole('button', { name: 'Expandir resultado anual', exact: true }).press('Enter');
    await expect(annual).toBeVisible();
    await expect(financial(page, 'annual', 11, 'actual')).toContainText(money(198390387.82));
    await expect(select(page, 'Cooperativa')).toHaveValue('1002:3017');
    expect(writes).toEqual([]);expect(relationshipWrites).toEqual([]);expect(errors).toEqual([]);
  });

  test('management communication: AR quarter filters, order and selected units remain exact while projection is optional in every format', async ({ page }, info) => {
    await captureCopies(page);
    const { errors, writes, relationshipWrites } = await setup(page, managementFixture);
    await select(page, 'Central').selectOption('1002');
    await select(page, 'Carteira').selectOption('AR');
    await select(page, 'Período').selectOption('quarter');
    await select(page, 'Trimestre').selectOption('3');
    await page.getByLabel('Buscar cooperativa ou PA').fill('Cooperativa');
    await select(page, 'Filtrar situação').selectOption('attention');
    await select(page, 'Ordenar análise').selectOption('production');
    await expect(results(page).getByRole('checkbox', { name: /^Selecionar (?!todas)/ })).toHaveCount(2);
    await page.getByRole('button', { name: 'Gerar comunicação', exact: true }).click();
    const chooser = page.getByRole('dialog', { name: 'Gerar comunicação', exact: true });
    await expect(projection(chooser)).not.toBeChecked();
    await chooser.getByRole('radio', { name: 'Cooperativas da seleção', exact: true }).check();
    await chooser.getByRole('radio', { name: 'E-mail', exact: true }).check();
    await chooser.getByRole('button', { name: 'Continuar', exact: true }).click();
    const dialog = share(page);
    await expect(projection(dialog)).not.toBeChecked();
    await expect(select(dialog, 'Ordem das unidades')).toHaveValue('production');
    await expect(exportedRows(page)).toHaveCount(2);
    expect(await exportedRows(page).evaluateAll(nodes => nodes.map(node => node.getAttribute('data-cooperative-id')))).toEqual(['cooperative:1002:3030', 'cooperative:1002:3025']);
    await expect(frame(page).locator('[data-communication-header]')).toContainText('Gestão comercial · Arrecadação');
    await expect(frame(page).locator('[data-communication-header]')).toContainText('3º trimestre · 2026');
    await expect(frame(page).getByRole('columnheader', { name: 'Projeção de produção', exact: true })).toHaveCount(0);
    for (const name of ['Cooperativa Alfa', 'Outra central', 'PA Alfa zero']) await expect(frame(page).locator('body')).not.toContainText(name);
    await projection(dialog).check();
    await expect(frame(page).getByRole('columnheader', { name: 'Projeção de produção', exact: true })).toBeVisible();
    for (const [id, actual, projected] of [['cooperative:1002:3030', 400, 812.90], ['cooperative:1002:3025', 200, 406.45]]) {
      const row = exportedRow(page, id);
      await expect(row.locator('td').nth(1)).toContainText(money(3000));
      await expect(row.locator('td').nth(2)).toContainText(money(actual));
      await expect(row.locator('td').nth(2)).toHaveAttribute('data-attainment-band', 'red');
      await expect(row.locator('td[data-label="Projeção de produção"]')).toContainText(money(projected));
    }
    await captureScenarioDocument(page, frame(page), info.outputPath('management-projection-email-desktop.png'));
    await dialog.getByRole('radio', { name: 'Painel resumido', exact: true }).check();
    const summary = dialog.getByRole('region', { name: 'Prévia do painel resumido', exact: true });
    await expect(summary.locator('tbody tr')).toHaveCount(2);
    await expect(summary.getByRole('columnheader', { name: 'Projeção de produção', exact: true })).toBeVisible();
    await expect(summary.locator('tbody tr').first()).toContainText('Cooperativa Delta');
    await expect(summary.locator('tbody tr').first()).toContainText(money(812.90));
    await dialog.getByRole('radio', { name: 'WhatsApp e imagem', exact: true }).check();
    const preview = dialog.getByRole('img', { name: 'Cenário das cooperativas — parte 1 de 1', exact: true });
    await expect.poll(() => preview.evaluate(image => image.naturalWidth)).toBe(1440);
    await dialog.getByRole('button', { name: 'Copiar imagem desta parte', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__managementCopies.png.length)).toBe(1);
    const copied = await page.evaluate(() => window.__managementCopies);
    expect(copied.png[0].bytes).toEqual(pngMagic); expect(copied.png[0].width).toBe(1440);
    const drawn = copied.drawings.at(-1).join(' ');
    for (const text of ['Arrecadação', '3º trimestre', 'Projeção é estimativa; não altera o realizado.', 'Cooperativa Delta', 'Cooperativa Beta', 'R$ 812,90', 'R$ 406,45']) expect(drawn).toContain(text);
    expect(drawn.indexOf('Cooperativa Delta')).toBeLessThan(drawn.indexOf('Cooperativa Beta'));
    expect(drawn).not.toContain('Cooperativa Alfa');
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Baixar imagem desta parte', exact: true }).click();
    await (await download).saveAs(info.outputPath('management-projection.png'));
    await projection(dialog).uncheck();
    await expect.poll(() => preview.evaluate(image => image.naturalWidth)).toBe(1200);
    await dialog.getByRole('radio', { name: 'Painel resumido', exact: true }).check();
    await expect(summary.getByRole('columnheader', { name: 'Projeção de produção', exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Fechar compartilhamento', exact: true }).click();
    await expect(select(page, 'Carteira')).toHaveValue('AR'); await expect(select(page, 'Trimestre')).toHaveValue('3');
    await expect(select(page, 'Filtrar situação')).toHaveValue('attention'); await expect(select(page, 'Ordenar análise')).toHaveValue('production');
    await expect(page.getByLabel('Buscar cooperativa ou PA')).toHaveValue('Cooperativa');
    await results(page).getByRole('checkbox', { name: 'Selecionar Cooperativa Beta', exact: true }).check();
    await page.getByRole('button', { name: 'Gerar comunicação', exact: true }).click();
    await expect(projection(chooser)).not.toBeChecked();
    await projection(chooser).check();
    await chooser.getByRole('radio', { name: 'Painel resumido', exact: true }).check();
    await chooser.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(projection(dialog)).toBeChecked();
    await expect(summary.locator('tbody tr')).toHaveCount(1);
    await expect(summary.locator('tbody tr')).toContainText('Cooperativa Beta');
    await expect(summary.locator('tbody tr')).toContainText(money(200));
    await expect(summary.locator('tbody tr')).toContainText(money(406.45));
    await expect(summary).not.toContainText('Cooperativa Delta');
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await dialog.getByRole('radio', { name: 'E-mail', exact: true }).check();
    await expect(exportedRows(page)).toHaveCount(1);
    await expect(exportedRow(page, 'cooperative:1002:3025').locator('td[data-label="Projeção de produção"]')).toContainText(money(406.45));
    expect(await frame(page).locator('body').evaluate(node => node.ownerDocument.documentElement.scrollWidth <= node.ownerDocument.defaultView.innerWidth + 1)).toBe(true);
    await captureScenarioDocument(page, frame(page), info.outputPath('management-projection-selected-320.png'));
    expect(writes).toEqual([]); expect(relationshipWrites).toEqual([]); expect(errors).toEqual([]);
  });
}
