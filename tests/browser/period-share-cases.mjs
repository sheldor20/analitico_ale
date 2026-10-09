import { readFile } from 'node:fs/promises';
import { money } from '../../lib/analytics.mjs';
import { managementFixture } from './management-period-cases.mjs';
import { captureScenarioDocument } from './scenario-artifacts.mjs';

const select = (root, name) => root.getByRole('combobox', { name, exact: true });
const panel = page => page.getByRole('region', { name: 'Resultados por período', exact: true });
const share = page => page.getByRole('dialog', { name: 'Compartilhar cenário por período', exact: true });
const frame = page => page.frameLocator('iframe[title="Painel do e-mail da carteira"]');
const rows = page => frame(page).locator('tr[data-period-share-id]');
const row = (page, id) => frame(page).locator(`tr[data-period-share-id="${id}"]`);
const projection = dialog => dialog.getByRole('checkbox', { name: 'Incluir projeção de produção', exact: true });
const pngMagic = [137, 80, 78, 71, 13, 10, 26, 10];

async function recordCopies(page, blocked = false) {
  await page.addInitScript(blocked => {
    window.__periodCopies = { html: [], text: [], png: [], drawings: [] };
    const paint = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (value, ...args) {
      this.canvas.__periodText ??= [];this.canvas.__periodText.push(String(value));
      return paint.call(this, value, ...args);
    };
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      const texts = [...(this.__periodText || [])];
      return toBlob.call(this, blob => { if (blob) window.__periodCopies.drawings.push(texts);callback(blob); }, ...args);
    };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => { if (blocked) throw new DOMException('Blocked for test', 'NotAllowedError');window.__periodCopies.text.push(text); },
      write: async items => {
        if (blocked) throw new DOMException('Blocked for test', 'NotAllowedError');
        for (const item of items) for (const type of item.types) {
          const blob = await item.getType(type);
          if (type === 'text/html') window.__periodCopies.html.push(await blob.text());
          if (type === 'image/png') {
            const bytes = new Uint8Array(await blob.arrayBuffer()), data = new DataView(bytes.buffer);
            window.__periodCopies.png.push({ magic: [...bytes.slice(0, 8)], width: data.getUint32(16), height: data.getUint32(20) });
          }
        }
      },
    } });
  }, blocked);
}

async function chooseCohort(page) {
  await select(page, 'Central').selectOption('1002');
  await select(page, 'Carteira').selectOption('AR');
  await select(page, 'Período').selectOption('month');
  await select(page, 'Mês de referência').selectOption('7');
  await page.getByLabel('Buscar cooperativa ou PA').fill('Alfa');
  await select(page, 'Filtrar situação').selectOption('track');
  await select(panel(page), 'Ordenar períodos').selectOption('attainment-desc');
}

