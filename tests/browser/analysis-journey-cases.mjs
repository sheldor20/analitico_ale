import { upsertPlanRow } from '../../lib/registry.mjs';
import { money } from '../../lib/analytics.mjs';
import { readFile } from 'node:fs/promises';

// All data and authenticated requests come from portfolio.spec.mjs's synthetic
// workspace. These journeys must never read or write a production workspace.
const tabs = ['Visão geral', 'Cooperativas e PAs', 'Por período', 'Comparar anos', 'Simulação'];
const tablist = page => page.getByRole('tablist', { name: 'Análises comerciais', exact: true });
const tab = (page, name) => tablist(page).getByRole('tab', { name, exact: true });
const context = page => page.getByRole('region', { name: 'Contexto da análise', exact: true });
const select = (root, name) => root.getByRole('combobox', { name, exact: true });
const results = page => page.getByRole('region', { name: 'Resultado do período', exact: true });
const units = page => page.getByRole('region', { name: 'Lista de unidades', exact: true });
const breadcrumb = page => page.getByRole('navigation', { name: 'Trilha da análise', exact: true });
const unitRow = (page, name) => units(page).locator('tr.unit-result-row').filter({ has: page.getByText(name, { exact: true }) });

async function advancedFilters(page) {
  const filters = page.getByRole('region', { name: 'Filtros da análise', exact: true });
  const toggle = filters.locator('.filter-toggle');
  if (await toggle.count() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  return filters;
}

async function august(page, cooperative = 'all') {
  await select(context(page), 'Central').selectOption('1002');
  await select(context(page), 'Carteira').selectOption('VN');
  await select(context(page), 'Período').selectOption('month');
  await select(context(page), 'Mês de referência').selectOption('7');
  if (cooperative !== 'all') await select(await advancedFilters(page), 'Cooperativa').selectOption(cooperative);
}

function pdfReferenceFixture(dataset) {
  // The PDF's net GAP includes the excess of Beta; the sum of individual
  // deficits deliberately excludes that excess. PA production is separate.
  for (const [entityId, target, actual] of [
    ['cooperative:1002:3017', 300000, 229063.87],
    ['cooperative:1002:3025', 277560, 286267.8],
  ]) dataset = upsertPlanRow(dataset, {
    entityId, metric: 'VN', targets: Array(12).fill(target), annualTarget: target * 12,
    actuals: [...Array(8).fill(actual), null, null, null, null], cutoff: '2026-08-31',
  });
  return dataset;
}

function dualPortfolioFixture(dataset) {
  return upsertPlanRow(dataset, {
    entityId: 'cooperative:1002:3017', metric: 'AR', targets: Array(12).fill(1000), annualTarget: 12000,
    actuals: [...Array(9).fill(700), null, null, null], cutoff: '2026-09-10',
  });
}

async function downloadReportPng(page, report, expect, info, filename) {
  const pending = page.waitForEvent('download');
  await report.getByRole('button', { name: 'Baixar imagem', exact: true }).click();
  const download = await pending;
  const bytes = await readFile(await download.path());
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBeGreaterThan(400);
  await download.saveAs(info.outputPath(filename));
}

async function downloadReportHtml(page, report, info, filename) {
  const pending = page.waitForEvent('download');
  await report.getByRole('button', { name: 'Baixar HTML completo', exact: true }).click();
  const download = await pending;
  const html = await readFile(await download.path(), 'utf8');
  await download.saveAs(info.outputPath(filename));
  return html;
}

export function registerAnalysisJourneyTests({ test, expect, setup }) {
  test('analysis journey: overview has one decision sequence and five distinct accessible tabs', async ({ page }, info) => {
    const { errors, writes, relationshipWrites } = await setup(page, value => value, { compactPortal: true });
    await expect(tablist(page).getByRole('tab')).toHaveText(tabs);
    await expect(tab(page, 'Visão geral')).toHaveAttribute('aria-selected', 'true');
    await expect(tablist(page).getByRole('tab', { selected: true })).toHaveCount(1);
    const summary = page.getByRole('region', { name: 'Resumo das unidades', exact: true });
    await expect(results(page).getByRole('article')).toHaveCount(4);
    await expect(summary).toBeVisible();
    await expect(units(page)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Resultados por período', exact: true })).toHaveCount(0);
    const positions = await Promise.all([context(page), results(page), summary].map(item => item.boundingBox()));
    expect(positions.every(Boolean)).toBe(true);
    expect(positions.map(box => box.y)).toEqual(positions.map(box => box.y).sort((a, b) => a - b));
    await page.setViewportSize({ width: 1440, height: 1100 });
    const screenIds = ['overview', 'units', 'periods', 'comparison', 'simulation'];
    for (const [index, name] of tabs.entries()) {
      await tab(page, name).click();
      await page.screenshot({ path: info.outputPath(`analysis-screen-${screenIds[index]}.png`), fullPage: true });
    }
    await tab(page, 'Visão geral').click();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1100 : 844 });
      for (const name of ['Ano do cadastro', 'Carteira', 'Central', 'Período']) await expect(select(page, name)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: info.outputPath(`analysis-overview-${width}.png`), fullPage: true });
    }
    expect(writes).toEqual([]); expect(relationshipWrites).toEqual([]); expect(errors).toEqual([]);
  });

  test('analysis journey: compatible context remains selected in every analysis tab', async ({ page }) => {
    const { errors } = await setup(page, value => value, { compactPortal: true });
    await select(context(page), 'Central').selectOption('1002');
    await select(context(page), 'Carteira').selectOption('VN');
    await select(context(page), 'Período').selectOption('quarter');
    await select(context(page), 'Trimestre').selectOption('2');
    for (const name of tabs) {
      await tab(page, name).click();
      await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true');
      await expect(tablist(page).getByRole('tab', { selected: true })).toHaveCount(1);
      await expect(select(context(page), 'Central')).toHaveValue('1002');
      await expect(select(context(page), 'Carteira')).toHaveValue('VN');
      await expect(select(context(page), 'Período')).toHaveValue('quarter');
      await expect(select(context(page), 'Trimestre')).toHaveValue('2');
      await expect(breadcrumb(page)).toContainText('Central Bahia teste');
    }
    await page.getByRole('region', { name: 'Filtros da análise', exact: true }).getByRole('button', { name: 'Limpar filtros', exact: true }).click();
    await expect(select(context(page), 'Central')).toHaveValue('all');
    expect(errors).toEqual([]);
  });

  test('analysis journey: PDF reference retains weighted attainment and distinguishes net GAP from unit deficits', async ({ page }, info) => {
    const { errors, writes, relationshipWrites } = await setup(page, pdfReferenceFixture, { compactPortal: true });
    await august(page);
    const kpis = results(page);
    await expect(kpis).toContainText(money(577560));
    await expect(kpis).toContainText(money(515331.67));
    await expect(kpis).toContainText('89,2%');
    await expect(kpis).toContainText(money(62228.33));
    await expect(page.getByText(/^Déficits das unidades:/i)).toHaveCount(0);
    await tab(page, 'Cooperativas e PAs').click();
    await expect(units(page).locator('tr.unit-result-row')).toHaveCount(2);
    const table = units(page).getByRole('table', { name: 'Resultados das unidades filtradas', exact: true });
    await expect(table.getByRole('columnheader')).toHaveText(['Cooperativa', 'Meta', 'Realizado', 'Atingimento', 'GAP / Superação', 'Projeção', 'Ações']);
    await expect(unitRow(page, 'Cooperativa Alfa').locator('[data-field="actual"]')).toContainText(money(229063.87));
    await expect(unitRow(page, 'Cooperativa Beta').locator('[data-field="actual"]')).toContainText(money(286267.8));
    await expect(table).not.toContainText('PA Alfa zero');
    await page.screenshot({ path: info.outputPath('analysis-pdf-reference-unit-table.png'), fullPage: true });
    expect(writes).toEqual([]); expect(relationshipWrites).toEqual([]); expect(errors).toEqual([]);
  });

  test('analysis journey: cooperative to PA history and return preserves the active unit, ordering and selection', async ({ page }, info) => {
    const { errors } = await setup(page, value => value, { compactPortal: true });
    await august(page);
    await tab(page, 'Cooperativas e PAs').click();
    await select(units(page), 'Ordenar análise').selectOption('production');
    await unitRow(page, 'Cooperativa Alfa').getByRole('checkbox', { name: 'Selecionar Cooperativa Alfa', exact: true }).check();
    await unitRow(page, 'Cooperativa Alfa').getByRole('button', { name: /^Analisar cooperativa/ }).click();
    await expect(breadcrumb(page)).toContainText('Cooperativa Alfa');
    await unitRow(page, 'Cooperativa Alfa').getByRole('button', { name: /^Ver PAs/ }).click();
    const pas = page.getByRole('region', { name: 'PAs da cooperativa', exact: true }).last();
    await expect(pas).toContainText('PA Alfa zero');
    const history = pas.getByRole('button', { name: /^Ver histórico/ }).first();
    await history.scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => scrollY);
    await history.click();
    await expect(tab(page, 'Por período')).toHaveAttribute('aria-selected', 'true');
    await expect(breadcrumb(page)).toContainText('PA Alfa zero');
    await expect(page.getByRole('region', { name: 'Resultados por período', exact: true })).toContainText('PA Alfa zero');
    await page.getByRole('button', { name: 'Voltar ao recorte anterior', exact: true }).click();
    await expect(tab(page, 'Cooperativas e PAs')).toHaveAttribute('aria-selected', 'true');
    await expect(select(context(page), 'Central')).toHaveValue('1002');
    await expect(select(context(page), 'Mês de referência')).toHaveValue('7');
    await expect(select(units(page), 'Ordenar análise')).toHaveValue('production');
    await expect(unitRow(page, 'Cooperativa Alfa').getByRole('checkbox', { name: 'Selecionar Cooperativa Alfa', exact: true })).toBeChecked();
    await expect(pas).toContainText('PA Alfa zero');
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThanOrEqual(Math.max(0, scrollBefore - 100));
    await page.screenshot({ path: info.outputPath('analysis-return-to-expanded-cooperative.png'), fullPage: true });
    await page.getByRole('button', { name: 'Voltar ao recorte anterior', exact: true }).click();
    await expect(units(page).locator('tr.unit-result-row')).toHaveCount(2);
    await expect(select(units(page), 'Ordenar análise')).toHaveValue('production');
    await expect(unitRow(page, 'Cooperativa Alfa').getByRole('checkbox', { name: 'Selecionar Cooperativa Alfa', exact: true })).toBeChecked();
    await expect(select(await advancedFilters(page), 'Cooperativa')).toHaveValue('all');
    expect(errors).toEqual([]);
  });

  test('analysis journey: a near-goal priority opens the matching units with the same period', async ({ page }) => {
    const { errors, relationshipWrites } = await setup(page, dataset => upsertPlanRow(dataset, {
      entityId: 'cooperative:1002:3017', metric: 'VN', targets: Array(12).fill(100), annualTarget: 1200,
      actuals: [...Array(9).fill(95), null, null, null], cutoff: '2026-09-10',
    }), { compactPortal: true });
    await august(page);
    await select(context(page), 'Mês de referência').selectOption('8');
    await select(context(page), 'Cooperativa').selectOption('1002:3017');
    await tab(page, 'Cooperativas e PAs').click();
    await expect(tab(page, 'Cooperativas e PAs')).toHaveAttribute('aria-selected', 'true');
    await expect(units(page).locator('tr.unit-result-row')).toHaveCount(1);
    await expect(unitRow(page, 'Cooperativa Alfa')).toContainText('95%');
    await expect(select(context(page), 'Central')).toHaveValue('1002');
    await expect(select(context(page), 'Mês de referência')).toHaveValue('8');
    await unitRow(page, 'Cooperativa Alfa').getByRole('button', { name: /^Ver PAs/ }).click();
    await page.getByRole('region', { name: 'PAs da cooperativa', exact: true }).getByRole('button', { name: /^Abrir cadência/ }).click();
    await expect(page.getByRole('heading', { name: 'Cadência dos PAs', level: 1, exact: true })).toBeVisible();
    await expect(select(page, 'Central')).toHaveValue('1002');
    await expect(select(await advancedFilters(page), 'Cooperativa')).toHaveValue('1002:3017');
    await expect(select(page, 'Mês de referência')).toHaveValue('8');
    expect(relationshipWrites).toEqual([]); expect(errors).toEqual([]);
  });

  test('analysis journey: periods keep January to December, distinguish zero and absence, and preview the same full year', async ({ page }, info) => {
    const { errors, writes } = await setup(page, dataset => upsertPlanRow(dataset, {
      entityId: 'cooperative:1002:3017', metric: 'VN', targets: Array(12).fill(100), annualTarget: 1200,
      actuals: [0, null, ...Array(6).fill(50), null, null, null, null], cutoff: '2026-08-31',
    }), { compactPortal: true });
    await august(page, '1002:3017');
    await tab(page, 'Por período').click();
    const periods = page.getByRole('region', { name: 'Resultados por período', exact: true });
    const monthly = periods.locator('tbody tr[data-period="month"]');
    await expect(monthly).toHaveCount(12);
    expect(await monthly.evaluateAll(rows => rows.map(row => Number(row.dataset.month)))).toEqual(Array.from({ length: 12 }, (_, index) => index));
    await expect(monthly.nth(0).locator('[data-field="actual"]')).toContainText(money(0));
    await expect(monthly.nth(1)).toHaveAttribute('data-phase', 'missing');
    await expect(monthly.nth(1).locator('[data-field="actual"]')).not.toContainText('0,00');
    await expect(monthly.nth(11)).toHaveAttribute('data-phase', 'future');
    await periods.getByRole('button', { name: 'Gráfico', exact: true }).click();
    await expect(periods.getByRole('img', { name: /^Realizado por período/ })).toBeVisible();
    await select(periods, 'Indicador dos períodos').selectOption('attainment');
    await expect(periods.getByRole('img', { name: /^Atingimento por período/ })).toBeVisible();
    await periods.getByRole('button', { name: 'Tabela', exact: true }).click();
    await select(periods, 'Granularidade dos períodos').selectOption('quarter');
    await expect(periods.locator('tbody tr[data-period="quarter"]')).toHaveCount(4);
    await select(periods, 'Granularidade dos períodos').selectOption('month');
    await page.locator('.page-heading-actions').getByRole('button', { name: 'Compartilhar cenário', exact: true }).click();
    const chooser = page.getByRole('dialog', { name: 'Compartilhar cenário', exact: true });
    await select(chooser, 'Cenário do compartilhamento').selectOption('periods');
    await chooser.getByRole('button', { name: 'Abrir prévia dos períodos', exact: true }).click();
    const share = page.getByRole('dialog', { name: 'Compartilhar cenário por período', exact: true });
    await share.getByRole('radio', { name: 'E-mail', exact: true }).check();
    const preview = page.frameLocator('iframe[title="Painel do e-mail da carteira"]');
    await expect(preview.locator('tr[data-period-share-id^="month:"]')).toHaveCount(12);
    await expect(preview.locator('body')).toContainText('Cooperativa Alfa');
    await expect(preview.locator('body')).toContainText('31/08/2026');
    await expect(preview.locator('body')).not.toContainText('Cooperativa Beta');
    await page.screenshot({ path: info.outputPath('analysis-full-year-sharing-preview.png'), fullPage: true });
    expect(writes).toEqual([]); expect(errors).toEqual([]);
  });

  test('analysis journey: simulation separates estimates and leaves actual results unchanged after restoring', async ({ page }, info) => {
    const { errors, writes, workspaceWrites } = await setup(page, value => value, { compactPortal: true });
    await august(page, '1002:3017');
    await select(context(page), 'Período').selectOption('annual');
    const actualBefore = await results(page).getByRole('article', { name: /Realizado/ }).locator('.kpi-value').innerText();
    await tab(page, 'Simulação').click();
    const simulation = page.getByRole('region', { name: 'Simulação comercial', exact: true });
    await expect(simulation).toContainText(/Realizado/);
    await expect(simulation).toContainText(/Projeção atual/);
    await expect(simulation).toContainText(/Cenário simulado|Projeção simulada/);
    const baseline = simulation.getByText('Projeção atual', { exact: true }).locator('..').locator('dd');
    const simulated = simulation.getByText('Cenário simulado', { exact: true }).locator('..').locator('dd');
    await expect(simulated).toHaveText(await baseline.innerText());
    const uplift = simulation.getByRole('slider');
    await uplift.focus();
    await uplift.press('Home');
    for (let step = 0; step < 5; step++) await uplift.press('ArrowRight');
    await expect(uplift).toHaveValue('25');
    await expect(simulation).toContainText('25%');
    await expect(simulated).not.toHaveText(await baseline.innerText());
    await expect(simulation.getByText('Realizado até o corte', { exact: true }).locator('..').locator('dd')).toHaveText(actualBefore);
    await page.screenshot({ path: info.outputPath('analysis-simulation-25-percent.png'), fullPage: true });
    await tab(page, 'Visão geral').click();
    await expect(results(page).getByRole('article', { name: /Realizado/ }).locator('.kpi-value')).toHaveText(actualBefore);
    await tab(page, 'Simulação').click();
    await expect(uplift).toHaveValue('25');
    await simulation.getByRole('button', { name: /Restaurar/ }).click();
    await expect(uplift).toHaveValue('0');
    await expect(simulated).toHaveText(await baseline.innerText());
    await tab(page, 'Visão geral').click();
    await expect(results(page).getByRole('article', { name: /Realizado/ }).locator('.kpi-value')).toHaveText(actualBefore);
    expect(writes).toEqual([]); expect(workspaceWrites).toEqual([]); expect(errors).toEqual([]);
  });

  test('analysis journey: print keeps every unit and table headers while hiding navigation and the focused skip link', async ({ page }, info) => {
    const { errors } = await setup(page, value => value, { compactPortal: true });
    const skip = page.getByRole('link', { name: 'Ir para o conteúdo', exact: true });
    await skip.focus();
    await expect(skip).toBeFocused();
    expect((await skip.boundingBox()).y).toBeGreaterThanOrEqual(0);
    await skip.press('Enter');
    await expect(page.locator('#conteudo')).toBeFocused();
    await tab(page, 'Cooperativas e PAs').click();
    const table = units(page).getByRole('table', { name: 'Resultados das unidades filtradas', exact: true });
    await expect(table.locator('tbody > tr.unit-result-row')).toHaveCount(3);
    await skip.focus();
    await page.emulateMedia({ media: 'print' });
    await expect(skip).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Navegação principal', exact: true })).toBeHidden();
    await expect(tablist(page)).toBeHidden();
    await expect(page.locator('.calculation-notes')).toBeHidden();
    await expect(table.locator('tbody > tr.unit-result-row')).toHaveCount(3);
    expect(await table.locator('thead').evaluate(node => getComputedStyle(node).display)).toBe('table-header-group');
    expect(await table.locator('tbody > tr.unit-result-row').evaluateAll(rows => rows.every(row => ['avoid', 'avoid-page'].includes(getComputedStyle(row).breakInside)))).toBe(true);
    await page.pdf({ path: info.outputPath('analysis-unit-table-print.pdf'), format: 'A4', landscape: true, printBackground: true });
    await page.emulateMedia({ media: 'screen' });
    expect(errors).toEqual([]);
  });

  test('analysis journey: sharing a dual-portfolio simulation preserves independent cuts and exports the actual PNG and complete HTML', async ({ page }, info) => {
    await page.addInitScript(() => {
      window.__analysisReportImageText = [];
      const paint = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (value, ...args) {
        window.__analysisReportImageText.push(String(value));
        return paint.call(this, value, ...args);
      };
    });
    const { errors, writes, workspaceWrites, relationshipWrites } = await setup(page, dualPortfolioFixture, { compactPortal: true });
    await august(page, '1002:3017');
    await select(context(page), 'Carteira').selectOption('both');
    await select(context(page), 'Período').selectOption('annual');
    await tab(page, 'Simulação').click();
    const portfolios = [
      { metric: 'VN', label: 'Venda Nova', target: 1200, actual: 400, cutoff: '31/08/2026' },
      { metric: 'AR', label: 'Arrecadação', target: 12000, actual: 6300, cutoff: '10/09/2026' },
    ];
    const before = [];
    for (const item of portfolios) {
      const simulation = page.locator(`[data-portfolio="${item.metric}"]`).getByRole('region', { name: 'Simulação comercial', exact: true });
      const value = label => simulation.getByText(label, { exact: true }).locator('..').locator('dd');
      await expect(value('Realizado até o corte')).toHaveText(money(item.actual));
      before.push({ ...item, baseline: await value('Projeção atual').innerText() });
    }
    const slider = page.locator('[data-portfolio="VN"]').getByRole('slider');
    await slider.focus();
    await slider.press('Home');
    for (let step = 0; step < 5; step++) await slider.press('ArrowRight');
    const expectedRows = [];
    for (const item of before) {
      const simulation = page.locator(`[data-portfolio="${item.metric}"]`).getByRole('region', { name: 'Simulação comercial', exact: true });
      const value = label => simulation.getByText(label, { exact: true }).locator('..').locator('dd');
      await expect(simulation.getByRole('slider')).toHaveValue('25');
      await expect(value('Realizado até o corte')).toHaveText(money(item.actual));
      await expect(value('Projeção atual')).toHaveText(item.baseline);
      await expect(value('Cenário simulado')).not.toHaveText(item.baseline);
      expectedRows.push(...[
        ['Meta', money(item.target)], ['Realizado', money(item.actual)],
        ['Projeção atual', item.baseline], ['Cenário simulado', await value('Cenário simulado').innerText()],
      ].map(([label, amount]) => ({ label: `${item.label} · ${label}`, amount })));
    }
    await page.screenshot({ path: info.outputPath('analysis-dual-simulation.png'), fullPage: true });
    await page.locator('.page-heading-actions').getByRole('button', { name: 'Compartilhar cenário', exact: true }).click();
    const chooser = page.getByRole('dialog', { name: 'Compartilhar cenário', exact: true });
    await select(chooser, 'Cenário do compartilhamento').selectOption('simulation');
    await chooser.getByRole('button', { name: 'Abrir prévia da simulação', exact: true }).click();
    const report = page.getByRole('dialog', { name: 'Compartilhar cenário', exact: true });
    await expect(report.getByRole('heading', { name: 'Simulação de ritmo +25%', exact: true })).toBeVisible();
    const preview = report.getByRole('region', { name: 'Prévia completa do cenário', exact: true });
    await expect(preview.locator('tbody > tr')).toHaveCount(14);
    for (const row of expectedRows) {
      const rendered = preview.getByRole('row').filter({ has: page.getByRole('rowheader', { name: row.label, exact: true }) });
      await expect(rendered).toContainText(row.amount);
    }
    for (const value of ['Central Bahia teste', 'Cooperativa Alfa', 'Venda Nova · cortes: 31/08/2026', 'Arrecadação · cortes: 10/09/2026']) await expect(report).toContainText(value);
    await page.evaluate(() => { window.__analysisReportImageText = []; });
    await downloadReportPng(page, report, expect, info, 'dual-portfolio-simulation-25.png');
    const painted = await page.evaluate(() => window.__analysisReportImageText.join(' '));
    for (const value of ['Simulação de ritmo +25%', '31/08/2026', '10/09/2026', ...expectedRows.map(row => row.label)]) expect(painted).toContain(value);
    const html = await downloadReportHtml(page, report, info, 'dual-portfolio-simulation-25.html');
    for (const value of ['Simulação de ritmo +25%', 'Central Bahia teste', 'Cooperativa Alfa', '31/08/2026', '10/09/2026', ...expectedRows.flatMap(row => [row.label, row.amount])]) expect(html).toContain(value);
    await report.getByRole('button', { name: 'Fechar compartilhamento do cenário', exact: true }).click();
    await tab(page, 'Visão geral').click();
    for (const item of before) await expect(page.locator(`[data-portfolio="${item.metric}"]`).locator('dd [data-field="actual"]')).toContainText(money(item.actual));
    expect(writes).toEqual([]); expect(workspaceWrites).toEqual([]); expect(relationshipWrites).toEqual([]); expect(errors).toEqual([]);
  });

  test('analysis journey: dual-portfolio comparison sharing exports equivalent months, validated variations and each source cutoff', async ({ page }, info) => {
    const { errors, writes, workspaceRows, workspaceWrites, relationshipWrites } = await setup(page, dualPortfolioFixture, { compactPortal: true });
    const current = structuredClone(workspaceRows[0]);
    const previous = JSON.parse(JSON.stringify(current).replaceAll('2026', '2025'));
    previous.id = '00000000-0000-0000-0000-000000000011';
    previous.dataset.rows.forEach(row => {
      row.cutoff = '2025-07-31';
      const monthly = row.metric === 'AR' ? 350 : row.source === 'cadence' ? 100 : row.cooperative === '3025' ? 100 : 25;
      row.actuals = [...Array(7).fill(monthly), ...Array(5).fill(null)];
    });
    const workspaces = [current, previous];
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    await page.route('http://127.0.0.1:4600/rest/v1/commercial_workspaces**', async route => {
      const request = route.request();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (request.method() !== 'GET') { errors.push('Comparison sharing attempted a workspace write'); return route.fulfill({ status: 405, headers }); }
      const url = new URL(request.url());
      if (url.searchParams.get('owner_id') !== `eq.${current.owner_id}`) errors.push('Comparison sharing lost owner scope');
      const year = url.searchParams.get('year');
      const selected = year ? workspaces.filter(row => `eq.${row.year}` === year) : workspaces;
      const body = (request.headers().accept || '').includes('vnd.pgrst.object') ? selected[0] || null : selected;
      return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await tab(page, 'Cooperativas e PAs').click();
    const filters = await advancedFilters(page);
    await filters.locator('summary').filter({ hasText: 'Gerenciar anos' }).click();
    await filters.getByRole('button', { name: 'Recarregar cadastro salvo', exact: true }).click();
    await expect(select(context(page), 'Ano do cadastro').locator('option[value="2025"]')).toHaveCount(1);
    const years = filters.locator('details.year-management');
    if (await years.getAttribute('open') !== null) await years.locator('summary').click();
    await august(page, '1002:3017');
    await select(context(page), 'Carteira').selectOption('both');
    await select(context(page), 'Período').selectOption('annual');
    await tab(page, 'Comparar anos').click();
    for (const item of [
      { metric: 'VN', label: 'Venda Nova', other: 'Arrecadação', cutoff: '31/08/2026', current: 350, previous: 175, delta: 175 },
      { metric: 'AR', label: 'Arrecadação', other: 'Venda Nova', cutoff: '10/09/2026', current: 4900, previous: 2450, delta: 2450 },
    ]) {
      const comparison = page.locator(`[data-portfolio="${item.metric}"]`).getByRole('region', { name: 'Comparativo entre anos', exact: true });
      await expect(comparison.getByLabel('Critério e cortes do comparativo')).toContainText('JAN a JUL');
      await expect(comparison).toContainText(item.cutoff);
      await expect(comparison).toContainText('31/07/2025');
      if (item.metric === 'VN') {
        await expect(page.locator('[data-portfolio="AR"]').getByLabel('Critério e cortes do comparativo')).toContainText('10/09/2026');
        await page.screenshot({ path: info.outputPath('analysis-dual-comparison.png'), fullPage: true });
      }
      await comparison.getByRole('button', { name: 'Compartilhar comparativo', exact: true }).click();
      const report = page.getByRole('dialog', { name: 'Compartilhar cenário', exact: true });
      await expect(report.getByRole('heading', { name: 'Comparativo entre anos', exact: true })).toBeVisible();
      for (const value of [item.label, 'Cooperativa Alfa', 'Recorte efetivamente comparado: JAN–JUL', '2026 × 2025', item.cutoff, '31/07/2025']) await expect(report).toContainText(value);
      const preview = report.getByRole('region', { name: 'Prévia completa do cenário', exact: true });
      await expect(preview.locator('tbody > tr')).toHaveCount(1);
      await expect(preview.locator('tbody > tr > td')).toHaveText([money(item.current), money(item.previous), money(item.delta), '100%']);
      const html = await downloadReportHtml(page, report, info, `comparison-${item.metric.toLowerCase()}-2026-2025.html`);
      for (const value of [item.label, 'Cooperativa Alfa', 'JAN–JUL', item.cutoff, '31/07/2025', money(item.current), money(item.previous), money(item.delta), '100%']) expect(html).toContain(value);
      expect(html).not.toContain(item.other);
      expect(html).not.toMatch(/NaN|Infinity/);
      if (item.metric === 'VN') await downloadReportPng(page, report, expect, info, 'comparison-vn-2026-2025.png');
      await report.getByRole('button', { name: 'Fechar compartilhamento do cenário', exact: true }).click();
    }
    await expect(tab(page, 'Comparar anos')).toHaveAttribute('aria-selected', 'true');
    await expect(select(context(page), 'Carteira')).toHaveValue('both');
    await expect(select(context(page), 'Período')).toHaveValue('annual');
    expect(writes).toEqual([]); expect(workspaceWrites).toEqual([]); expect(relationshipWrites).toEqual([]); expect(errors).toEqual([]);
  });
}
