import { readFile } from 'node:fs/promises';
import { upsertPlanRow } from '../../lib/registry.mjs';
import { money } from '../../lib/analytics.mjs';
import { captureScenarioDocument } from './scenario-artifacts.mjs';

const select = (root, name) => root.getByRole('combobox', { name, exact: true });
const list = page => page.getByRole('region', { name: 'Lista de unidades', exact: true });
const frame = page => page.frameLocator('iframe[title="Painel do e-mail da carteira"]');
const dialog = (page, kind = 'cooperativas') => page.getByRole('dialog', { name: `Compartilhar cenário das ${kind}`, exact: true });
const portfolio = (page, metric) => page.locator(`[data-portfolio="${metric}"]`);
const sourceRows = (page, metric) => portfolio(page, metric).locator('tr[data-unit-id]');
const report = (page, metric) => frame(page).locator(`[data-scenario-metric="${metric}"]`);
const pngMagic = [137, 80, 78, 71, 13, 10, 26, 10];
const numeric = value => money(value).replace(/\s/g, ' ');

function fixture(dataset) {
  for (const [entityId, metric, target, actual, cutoff] of [
    ['cooperative:1002:3017', 'VN', 100, 95, '2026-09-10'],
    ['cooperative:1002:3025', 'VN', 100, -25.5, '2026-09-07'],
    ['cooperative:1002:3017', 'AR', 1000, 700, '2026-09-05'],
    ['pa:1002:3017:0', 'VN', 500000, 999999, '2026-09-10'],
  ]) dataset = upsertPlanRow(dataset, { entityId, metric, targets: Array(12).fill(target), annualTarget: target * 12,
    actuals: [...Array(8).fill(actual), actual, null, null, null], cutoff });
  return dataset;
}

async function copies(page) {
  await page.addInitScript(() => {
    window.__filteredCopies = { html: [], text: [], png: [], drawings: [], denied: false };
    const paint = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (value, ...args) {
      this.canvas.__filteredText ??= [];this.canvas.__filteredText.push(String(value));return paint.call(this, value, ...args);
    };
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      const text = [...(this.__filteredText || [])];
      return toBlob.call(this, blob => { if (blob) window.__filteredCopies.drawings.push(text);callback(blob); }, ...args);
    };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async value => { window.__filteredCopies.text.push(String(value)); },
      write: async items => {
        if (window.__filteredCopies.denied) throw new DOMException('Synthetic denied clipboard', 'NotAllowedError');
        for (const item of items) {
          if (item.types.includes('text/html')) window.__filteredCopies.html.push(await (await item.getType('text/html')).text());
          if (item.types.includes('image/png')) {
            const bytes = new Uint8Array(await (await item.getType('image/png')).arrayBuffer()), view = new DataView(bytes.buffer);
            window.__filteredCopies.png.push({ magic: [...bytes.slice(0, 8)], width: view.getUint32(16), height: view.getUint32(20) });
          }
        }
      },
    } });
  });
}

async function september(page) {
  await select(page, 'Período').selectOption('month');await select(page, 'Mês de referência').selectOption('8');
  await select(page, 'Ordenar análise').selectOption('production');
}
async function generate(page, format = 'E-mail') {
  await page.getByRole('button', { name: 'Gerar comunicação', exact: true }).click();
  const chooser = page.getByRole('dialog', { name: 'Gerar comunicação', exact: true });
  await chooser.getByRole('radio', { name: format, exact: true }).check();
  await chooser.getByRole('button', { name: 'Continuar', exact: true }).click();
}
async function noScopePicker(expect, modal) {
  for (const name of ['Selecionar unidades', 'Todas as cooperativas da seleção', 'Somente cooperativas filtradas']) await expect(modal.getByRole('radio', { name, exact: true })).toHaveCount(0);
  await expect(modal.getByRole('searchbox', { name: 'Buscar unidades para selecionar', exact: true })).toHaveCount(0);
  await expect(select(modal, 'Ordem das unidades')).toHaveCount(0);
}

