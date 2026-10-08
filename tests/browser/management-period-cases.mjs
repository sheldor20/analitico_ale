import { upsertEntity, upsertPlanRow } from '../../lib/registry.mjs';
import { money } from '../../lib/analytics.mjs';
import { captureScenarioDocument } from './scenario-artifacts.mjs';

const select = (root, name) => root.getByRole('combobox', { name, exact: true });
const results = page => page.getByRole('region', { name: 'Lista de unidades', exact: true });
const periods = page => page.getByRole('region', { name: 'Resultados por período', exact: true });
const periodRow = (page, period, month) => periods(page).locator(`tr[data-period="${period}"][data-month="${month}"]`);
const frame = page => page.frameLocator('iframe[title="Painel do e-mail da carteira"]');
const share = page => page.getByRole('dialog', { name: 'Compartilhar cenário das cooperativas', exact: true });
const projection = root => root.getByRole('checkbox', { name: 'Incluir projeção de produção', exact: true });
const exportedRows = page => frame(page).locator('tr[data-cooperative-id]');
const exportedRow = (page, id) => frame(page).locator(`tr[data-cooperative-id="${id}"]`);
const pngMagic = [137, 80, 78, 71, 13, 10, 26, 10];

function managementFixture(dataset) {
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
    for (const [name, count] of [['Resultados mensais', 12], ['Resultados trimestrais', 4], ['Resultados semestrais', 2], ['Resultado anual', 1]]) {
      await expect(panel.getByRole('table', { name, exact: true }).locator('tbody tr')).toHaveCount(count);
    }
    for (const [month, name, actual, band] of [[0, 'Janeiro', 690, 'red'], [1, 'Fevereiro', 700, 'yellow'], [2, 'Março', 1000, 'blue']]) {
      const row = periodRow(page, 'month', month);
      await expect(row.getByRole('rowheader')).toContainText(name);
      await expect(row.locator('td').nth(0)).toContainText(money(1000));
      await expect(row.locator('td').nth(1)).toContainText(money(actual));
      await expect(row.locator('[data-attainment]')).toHaveAttribute('data-attainment', band);
    }
    const missing = periodRow(page, 'month', 8);
    await expect(missing.getByRole('rowheader')).toContainText('Setembro');
    await expect(missing.locator('td').nth(1)).not.toContainText('0,00');
    await expect(missing.locator('[data-attainment]')).toHaveAttribute('data-attainment', 'neutral');
    for (const [kind, month, target, actual] of [['quarter', 2, 3000, 2390], ['semester', 5, 6000, 4390], ['annual', 11, 12000, 6090]]) {
      const row = periodRow(page, kind, month);
      await expect(row.locator('td').nth(0)).toContainText(money(target));
      await expect(row.locator('td').nth(1)).toContainText(money(actual));
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
    await expect(periodRow(page, 'quarter', 2).locator('td').nth(1)).toContainText(money(27000));
    await expect(periodRow(page, 'quarter', 2).locator('td').nth(1)).not.toContainText(money(2390));
    await page.getByRole('navigation', { name: 'Navegação principal', exact: true }).getByRole('button', { name: 'Cadência dos PAs', exact: true }).click();
    await select(page, 'PA').selectOption('2007:3017:0');
    await expect(periodRow(page, 'month', 0).locator('td').nth(1)).toContainText(money(4000));
    await select(page, 'Central').selectOption('1002');
    await select(page, 'Cooperativa').selectOption('1002:3017');
    await select(page, 'PA').selectOption('1002:3017:0');
    await expect(periodRow(page, 'month', 0).locator('td').nth(1)).toContainText(money(10));
    await expect(periodRow(page, 'annual', 11).locator('td').nth(1)).toContainText(money(360));
    expect(writes).toEqual([]); expect(relationshipWrites).toEqual([]); expect(errors).toEqual([]);
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
