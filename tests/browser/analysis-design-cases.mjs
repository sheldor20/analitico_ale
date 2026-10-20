import { upsertEntity, upsertPlanRow } from '../../lib/registry.mjs';
import { money, percent } from '../../lib/analytics.mjs';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const select = (root, name) => root.getByRole('combobox', { name, exact: true });
const context = page => page.getByRole('region', { name: 'Contexto da análise', exact: true });
const tabs = page => page.getByRole('tablist', { name: 'Análises comerciais', exact: true });
const tab = (page, name) => tabs(page).getByRole('tab', { name, exact: true });
const matrixMode = page => page.getByRole('radio', { name: 'Mês · trimestre · ano', exact: true });
const periodMode = page => page.getByRole('radio', { name: 'Resultado do período', exact: true });
const matrix = page => page.getByRole('region', { name: 'Matriz das unidades', exact: true });
const matrixTable = page => matrix(page).getByRole('table', { name: 'Metas e resultados por horizonte', exact: true });
const rows = table => table.locator('tbody > tr[data-unit-id]');
const row = (table, name) => rows(table).filter({ hasText: name });
const field = (unit, horizon, name) => unit.locator(`[data-horizon="${horizon}"][data-field="${name}"]`);
const unavailable = /Não disponível|—/;

async function advancedFilters(page) {
  const panel = page.getByRole('region', { name: 'Filtros da análise', exact: true });
  const toggle = panel.locator('.filter-toggle');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  return panel;
}

async function august(page, { cooperative = false, metric = 'VN' } = {}) {
  await select(context(page), 'Central').selectOption('1002');
  await select(context(page), 'Carteira').selectOption(metric);
  await select(context(page), 'Período').selectOption('month');
  await select(context(page), 'Mês de referência').selectOption('7');
  if (cooperative) await select(await advancedFilters(page), 'Cooperativa').selectOption('1002:3017');
  await tab(page, 'Cooperativas e PAs').click();
}