export function registerFilteredSharingTests({ test, expect, setup }) {
  test('filtered sharing: central level ignores export checkboxes and preserves the partial cooperative and priority snapshot', async ({ page, context }, info) => {
    await copies(page);
    const { errors, writes, relationshipWrites } = await setup(page, fixture);
    await september(page);await select(page, 'Agrupar por').selectOption('central');
    await expect(list(page).locator('tbody tr')).toHaveCount(2);
    await list(page).getByRole('checkbox', { name: 'Selecionar Central Bahia teste', exact: true }).check();
    await generate(page);
    const modal = dialog(page, 'centrais');await noScopePicker(expect, modal);
    const rows = frame(page).locator('tr[data-central-id]');
    await expect(rows).toHaveCount(2);
    expect(await rows.evaluateAll(nodes => nodes.map(node => node.dataset.centralId))).toEqual(['central:1002', 'central:2007']);
    const bahia = frame(page).locator('tr[data-central-id="central:1002"]');
    await expect(bahia.locator('td[data-label="Meta"]')).toContainText(money(200));
    await expect(bahia.locator('td[data-label="Realizado / % da meta"]')).toContainText(money(69.5));
    await expect(frame(page).locator('tr[data-cooperative-id],tr[data-pa-id]')).toHaveCount(0);
    await expect(frame(page).locator('body')).not.toContainText(money(999999));
    await modal.getByRole('button', { name: 'Fechar compartilhamento', exact: true }).click();
    await select(page, 'Central').selectOption('1002');await select(page, 'Cooperativa').selectOption('1002:3017');
    await page.getByLabel('Buscar cooperativa ou PA').fill('Bahia');
    await page.getByRole('region', { name: 'Prioridades da carteira', exact: true }).getByRole('button', { name: 'Ver unidades: Próximas da meta', exact: true }).click();
    await expect(list(page).locator('tbody tr')).toHaveCount(1);
    await generate(page);await expect(rows).toHaveCount(1);
    await expect(bahia.locator('td[data-label="Meta"]')).toContainText(money(100));
    await expect(bahia.locator('td[data-label="Realizado / % da meta"]')).toContainText(money(95));
    await expect(bahia.locator('td[data-label="Crescimento ou GAP"]')).toContainText(money(5));
    await expect(frame(page).locator('[data-communication-context]')).toContainText('3017');
    await expect(frame(page).locator('[data-communication-context]')).toContainText('Cooperativa Alfa');
    await expect(frame(page).locator('body')).not.toContainText('Cooperativa Beta');
    await modal.getByRole('textbox', { name: 'Destinatários do e-mail', exact: true }).fill('gestor-sintetico@example.com');
    await modal.getByRole('button', { name: 'Copiar painel', exact: true }).click();
    const ready = modal.getByRole('link', { name: 'Abrir Outlook e colar painel', exact: true });
    await expect(ready).toBeVisible();expect(new URL(await ready.getAttribute('href')).searchParams.get('body') || '').toBe('');
    expect((await page.evaluate(() => window.__filteredCopies.html.at(-1))).match(/data-central-id=/g)).toHaveLength(1);
    await captureScenarioDocument(page, frame(page), info.outputPath('filtered-central-partial-email.png'));
    await modal.getByRole('radio', { name: 'WhatsApp e imagem', exact: true }).check();
    await modal.getByRole('button', { name: 'Copiar imagem desta parte', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__filteredCopies.png.length)).toBe(1);
    const drawn = await page.evaluate(() => window.__filteredCopies.drawings.at(-1));
    expect(drawn).toContain(numeric(95));expect(drawn).toContain(numeric(100));expect(drawn.join(' ')).toContain('3017');
    expect(drawn).not.toContain(numeric(69.5));
    await modal.getByRole('radio', { name: 'E-mail', exact: true }).check();
    await expect(modal.getByRole('button', { name: 'Abrir Outlook e colar painel', exact: true })).toBeDisabled();
    await modal.getByRole('button', { name: 'Fechar compartilhamento', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Limpar prioridade', exact: true })).toBeVisible();
    await expect(page.getByLabel('Buscar cooperativa ou PA')).toHaveValue('Bahia');
    await expect(select(page, 'Cooperativa')).toHaveValue('1002:3017');
    await list(page).getByRole('button', { name: 'Compartilhar cooperativas de Central Bahia teste', exact: true }).click();
    const childModal = dialog(page);await childModal.getByRole('radio', { name: 'E-mail', exact: true }).check();
    await expect(frame(page).locator('tr[data-cooperative-id]')).toHaveCount(1);
    await expect(frame(page).locator('tr[data-cooperative-id]')).toHaveAttribute('data-cooperative-id', 'cooperative:1002:3017');
    await expect(frame(page).locator('td[data-label="Realizado / % da meta"]')).toContainText(money(95));
    await childModal.getByRole('button', { name: 'Fechar compartilhamento', exact: true }).click();
    expect(context.pages()).toHaveLength(1);expect(writes).toEqual([]);expect(relationshipWrites).toEqual([]);expect(errors).toEqual([]);
  });

  test('filtered sharing: both portfolios retain independent rows, cutoffs and missing values in email, WhatsApp and metric-specific PNG parts', async ({ page, context }, info) => {
    await copies(page);
    const { errors, writes, relationshipWrites } = await setup(page, fixture);
    await september(page);await select(page, 'Central').selectOption('1002');await select(page, 'Carteira').selectOption('both');
    const expectedIds = ['cooperative:1002:3017', 'cooperative:1002:3025'];
    for (const metric of ['VN', 'AR']) {
      await expect(sourceRows(page, metric)).toHaveCount(2);
      expect(await sourceRows(page, metric).evaluateAll(nodes => nodes.map(node => node.dataset.unitId))).toEqual(expectedIds);
    }
    await expect(portfolio(page, 'VN')).toContainText('10/09/2026');await expect(portfolio(page, 'AR')).toContainText('05/09/2026');
    await expect(portfolio(page, 'AR').locator('header')).toContainText('Dados incompletos');
    const betaAr = portfolio(page, 'AR').locator('tr[data-unit-id="cooperative:1002:3025"]');
    await expect(betaAr.locator('[data-field="actual"]')).toContainText('Não disponível');await expect(betaAr.locator('[data-attainment]')).toHaveAttribute('data-attainment', 'neutral');
    await expect(portfolio(page, 'VN').locator('tr[data-unit-id="cooperative:1002:3025"] [data-field="actual"]')).toContainText(money(-25.5));
    await page.getByRole('region', { name: 'Venda Nova e Arrecadação', exact: true }).screenshot({ path: info.outputPath('both-portfolios-desktop.png') });
    await generate(page);const modal = dialog(page);await noScopePicker(expect, modal);
    await expect(frame(page).locator('[data-scenario-metric]')).toHaveCount(2);
    for (const metric of ['VN', 'AR']) expect(await report(page, metric).locator('tr[data-cooperative-id]').evaluateAll(nodes => nodes.map(node => node.dataset.cooperativeId))).toEqual(expectedIds);
    await expect(report(page, 'VN').locator('tr[data-cooperative-id="cooperative:1002:3017"] td[data-label="Realizado / % da meta"]')).toContainText(money(95));
    await expect(report(page, 'VN').locator('tr[data-cooperative-id="cooperative:1002:3025"] td[data-label="Realizado / % da meta"]')).toContainText(money(-25.5));
    await expect(report(page, 'AR').locator('tr[data-cooperative-id="cooperative:1002:3017"] td[data-label="Realizado / % da meta"]')).toContainText(money(700));
    await expect(report(page, 'AR').locator('[data-communication-context]')).toContainText('Dados incompletos');
    const unknown = report(page, 'AR').locator('tr[data-cooperative-id="cooperative:1002:3025"] td[data-label="Realizado / % da meta"]');
    await expect(unknown).toContainText('—');await expect(unknown).not.toContainText('0,00');
    await expect(frame(page).locator('body')).not.toContainText('PA Alfa zero');await expect(frame(page).locator('body')).not.toContainText(money(999999));
    await modal.getByRole('textbox', { name: 'Destinatários do e-mail', exact: true }).fill('duas-carteiras@example.com');
    await modal.getByRole('button', { name: 'Copiar painel', exact: true }).click();
    const copied = await page.evaluate(() => window.__filteredCopies.html.at(-1));
    expect((copied.match(/data-scenario-metric=/g) || [])).toHaveLength(2);
    const download = page.waitForEvent('download');await modal.getByRole('button', { name: 'Baixar e-mail (.eml)', exact: true }).click();
    const eml = await readFile(await (await download).path(), 'utf8');
    const encoded = eml.split('Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0];
    expect(Buffer.from(encoded.replace(/\s/g, ''), 'base64').toString('utf8')).toBe(copied);
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await frame(page).locator('body').evaluate(node => node.ownerDocument.documentElement.scrollWidth <= node.ownerDocument.defaultView.innerWidth + 1)).toBe(true);
    await captureScenarioDocument(page, frame(page), info.outputPath('both-portfolios-email-320.png'));
    await modal.getByRole('radio', { name: 'WhatsApp e imagem', exact: true }).check();
    await select(modal, 'Texto do WhatsApp').selectOption('report');await modal.getByRole('button', { name: 'Copiar texto do WhatsApp', exact: true }).click();
    const text = await page.evaluate(() => window.__filteredCopies.text.at(-1));
    for (const value of ['Gestão comercial · Venda nova', 'Gestão comercial · Arrecadação', '10/09/2026', '05/09/2026', money(95), money(-25.5), money(700)]) expect(text).toContain(value);
    await modal.getByRole('button', { name: 'Copiar imagem desta parte', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__filteredCopies.png.length)).toBe(1);
    const vn = await page.evaluate(() => window.__filteredCopies.drawings.at(-1));
    expect(vn).toContain('Gestão comercial · Venda nova');expect(vn).toContain(numeric(-25.5));expect(vn).not.toContain(numeric(700));
    expect(await page.evaluate(() => window.__filteredCopies.png[0].magic)).toEqual(pngMagic);
    await modal.getByRole('button', { name: 'Próxima parte', exact: true }).click();
    await expect(modal.getByText(/Arrecadação · Parte 1 de 1/)).toBeVisible();
    await page.evaluate(() => { window.__filteredCopies.denied = true; });
    const pngDownload = page.waitForEvent('download');await modal.getByRole('button', { name: 'Copiar imagem desta parte', exact: true }).click();
    const png = await pngDownload, bytes = await readFile(await png.path());expect([...bytes.slice(0, 8)]).toEqual(pngMagic);
    const ar = await page.evaluate(() => window.__filteredCopies.drawings.at(-1));
    expect(ar).toContain('Gestão comercial · Arrecadação');expect(ar).toContain(numeric(700));expect(ar).not.toContain(numeric(95));expect(ar).not.toContain(numeric(-25.5));
    expect(ar.join(' ')).toContain('Dados incompletos');
    await png.saveAs(info.outputPath('both-portfolios-ar-fallback.png'));
    expect(await page.evaluate(() => window.__filteredCopies.png.length)).toBe(1);
    await modal.getByRole('button', { name: 'Fechar compartilhamento', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    for (const metric of ['VN', 'AR']) {
      await portfolio(page, metric).evaluate(node => node.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: info.outputPath(`both-portfolios-${metric.toLowerCase()}-320.png`), fullPage: false });
    }
    await select(page, 'Filtrar situação').selectOption('missing');
    await expect(sourceRows(page, 'VN')).toHaveCount(0);await expect(sourceRows(page, 'AR')).toHaveCount(1);
    await expect(portfolio(page, 'AR')).toContainText('Sem data de atualização');
    await generate(page);await expect(report(page, 'VN').locator('tr[data-cooperative-id]')).toHaveCount(0);
    await expect(report(page, 'AR').locator('tr[data-cooperative-id]')).toHaveCount(1);
    await expect(report(page, 'AR').locator('tr[data-cooperative-id]')).toHaveAttribute('data-cooperative-id', 'cooperative:1002:3025');
    expect(context.pages()).toHaveLength(1);expect(writes).toEqual([]);expect(relationshipWrites).toEqual([]);expect(errors).toEqual([]);
  });
}
