import { step, disclosure, customize, openIndividualCommunication } from './composer-navigation.mjs';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { money } from '../../lib/analytics.mjs';

export function registerDashboardTests({ setup, composer, selectAugust }) {
  async function open(page) {
    const state = await setup(page);
    await openIndividualCommunication(page);
    const dialog = composer(page);
    await dialog.getByLabel('Unidade selecionada').selectOption('cooperative:1002:3017');
    await selectAugust(dialog);
    await expect(dialog.getByText('Ana Teste',{exact:true})).toBeVisible();
    return { ...state, dialog };
  }
  test('compact dashboard: three main cards share one row in HTML and PNG, with projection below', async ({ page }, info) => {
    await page.addInitScript(() => {
      window.__compactText = [];
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (value, x, y, ...args) {
        window.__compactText.push({ text: String(value), x, y });
        return fillText.call(this, value, x, y, ...args);
      };
    });
    const { dialog, errors } = await open(page);
    await step(dialog, 2);
    const frame = page.frameLocator('iframe[title="Painel do e-mail da carteira"]');
    const primary = frame.locator('table[data-layout="metric-cards"][data-columns="3"]').first();
    const expectedLabels = ['Meta do período', 'Realizado informado', 'GAP para a meta'];
    const cells = primary.locator('td[data-metric]');
    await expect(cells).toHaveCount(3);
    async function assertHtmlRow() {
      const geometry = await cells.evaluateAll(items => items.map(item => { const box = item.getBoundingClientRect(); return { label: item.getAttribute('data-metric'), x: box.x, y: box.y, width: box.width, height: box.height }; }));
      expect(geometry.map(cell => cell.label)).toEqual(expectedLabels);
      expect(Math.max(...geometry.map(cell => cell.y)) - Math.min(...geometry.map(cell => cell.y))).toBeLessThan(1);
      expect(Math.max(...geometry.map(cell => cell.height)) - Math.min(...geometry.map(cell => cell.height))).toBeLessThan(1);
      expect(geometry[0].x).toBeLessThan(geometry[1].x);
      expect(geometry[1].x).toBeLessThan(geometry[2].x);
      return geometry;
    }
    const plain = await assertHtmlRow();
    await expect(frame.locator('[data-columns="1"]')).toHaveCount(0);
    const projection = dialog.getByRole('checkbox', { name: /Incluir projeção de fechamento/ });
    await projection.check();
    const projected = frame.locator('td[data-metric="Fechamento apurado"]').first();
    await expect(projected).toBeVisible();
    await assertHtmlRow();
    expect(await projected.evaluate(node => node.getBoundingClientRect().y)).toBeGreaterThan(plain[0].y + plain[0].height);
    await frame.locator('body').screenshot({ path: info.outputPath('compact-email-desktop.png') });
    await projection.uncheck();
    await page.evaluate(() => { window.__compactText = []; });
    await dialog.getByRole('button', { name: 'Painel do WhatsApp', exact: true }).click();
    const image = dialog.getByRole('img', { name: /Dashboard Mensal/ });
    await expect(image).toBeVisible();
    async function pngLabels() {
      return page.evaluate(labels => labels.map(label => window.__compactText.find(item => item.text === label)), expectedLabels);
    }
    const png = await pngLabels();
    expect(png.every(Boolean)).toBe(true);
    expect(new Set(png.map(item => item.y)).size).toBe(1);
    expect(png[0].x).toBeLessThan(png[1].x);
    expect(png[1].x).toBeLessThan(png[2].x);
    await page.evaluate(() => { window.__compactText = []; });
    const previousSource = await image.getAttribute('src');
    await projection.check();
    await expect(image).not.toHaveAttribute('src', previousSource);
    await expect(image).toBeVisible();
    const pngWithProjection = await pngLabels();
    expect(pngWithProjection.every(Boolean)).toBe(true);
    expect(new Set(pngWithProjection.map(item => item.y)).size).toBe(1);
    const projectedText = await page.evaluate(() => window.__compactText.find(item => item.text.startsWith('Fechamento')));
    expect(projectedText).toBeTruthy();
    expect(projectedText.y).toBeGreaterThan(pngWithProjection[0].y);
    const downloadEvent = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Baixar painel WhatsApp (PNG)', exact: true }).click();
    await (await downloadEvent).saveAs(info.outputPath('compact-whatsapp-dashboard.png'));
    await dialog.getByRole('button', { name: 'Painel do e-mail', exact: true }).click();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      const bounds = await frame.locator('body').evaluate(node => ({ content: node.ownerDocument.documentElement.scrollWidth, viewport: node.ownerDocument.defaultView.innerWidth }));
      expect(bounds.content).toBeLessThanOrEqual(bounds.viewport + 1);
      await frame.locator('body').screenshot({ path: info.outputPath(`compact-email-mobile-${width}.png`) });
    }
    expect(errors).toEqual([]);
  });

  test('currency layout: large and negative amounts remain exact on one line in email and PNG', async ({ page }, info) => {
    await page.addInitScript(() => {
      window.__currencyDraws = [];
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (value, x, y, ...args) {
        window.__currencyDraws.push({ value: String(value), x, y, width: this.measureText(String(value)).width });
        return fillText.call(this, value, x, y, ...args);
      };
    });
    const target = 9279000;
    const { errors } = await setup(page, dataset => ({ ...dataset, rows: dataset.rows.map(row => row.source === 'base' && row.central === '1002' && row.metric === 'VN'
      ? { ...row, targets: Array(12).fill(target), annualTarget: target * 12, actuals: row.actuals.map(value => value == null ? null : row.cooperative === '3017' ? 186000000 : -186000000) } : row) }));
    await openIndividualCommunication(page);
    const dialog = composer(page);
    const frame = page.frameLocator('iframe[title="Painel do e-mail da carteira"]');
    for (const [cooperative, actual] of [['3017', 186000000], ['3025', -186000000]]) {
      await dialog.getByLabel('Unidade selecionada').selectOption(`cooperative:1002:${cooperative}`);
      await selectAugust(dialog);
      await step(dialog, 2);
      await dialog.getByRole('button', { name: 'Painel do e-mail', exact: true }).click();
      const primary = frame.locator('table[data-layout="metric-cards"][data-columns="3"]').first();
      await expect(primary.locator('.metric-value')).toHaveCount(3);
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: width === 1440 ? 1100 : 844 });
        const displayed = await primary.locator('.metric-value').evaluateAll(nodes => nodes.map(node => node.textContent));
        expect(displayed[0]).toBe(money(target));
        expect(displayed[1]).toBe(money(actual));
        if (width === 1440) {
          const cells = await primary.locator('td[data-metric]').evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { x: box.x, y: box.y }; }));
          expect(new Set(cells.map(cell => cell.y)).size).toBe(1);
          expect(cells[0].x).toBeLessThan(cells[1].x); expect(cells[1].x).toBeLessThan(cells[2].x);
        }
        const geometry = await frame.locator('.metric-value').evaluateAll(nodes => nodes.map(node => {
          const range = node.ownerDocument.createRange(); range.selectNodeContents(node);
          const lines = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
          return { text: node.textContent, lines: lines.length, width: node.clientWidth, scroll: node.scrollWidth };
        }));
        for (const value of geometry) {
          expect(value.lines, `${value.text} at ${width}px`).toBe(1);
          expect(value.scroll, `${value.text} at ${width}px`).toBeLessThanOrEqual(value.width + 1);
        }
        const bounds = await frame.locator('body').evaluate(node => ({ content: node.ownerDocument.documentElement.scrollWidth, viewport: node.ownerDocument.defaultView.innerWidth }));
        expect(bounds.content).toBeLessThanOrEqual(bounds.viewport + 1);
        if (cooperative === '3017' && width !== 320 || cooperative === '3025' && width === 320) await frame.locator('body').screenshot({ path: info.outputPath(`currency-${cooperative}-${width}.png`) });
      }
      await page.evaluate(() => { window.__currencyDraws = []; });
      await dialog.getByRole('button', { name: 'Painel do WhatsApp', exact: true }).click();
      await expect(dialog.getByRole('img', { name: /Dashboard Mensal/ })).toBeVisible();
      const draws = await page.evaluate(() => window.__currencyDraws);
      for (const expected of [money(target), money(actual)].map(value => value.replace(/\s/g, ' '))) {
        const amount = draws.find(draw => draw.value === expected);
        expect(amount, `complete currency string ${expected}`).toBeTruthy();
        expect(amount.width).toBeLessThanOrEqual(284);
      }
    }
    expect(errors).toEqual([]);
  });

  test('selected period leads dashboard and annual cards replace duplicated evolution', async ({ page }, info) => {
    const { dialog, errors } = await open(page);
    await dialog.getByLabel('Incluir Venda Nova e Arrecadação, separadamente').check();
    await step(dialog, 2);
    const frame = page.frameLocator('iframe[title="Painel do e-mail da carteira"]');
    const annual = dialog.getByRole('checkbox', { name: 'Incluir cenário anual', exact: true });
    await expect(annual).toBeChecked();
    for (const period of ['month','quarter','semester','ytd','annual']) {
      await dialog.getByLabel('Período da mensagem').selectOption(period);
      const support = frame.locator('[data-section="annual-support"]');
      await expect(support).toHaveCount(0);
      await expect(frame.getByRole('heading', { name: 'Cenário anual · 2026', exact: true })).toHaveCount(period === 'annual' ? 0 : 1);
      await expect(frame.getByRole('heading', { name: 'Evolução do período', exact: true })).toHaveCount(0);
      if (period !== 'annual') {
        await expect(annual).toBeChecked();
        const text = await frame.locator('body').innerText();
        expect(text.indexOf('Arrecadação')).toBeLessThan(text.indexOf('Cenário anual'));
      } else {
        await expect(annual).toHaveCount(0);
        await expect(frame.locator('[data-metric="Meta anual"]')).toHaveCount(2);
      }
    }
    await dialog.getByLabel('Período da mensagem').selectOption('month');
    const cards = frame.locator('table[data-layout="metric-cards"]');
    await expect(cards).toHaveCount(4);
    const monthlyValues = await cards.locator('.metric-value').allTextContents();
    await annual.uncheck();
    await expect(frame.getByRole('heading', { name: 'Cenário anual · 2026', exact: true })).toHaveCount(0);
    await expect(frame.locator('[data-metric="Meta anual"]')).toHaveCount(0);
    await expect(cards).toHaveCount(2);
    expect(await cards.locator('.metric-value').allTextContents()).toEqual(monthlyValues.slice(0, 6));
    await expect(frame.locator('body')).toContainText('Venda Nova');
    await expect(frame.locator('body')).toContainText('Arrecadação');
    await dialog.getByRole('button', { name: 'Painel do WhatsApp', exact: true }).click();
    const image = dialog.getByRole('img', { name: /Dashboard Mensal/ });
    await expect(image).toBeVisible();
    const compactSource = await image.getAttribute('src');
    const compactHeight = await image.evaluate(node => node.naturalHeight);
    await disclosure(dialog, 'Ver texto do WhatsApp');
    const whatsapp = dialog.getByLabel('WhatsApp gerado');
    await expect(whatsapp).not.toContainText('Cenário anual');
    await expect(whatsapp).toContainText(`Meta: ${money(100)} · Realizado: ${money(50)}`);
    await expect(whatsapp).toContainText(`Meta: ${money(1000)} · Realizado: ${money(700)}`);
    await annual.check();
    await expect(whatsapp).toContainText('Cenário anual · 2026');
    await expect(image).not.toHaveAttribute('src', compactSource);
    await expect.poll(() => image.evaluate(node => node.naturalHeight)).toBeGreaterThan(compactHeight);
    await dialog.getByRole('button', { name: 'Painel do e-mail', exact: true }).click();
    await expect(frame.getByRole('heading', { name: 'Cenário anual · 2026', exact: true })).toBeVisible();
    await frame.locator('body').screenshot({path:info.outputPath('email-month-primary.png')});
    expect(errors).toEqual([]);
  });
  test('WhatsApp mobile keeps dashboard and downloads a real PNG with current scenario', async ({ page }, info) => {
    await page.setViewportSize({width:390,height:844});
    const { dialog, errors, writes } = await open(page);
    await dialog.getByLabel('Período da mensagem').selectOption('month');
    await step(dialog, 2);
    await dialog.getByRole('button',{name:'Painel do WhatsApp',exact:true}).click();
    const image = dialog.getByRole('img',{name:/Dashboard Mensal/});
    await expect(image).toBeVisible();
    expect(await image.evaluate((node) => node.naturalWidth)).toBe(1080);
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button',{name:'Baixar painel WhatsApp (PNG)',exact:true}).click();
    const download = await downloadPromise;
    const bytes = await readFile(await download.path());
    expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(bytes.readUInt32BE(16)).toBe(1080); expect(bytes.readUInt32BE(20)).toBeGreaterThan(800);
    await download.saveAs(info.outputPath('whatsapp-month-dashboard.png'));
    await image.screenshot({path:info.outputPath('mobile-dashboard-preview.png')});
    await dialog.getByLabel('Período da mensagem').selectOption('annual');
    await expect(dialog.getByRole('img',{name:/Dashboard Anual/})).toBeVisible();
    await disclosure(dialog, 'Ver texto do WhatsApp');
    await expect(dialog.getByLabel('WhatsApp gerado')).not.toContainText('Apoio anual');
    await step(dialog, 3);
    await dialog.getByRole('button',{name:'Salvar rascunho',exact:true}).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].presentation_version).toBe(2); expect(writes[0].whatsapp_dashboard.period).toBe('annual');
    expect(writes[0].whatsapp_dashboard.blocks.some((b) => b.type === 'secondary')).toBe(false);
    expect(errors).toEqual([]);
  });
  test('projection is optional across channels and saved snapshots, preserving edited text when toggled', async ({ page }) => {
    const { dialog, errors, writes } = await open(page);
    await customize(dialog);
    await dialog.getByLabel('Texto / modelo do e-mail', { exact: true }).fill('Minha abertura preservada.\n{{cenario}}');
    await dialog.getByLabel('Texto / modelo do WhatsApp', { exact: true }).fill('Meu texto comercial.\n{{cenario}}');
    await step(dialog, 2);
    const projection = dialog.getByRole('checkbox', { name: /Incluir projeção de fechamento/ });
    await expect(projection).not.toBeChecked();
    const frame = page.frameLocator('iframe[title="Painel do e-mail da carteira"]');
    await expect(frame.locator('[data-metric="Projeção de fechamento"]')).toHaveCount(0);
    await expect(frame.locator('body')).toContainText('Minha abertura preservada.');
    await projection.check();
    await expect(frame.locator('[data-metric="Projeção de fechamento"]')).toHaveCount(1);
    await expect(frame.locator('[data-metric="Fechamento apurado"]')).toHaveCount(1);
    await expect(frame.locator('body')).toContainText('Minha abertura preservada.');
    await dialog.getByRole('button', { name: 'Painel do WhatsApp', exact: true }).click();
    await disclosure(dialog, 'Ver texto do WhatsApp');
    await expect(dialog.getByLabel('WhatsApp gerado')).toContainText('Meu texto comercial.');
    await expect(dialog.getByLabel('WhatsApp gerado')).toContainText('Projeção:');
    await projection.uncheck();
    await expect(dialog.getByLabel('WhatsApp gerado')).not.toContainText('Projeção:');
    await expect(dialog.getByLabel('WhatsApp gerado')).toContainText('Meu texto comercial.');
    await step(dialog, 3);
    await dialog.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].whatsapp_dashboard.blocks.filter((block) => block.type === 'cards').every((block) => block.items.length === 3)).toBe(true);
    expect(writes[0].email_body).toContain('Minha abertura preservada.');
    expect(writes[0].whatsapp_body).toContain('Meu texto comercial.');
    expect(writes[0].email_html).not.toContain('Projeção de fechamento');
    expect(errors).toEqual([]);
  });
  test('copy image writes a real PNG and invalidates the previously copied Outlook panel', async ({ page }) => {
    await page.addInitScript(() => {
      window.__imageCopies = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: async (items) => {
        if (!items[0].types.includes('image/png')) return;
        const blob = await items[0].getType('image/png');
        window.__imageCopies.push({ type: blob.type, size: blob.size, bytes: Array.from(new Uint8Array(await blob.arrayBuffer()).slice(0, 8)) });
      } } });
    });
    const { dialog, errors } = await open(page);
    await step(dialog, 3);
    await dialog.getByRole('button', { name: 'Copiar painel', exact: true }).click();
    await expect(dialog.getByRole('link', { name: 'Abrir Outlook e colar painel', exact: true })).toBeVisible();
    await dialog.getByRole('radio', { name: 'WhatsApp', exact: true }).check();
    const copy = dialog.getByRole('button', { name: 'Copiar painel como imagem', exact: true });
    await expect(copy).toBeEnabled(); await copy.click();
    await expect(dialog.getByRole('status')).toContainText('Imagem copiada');
    const images = await page.evaluate(() => window.__imageCopies);
    expect(images).toHaveLength(1); expect(images[0].type).toBe('image/png'); expect(images[0].size).toBeGreaterThan(1000);
    expect(images[0].bytes).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    await dialog.getByRole('radio', { name: 'E-mail', exact: true }).check();
    await expect(dialog.getByRole('button', { name: 'Abrir Outlook e colar painel', exact: true })).toBeDisabled();
    expect(errors).toEqual([]);
  });
  test('blocked image clipboard downloads PNG without claiming a successful copy', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: async () => { throw new DOMException('Denied', 'NotAllowedError'); } } }));
    const { dialog, errors } = await open(page);
    await step(dialog, 2);
    await dialog.getByRole('button', { name: 'Painel do WhatsApp', exact: true }).click();
    const copy = dialog.getByRole('button', { name: 'Copiar painel como imagem', exact: true });
    await expect(copy).toBeEnabled();
    const downloadPromise = page.waitForEvent('download'); await copy.click();
    const downloaded = await downloadPromise;
    const bytes = await readFile(await downloaded.path());
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    await expect(dialog.getByRole('status')).toContainText('não permitiu copiar');
    await expect(dialog.getByRole('status')).not.toContainText('Imagem copiada');
    expect(errors).toEqual([]);
  });
  test('native sharing receives real PNG plus commercial text; cancellation never downloads or claims delivery', async ({page}) => {
    await page.addInitScript(() => {
      window.__shared = []; window.__cancelShare = false;
      Object.defineProperty(navigator,'canShare',{configurable:true,value:() => true});
      Object.defineProperty(navigator,'share',{configurable:true,value:async (data) => {
        if (window.__cancelShare) throw new DOMException('Cancelled','AbortError');
        window.__shared.push({text:data.text,name:data.files[0].name,type:data.files[0].type,size:data.files[0].size});
      }});
    });
    const {dialog, errors} = await open(page);
    await dialog.getByLabel('Período da mensagem').selectOption('month');
    await step(dialog, 2);
    await dialog.getByRole('button',{name:'Painel do WhatsApp',exact:true}).click();
    const share = dialog.getByRole('button',{name:'Compartilhar painel + mensagem',exact:true});
    await expect(share).toBeEnabled(); await share.click();
    const sent = await page.evaluate(() => window.__shared);
    expect(sent).toHaveLength(1); expect(sent[0].type).toBe('image/png'); expect(sent[0].size).toBeGreaterThan(1000);
    expect(sent[0].text).toContain(`Meta: ${money(100)} · Realizado: ${money(50)}`);
    expect(sent[0].text).toContain(`GAP: ${money(50)}`); expect(sent[0].text).toContain('Mensal');
    expect(sent[0].text).not.toContain('Foco comercial');
    let downloads = 0; page.on('download',() => downloads++);
    await page.evaluate(() => { window.__cancelShare = true; }); await share.click();
    await expect(dialog.getByRole('status')).toContainText('Compartilhamento cancelado');
    expect(downloads).toBe(0); expect(errors).toEqual([]);
  });
  test('unsupported file sharing downloads image and keeps copyable commercial message', async ({page}) => {
    await page.addInitScript(() => Object.defineProperty(navigator,'canShare',{configurable:true,value:() => false}));
    const {dialog, errors} = await open(page);
    await step(dialog, 2);
    await dialog.getByRole('button',{name:'Painel do WhatsApp',exact:true}).click();
    const event = page.waitForEvent('download');
    await dialog.getByRole('button',{name:'Compartilhar painel + mensagem',exact:true}).click();
    expect((await event).suggestedFilename()).toMatch(/\.png$/);
    await expect(dialog.getByRole('status')).toContainText('Anexe a imagem');
    await disclosure(dialog, 'Ver texto do WhatsApp');
    await expect(dialog.getByLabel('WhatsApp gerado')).toContainText(`Meta: ${money(100)} · Realizado: ${money(50)}`);
    await expect(dialog.getByLabel('WhatsApp gerado')).toContainText(`GAP: ${money(50)}`);
    await expect(dialog.getByLabel('WhatsApp gerado')).not.toContainText('Foco comercial');
    expect(errors).toEqual([]);
  });
}
