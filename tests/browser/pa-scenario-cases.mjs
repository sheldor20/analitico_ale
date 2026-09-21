import { readFile } from 'node:fs/promises';
import { upsertEntity, upsertPlanRow } from '../../lib/registry.mjs';
import { money } from '../../lib/analytics.mjs';
import { captureScenarioDocument } from './scenario-artifacts.mjs';

const pngMagic = [137, 80, 78, 71, 13, 10, 26, 10];

function addPa(dataset, { central = '1002', cooperative = '3017', pa, name, group = 'P1', target, actual }) {
  dataset = upsertEntity(dataset, { kind: 'pa', central, cooperative, pa, name, group });
  return upsertPlanRow(dataset, {
    entityId: `pa:${central}:${cooperative}:${pa}`, metric: 'VN',
    targets: Array(12).fill(target), annualTarget: target == null ? null : target * 12,
    actuals: [...Array(8).fill(actual), null, null, null, null], cutoff: '2026-08-31',
  });
}

function scenarioFixture(dataset, extra = 0) {
  for (const entry of [
    { pa: '1', name: 'PA Crescimento exato', group: 'P2', target: 1000, actual: 1234.56 },
    { pa: '2', name: 'PA Ajuste negativo', target: 100, actual: -25.50 },
    { pa: '3', name: 'PA Produção zero', target: 100, actual: 0 },
    { pa: '4', name: 'PA Sem realizado', target: 100, actual: null },
    { pa: '5', name: 'PA Sem meta', target: null, actual: 50 },
    { central: '2007', pa: '0', name: 'PA Nordeste zero', target: 900, actual: 800 },
  ]) dataset = addPa(dataset, entry);
  for (let index = 1; index <= extra; index++) dataset = addPa(dataset, {
    pa: String(100 + index), name: `PA Completo ${String(index).padStart(2, '0')}`,
    target: 200 + index, actual: 100 + index,
  });
  return { ...dataset, rows: dataset.rows.map(row => row.source === 'cadence' && row.central === '1002' && row.cooperative === '3025'
    ? { ...row, cutoff: '2026-08-15' } : row) };
}

// Exercise the real canvas encoder; only replace the browser clipboard boundary.
async function recordExports(page, denied = false) {
  await page.addInitScript(({ denied }) => {
    window.__paExports = { png: [], html: [], plain: [], texts: [] };
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (value, ...args) {
      window.__paExports.texts.push(String(value));
      return fillText.call(this, value, ...args);
    };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async value => {
        if (denied) throw new DOMException('Clipboard denied for fallback test', 'NotAllowedError');
        window.__paExports.plain.push(String(value));
      },
      write: async items => {
        if (denied) throw new DOMException('Clipboard denied for fallback test', 'NotAllowedError');
        for (const item of items) {
          if (item.types.includes('image/png')) {
            const blob = await item.getType('image/png');
            const bytes = new Uint8Array(await blob.arrayBuffer());
            const size = new DataView(bytes.buffer);
            window.__paExports.png.push({ bytes: Array.from(bytes.slice(0, 8)), width: size.getUint32(16), height: size.getUint32(20), size: blob.size });
          }
          if (item.types.includes('text/html')) window.__paExports.html.push(await (await item.getType('text/html')).text());
          if (item.types.includes('text/plain')) window.__paExports.plain.push(await (await item.getType('text/plain')).text());
        }
      },
    } });
  }, { denied });
}