export function registerAnalysisDesignTests({ test, expect, setup }) {
  test('analysis design: the alternative matrix uses the same cohort and independently measures month, quarter and year', async ({ page }, info) => {
    const { errors, writes, workspaceWrites } = await setup(page, value => value, { compactPortal: true });
    await august(page);
    await expect(periodMode(page)).toBeChecked();
    const regular = page.getByRole('table', { name: 'Resultados das unidades filtradas', exact: true });
    await expect(regular.locator('tbody > tr.unit-result-row')).toHaveCount(2);
    const kpis = page.getByRole('region', { name: 'Resultado do período', exact: true });
    const before = await kpis.getByRole('article').allTextContents();
    await matrixMode(page).check();
    const table = matrixTable(page);
    await expect(table).toBeVisible();
    await expect(table.locator('thead > tr')).toHaveCount(2);
    for (const group of ['Mês de referência', 'Trimestre', 'Ano']) await expect(table.getByRole('columnheader', { name: new RegExp(`^${group}(?:\\s|$)`) })).toHaveCount(1);
    await expect(rows(table)).toHaveCount(2);
    const alfa = row(table, 'Cooperativa Alfa');
    for (const [horizon, target, actual, attainment] of [
      ['month', 100, 50, .5], ['quarter', 300, 100, 1 / 3], ['annual', 1200, 400, 1 / 3],
    ]) {
      await expect(field(alfa, horizon, 'target')).toContainText(money(target));
      await expect(field(alfa, horizon, 'actual')).toContainText(money(actual));
      await expect(field(alfa, horizon, 'attainment')).toContainText(percent(attainment));
    }
    await expect(alfa.locator('[data-field="cutoff"]')).toContainText('31/08/2026');
    await expect(table).not.toContainText('PA Alfa zero');
    expect(await kpis.getByRole('article').allTextContents()).toEqual(before);
    await page.screenshot({ path: info.outputPath('analysis-design-matrix-horizons.png'), fullPage: true });
    await periodMode(page).check();
    await expect(regular.locator('tbody > tr.unit-result-row')).toHaveCount(2);
    expect(await kpis.getByRole('article').allTextContents()).toEqual(before);
    expect(writes).toEqual([]); expect(workspaceWrites).toEqual([]); expect(errors).toEqual([]);
  });

  test('analysis design: matrix distinguishes informed zero, missing production and unavailable or zero targets', async ({ page }) => {
    const { errors, writes } = await setup(page, dataset => {
      dataset = upsertPlanRow(dataset, { entityId: 'cooperative:1002:3017', metric: 'VN', targets: Array(12).fill(100), annualTarget: 1200,
        actuals: [...Array(8).fill(0), null, null, null, null], cutoff: '2026-08-31' });
      dataset = upsertPlanRow(dataset, { entityId: 'cooperative:1002:3025', metric: 'VN', targets: Array(12).fill(100), annualTarget: 1200,
        actuals: [...Array(7).fill(150), null, 150, null, null, null], cutoff: '2026-09-10' });
      for (const [cooperative, name, target] of [['4001', 'Unidade sem meta', null], ['4002', 'Unidade meta zero', 0]]) {
        dataset = upsertEntity(dataset, { kind: 'cooperative', central: '1002', cooperative, name });
        dataset = upsertPlanRow(dataset, { entityId: `cooperative:1002:${cooperative}`, metric: 'VN', targets: Array(12).fill(target), annualTarget: target == null ? null : 0,
          actuals: [...Array(8).fill(0), null, null, null, null], cutoff: '2026-08-31' });
      }
      return dataset;
    }, { compactPortal: true });
    await august(page);
    await matrixMode(page).check();
    const table = matrixTable(page);
    await expect(rows(table)).toHaveCount(4);
    const zero = row(table, 'Cooperativa Alfa');
    await expect(field(zero, 'month', 'actual')).toContainText(money(0));
    await expect(field(zero, 'month', 'attainment')).toContainText('0%');
    const missing = row(table, 'Cooperativa Beta');
    await expect(field(missing, 'month', 'actual')).toContainText(unavailable);
    await expect(field(missing, 'month', 'actual')).not.toContainText('0,00');
    await expect(field(missing, 'month', 'attainment')).toHaveText('Sem dado');
    await expect(field(missing, 'quarter', 'attainment')).not.toContainText('100%');
    await expect(missing.locator('[data-field="cutoff"]')).toContainText('10/09/2026');
    const noTarget = row(table, 'Unidade sem meta');
    await expect(field(noTarget, 'month', 'target')).toContainText(unavailable);
    await expect(field(noTarget, 'month', 'actual')).toContainText(money(0));
    await expect(field(noTarget, 'month', 'attainment')).toContainText(/Sem meta|Sem avaliação|Sem base/);
    const zeroTarget = row(table, 'Unidade meta zero');
    await expect(field(zeroTarget, 'month', 'target')).toContainText(money(0));
    await expect(field(zeroTarget, 'month', 'actual')).toContainText(money(0));
    await expect(field(zeroTarget, 'month', 'attainment')).toContainText(/Meta zero|Sem meta|Sem avaliação|Sem base/);
    await expect(field(zeroTarget, 'month', 'attainment')).not.toContainText('%');
    await expect(table).not.toContainText('NaN');
    await expect(table).not.toContainText('Infinity');
    expect(writes).toEqual([]); expect(errors).toEqual([]);
  });

  test('analysis design: switching matrix and analysis tabs preserves compatible filters, ordering and checked units', async ({ page }) => {
    const { errors, writes } = await setup(page, value => value, { compactPortal: true });
    await august(page);
    const filters = await advancedFilters(page);
    await filters.getByLabel('Buscar cooperativa ou PA').fill('Alfa');
    const list = page.getByRole('region', { name: 'Lista de unidades', exact: true });
    await select(list, 'Ordenar análise').selectOption('production');
    const checkbox = list.getByRole('checkbox', { name: 'Selecionar Cooperativa Alfa', exact: true });
    await checkbox.check();
    await matrixMode(page).check();
    await expect(rows(matrixTable(page))).toHaveCount(1);
    await expect(row(matrixTable(page), 'Cooperativa Alfa')).toBeVisible();
    await tab(page, 'Por período').click();
    await expect(select(context(page), 'Central')).toHaveValue('1002');
    await expect(select(context(page), 'Mês de referência')).toHaveValue('7');
    await tab(page, 'Cooperativas e PAs').click();
    await expect(matrixMode(page)).toBeChecked();
    await expect(rows(matrixTable(page))).toHaveCount(1);
    await expect(select(page, 'Ordenar análise')).toHaveValue('production');
    await expect(filters.getByLabel('Buscar cooperativa ou PA')).toHaveValue('Alfa');
    await periodMode(page).check();
    await expect(checkbox).toBeChecked();
    await expect(list.locator('tbody > tr.unit-result-row')).toHaveCount(1);
    expect(writes).toEqual([]); expect(errors).toEqual([]);
  });

  test('analysis design: dual-portfolio matrix keeps each portfolio and its cutoff independent', async ({ page }, info) => {
    const { errors, writes } = await setup(page, dataset => upsertPlanRow(dataset, {
      entityId: 'cooperative:1002:3017', metric: 'AR', targets: Array(12).fill(1000), annualTarget: 12000,
      actuals: [...Array(9).fill(700), null, null, null], cutoff: '2026-09-10',
    }), { compactPortal: true });
    await august(page, { cooperative: true, metric: 'both' });
    await matrixMode(page).check();
    for (const [metric, cutoff, target, actual, attainment] of [
      ['VN', '31/08/2026', 100, 50, .5], ['AR', '10/09/2026', 1000, 700, .7],
    ]) {
      const table = page.locator(`[data-portfolio="${metric}"]`).getByRole('table', { name: 'Metas e resultados por horizonte', exact: true });
      await expect(rows(table)).toHaveCount(1);
      const alfa = row(table, 'Cooperativa Alfa');
      await expect(field(alfa, 'month', 'target')).toContainText(money(target));
      await expect(field(alfa, 'month', 'actual')).toContainText(money(actual));
      await expect(field(alfa, 'month', 'attainment')).toContainText(percent(attainment));
      await expect(alfa.locator('[data-field="cutoff"]')).toContainText(cutoff);
      await expect(table).not.toContainText('Cooperativa Beta');
      await expect(table).not.toContainText('PA Alfa zero');
    }
    await page.screenshot({ path: info.outputPath('analysis-design-dual-portfolio-matrix.png'), fullPage: true });
    expect(writes).toEqual([]); expect(errors).toEqual([]);
  });

  test('analysis design: all matrix records remain rendered in compact rows with only local horizontal scrolling', async ({ page }, info) => {
    const { errors } = await setup(page, dataset => {
      for (let index = 1; index <= 22; index++) {
        const cooperative = String(5000 + index);
        dataset = upsertEntity(dataset, { kind: 'cooperative', central: '1002', cooperative, name: `Cooperativa matriz ${String(index).padStart(2, '0')}` });
        dataset = upsertPlanRow(dataset, { entityId: `cooperative:1002:${cooperative}`, metric: 'VN', targets: Array(12).fill(100), annualTarget: 1200,
          actuals: [...Array(8).fill(75), null, null, null, null], cutoff: '2026-08-31' });
      }
      return dataset;
    }, { compactPortal: true });
    await tab(page, 'Cooperativas e PAs').click();
    await matrixMode(page).check();
    const table = matrixTable(page);
    await expect(rows(table)).toHaveCount(25);
    expect(new Set(await rows(table).evaluateAll(nodes => nodes.map(node => node.dataset.unitId))).size).toBe(25);
    for (const width of [1440, 1920, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1100 });
      await expect(rows(table)).toHaveCount(25);
      expect(await rows(table).evaluateAll(nodes => nodes.every(node => getComputedStyle(node).display === 'table-row'))).toBe(true);
      expect(await rows(table).first().evaluate(node => node.getBoundingClientRect().height)).toBeLessThan(72);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const geometry = await table.locator('..').evaluate(node => ({ client: node.clientHeight, scroll: node.scrollHeight }));
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
      await page.screenshot({ path: info.outputPath(`analysis-design-matrix-${width}.png`), fullPage: true });
    }
    expect(errors).toEqual([]);
  });

  test('analysis design: matrix sharing includes every filtered row and exports the same horizons to real PNG and HTML', async ({ page }, info) => {
    const { errors, writes, workspaceWrites, relationshipWrites } = await setup(page, dataset => {
      for (let index = 1; index <= 18; index++) {
        const cooperative = String(6000 + index);
        dataset = upsertEntity(dataset, { kind: 'cooperative', central: '1002', cooperative, name: `Cooperativa compartilhada ${String(index).padStart(2, '0')}` });
        dataset = upsertPlanRow(dataset, { entityId: `cooperative:1002:${cooperative}`, metric: 'VN', targets: Array(12).fill(100), annualTarget: 1200,
          actuals: [...Array(8).fill(75), null, null, null, null], cutoff: '2026-08-31' });
      }
      return dataset;
    }, { compactPortal: true });
    await august(page);
    await matrixMode(page).check();
    const source = matrixTable(page);
    await expect(rows(source)).toHaveCount(20);
    const snapshot = await rows(source).evaluateAll(nodes => nodes.map(node => ({
      name: node.querySelector('.matrix-unit .entity-button').getAttribute('aria-label').replace(/^Analisar cooperativa\s+/, ''),
      values: [...node.querySelectorAll('td[data-horizon]')].map(cell => cell.textContent.trim()),
      cutoff: node.querySelector('[data-field="cutoff"]').textContent.trim(),
    })));
    await page.locator('.page-heading-actions').getByRole('button', { name: 'Compartilhar cenário', exact: true }).click();
    const chooser = page.getByRole('dialog', { name: 'Compartilhar cenário', exact: true });
    await expect(select(chooser, 'Cenário do compartilhamento')).toHaveValue('matrix');
    await chooser.getByRole('button', { name: 'Abrir prévia da matriz', exact: true }).click();
    const report = page.getByRole('dialog', { name: 'Compartilhar cenário', exact: true });
    await expect(report.getByRole('heading', { name: 'Mês · trimestre · ano', exact: true })).toBeVisible();
    const preview = report.getByRole('region', { name: 'Prévia completa do cenário', exact: true }).getByRole('table');
    await expect(preview.locator('tbody > tr')).toHaveCount(snapshot.length);
    for (const [index, unit] of snapshot.entries()) {
      const output = preview.locator('tbody > tr').nth(index);
      await expect(output.getByRole('rowheader')).toContainText(unit.name);
      await expect(output.locator('td')).toHaveText([...unit.values, unit.cutoff]);
    }
    await expect(report).toContainText('Central Bahia teste');
    await expect(report).toContainText('AGO/2026');
    await expect(report).not.toContainText('PA Alfa zero');
    const pngPending = page.waitForEvent('download');
    await report.getByRole('button', { name: 'Baixar imagem', exact: true }).click();
    const png = await pngPending, bytes = await readFile(await png.path());
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(bytes.readUInt32BE(16)).toBe(1920);
    expect(bytes.readUInt32BE(20)).toBeGreaterThan(600);
    await png.saveAs(info.outputPath('analysis-design-matrix-all-20-units.png'));
    const htmlPending = page.waitForEvent('download');
    await report.getByRole('button', { name: 'Baixar HTML completo', exact: true }).click();
    const htmlDownload = await htmlPending, html = await readFile(await htmlDownload.path(), 'utf8');
    for (const unit of snapshot) {
      expect(html).toContain(unit.name);
      for (const value of [...unit.values, unit.cutoff]) expect(html).toContain(value);
    }
    for (const value of ['Mês · trimestre · ano', 'Central Bahia teste', 'AGO/2026', '3º trimestre', '2026']) expect(html).toContain(value);
    await htmlDownload.saveAs(info.outputPath('analysis-design-matrix-all-20-units.html'));
    await page.screenshot({ path: info.outputPath('analysis-design-matrix-share-preview.png'), fullPage: true });
    await report.getByRole('button', { name: 'Fechar compartilhamento do cenário', exact: true }).click();
    const selected = snapshot.at(-1);
    await row(source, selected.name).getByRole('button', { name: `Compartilhar cenário de ${selected.name}`, exact: true }).click();
    const individual = page.getByRole('dialog', { name: 'Compartilhar cenário', exact: true });
    const individualPreview = individual.getByRole('region', { name: 'Prévia completa do cenário', exact: true }).getByRole('table');
    await expect(individualPreview.locator('tbody > tr')).toHaveCount(1);
    await expect(individualPreview.getByRole('rowheader')).toContainText(selected.name);
    await expect(individualPreview.locator('tbody > tr > td')).toHaveText([...selected.values, selected.cutoff]);
    await expect(individualPreview).not.toContainText(snapshot.find(unit => unit.name !== selected.name).name);
    expect(writes).toEqual([]); expect(workspaceWrites).toEqual([]); expect(relationshipWrites).toEqual([]); expect(errors).toEqual([]);
  });

  test('analysis design: expanded matrix PAs stay directly under their cooperative and history returns to the selected matrix row', async ({ page }, info) => {
    const { errors, writes, relationshipWrites } = await setup(page, value => value, { compactPortal: true });
    await august(page);
    await select(page, 'Ordenar análise').selectOption('production');
    await matrixMode(page).check();
    const table = matrixTable(page);
    const alfa = row(table, 'Cooperativa Alfa');
    const selected = alfa.getByRole('checkbox', { name: 'Selecionar Cooperativa Alfa', exact: true });
    await selected.check();
    await alfa.getByRole('button', { name: 'Ver PAs de Cooperativa Alfa', exact: true }).click();
    const expanded = alfa.locator('xpath=following-sibling::tr[1]');
    await expect(expanded).toHaveClass(/matrix-expanded-unit/);
    const pas = expanded.getByRole('region', { name: 'PAs da cooperativa', exact: true });
    await expect(pas).toContainText('PA Alfa zero');
    await expect(pas).not.toContainText('PA Beta zero');
    const history = pas.getByRole('button', { name: /^Ver histórico do PA/ }).first();
    await history.scrollIntoViewIfNeeded();
    const beforeScroll = await page.evaluate(() => scrollY);
    await history.click();
    await expect(tab(page, 'Por período')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('navigation', { name: 'Trilha da análise', exact: true })).toContainText('PA Alfa zero');
    await expect(page.getByRole('region', { name: 'Resultados por período', exact: true })).toContainText('PA Alfa zero');
    await page.getByRole('button', { name: 'Voltar ao recorte anterior', exact: true }).click();
    await expect(tab(page, 'Cooperativas e PAs')).toHaveAttribute('aria-selected', 'true');
    await expect(matrixMode(page)).toBeChecked();
    await expect(select(page, 'Ordenar análise')).toHaveValue('production');
    await expect(select(context(page), 'Central')).toHaveValue('1002');
    await expect(select(context(page), 'Mês de referência')).toHaveValue('7');
    await expect(rows(table)).toHaveCount(2);
    await expect(selected).toBeChecked();
    await expect(expanded).toHaveClass(/matrix-expanded-unit/);
    await expect(pas).toContainText('PA Alfa zero');
    await expect(alfa.getByRole('button', { name: 'Recolher PAs de Cooperativa Alfa', exact: true })).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThanOrEqual(Math.max(0, beforeScroll - 100));
    await page.screenshot({ path: info.outputPath('analysis-design-matrix-pa-history-return.png'), fullPage: true });
    expect(writes).toEqual([]); expect(relationshipWrites).toEqual([]); expect(errors).toEqual([]);
  });

  test('analysis design: matrix print renders all 25 units, repeats grouped headers and keeps navigation out of the report', async ({ page }, info) => {
    const extraNames = Array.from({ length: 22 }, (_, index) => `Cooperativa impressa ${String(index + 1).padStart(2, '0')}`);
    const { errors, writes } = await setup(page, dataset => {
      for (const [index, name] of extraNames.entries()) {
        const cooperative = String(7001 + index);
        dataset = upsertEntity(dataset, { kind: 'cooperative', central: '1002', cooperative, name });
        dataset = upsertPlanRow(dataset, { entityId: `cooperative:1002:${cooperative}`, metric: 'VN', targets: Array(12).fill(100), annualTarget: 1200,
          actuals: [...Array(8).fill(75), null, null, null, null], cutoff: '2026-08-31' });
      }
      return dataset;
    }, { compactPortal: true });
    await select(context(page), 'Período').selectOption('month');
    await select(context(page), 'Mês de referência').selectOption('7');
    await tab(page, 'Cooperativas e PAs').click();
    await matrixMode(page).check();
    const table = matrixTable(page);
    await expect(rows(table)).toHaveCount(25);
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('navigation', { name: 'Navegação principal', exact: true })).toBeHidden();
    await expect(tabs(page)).toBeHidden();
    await expect(page.locator('.unit-layout-switch')).toBeHidden();
    await expect(page.locator('.page-heading-actions')).toBeHidden();
    await expect(page.locator('.skip-link')).toBeHidden();
    await expect(table.locator('tbody > tr[data-unit-id]')).toHaveCount(25);
    expect(await rows(table).evaluateAll(nodes => nodes.every(node => node.getClientRects().length > 0))).toBe(true);
    const expectedNames = ['Cooperativa Alfa', 'Cooperativa Beta', 'Outra central', ...extraNames];
    for (const name of expectedNames) await expect(row(table, name)).toBeVisible();
    expect(await table.locator('thead').evaluate(node => getComputedStyle(node).display)).toBe('table-header-group');
    expect(await rows(table).evaluateAll(nodes => nodes.every(node => ['avoid', 'avoid-page'].includes(getComputedStyle(node).breakInside)))).toBe(true);
    await expect(table.locator('.matrix-actions').first()).toBeHidden();
    const pdfPath = info.outputPath('analysis-design-matrix-all-25-units-print.pdf');
    const pdf = await page.pdf({ path: pdfPath, format: 'A4', landscape: true, printBackground: true });
    expect(pdf.toString('ascii', 0, 5)).toBe('%PDF-');
    const extraction = spawnSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    if (extraction.error?.code === 'ENOENT') {
      info.annotations.push({ type: 'pdf-text-verification', description: 'pdftotext unavailable: printed DOM, pagination rules and the generated PDF are retained for inspection.' });
    } else {
      expect(extraction.error).toBeUndefined();
      expect(extraction.status, extraction.stderr).toBe(0);
      const pages = extraction.stdout.split('\f');
      while (pages.length && !pages.at(-1).trim()) pages.pop();
      expect(pages.length).toBeGreaterThan(0);
      const allText = pages.join(' ').replace(/\s+/g, ' ');
      for (const name of expectedNames) expect(allText).toContain(name);
      for (const pageText of pages) {
        const text = pageText.replace(/\s+/g, ' ');
        const namesOnPage = expectedNames.filter(name => text.includes(name));
        expect(namesOnPage.length, 'Each printed page should contain unit records rather than only headings or controls').toBeGreaterThan(0);
        for (const label of ['Mês de referência', 'Trimestre', 'Ano', 'Meta', 'Realizado', 'Corte']) expect(text).toContain(label);
      }
      expect(allText).not.toContain('Compartilhar cenário');
      expect(allText).not.toContain('Selecionar todas');
      expect(allText).not.toContain('Ir para o conteúdo');
    }
    await page.emulateMedia({ media: 'screen' });
    expect(writes).toEqual([]); expect(errors).toEqual([]);
  });
}
