export function registerPortalV2Tests({ test, expect, setup }) {
  test('portal v2: cards, filtered table, empty state and reset use the same scope', async ({ page }, info) => {
    const { errors } = await setup(page);
    await page.getByRole('combobox', { name: 'Período', exact: true }).selectOption('month');
    await page.getByRole('combobox', { name: 'Mês de referência', exact: true }).selectOption('7');
    await page.getByLabel('Buscar cooperativa ou PA').fill('Alfa');
    const result = page.getByRole('region', { name: 'Resultado do período', exact: true });
    await expect(result.getByRole('article', { name: 'Realizado até o corte', exact: true })).toContainText('50,00');
    await expect(result.getByRole('article', { name: 'Meta do período', exact: true })).toContainText('100,00');
    await expect(page.locator('.result-scope')).toContainText('1 cooperativa');
    await expect(page.getByRole('region', { name: 'Lista de unidades' }).locator('tbody tr')).toHaveCount(1);
    await expect(page.getByRole('meter', { name: 'Atingimento da meta' })).toHaveAttribute('aria-valuenow', '50');
    await page.getByLabel('Buscar cooperativa ou PA').fill('inexistente');
    await expect(result.getByRole('article', { name: 'Realizado até o corte', exact: true }).locator('.kpi-value')).toHaveText('—');
    await expect(page.getByRole('meter')).toHaveCount(0);
    await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Lista de unidades' }).locator('tbody tr')).toHaveCount(3);
    await page.getByRole('combobox', { name: 'Central', exact: true }).selectOption('1002');
    await page.getByRole('combobox', { name: 'Filtrar situação', exact: true }).selectOption('attention');
    await expect(result.getByRole('article', { name: 'Realizado até o corte', exact: true })).toContainText('50,00');
    await page.screenshot({ path: info.outputPath('portal-v2-desktop.png'), fullPage: true });
    expect(errors).toEqual([]);
  });
  test('portal v2: filters preserve values while collapsed and navigation works on small screens', async ({ page }, info) => {
    const { errors } = await setup(page);
    await page.getByRole('combobox', { name: 'Central', exact: true }).selectOption('1002');
    const filters = page.getByRole('region', { name: 'Filtros da análise' });
    const toggle = filters.locator('button[aria-expanded]');
    await toggle.focus(); await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(filters.getByRole('combobox', { name: 'Central', exact: true })).toBeHidden();
    await toggle.press('Enter');
    await expect(filters.getByRole('combobox', { name: 'Central', exact: true })).toHaveValue('1002');
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.getByRole('button', { name: 'Cadastro e metas', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Cadastro e metas' })).toBeFocused();
      await page.getByRole('button', { name: 'Visão geral', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Visão geral', exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('button', { name: 'Sair', exact: true }).locator('span')).toBeVisible();
      await page.screenshot({ path: info.outputPath(`portal-v2-mobile-${width}.png`), fullPage: true });
    }
    expect(errors).toEqual([]);
  });
  test('portal v2: all six views retain focus and fit desktop and both mobile widths', async ({ page }, info) => {
    const { errors } = await setup(page);
    const views = ['Visão geral','Cadência dos PAs','Plano de ação','Conferência da base','Importações','Cadastro e metas'];
    for (const width of [1440,390,320]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1100 : 844 });
      for (const [index, name] of views.entries()) {
        await page.getByRole('button', { name, exact: true }).click();
        await expect(page.getByRole('heading', { name, level: 1, exact: true })).toBeFocused();
        if (width !== 320) await page.screenshot({ path: info.outputPath(`view-${index}-${width}.png`), fullPage: true });
        const bounds = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
        expect(bounds.width, `${name} at ${width}px`).toBeLessThanOrEqual(bounds.viewport + 1);
      }
    }
    expect(errors).toEqual([]);
  });
  test('portal v2: logout clears private data and browser Back cannot restore the portal', async ({ page }) => {
    await setup(page);
    const pending = page.waitForResponse(r => r.url().endsWith('/api/auth/logout'));
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Resultado do período' })).toHaveCount(0);
    expect((await pending).status()).toBe(200);
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.context().cookies()).filter(c => c.name.startsWith('sb-') && c.value)).toHaveLength(0);
    await page.goBack();
    await expect(page.getByRole('region', { name: 'Resultado do período' })).toHaveCount(0);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Gerar e-mail / WhatsApp' })).toHaveCount(0);
  });
  test('portal v2: logout provider outage still removes local access', async ({ page }) => {
    await setup(page);
    await page.route('**/api/auth/logout', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"test provider unavailable"}' }));
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.context().cookies()).filter(c => c.name.startsWith('sb-') && c.value)).toHaveLength(0);
    await page.goto('/'); await expect(page).toHaveURL(/\/login$/);
  });
  test('portal v2: a logout notification from another tab immediately removes the workspace', async ({ page }) => {
    await setup(page);
    // Shared cookies are removed by the logging-out tab before it broadcasts the event.
    await page.context().clearCookies();
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'commercial:logout', newValue: String(Date.now()) })));
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('region', { name: 'Resultado do período' })).toHaveCount(0);
  });
}
