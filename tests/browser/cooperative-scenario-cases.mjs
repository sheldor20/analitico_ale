import { readFile } from 'node:fs/promises';
import { money } from '../../lib/analytics.mjs';
import { upsertEntity, upsertPlanRow } from '../../lib/registry.mjs';
import { captureScenarioDocument } from './scenario-artifacts.mjs';

const pngMagic = [137, 80, 78, 71, 13, 10, 26, 10];
const shared = page => page.getByRole('dialog', { name: 'Compartilhar cenário das cooperativas', exact: true });
const frame = page => page.frameLocator('iframe[title="Painel do e-mail da carteira"]');
const rows = page => frame(page).locator('table[data-cooperative-scenario] tr[data-cooperative-id]');
const row = (page, id) => frame(page).locator(`tr[data-cooperative-id="${id}"]`);
const open = page => page.getByRole('region', { name: 'Lista de unidades', exact: true }).getByRole('button', { name: 'Compartilhar cooperativas', exact: true }).click();
const email = page => shared(page).getByRole('radio', { name: 'E-mail', exact: true }).check();
const close = page => shared(page).getByRole('button', { name: 'Fechar compartilhamento', exact: true }).click();

function fixture(dataset, extra = 0) {
  dataset = upsertPlanRow(dataset, { entityId: 'cooperative:1002:3025', metric: 'AR', targets: Array(12).fill(500), annualTarget: 6000,
    actuals: [...Array(8).fill(800), null, null, null, null], cutoff: '2026-08-31' });
  for (let index = 1; index <= extra; index++) {
    const cooperative = String(4000 + index);
    const target = index === 1 ? 9279000 : index === 3 ? 0 : 1000;
    dataset = upsertEntity(dataset, { kind: 'cooperative', central: '1002', cooperative, name: `Cooperativa Lote ${String(index).padStart(2, '0')}` });
    dataset = upsertPlanRow(dataset, { entityId: `cooperative:1002:${cooperative}`, metric: 'VN', targets: Array(12).fill(target), annualTarget: target * 12,
      actuals: [...Array(8).fill(index === 1 ? 186000000.17 : index === 3 ? 0 : 100), null, null, null, null], cutoff: index === 2 ? '2026-08-15' : '2026-08-31' });
  }
  return dataset;
}

async function recordExports(page) {
  await page.addInitScript(() => {
    window.__cooperativeExports = { png: [], html: [], plain: [], texts: [], denied: false };
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (value, ...args) { window.__cooperativeExports.texts.push(String(value)); return fillText.call(this, value, ...args); };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async value => { window.__cooperativeExports.plain.push(String(value)); },
      write: async items => {
        if (window.__cooperativeExports.denied) throw new DOMException('Denied', 'NotAllowedError');
        for (const item of items) {
          if (item.types.includes('image/png')) {
            const bytes = new Uint8Array(await (await item.getType('image/png')).arrayBuffer());
            const dimensions = new DataView(bytes.buffer);
            window.__cooperativeExports.png.push({ bytes: Array.from(bytes.slice(0, 8)), width: dimensions.getUint32(16), height: dimensions.getUint32(20) });
          }
          if (item.types.includes('text/html')) window.__cooperativeExports.html.push(await (await item.getType('text/html')).text());
        }
      },
    } });
  });
}

