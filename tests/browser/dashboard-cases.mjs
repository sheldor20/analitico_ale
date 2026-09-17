import { step, disclosure, customize } from './composer-navigation.mjs';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

export function registerDashboardTests({ setup, composer, selectAugust }) {
  async function open(page) {
    const state = await setup(page);
    await page.getByRole('button',{name:'Gerar e-mail / WhatsApp',exact:true}).click();
    const dialog = composer(page);
    await dialog.getByLabel('Unidade selecionada').selectOption('cooperative:1002:3017');
    await selectAugust(dialog);
    await expect(dialog.getByText('Ana Teste',{exact:true})).toBeVisible();
    return { ...state, dialog };
  }
  test('selected period leads dashboard and annual cards replace duplicated evolution', async ({ page }, info) => {
    const { dialog, errors } = await open(page);
    await dialog.getByLabel('Incluir Venda Nova e Arrecadação, separadamente').check();
    await step(dialog, 2);
    const frame = page.frameLocator('iframe[title="Painel do e-mail da carteira"]');
    for (const period of ['month','quarter','semester','ytd','annual']) {
      await dialog.getByLabel('Período da mensagem').selectOption(period);
      const support = frame.locator('[data-section="annual-support"]');
      await expect(support).toHaveCount(0);
      await expect(frame.getByRole('heading', { name: 'Cenário anual · 2026', exact: true })).toHaveCount(period === 'annual' ? 0 : 1);
      await expect(frame.getByRole('heading', { name: 'Evolução do período', exact: true })).toHaveCount(0);
      if (period !== 'annual') {
        const text = await frame.locator('body').innerText();
        expect(text.indexOf('Arrecadação')).toBeLessThan(text.indexOf('Cenário anual'));
      }
    }
    await dialog.getByLabel('Período da mensagem').selectOption('month');
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
    expect(sent[0].text).toContain('Foco comercial'); expect(sent[0].text).toContain('Mensal');
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
    await expect(dialog.getByLabel('WhatsApp gerado')).toContainText('Foco comercial');
    expect(errors).toEqual([]);
  });
}
