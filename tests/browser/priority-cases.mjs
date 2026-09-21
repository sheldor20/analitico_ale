import { upsertEntity, upsertPlanRow } from '../../lib/registry.mjs';
import { money } from '../../lib/analytics.mjs';
import { step } from './composer-navigation.mjs';

function priorityFixture(dataset) {
  dataset = upsertEntity(dataset, { kind: 'cooperative', central: '1002', cooperative: '4001', name: 'Cooperativa Sem realizado' });
  for (const [entityId, actual] of [
    ['cooperative:1002:3017', 95],
    ['cooperative:1002:3025', 150],
    ['cooperative:1002:4001', null],
    ['cooperative:2007:3017', 95],
  ]) dataset = upsertPlanRow(dataset, {
    entityId, metric: 'VN', targets: Array(12).fill(100), annualTarget: 1200,
    actuals: [...Array(8).fill(actual ?? 50), actual, null, null, null], cutoff: '2026-09-10',
  });
  return dataset;
}

export function registerPriorityTests({ test, expect, setup }) {
  test('priorities: near-goal action preserves hierarchy, period and contact; missing results stay unassessed on mobile', async ({ page }, info) => {
    const { errors, writes, relationshipWrites } = await setup(page, priorityFixture);
    await page.getByRole('combobox', { name: 'Central', exact: true }).selectOption('1002');
    await page.getByRole('combobox', { name: 'Período', exact: true }).selectOption('month');
    await page.getByRole('combobox', { name: 'Mês de referência', exact: true }).selectOption('8');
    const priorities = page.getByRole('region', { name: 'Prioridades da carteira', exact: true });
    const near = priorities.getByRole('button', { name: 'Ver unidades: Próximas da meta', exact: true });
    const review = priorities.getByRole('button', { name: 'Ver unidades: Conferir registros', exact: true });
    const nearCard = priorities.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Próximas da meta', exact: true }) });
    await expect(near).toBeVisible();
    await expect(review).toBeVisible();
    await expect(nearCard).toContainText('1 unidade já alcançou');
    await expect(nearCard).not.toContainText('Outra central');
    await expect(priorities.getByRole('button', { name: 'Ver unidades: Ritmo a recuperar', exact: true })).toHaveCount(0);
    const list = page.getByRole('region', { name: 'Lista de unidades', exact: true });
    await expect(list.locator('tbody tr')).toHaveCount(3);
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await near.focus(); await page.keyboard.press('Enter');
    await expect(list.locator('tbody tr')).toHaveCount(1);
    const selected = list.locator('tbody tr').first();
    await expect(selected).toContainText('Cooperativa Alfa');
    await expect(selected).toContainText('95%');
    await expect(selected).not.toContainText('Meta atingida');
    await expect(list).not.toContainText('Cooperativa Beta');
    await expect(list).not.toContainText('Outra central');
    const communicate = selected.getByRole('button', { name: 'Gerar comunicação de Cooperativa Alfa', exact: true });
    await communicate.focus(); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Comunicar resultado', exact: true });
    await expect(dialog.getByLabel('Unidade selecionada')).toHaveValue('cooperative:1002:3017');
    await expect(dialog.getByLabel('Período da mensagem')).toHaveValue('month');
    await expect(dialog.getByLabel('Mês de referência')).toHaveValue('8');
    await expect(dialog.getByText('Ana Teste', { exact: true })).toBeVisible();
    await expect(dialog.getByText('ana@example.com', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Bruno Teste', { exact: true })).toHaveCount(0);
    await step(dialog, 2);
    const frame = page.frameLocator('iframe[title="Painel do e-mail da carteira"]');
    await expect(frame.locator('body')).toContainText('Mensal · SET/2026');
    await expect(frame.locator('[data-metric="Realizado informado"]').first()).toContainText(money(95));
    await dialog.getByRole('button', { name: 'Fechar comunicação', exact: true }).click();
    await expect(list.locator('tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: 'Limpar prioridade', exact: true }).click();
    await expect(list.locator('tbody tr')).toHaveCount(3);
    await expect(page.getByRole('combobox', { name: 'Central', exact: true })).toHaveValue('1002');
    await expect(page.getByRole('combobox', { name: 'Mês de referência', exact: true })).toHaveValue('8');
    await review.focus(); await page.keyboard.press('Space');
    await expect(list.locator('tbody tr')).toHaveCount(1);
    const missing = list.locator('tbody tr').first();
    await expect(missing).toContainText('Cooperativa Sem realizado');
    await expect(missing.locator('td').nth(2)).toHaveText('—');
    await expect(missing).toContainText('Sem realizado');
    await expect(missing).not.toContainText('Meta atingida');
    await expect(missing).not.toContainText('Cooperativa Alfa');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('priorities-review-320.png'), fullPage: true });
    expect(writes).toEqual([]); expect(relationshipWrites).toEqual([]); expect(errors).toEqual([]);
  });
}
