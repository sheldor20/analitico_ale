import { upsertPlanRow } from '../../lib/registry.mjs';
import { portfolioFixture } from '../portfolio-fixture.mjs';

const select = (root, name) => root.getByRole('combobox', { name, exact: true });
const periods = page => page.getByRole('region', { name: 'Resultados por período', exact: true });
async function advancedFilters(page) {
  const filters = page.getByRole('region', { name: 'Filtros da análise', exact: true });
  const toggle = filters.locator('.filter-toggle');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  return filters;
}

export function registerAnalysisPeriodTests({ test, expect, setup, owner, created }) {
  test('analysis periods: twelve months preserve zero, missing and future states across chart, granularity and sharing', async ({ page }, info) => {
    const { errors } = await setup(page, dataset => upsertPlanRow(dataset, {
      entityId: 'cooperative:1002:3017', metric: 'AR', targets: Array(12).fill(1000), annualTarget: 12000,
      actuals: [0, 700, null, 500, 1000, 500, 1000, 700, 300, null, null, null], cutoff: '2026-09-14',
    }), { compactPortal: true });
    await select(page, 'Central').selectOption('1002');
    await select(await advancedFilters(page), 'Cooperativa').selectOption('1002:3017');
    await select(page, 'Carteira').selectOption('AR');
    await page.getByRole('tab', { name: 'Por período', exact: true }).click();
    const panel = periods(page);
    await expect(panel.getByRole('button', { name: /Expandir resultados por período/i })).toHaveCount(0);
    await expect(panel.locator('tbody tr')).toHaveCount(12);
    await expect(panel.locator('[data-month="0"] [data-field="actual"]')).toContainText('0,00');
    await expect(panel.locator('tr[data-month="2"]')).toHaveAttribute('data-phase', 'missing');
    await expect(panel.locator('tr[data-month="8"]')).toHaveAttribute('data-phase', 'partial');
    await expect(panel.locator('tr[data-month="11"]')).toContainText('Dezembro');
    await expect(panel.locator('tr[data-month="11"]')).toHaveAttribute('data-phase', 'future');
    await expect(panel.locator('tr[data-month="11"] [data-field="actual"]')).not.toContainText('0,00');

    await panel.getByRole('button', { name: 'Gráfico', exact: true }).click();
    await expect(panel.getByRole('img')).toHaveAttribute('aria-label', /Realizado por período/);
    await expect(panel.locator('circle')).toHaveCount(8);
    await expect(panel.locator('circle title').filter({ hasText: 'Janeiro:' })).toContainText('0,00');
    await select(panel, 'Indicador dos períodos').selectOption('target');
    await expect(panel.locator('circle')).toHaveCount(12);
    await expect(panel).toContainText('Metas planejadas permanecem visíveis');
    await select(panel, 'Indicador dos períodos').selectOption('attainment');
    await expect(panel.getByRole('img')).toHaveAttribute('aria-label', /Escala em percentual/);
    await expect(panel).toContainText('Meta · 100%');
    await panel.getByRole('button', { name: 'Tabela', exact: true }).click();
    for (const [value, count] of [['quarter', 4], ['semester', 2], ['annual', 1], ['month', 12]]) {
      await select(panel, 'Granularidade dos períodos').selectOption(value);
      await expect(panel.locator('tbody tr')).toHaveCount(count);
    }
    await panel.getByRole('button', { name: 'Compartilhar cenário', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Compartilhar cenário por período', exact: true });
    await expect(select(dialog, 'Períodos para compartilhar')).toHaveValue('month');
    const frame = page.frameLocator('iframe[title="Painel do e-mail da carteira"]');
    await expect(frame.locator('tr[data-period-share-id]')).toHaveCount(12);
    await expect(frame.locator('tr[data-period-share-id="month:11"]')).toContainText('Dezembro');
    await dialog.getByRole('button', { name: 'Fechar compartilhamento de períodos', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await panel.screenshot({ path: info.outputPath('analysis-periods-390.png') });
    expect(errors).toEqual([]);
  });

  test('analysis comparison: differing cutoffs use equivalent closed months and zero prior production has no invented percentage', async ({ page }) => {
    const { errors } = await setup(page, value => value, { compactPortal: true });
    const dataset = portfolioFixture();
    const previous = JSON.parse(JSON.stringify(dataset).replaceAll('2026', '2025'));
    previous.rows.forEach(row => { row.cutoff = '2025-07-31'; row.actuals = [...Array(7).fill(0), ...Array(5).fill(null)]; });
    const workspaces = [dataset, previous].map((value, index) => ({ id: `00000000-0000-0000-0000-00000000001${index}`, owner_id: owner, year: value.year, revision: 1, updated_at: created, dataset: value }));
    await page.route('http://127.0.0.1:4600/rest/v1/commercial_workspaces**', async route => {
      const year = new URL(route.request().url()).searchParams.get('year');
      const selected = year ? workspaces.filter(row => `eq.${row.year}` === year) : workspaces;
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify((route.request().headers().accept || '').includes('vnd.pgrst.object') ? selected[0] || null : selected) });
    });
    await advancedFilters(page);
    await page.locator('summary').filter({ hasText: 'Gerenciar anos' }).click();
    await page.getByRole('button', { name: 'Recarregar cadastro salvo', exact: true }).click();
    await page.locator('summary').filter({ hasText: 'Gerenciar anos' }).click();
    await select(page, 'Central').selectOption('1002');
    await select(page, 'Período').selectOption('annual');
    await page.getByRole('tab', { name: 'Comparar anos', exact: true }).click();
    const comparison = page.getByRole('region', { name: 'Comparativo entre anos', exact: true });
    await expect(comparison.getByRole('button', { name: 'Comparar anos', exact: true })).toHaveCount(0);
    await expect(comparison.getByLabel('Critério e cortes do comparativo')).toContainText('JAN a JUL');
    await expect(comparison.getByLabel('Critério e cortes do comparativo')).toContainText('31/08/2026');
    await expect(comparison.getByLabel('Critério e cortes do comparativo')).toContainText('31/07/2025');
    await expect(comparison).toContainText('As datas de corte diferem');
    await comparison.locator('summary').filter({ hasText: 'Detalhar por unidade' }).click();
    await expect(comparison.locator('.comparison-unit-table tbody tr').first()).toContainText('Sem base');
    await expect(comparison.locator('.comparison-unit-table tbody tr').first()).not.toContainText('Infinity');
    await expect(comparison.getByRole('button', { name: 'Compartilhar comparativo', exact: true })).toBeEnabled();
    expect(errors).toEqual([]);
  });
}
