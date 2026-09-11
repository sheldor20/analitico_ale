import { step, disclosure } from './composer-navigation.mjs';
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
  test('selected period leads dashboard and annual support is omitted in annual scenario', async ({ page }, info) => {
    const { dialog, errors } = await open(page);
    await dialog.getByLabel('Incluir Venda Nova e Arrecadação, separadamente').check();
    await step(dialog, 2);
    const frame = page.frameLocator('iframe[title="Painel do e-mail da carteira"]');
    for (const period of ['month','quarter','semester','ytd','annual']) {
      await dialog.getByLabel('Período da mensagem').selectOption(period);
      const support = frame.locator('[data-section="annual-support"]');
      await expect(support).toHaveCount(period === 'annual' ? 0 : 1);
      if (period !== 'annual') {
        const text = await frame.locator('body').innerText();
        expect(text.indexOf('Arrecadação')).toBeLessThan(text.indexOf('Apoio anual'));
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
