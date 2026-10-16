import { upsertEntity, upsertPlanRow } from '../../lib/registry.mjs';
export function registerPortalV2Tests({ test, expect, setup }) {
  test('compact units: all cooperatives and PAs remain in one unpaginated table with natural vertical flow', async ({page},info) => {
    const {errors}=await setup(page,dataset=>{
      for (let index=1;index<=22;index++) {
        const cooperative=String(5000+index),pa=String(index);
        dataset=upsertEntity(dataset,{kind:'cooperative',central:'1002',cooperative,name:`Cooperativa compacta ${index}`});
        dataset=upsertPlanRow(dataset,{entityId:`cooperative:1002:${cooperative}`,metric:'VN',targets:Array(12).fill(100),annualTarget:1200,actuals:Array(12).fill(75),cutoff:'2026-08-31'});
        dataset=upsertEntity(dataset,{kind:'pa',central:'1002',cooperative:'3017',pa,name:`PA compacto ${index}`,group:'P1'});
        dataset=upsertPlanRow(dataset,{entityId:`pa:1002:3017:${pa}`,metric:'VN',targets:Array(12).fill(450),annualTarget:5400,actuals:Array(12).fill(300),cutoff:'2026-08-31'});
      }
      return dataset;
    });
    const table=page.getByRole('table',{name:'Resultados das unidades filtradas',exact:true});
    await expect(table.locator('tbody > .unit-result-row')).toHaveCount(25);
    await page.getByRole('navigation',{name:'Navegação principal',exact:true}).getByRole('button',{name:'Cadência dos PAs',exact:true}).click();
    await expect(table.locator('tbody > .unit-result-row')).toHaveCount(24);
    for (const width of [1440,768,390]) {
      await page.setViewportSize({width,height:900});
      const geometry=await table.locator('..').evaluate(node=>({height:node.clientHeight,scroll:node.scrollHeight}));
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.height+1);
      expect(await table.locator('tbody > .unit-result-row').evaluateAll(rows=>rows.every(row=>getComputedStyle(row).display==='table-row'))).toBe(true);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    }
    await page.setViewportSize({width:1440,height:900});
    await table.screenshot({path:info.outputPath('all-24-pas-in-compact-rows.png')});
    expect(errors).toEqual([]);
  });
  test('compact unit table: desktop rows keep identity and amounts together without card stacking', async ({ page }, info) => {
    await page.setViewportSize({width:1200,height:900});
    const {errors}=await setup(page);
    const row=page.locator('.unit-result-row').first();
    const bounds=await row.evaluate(node=>({height:node.getBoundingClientRect().height,identity:node.querySelector('.unit-identity').getBoundingClientRect().top,amount:node.querySelector('[data-field="target"]').getBoundingClientRect().top}));
    expect(bounds.height).toBeLessThan(110);
    expect(Math.abs(bounds.identity-bounds.amount)).toBeLessThan(3);
    const table=page.getByRole('table',{name:'Resultados das unidades filtradas',exact:true});
    await expect(table.getByRole('columnheader')).toHaveText(['Cooperativa','Meta','Realizado','Atingimento','GAP / Superação','Projeção','Ações']);
    for (const width of [1200,768,390,320]) {
      await page.setViewportSize({width,height:900});
      expect(await row.evaluate(node=>getComputedStyle(node).display)).toBe('table-row');
      expect(await row.evaluate(node=>node.getBoundingClientRect().height)).toBeLessThan(85);
      await expect(table.locator('tbody > tr.unit-result-row')).toHaveCount(3);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    }
    await page.setViewportSize({width:1200,height:900});

    await page.screenshot({path:info.outputPath('compact-units-1200.png'),fullPage:true});
    expect(errors).toEqual([]);
  });
  test('portal clean: context stays visible with filters and complementary periods collapsed', async ({ page }) => {
    const { errors } = await setup(page, value => value, { compactPortal: true });
    const filters = page.getByRole('region', { name: 'Filtros da análise' });
    await expect(filters.locator('button[aria-expanded]')).toHaveAttribute('aria-expanded', 'false');
    await expect(filters.locator('.filter-description')).toBeVisible();
    await expect(filters.getByRole('combobox', { name: 'Central', exact: true })).toBeHidden();
    await expect(page.getByRole('region', { name: 'Resultado do período', exact: true })).toBeVisible();
    const periods = page.getByRole('region', { name: 'Resultados por período', exact: true });
    await expect(periods.locator('button[aria-expanded]').first()).toHaveAttribute('aria-expanded', 'false');
    await filters.locator('button[aria-expanded]').click();
    await filters.getByRole('combobox', { name: 'Central', exact: true }).selectOption('1002');
    await filters.locator('button[aria-expanded]').click();
    await expect(filters.locator('.filter-description')).toContainText('Bahia');
    await page.getByRole('button', { name: 'Ver todos os períodos', exact: true }).click();
    await expect(periods.locator('button[aria-expanded]').first()).toHaveAttribute('aria-expanded', 'true');
    expect(errors).toEqual([]);
  });
  test('portal v2: cards, filtered table, empty state and reset use the same scope', async ({ page }, info) => {
    const { errors } = await setup(page);
    await page.getByRole('combobox', { name: 'Período', exact: true }).selectOption('month');
    await page.getByRole('combobox', { name: 'Mês de referência', exact: true }).selectOption('7');
    await page.getByLabel('Buscar cooperativa ou PA').fill('Alfa');
    const result = page.getByRole('region', { name: 'Resultado do período', exact: true });
    await expect(result.getByRole('article', { name: 'Realizado até o corte', exact: true })).toContainText('50,00');
    await expect(result.getByRole('article', { name: 'Meta do período', exact: true })).toContainText('100,00');
    await expect(page.locator('.overview-units-heading').getByRole('heading')).toHaveText('Resultado por cooperativa');
    await expect(page.locator('.overview-units-heading')).toContainText('1 de 3 unidades');
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
    await page.getByRole('combobox', { name: 'Filtrar situação', exact: true }).selectOption('all');
    await page.getByLabel('Buscar cooperativa ou PA').fill('Beta');
    await page.locator('summary').filter({ hasText: 'Evolução e simulação' }).click();
    await expect(page.locator('.route-number')).toHaveText(/1\s*\/\s*1/);
    await expect(page.locator('.route-progress > span')).toHaveAttribute('style', /width: 100%/);
    expect(errors).toEqual([]);
  });
  test('portal v2: filters preserve values while collapsed and navigation works on small screens', async ({ page }, info) => {
    const { errors } = await setup(page);
    await page.getByRole('combobox', { name: 'Central', exact: true }).selectOption('1002');
    await page.getByRole('combobox', { name: 'Período', exact: true }).selectOption('quarter');
    await page.getByRole('combobox', { name: 'Trimestre', exact: true }).selectOption('2');
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
      await page.locator('.filter-toggle[aria-expanded="false"]').click();
      await expect(page.getByRole('combobox', { name: 'Central', exact: true })).toHaveValue('1002');
      await expect(page.getByRole('combobox', { name: 'Trimestre', exact: true })).toHaveValue('2');
      await expect(page.getByRole('button', { name: 'Sair', exact: true }).locator('span')).toBeVisible();
      await page.screenshot({ path: info.outputPath(`portal-v2-mobile-${width}.png`), fullPage: true });
    }
    expect(errors).toEqual([]);
  });
  test('portal v2: all views retain focus and fit desktop and both mobile widths', async ({ page }, info) => {
    const { errors } = await setup(page);
    const views = ['Visão geral','Cadência dos PAs','Plano de ação','Conferência da base','Importações','Cadastro e metas','Metas atingidas','Agenda'];
    for (const width of [1440,390,320]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1100 : 844 });
      for (const [index, name] of views.entries()) {
        await page.getByRole('navigation', { name: 'Navegação principal', exact: true }).getByRole('button', { name, exact: true }).click();
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
    await expect(page.getByRole('button', { name: 'Gerar comunicação', exact: true })).toHaveCount(0);
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