function htmlFromEml(eml) {
  const encoded = eml.split('Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0];
  return Buffer.from(encoded.replace(/\s/g, ''), 'base64').toString('utf8');
}

export function registerPeriodShareTests({ test, expect, setup }) {
  test('period sharing: the exact AR cohort and order survive all 19 periods, collapsed groups, email and two complete PNG parts', async ({ page, context }, info) => {
    await recordCopies(page);
    const { errors, writes, relationshipWrites, contactImports, contactReads } = await setup(page, managementFixture);
    await chooseCohort(page);
    const sourceIds = await panel(page).locator('[data-period][data-month]').evaluateAll(nodes => nodes.map(node => `${node.dataset.period}:${node.dataset.month}`));
    expect(sourceIds).toHaveLength(19);
    expect(sourceIds).toEqual([
      'annual:11', ...[2, 4, 6, 1, 7, 0, 3, 5, 8, 9, 10, 11].map(month => `month:${month}`),
      'quarter:2', 'quarter:5', 'quarter:8', 'quarter:11', 'semester:5', 'semester:11',
    ]);
    await panel(page).getByRole('button', { name: 'Recolher resultados mensais', exact: true }).click();
    await panel(page).getByRole('button', { name: 'Recolher resultado anual', exact: true }).click();
    await panel(page).getByRole('button', { name: 'Compartilhar cenário', exact: true }).click();
    const dialog = share(page);
    await expect(select(dialog, 'Períodos para compartilhar')).toHaveValue('all');
    await expect(projection(dialog)).not.toBeChecked();
    await expect(rows(page)).toHaveCount(19);
    expect(await rows(page).evaluateAll(nodes => nodes.map(node => node.dataset.periodShareId))).toEqual(sourceIds);
    expect(await frame(page).locator('[data-period-share-group]').evaluateAll(nodes => nodes.map(node => node.dataset.periodShareGroup))).toEqual(['annual', 'month', 'quarter', 'semester']);
    await expect(frame(page).locator('[data-period-share-group="month"] thead th')).toHaveText(['Período', 'Meta', 'Realizado', 'Atingimento', 'GAP ou superação']);
    for (const [month, band] of [[0, 'red'], [1, 'yellow'], [2, 'blue']]) {
      await expect(row(page, `month:${month}`).locator('td[data-label="Atingimento"] [data-attainment-band]')).toHaveAttribute('data-attainment-band', band);
      await expect(row(page, `month:${month}`).locator('td[data-label="Realizado"] [data-attainment-band]')).toHaveCount(0);
    }
    await expect(row(page, 'annual:11').locator('td[data-label="Realizado"] [data-attainment-band]')).toHaveAttribute('data-attainment-band', 'red');
    await expect(frame(page).locator('[data-communication-header]')).toContainText('Gestão comercial · Arrecadação');
    await expect(frame(page).locator('[data-communication-header]')).toContainText('Central Bahia teste');
    await expect(frame(page).locator('[data-communication-context]')).toContainText('Cooperativa Alfa');
    for (const excluded of ['Cooperativa Beta', 'Outra central', 'PA Alfa zero']) await expect(frame(page).locator('body')).not.toContainText(excluded);
    await expect(frame(page).getByRole('columnheader', { name: 'Projeção de produção', exact: true })).toHaveCount(0);
    const periodAmounts = [
      ['annual:11', 12000, 6090],
      ...[690, 700, 1000, 500, 1000, 500, 1000, 700, null, null, null, null].map((actual, month) => [`month:${month}`, 1000, actual]),
      ...[2390, 2000, 1700, null].map((actual, index) => [`quarter:${index * 3 + 2}`, 3000, actual]),
      ['semester:5', 6000, 4390], ['semester:11', 6000, 1700],
    ];
    for (const [id, target, actual] of periodAmounts) {
      await expect(row(page, id).locator('td[data-label="Meta"]')).toContainText(money(target));
      await expect(row(page, id).locator('td[data-label="Realizado"]')).toContainText(actual == null ? '—' : money(actual));
    }
    await expect(row(page, 'month:8').locator('td[data-label="Realizado"]')).toContainText('—');
    await expect(row(page, 'month:8').locator('td[data-label="Realizado"]')).not.toContainText('0,00');
    const savedContact = dialog.getByRole('group', { name: 'Responsáveis da unidade', exact: true }).getByRole('checkbox', { name: /Ana Teste/ });
    await expect(savedContact).not.toBeChecked();
    await expect(dialog.getByRole('textbox', { name: 'Destinatários do e-mail', exact: true })).toHaveValue('');
    await savedContact.check();
    await dialog.getByRole('textbox', { name: 'Destinatários do e-mail', exact: true }).fill('gestor-sintetico@example.com');
    await select(dialog, 'Conta do Outlook').selectOption('personal');
    await dialog.getByRole('button', { name: 'Copiar painel', exact: true }).click();
    const ready = dialog.getByRole('link', { name: 'Abrir Outlook e colar painel', exact: true });
    await expect(ready).toBeVisible();
    const outlook = new URL(await ready.getAttribute('href'));
    expect(outlook.hostname).toBe('outlook.live.com');expect(outlook.searchParams.get('body')).toBe('');
    expect(outlook.searchParams.get('to').split(';').sort()).toEqual(['ana@example.com', 'gestor-sintetico@example.com']);
    const copied = await page.evaluate(() => window.__periodCopies.html.at(-1));
    expect((copied.match(/data-period-share-id=/g) || [])).toHaveLength(19);
    const emailDownload = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Baixar e-mail (.eml)', exact: true }).click();
    const email = await emailDownload, eml = await readFile(await email.path(), 'utf8');
    expect(email.suggestedFilename()).toMatch(/^cenario-periodos-ar-2026-all-.*\.eml$/);
    expect(eml).toContain('X-Unsent: 1');expect(eml).toContain('ana@example.com');
    expect(htmlFromEml(eml)).toBe(copied);
    await captureScenarioDocument(page, frame(page), info.outputPath('period-share-all-email-desktop.png'));
    await projection(dialog).check();
    await expect(dialog.getByRole('button', { name: 'Abrir Outlook e colar painel', exact: true })).toBeDisabled();
    await projection(dialog).uncheck();
    await dialog.getByRole('radio', { name: 'WhatsApp e imagem', exact: true }).check();
    await expect(select(dialog, 'Responsável para o WhatsApp')).toHaveValue('');
    await select(dialog, 'Responsável para o WhatsApp').selectOption({ label: 'Ana Teste · (71) 99999-9999' });
    const wa = new URL(await dialog.getByRole('link', { name: 'Abrir WhatsApp', exact: true }).getAttribute('href'));
    expect(wa.pathname).toBe('/5571999999999');expect(wa.searchParams.get('text')).toContain('19 períodos');
    await select(dialog, 'Texto do WhatsApp').selectOption('report');
    await dialog.locator('summary').filter({ hasText: 'Ver texto do WhatsApp' }).click();
    await expect(dialog.locator('pre[aria-label="Texto do WhatsApp"]')).toContainText('Ano completo');
    await expect(dialog.locator('pre[aria-label="Texto do WhatsApp"]')).toContainText(money(6090));
    await dialog.getByRole('button', { name: 'Copiar texto do WhatsApp', exact: true }).click();
    const text = await page.evaluate(() => window.__periodCopies.text.at(-1));
    expect(text).toContain('Realizado: R$');expect(text).toContain('6.090,00');expect(text).not.toContain('Projeção de produção:');
    const partLabels = [
      ['Ano completo', 'Março', 'Maio', 'Julho', 'Fevereiro', 'Agosto', 'Janeiro', 'Abril', 'Junho', 'Setembro', 'Outubro', 'Novembro'],
      ['Dezembro', '1º trimestre', '2º trimestre', '3º trimestre', '4º trimestre', '1º semestre', '2º semestre'],
    ];
    const labels = partLabels.flat();
    for (const index of [1, 2]) {
      const image = dialog.getByRole('img', { name: `Cenário por período — parte ${index} de 2`, exact: true });
      await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBe(1200);
      await dialog.getByRole('button', { name: 'Copiar imagem desta parte', exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.__periodCopies.png.length)).toBe(index);
      const drawn = await page.evaluate(() => window.__periodCopies.drawings.at(-1));
      expect(drawn.filter(value => labels.includes(value))).toEqual(partLabels[index - 1]);
      if (index === 1) {
        expect(drawn).toContain('R$ 6.090,00');expect(drawn).toContain('R$ 12.000,00');
      }
      const pngDownload = page.waitForEvent('download');
      await dialog.getByRole('button', { name: 'Baixar imagem desta parte', exact: true }).click();
      await (await pngDownload).saveAs(info.outputPath(`period-share-all-part-${index}.png`));
      if (index === 1) await dialog.getByRole('button', { name: 'Próxima parte', exact: true }).click();
    }
    expect(await page.evaluate(() => window.__periodCopies.png.map(item => item.magic))).toEqual([pngMagic, pngMagic]);
    await dialog.getByRole('button', { name: 'Fechar compartilhamento de períodos', exact: true }).click();
    await expect(select(panel(page), 'Ordenar períodos')).toHaveValue('attainment-desc');
    await expect(select(page, 'Carteira')).toHaveValue('AR');await expect(select(page, 'Filtrar situação')).toHaveValue('track');
    await expect(page.getByLabel('Buscar cooperativa ou PA')).toHaveValue('Alfa');
    expect(contactReads.every(read => read.entity_id === 'eq.cooperative:1002:3017')).toBe(true);
    expect(context.pages()).toHaveLength(1);expect(contactImports).toEqual([]);expect(writes).toEqual([]);expect(relationshipWrites).toEqual([]);expect(errors).toEqual([]);
  });

  test('period sharing: selected groups and optional projection remain exact on mobile with genuine PNG and EML clipboard fallbacks', async ({ page, context }, info) => {
    await recordCopies(page, true);
    const { errors, writes, relationshipWrites, contactImports } = await setup(page, managementFixture);
    await chooseCohort(page);
    await panel(page).getByRole('button', { name: 'Compartilhar cenário', exact: true }).click();
    const dialog = share(page);
    await select(dialog, 'Períodos para compartilhar').selectOption('quarter');
    await projection(dialog).check();
    await expect(rows(page)).toHaveCount(4);
    expect(await rows(page).evaluateAll(nodes => nodes.map(node => node.dataset.periodShareId))).toEqual(['quarter:2', 'quarter:5', 'quarter:8', 'quarter:11']);
    await expect(row(page, 'quarter:8').locator('td[data-label="Realizado"]')).toContainText(money(1700));
    await expect(row(page, 'quarter:8').locator('td[data-label="Projeção de produção"]')).toContainText(money(3454.84));
    await expect(row(page, 'quarter:8').locator('td[data-label="Projeção de produção"]')).toContainText('115,2% da meta');
    await expect(row(page, 'quarter:8').locator('td[data-label="Projeção de produção"] [data-attainment-band]')).toHaveCount(0);
    await expect(row(page, 'quarter:11').locator('td[data-label="Projeção de produção"]')).toContainText('—');
    await expect(row(page, 'quarter:11').locator('td[data-label="Projeção de produção"]')).toContainText('Sem avaliação');
    const recipients = dialog.getByRole('textbox', { name: 'Destinatários do e-mail', exact: true });
    await recipients.fill('endereco-invalido');
    await expect(dialog.getByRole('button', { name: 'Copiar painel', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Baixar e-mail (.eml)', exact: true })).toBeDisabled();
    await recipients.fill('gestor-mobile@example.com');
    await dialog.getByRole('button', { name: 'Copiar painel', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('A cópia formatada foi bloqueada');
    await expect(dialog.getByRole('button', { name: 'Abrir Outlook e colar painel', exact: true })).toBeDisabled();
    const emailDownload = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Baixar e-mail (.eml)', exact: true }).click();
    const eml = await readFile(await (await emailDownload).path(), 'utf8'), html = htmlFromEml(eml);
    expect((html.match(/data-period-share-id=/g) || [])).toHaveLength(4);expect(html).toContain('3.454,84');expect(html).not.toContain('data-period-share-id="annual:11"');
    for (const width of [768, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      expect(await frame(page).locator('body').evaluate(node => node.ownerDocument.documentElement.scrollWidth <= node.ownerDocument.defaultView.innerWidth + 1)).toBe(true);
      const amounts = await frame(page).locator('strong[data-money="true"]').evaluateAll(nodes => nodes.map(node => {
        const range = node.ownerDocument.createRange();range.selectNodeContents(node);
        const box = node.getBoundingClientRect(), cell = node.closest('td'), bounds = cell.getBoundingClientRect();
        return { lines: range.getClientRects().length, right: box.right, limit: bounds.right - parseFloat(getComputedStyle(cell).paddingRight) };
      }));
      expect(amounts.length).toBeGreaterThan(10);
      for (const amount of amounts) { expect(amount.lines).toBe(1);expect(amount.right).toBeLessThanOrEqual(amount.limit + 1); }
    }
    await captureScenarioDocument(page, frame(page), info.outputPath('period-share-quarter-email-320.png'));
    await dialog.getByRole('radio', { name: 'WhatsApp e imagem', exact: true }).check();
    const image = dialog.getByRole('img', { name: 'Cenário por período — parte 1 de 1', exact: true });
    await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBe(1440);
    const pngDownload = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Copiar imagem desta parte', exact: true }).click();
    const png = await pngDownload, bytes = await readFile(await png.path());
    expect([...bytes.subarray(0, 8)]).toEqual(pngMagic);expect(bytes.readUInt32BE(16)).toBe(1440);
    expect(png.suggestedFilename()).toMatch(/^cenario-periodos-ar-2026-quarter-.*-parte-1-de-1\.png$/);
    await png.saveAs(info.outputPath('period-share-quarter-projection.png'));
    await expect(dialog.getByRole('status')).toContainText('A cópia foi bloqueada. Anexe o PNG baixado');
    expect(await page.evaluate(() => window.__periodCopies.png)).toEqual([]);
    await select(dialog, 'Períodos para compartilhar').selectOption('annual');
    await expect.poll(() => page.evaluate(() => window.__periodCopies.drawings.at(-1)?.includes('Ano completo'))).toBe(true);
    await dialog.getByRole('radio', { name: 'E-mail', exact: true }).check();
    await expect(rows(page)).toHaveCount(1);
    await expect(row(page, 'annual:11').locator('td[data-label="Realizado"]')).toContainText(money(6090));
    await expect(row(page, 'annual:11').locator('td[data-label="Projeção de produção"]')).toContainText(money(9775.03));
    await projection(dialog).uncheck();
    await expect(frame(page).locator('td[data-label="Projeção de produção"]')).toHaveCount(0);
    expect(context.pages()).toHaveLength(1);expect(contactImports).toEqual([]);expect(writes).toEqual([]);expect(relationshipWrites).toEqual([]);expect(errors).toEqual([]);
  });
}