const shared = page => page.getByRole('dialog', { name: 'Compartilhar cenário dos PAs', exact: true });
const emailFrame = page => page.frameLocator('iframe[title="Painel do e-mail da carteira"]');
const reportRows = page => emailFrame(page).locator('table[data-pa-scenario] tr[data-pa-id]');
const reportRow = (page, id) => emailFrame(page).locator(`tr[data-pa-id="${id}"]`);
const openShare = page => page.getByRole('region', { name: 'Lista de unidades', exact: true }).getByRole('button', { name: 'Compartilhar PAs', exact: true }).click();
async function selectScope(page, cooperative = 'all') {
  await page.getByRole('navigation', { name: 'Navegação principal', exact: true }).getByRole('button', { name: 'Cadência dos PAs', exact: true }).click();
  await page.getByRole('combobox', { name: 'Período', exact: true }).selectOption('month');
  await page.getByRole('combobox', { name: 'Mês de referência', exact: true }).selectOption('7');
  await page.getByRole('combobox', { name: 'Central', exact: true }).selectOption('1002');
  await page.getByRole('combobox', { name: 'Cooperativa', exact: true }).selectOption(cooperative);
}
function htmlFromEml(eml) {
  const encoded = eml.split('Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0];
  return Buffer.from(encoded.replace(/\s/g, ''), 'base64').toString('utf8');
}

export function registerPaScenarioTests({ test, expect, setup }) {
  test('PA sharing: all units is the default, filtered mode is explicit and composite hierarchy preserves PA zero', async ({ page }, info) => {
    const { errors, writes, relationshipWrites } = await setup(page, scenarioFixture);
    await selectScope(page);
    await page.getByLabel('Grupo do PA').selectOption('P1');
    await page.getByRole('combobox', { name: 'Filtrar situação', exact: true }).selectOption('attention');
    await page.getByLabel('Buscar cooperativa ou PA').fill('PA Alfa zero');
    await expect(page.getByRole('region', { name: 'Lista de unidades', exact: true }).locator('tbody tr')).toHaveCount(1);
    await openShare(page);
    const dialog = shared(page);
    await expect(dialog.getByRole('radio', { name: 'Todos os PAs da seleção', exact: true })).toBeChecked();
    await dialog.getByRole('radio', { name: 'E-mail', exact: true }).check();
    await expect(reportRows(page)).toHaveCount(7);
    await expect(reportRow(page, 'pa:1002:3017:0')).toContainText('PA Alfa zero');
    await expect(reportRow(page, 'pa:1002:3017:1')).toContainText('PA Crescimento exato');
    await expect(reportRow(page, 'pa:1002:3025:0')).toContainText('PA Beta zero');
    await expect(reportRow(page, 'pa:1002:3025:0')).toContainText('15/08/2026');
    await expect(reportRow(page, 'pa:2007:3017:0')).toHaveCount(0);
    await expect(emailFrame(page).locator('body')).toContainText('AGO/2026');
    const grouped = await emailFrame(page).locator('body').innerText();
    for (const common of ['Central 1002', 'Cooperativa 3017', 'Cooperativa 3025', '31/08/2026']) expect(grouped.split(common)).toHaveLength(2);
    await expect(reportRow(page, 'pa:1002:3017:0')).not.toContainText('Central 1002');
    await dialog.getByRole('radio', { name: 'Somente PAs filtrados', exact: true }).check();
    await expect(reportRows(page)).toHaveCount(1);
    await expect(reportRow(page, 'pa:1002:3017:0')).toContainText('PA Alfa zero');
    await dialog.getByRole('button', { name: 'Fechar compartilhamento', exact: true }).click();
    await page.getByLabel('Buscar cooperativa ou PA').fill('');
    await page.getByLabel('Grupo do PA').selectOption('all');
    await page.getByRole('combobox', { name: 'Filtrar situação', exact: true }).selectOption('all');
    await page.getByRole('combobox', { name: 'Cooperativa', exact: true }).selectOption('1002:3017');
    await openShare(page);
    await dialog.getByRole('radio', { name: 'E-mail', exact: true }).check();
    await expect(reportRows(page)).toHaveCount(6);
    await expect(reportRow(page, 'pa:1002:3025:0')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Fechar compartilhamento', exact: true }).click();
    await page.getByRole('combobox', { name: 'Cooperativa', exact: true }).selectOption('1002:3025');
    await page.getByLabel('Grupo do PA').selectOption('P2');
    await expect(page.getByRole('region', { name: 'Lista de unidades', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Compartilhar PAs', exact: true }).click();
    await dialog.getByRole('radio', { name: 'E-mail', exact: true }).check();
    await expect(reportRows(page)).toHaveCount(1);
    await expect(reportRow(page, 'pa:1002:3025:0')).toContainText('PA Beta zero');
    await dialog.getByRole('button', { name: 'Fechar compartilhamento', exact: true }).click();
    await page.getByLabel('Grupo do PA').selectOption('all');
    await page.getByRole('combobox', { name: 'Central', exact: true }).selectOption('2007');
    await page.getByRole('combobox', { name: 'Cooperativa', exact: true }).selectOption('2007:3017');
    await openShare(page);
    await dialog.getByRole('radio', { name: 'E-mail', exact: true }).check();
    await expect(reportRows(page)).toHaveCount(1);
    await expect(reportRow(page, 'pa:2007:3017:0')).toContainText('PA Nordeste zero');
    await expect(reportRow(page, 'pa:1002:3017:0')).toHaveCount(0);
    await captureScenarioDocument(page, emailFrame(page), info.outputPath('pa-scenario-hierarchy.png'));
    expect(writes).toEqual([]); expect(relationshipWrites).toEqual([]); expect(errors).toEqual([]);
  });

  test('PA sharing: exact growth, negative adjustments, zero and absent values agree across HTML, WhatsApp and PNG', async ({ page }) => {
    await recordExports(page);
    const { errors, writes, relationshipWrites } = await setup(page, scenarioFixture);
    await selectScope(page, '1002:3017');
    await openShare(page);
    const dialog = shared(page);
    await expect(dialog.getByRole('img', { name: 'Cenário dos PAs — parte 1 de 1', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Copiar texto do WhatsApp', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__paExports.plain.length)).toBe(1);
    const text = await page.evaluate(() => window.__paExports.plain[0]);
    for (const fragment of ['PA Crescimento exato', '1.234,56', '234,56', 'PA Ajuste negativo', '25,50', '125,50', 'PA Produção zero', 'PA Sem realizado', 'PA Sem meta']) expect(text).toContain(fragment);
    for (const common of ['Central 1002', 'Cooperativa 3017', '31/08/2026']) expect(text.split(common)).toHaveLength(2);
    await dialog.getByRole('button', { name: 'Copiar imagem desta parte', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__paExports.png.length)).toBe(1);
    const exported = await page.evaluate(() => window.__paExports);
    expect(exported.png[0].bytes).toEqual(pngMagic); expect(exported.png[0].width).toBe(1200);
    for (const common of ['Central 1002', 'Cooperativa 3017', '31/08/2026']) expect(exported.texts.join(' ').split(common)).toHaveLength(2);
    for (const amount of [1000, 1234.56, 234.56, -25.50, 125.50, 0]) expect(exported.texts.map(value => value.replace(/\s/g, ' '))).toContain(money(amount).replace(/\s/g, ' '));
    await dialog.getByRole('radio', { name: 'E-mail', exact: true }).check();
    await expect(reportRows(page)).toHaveCount(6);
    const commonHeader = await emailFrame(page).locator('body').innerText();
    for (const common of ['Central 1002', 'Cooperativa 3017', '31/08/2026']) expect(commonHeader.split(common)).toHaveLength(2);
    const growth = reportRow(page, 'pa:1002:3017:1').locator('td');
    await expect(growth).toHaveCount(4);
    await expect(growth.nth(1)).toContainText(money(1000));
    await expect(growth.nth(2)).toContainText(money(1234.56));
    await expect(growth.nth(3)).toContainText('Crescimento');
    await expect(growth.nth(3)).toContainText(money(234.56));
    const negative = reportRow(page, 'pa:1002:3017:2').locator('td');
    await expect(negative.nth(2)).toContainText(money(-25.50));
    await expect(negative.nth(3)).toContainText(money(125.50));
    const zero = reportRow(page, 'pa:1002:3017:3').locator('td');
    await expect(zero.nth(2)).toContainText(money(0));
    await expect(zero.nth(3)).toContainText(money(100));
    const absentActual = reportRow(page, 'pa:1002:3017:4').locator('td');
    await expect(absentActual.nth(2)).toContainText('—');
    await expect(absentActual.nth(2)).not.toContainText('0,00');
    await expect(absentActual.nth(3)).toContainText('—');
    const absentTarget = reportRow(page, 'pa:1002:3017:5').locator('td');
    await expect(absentTarget.nth(1)).toContainText('—');
    await expect(absentTarget.nth(2)).toContainText(money(50));
    await expect(absentTarget.nth(3)).toContainText('—');
    await expect(emailFrame(page).getByRole('columnheader', { name: 'Projeção', exact: true })).toHaveCount(0);
    const recipients = dialog.getByRole('textbox', { name: 'Destinatários do e-mail', exact: true });
    await expect(recipients).toHaveValue('');
    await recipients.fill('gestor@example.com; apoio@example.com');
    await dialog.getByLabel('Conta do Outlook').selectOption('personal');
    await dialog.getByRole('button', { name: 'Copiar painel', exact: true }).click();
    const ready = dialog.getByRole('link', { name: 'Abrir Outlook e colar painel', exact: true });
    await expect(ready).toBeVisible();
    const outlook = new URL(await ready.getAttribute('href'));
    expect(outlook.hostname).toBe('outlook.live.com'); expect(outlook.searchParams.get('body') || '').toBe('');
    expect(outlook.searchParams.get('to').split(';').sort()).toEqual(['apoio@example.com', 'gestor@example.com']);
    await dialog.getByRole('radio', { name: 'WhatsApp e imagem', exact: true }).check();
    await dialog.getByRole('button', { name: 'Copiar imagem desta parte', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__paExports.png.length)).toBe(2);
    await dialog.getByRole('radio', { name: 'E-mail', exact: true }).check();
    await expect(ready).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Abrir Outlook e colar painel', exact: true })).toBeDisabled();
    expect(writes).toEqual([]); expect(relationshipWrites).toEqual([]); expect(errors).toEqual([]);
  });

  test('PA sharing: dozens of units remain complete in email, WhatsApp and every numbered PNG part', async ({ page }, info) => {
    await recordExports(page);
    const { errors } = await setup(page, dataset => scenarioFixture(dataset, 40));
    await selectScope(page);
    await openShare(page);
    const dialog = shared(page);
    const names = ['PA Alfa zero', 'PA Beta zero', 'PA Crescimento exato', 'PA Ajuste negativo', 'PA Produção zero', 'PA Sem realizado', 'PA Sem meta', ...Array.from({ length: 40 }, (_, index) => `PA Completo ${String(index + 1).padStart(2, '0')}`)];
    await expect(dialog.getByText('Mensagem longa: copie o texto, abra a conversa e cole.', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Abrir WhatsApp e colar texto', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Copiar texto do WhatsApp', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__paExports.plain.length)).toBe(1);
    const whatsappReady = dialog.getByRole('link', { name: 'Abrir WhatsApp e colar texto', exact: true });
    await expect(whatsappReady).toBeVisible();
    const whatsapp = new URL(await whatsappReady.getAttribute('href'));
    expect(whatsapp.hostname).toBe('wa.me'); expect(whatsapp.searchParams.get('text') || '').toBe('');
    const text = await page.evaluate(() => window.__paExports.plain[0]);
    for (const name of names) expect(text).toContain(name);
    expect(text).not.toContain('PA Nordeste zero');
    for (let part = 1; part <= 3; part++) {
      await expect(dialog.getByRole('img', { name: `Cenário dos PAs — parte ${part} de 3`, exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Copiar imagem desta parte', exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.__paExports.png.length)).toBe(part);
      await expect(whatsappReady).toHaveCount(0);
      await expect(dialog.getByRole('button', { name: 'Abrir WhatsApp e colar texto', exact: true })).toBeDisabled();
      if (part < 3) await dialog.getByRole('button', { name: 'Próxima parte', exact: true }).click();
    }
    const exported = await page.evaluate(() => window.__paExports);
    for (const png of exported.png) { expect(png.bytes).toEqual(pngMagic); expect(png.width).toBe(1200); expect(png.height).toBeLessThan(3000); expect(png.size).toBeGreaterThan(1000); }
    const drawn = exported.texts.join(' ');
    for (const name of names) expect(drawn).toContain(name);
    expect(drawn).not.toContain('PA Nordeste zero');
    const pngEvent = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Baixar imagem desta parte', exact: true }).click();
    await (await pngEvent).saveAs(info.outputPath('pa-scenario-last-part.png'));
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
    await dialog.getByRole('button', { name: 'Copiar texto do WhatsApp', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('A cópia foi bloqueada');
    const manualWhatsapp = dialog.getByRole('link', { name: 'Abrir WhatsApp para colar manualmente', exact: true });
    await expect(manualWhatsapp).toBeVisible();
    expect(new URL(await manualWhatsapp.getAttribute('href')).searchParams.get('text') || '').toBe('');
    expect(page.context().pages()).toHaveLength(1);
    await dialog.getByRole('radio', { name: 'E-mail', exact: true }).check();
    await expect(reportRows(page)).toHaveCount(47);
    await expect(reportRow(page, 'pa:1002:3017:140')).toContainText('PA Completo 40');
    await dialog.getByRole('textbox', { name: 'Destinatários do e-mail', exact: true }).fill('gestor@example.com');
    const emlEvent = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Baixar e-mail (.eml)', exact: true }).click();
    const eml = await readFile(await (await emlEvent).path(), 'utf8');
    const html = htmlFromEml(eml);
    expect((html.match(/data-pa-id=/g) || [])).toHaveLength(47);
    for (const name of names) expect(html).toContain(name);
    expect(html).not.toContain('PA Nordeste zero');
    expect(errors).toEqual([]);
  });

  test('PA sharing: the cooperative entry supports clipboard fallback, manual recipients and mobile without sending automatically', async ({ page, context }, info) => {
    await recordExports(page, true);
    const { errors, writes, relationshipWrites } = await setup(page, dataset => upsertPlanRow(scenarioFixture(dataset), {
      entityId: 'pa:1002:3017:1', metric: 'VN', targets: Array(12).fill(9279000), annualTarget: 111348000,
      actuals: [...Array(8).fill(186000000), null, null, null, null], cutoff: '2026-08-31',
    }));
    await page.getByRole('combobox', { name: 'Período', exact: true }).selectOption('month');
    await page.getByRole('combobox', { name: 'Mês de referência', exact: true }).selectOption('7');
    await page.getByRole('button', { name: 'Ver PAs de Cooperativa Alfa', exact: true }).click();
    await page.getByRole('region', { name: 'PAs da cooperativa', exact: true }).getByRole('button', { name: 'Compartilhar PAs', exact: true }).click();
    const dialog = shared(page);
    const pngEvent = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Copiar imagem desta parte', exact: true }).click();
    const png = await pngEvent;
    expect(Array.from((await readFile(await png.path())).subarray(0, 8))).toEqual(pngMagic);
    await dialog.getByLabel('WhatsApp do destinatário (opcional)', { exact: true }).fill('(71) 99999-9999');
    await dialog.getByRole('button', { name: 'Copiar texto do WhatsApp', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('A cópia foi bloqueada');
    const whatsapp = new URL(await dialog.getByRole('link', { name: 'Abrir WhatsApp', exact: true }).getAttribute('href'));
    expect(whatsapp.hostname).toBe('wa.me'); expect(whatsapp.pathname).toBe('/5571999999999');
    expect(whatsapp.searchParams.get('text')).toContain('186.000.000,00');
    await dialog.locator('summary').filter({ hasText: 'Ver texto do WhatsApp' }).click();
    await expect(dialog.getByLabel('Texto do WhatsApp', { exact: true })).toContainText('186.000.000,00');
    expect(context.pages()).toHaveLength(1);
    await dialog.getByRole('radio', { name: 'E-mail', exact: true }).check();
    await expect(reportRows(page)).toHaveCount(6);
    const recipients = dialog.getByRole('textbox', { name: 'Destinatários do e-mail', exact: true });
    await expect(recipients).toHaveValue('');
    await recipients.fill('email-invalido');
    await expect(dialog.getByRole('button', { name: 'Copiar painel', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Baixar e-mail (.eml)', exact: true })).toBeDisabled();
    await recipients.fill('gestor@example.com');
    await dialog.getByRole('button', { name: 'Copiar painel', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('A cópia formatada foi bloqueada');
    await expect(dialog.getByRole('button', { name: 'Abrir Outlook e colar painel', exact: true })).toBeDisabled();
    const emlEvent = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Baixar e-mail (.eml)', exact: true }).click();
    const eml = await readFile(await (await emlEvent).path(), 'utf8');
    expect(eml).toContain('X-Unsent: 1'); expect(eml).toContain('gestor@example.com');
    expect((htmlFromEml(eml).match(/data-pa-id=/g) || [])).toHaveLength(6);
    for (const width of [1440, 820, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1100 : 844 });
      expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      const dimensions = await emailFrame(page).locator('body').evaluate(node => ({ content: node.ownerDocument.documentElement.scrollWidth, viewport: node.ownerDocument.defaultView.innerWidth }));
      expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
      const moneyCells = await emailFrame(page).locator('strong[data-money="true"]').evaluateAll(nodes => nodes.map(node => {
        const box = node.getBoundingClientRect(), cell = node.closest('td'), bounds = cell.getBoundingClientRect();
        const style = node.ownerDocument.defaultView.getComputedStyle(cell);
        const range = node.ownerDocument.createRange(); range.selectNodeContents(node);
        return { text: node.textContent, left: box.left, right: box.right, availableLeft: bounds.left + parseFloat(style.paddingLeft), availableRight: bounds.right - parseFloat(style.paddingRight), lines: [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0).length };
      }));
      expect(moneyCells.some(cell => cell.text === money(186000000))).toBe(true);
      for (const cell of moneyCells) {
        expect(cell.lines, `${cell.text} at ${width}px`).toBe(1);
        expect(cell.left, `${cell.text} at ${width}px`).toBeGreaterThanOrEqual(cell.availableLeft - 1);
        expect(cell.right, `${cell.text} at ${width}px`).toBeLessThanOrEqual(cell.availableRight + 1);
      }
      if (width === 1440 || width === 320) await captureScenarioDocument(page, emailFrame(page), info.outputPath(`pa-scenario-email-${width}.png`));
    }
    expect(context.pages()).toHaveLength(1);
    expect(writes).toEqual([]); expect(relationshipWrites).toEqual([]); expect(errors).toEqual([]);
  });
}