async function august(page, central = '1002') {
  await page.getByRole('combobox', { name: 'Período', exact: true }).selectOption('month');
  await page.getByRole('combobox', { name: 'Mês de referência', exact: true }).selectOption('7');
  await page.getByRole('combobox', { name: 'Central', exact: true }).selectOption(central);
}
function htmlFromEml(eml) {
  const encoded = eml.split('Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0];
  return Buffer.from(encoded.replace(/\s/g, ''), 'base64').toString('utf8');
}

export function registerCooperativeScenarioTests({ test, expect, setup }) {
  test('cooperative sharing: explicit filters, composite hierarchy, VN/AR and semester/annual keep source values without adding PAs', async ({ page }) => {
    const { errors, writes, relationshipWrites } = await setup(page, fixture);
    await august(page);
    await page.getByLabel('Buscar cooperativa ou PA').fill('Alfa');
    await page.getByRole('combobox', { name: 'Filtrar situação', exact: true }).selectOption('attention');
    await open(page); await email(page);
    await expect(shared(page).getByRole('radio', { name: 'Todas as cooperativas da seleção', exact: true })).toBeChecked();
    await expect(rows(page)).toHaveCount(2);
    await expect(row(page, 'cooperative:1002:3017').locator('td').nth(2)).toContainText(money(50));
    await expect(row(page, 'cooperative:1002:3025').locator('td').nth(2)).toContainText(money(150));
    await expect(frame(page).locator('body')).not.toContainText('PA Alfa zero');
    await shared(page).getByRole('radio', { name: 'Somente cooperativas filtradas', exact: true }).check();
    await expect(rows(page)).toHaveCount(1);
    await expect(row(page, 'cooperative:1002:3017')).toBeVisible();
    await close(page);
    await page.getByLabel('Buscar cooperativa ou PA').fill('');
    await page.getByRole('combobox', { name: 'Filtrar situação', exact: true }).selectOption('all');
    await page.getByLabel('Carteira').selectOption('AR');
    await open(page); await email(page);
    await expect(rows(page)).toHaveCount(2);
    await expect(frame(page).locator('body')).toContainText('Arrecadação');
    await expect(row(page, 'cooperative:1002:3017').locator('td').nth(2)).toContainText(money(700));
    await expect(row(page, 'cooperative:1002:3025').locator('td').nth(3)).toContainText(money(300));
    await close(page);
    await page.getByRole('combobox', { name: 'Período', exact: true }).selectOption('semester');
    await page.getByRole('combobox', { name: 'Semestre', exact: true }).selectOption('1');
    await open(page); await email(page);
    await expect(frame(page).locator('body')).toContainText('1º semestre · 2026');
    await expect(row(page, 'cooperative:1002:3025').locator('td').nth(1)).toContainText(money(3000));
    await expect(row(page, 'cooperative:1002:3025').locator('td').nth(2)).toContainText(money(4800));
    await close(page);
    await page.getByRole('combobox', { name: 'Período', exact: true }).selectOption('annual');
    await open(page); await email(page);
    await expect(frame(page).locator('body')).toContainText('Anual · 2026');
    await expect(row(page, 'cooperative:1002:3025').locator('td').nth(1)).toContainText(money(6000));
    await expect(row(page, 'cooperative:1002:3025').locator('td').nth(2)).toContainText(money(6400));
    await close(page);
    await page.getByLabel('Carteira').selectOption('VN');
    await august(page, '2007');
    await page.getByRole('combobox', { name: 'Cooperativa', exact: true }).selectOption('2007:3017');
    await open(page); await email(page);
    await expect(rows(page)).toHaveCount(1);
    await expect(row(page, 'cooperative:2007:3017')).toContainText('Outra central');
    await expect(row(page, 'cooperative:1002:3017')).toHaveCount(0);
    await expect(row(page, 'cooperative:2007:3017').locator('td').nth(2)).toContainText(money(9999));
    expect(writes).toEqual([]); expect(relationshipWrites).toEqual([]); expect(errors).toEqual([]);
  });

  test('cooperative sharing: a central shortcut prepares its complete PNG, WhatsApp, Outlook and fallback EML without sending', async ({ page, context }, info) => {
    await recordExports(page);
    const { errors, writes, relationshipWrites } = await setup(page, fixture);
    await august(page, 'all');
    await page.getByLabel('Agrupar por').selectOption('central');
    await page.getByRole('button', { name: 'Compartilhar cooperativas de Central Bahia teste', exact: true }).click();
    const dialog = shared(page);
    await expect(dialog.getByRole('img', { name: 'Cenário das cooperativas — parte 1 de 1', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Copiar texto do WhatsApp', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__cooperativeExports.plain.length)).toBe(1);
    const text = await page.evaluate(() => window.__cooperativeExports.plain[0]);
    expect(text).toContain('Cooperativa Alfa'); expect(text).toContain('Cooperativa Beta'); expect(text).not.toContain('Outra central');
    expect(text).not.toContain('PA Alfa zero');
    await dialog.getByRole('button', { name: 'Copiar imagem desta parte', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__cooperativeExports.png.length)).toBe(1);
    const png = await page.evaluate(() => window.__cooperativeExports.png[0]);
    expect(png.bytes).toEqual(pngMagic); expect(png.width).toBe(1200);
    await email(page);
    await expect(rows(page)).toHaveCount(2);
    const recipients = dialog.getByRole('textbox', { name: 'Destinatários do e-mail', exact: true });
    await expect(recipients).toHaveValue(''); await recipients.fill('gestor@example.com; apoio@example.com');
    await dialog.getByLabel('Conta do Outlook').selectOption('personal');
    await dialog.getByRole('button', { name: 'Copiar painel', exact: true }).click();
    const ready = dialog.getByRole('link', { name: 'Abrir Outlook e colar painel', exact: true });
    await expect(ready).toBeVisible();
    const outlook = new URL(await ready.getAttribute('href'));
    expect(outlook.hostname).toBe('outlook.live.com'); expect(outlook.searchParams.get('body') || '').toBe('');
    expect(outlook.searchParams.get('to').split(';').sort()).toEqual(['apoio@example.com', 'gestor@example.com']);
    const copied = await page.evaluate(() => window.__cooperativeExports.html.at(-1));
    expect((copied.match(/data-cooperative-id=/g) || [])).toHaveLength(2);
    await dialog.getByRole('radio', { name: 'WhatsApp e imagem', exact: true }).check();
    await page.evaluate(() => { window.__cooperativeExports.denied = true; });
    const pngDownload = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Copiar imagem desta parte', exact: true }).click();
    const image = await pngDownload;
    expect(Array.from((await readFile(await image.path())).subarray(0, 8))).toEqual(pngMagic);
    await image.saveAs(info.outputPath('cooperative-central.png'));
    await email(page);
    await expect(ready).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Copiar painel', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('A cópia formatada foi bloqueada');
    await recipients.fill('email-invalido');
    await expect(dialog.getByRole('button', { name: 'Baixar e-mail (.eml)', exact: true })).toBeDisabled();
    await recipients.fill('gestor@example.com');
    const emlDownload = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Baixar e-mail (.eml)', exact: true }).click();
    const eml = await readFile(await (await emlDownload).path(), 'utf8');
    expect(eml).toContain('X-Unsent: 1'); expect(eml).toContain('gestor@example.com');
    expect((htmlFromEml(eml).match(/data-cooperative-id=/g) || [])).toHaveLength(2);
    await captureScenarioDocument(page, frame(page), info.outputPath('cooperative-central-email.png'));
    expect(context.pages()).toHaveLength(1); expect(writes).toEqual([]); expect(relationshipWrites).toEqual([]); expect(errors).toEqual([]);
  });

  test('cooperative sharing: all 27 units and exceptional dates survive compact images, complete email and narrow money layouts', async ({ page }, info) => {
    await recordExports(page);
    const { errors } = await setup(page, dataset => fixture(dataset, 25));
    await august(page);
    const zero = page.getByRole('region', { name: 'Lista de unidades', exact: true }).locator('tbody tr').filter({ has: page.getByText('Cooperativa Lote 03', { exact: true }) });
    await expect(zero).toContainText('Meta zero');
    await expect(zero).not.toContainText('Meta atingida');
    await open(page);
    const dialog = shared(page);
    const names = ['Cooperativa Alfa', 'Cooperativa Beta', ...Array.from({ length: 25 }, (_, index) => `Cooperativa Lote ${String(index + 1).padStart(2, '0')}`)];
    await dialog.getByRole('button', { name: 'Copiar texto do WhatsApp', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__cooperativeExports.plain.length)).toBe(1);
    const text = await page.evaluate(() => window.__cooperativeExports.plain[0]);
    for (const name of names) expect(text).toContain(name);
    expect(text).toContain('15/08/2026'); expect(text).toContain('31/08/2026');
    for (let part = 1; part <= 2; part++) {
      await expect(dialog.getByRole('img', { name: `Cenário das cooperativas — parte ${part} de 2`, exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Copiar imagem desta parte', exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.__cooperativeExports.png.length)).toBe(part);
      if (part === 1) await dialog.getByRole('button', { name: 'Próxima parte', exact: true }).click();
    }
    const exported = await page.evaluate(() => window.__cooperativeExports);
    for (const png of exported.png) { expect(png.bytes).toEqual(pngMagic); expect(png.width).toBe(1200); expect(png.height).toBeLessThan(3000); }
    for (const name of names) expect(exported.texts.join(' ')).toContain(name);
    expect(exported.texts.map(value => value.replace(/\s/g, ' '))).toContain(money(186000000.17).replace(/\s/g, ' '));
    await email(page);
    await expect(rows(page)).toHaveCount(27);
    await expect(row(page, 'cooperative:1002:4025')).toContainText('Cooperativa Lote 25');
    await expect(row(page, 'cooperative:1002:4002')).toContainText('15/08/2026');
    await expect(row(page, 'cooperative:1002:4003')).toContainText('Meta zero');
    await expect(row(page, 'cooperative:1002:4003')).not.toContainText('Meta atingida');
    const content = await frame(page).locator('body').innerText();
    expect((content.match(/Central 1002/g) || [])).toHaveLength(1);
    expect((content.match(/31\/08\/2026/g) || [])).toHaveLength(1);
    for (const width of [1440, 820, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1100 : 844 });
      expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      const values = await frame(page).locator('strong[data-money="true"]').evaluateAll(nodes => nodes.map(node => {
        const box = node.getBoundingClientRect(), cell = node.closest('td'), bounds = cell.getBoundingClientRect();
        const style = node.ownerDocument.defaultView.getComputedStyle(cell);
        const range = node.ownerDocument.createRange(); range.selectNodeContents(node);
        return { text: node.textContent, left: box.left, right: box.right, availableLeft: bounds.left + parseFloat(style.paddingLeft), availableRight: bounds.right - parseFloat(style.paddingRight), lines: [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0).length };
      }));
      for (const value of values) {
        expect(value.lines, `${value.text} at ${width}px`).toBe(1);
        expect(value.left, `${value.text} at ${width}px`).toBeGreaterThanOrEqual(value.availableLeft - 1);
        expect(value.right, `${value.text} at ${width}px`).toBeLessThanOrEqual(value.availableRight + 1);
      }
      if (width === 1440 || width === 320) await captureScenarioDocument(page, frame(page), info.outputPath(`cooperative-list-${width}.png`));
    }
    expect(errors).toEqual([]);
  });
}
