import { readFile } from 'node:fs/promises';

const pngMagic = [137, 80, 78, 71, 13, 10, 26, 10];
const alertRegion = page => page.getByRole('region', { name: 'Metas atingidas no mês', exact: true });
const achievement = (page, name) => alertRegion(page).getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
const emailRegion = (page, name) => page.getByRole('region', { name: `E-mail de ${name}`, exact: true });

// Keep the actual local canvas and PNG encoder; inspect what is offered to the clipboard.
async function recordExports(page, denied = false) {
  await page.addInitScript(({ denied }) => {
    window.__goalExports = { png: [], html: [], texts: [] };
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (value, ...args) {
      window.__goalExports.texts.push(String(value));
      return fillText.call(this, value, ...args);
    };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: async items => {
      if (denied) throw new DOMException('Clipboard denied for fallback test', 'NotAllowedError');
      for (const item of items) {
        if (item.types.includes('image/png')) {
          const blob = await item.getType('image/png');
          window.__goalExports.png.push({ type: blob.type, size: blob.size, bytes: Array.from(new Uint8Array(await blob.arrayBuffer()).slice(0, 8)) });
        }
        if (item.types.includes('text/html')) window.__goalExports.html.push(await (await item.getType('text/html')).text());
      }
    } } });
  }, { denied });
}

export function registerGoalExportTests({ test, expect, setup, owner, created }) {
  test('goal exports: a unit without contacts can copy its actual achievement as a real PNG', async ({ page }) => {
    await recordExports(page);
    const { errors, relationshipWrites } = await setup(page);
    await page.getByRole('button', { name: 'Metas atingidas', exact: true }).click();
    const noContacts = achievement(page, 'Outra central');
    await expect(noContacts).toBeVisible();
    await noContacts.getByRole('button', { name: 'Copiar painel como imagem', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__goalExports.png.length)).toBe(1);
    const exported = await page.evaluate(() => window.__goalExports);
    expect(exported.png[0].bytes).toEqual(pngMagic);
    expect(exported.png[0].type).toBe('image/png');
    expect(exported.png[0].size).toBeGreaterThan(1000);
    const text = exported.texts.join(' ');
    expect(text).toContain('Outra central');
    expect(text).toMatch(/AGO(?:STO)?[\s/]+2026/i);
    expect(text).toContain('9.999,00');
    expect(text).not.toMatch(/projeção/i);
    expect(text).not.toContain('Cooperativa Beta');
    expect(relationshipWrites).toHaveLength(0);
    expect(errors).toEqual([]);
  });

  test('goal exports: filtered image includes only the selected type, unread results and reference month', async ({ page }) => {
    await recordExports(page);
    const { errors } = await setup(page);
    await page.getByRole('button', { name: 'Metas atingidas', exact: true }).click();
    const alerts = alertRegion(page);
    await alerts.getByRole('combobox', { name: 'Tipo de unidade', exact: true }).selectOption('cooperative');
    const beta = achievement(page, 'Cooperativa Beta');
    await beta.getByRole('button', { name: 'Marcar como lida', exact: true }).click();
    await expect(beta.getByText('Lida', { exact: true })).toBeVisible();
    await alerts.getByRole('checkbox', { name: 'Somente não lidas', exact: true }).check();
    await expect(beta).toHaveCount(0);
    await expect(achievement(page, 'Outra central')).toBeVisible();
    const copyFiltered = alerts.getByRole('button', { name: 'Copiar painel filtrado como imagem', exact: true });
    await page.evaluate(() => { window.__goalExports.texts = []; });
    await copyFiltered.click();
    await expect.poll(() => page.evaluate(() => window.__goalExports.png.length)).toBe(1);
    let text = await page.evaluate(() => window.__goalExports.texts.join(' '));
    expect(text).toContain('Outra central');
    expect(text).not.toContain('Cooperativa Beta');
    expect(text).not.toContain('Central Bahia teste');
    expect(text).not.toContain('Central Nordeste teste');
    expect(text).toMatch(/AGO(?:STO)?[\s/]+2026/i);
    await alerts.getByRole('combobox', { name: 'Mês de referência', exact: true }).selectOption('6');
    await expect(beta.getByRole('button', { name: 'Marcar como lida', exact: true })).toBeEnabled();
    await page.evaluate(() => { window.__goalExports.texts = []; });
    await copyFiltered.click();
    await expect.poll(() => page.evaluate(() => window.__goalExports.png.length)).toBe(2);
    text = await page.evaluate(() => window.__goalExports.texts.join(' '));
    expect(text).toContain('Cooperativa Beta');
    expect(text).toContain('Outra central');
    expect(text).toMatch(/JUL(?:HO)?[\s/]+2026/i);
    expect(text).not.toMatch(/AGO(?:STO)?[\s/]+2026/i);
    await alerts.getByRole('combobox', { name: 'Mês de referência', exact: true }).selectOption('8');
    await expect(copyFiltered).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('goal exports: email-only contacts stay isolated and Outlook copy is invalidated by an image copy', async ({ page }) => {
    await recordExports(page);
    const { errors } = await setup(page);
    // Simulate extra rows in a provider response to verify the UI also checks identity.
    const contact = (id, overrides = {}) => ({ id, owner_id: owner, workspace_year: 2026, entity_id: 'cooperative:1002:3025', entity_kind: 'cooperative', central: '1002', cooperative: '3025', pa: null, name: 'Contato somente e-mail', job_title: 'Gerente', teams: '', whatsapp: '', emails: ['bruno@example.com', 'apoio@example.com'], created_at: created, updated_at: created, ...overrides });
    await page.route('http://127.0.0.1:4600/rest/v1/commercial_entity_contacts**', async route => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      const url = new URL(route.request().url());
      if (url.searchParams.get('entity_id') !== 'eq.cooperative:1002:3025') return route.fallback();
      expect(url.searchParams.get('owner_id')).toBe(`eq.${owner}`);
      expect(url.searchParams.get('workspace_year')).toBe('eq.2026');
      const rows = [
        contact('00000000-0000-0000-0000-000000000501'),
        contact('00000000-0000-0000-0000-000000000502', { owner_id: '00000000-0000-0000-0000-000000000002', emails: ['private@example.com'] }),
        contact('00000000-0000-0000-0000-000000000503', { workspace_year: 2025, emails: ['previous-year@example.com'] }),
        contact('00000000-0000-0000-0000-000000000504', { entity_id: 'cooperative:1002:3017', cooperative: '3017', emails: ['another-unit@example.com'] }),
      ];
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(rows) });
    });
    await page.getByRole('button', { name: 'Metas atingidas', exact: true }).click();
    const beta = achievement(page, 'Cooperativa Beta');
    await beta.getByRole('button', { name: 'Preparar Outlook', exact: true }).click();
    const email = emailRegion(page, 'Cooperativa Beta');
    const recipients = email.getByRole('textbox', { name: 'Destinatários do e-mail', exact: true });
    await expect(recipients).toHaveValue(/bruno@example\.com/);
    expect((await recipients.inputValue()).split(/[;,\s]+/).filter(Boolean).sort()).toEqual(['apoio@example.com', 'bruno@example.com']);
    await email.getByRole('combobox', { name: 'Conta do Outlook', exact: true }).selectOption('personal');
    await expect(email.getByRole('button', { name: 'Abrir Outlook e colar painel', exact: true })).toBeDisabled();
    await email.getByRole('button', { name: 'Copiar painel', exact: true }).click();
    const ready = email.getByRole('link', { name: 'Abrir Outlook e colar painel', exact: true });
    await expect(ready).toBeVisible();
    const href = new URL(await ready.getAttribute('href'));
    expect(href.hostname).toBe('outlook.live.com');
    expect(href.searchParams.get('body') || '').toBe('');
    expect(href.searchParams.get('to').split(';').sort()).toEqual(['apoio@example.com', 'bruno@example.com']);
    expect(href.searchParams.get('subject')).toContain('Cooperativa Beta');
    const html = await page.evaluate(() => window.__goalExports.html.at(-1));
    expect(html).toContain('Cooperativa Beta');
    expect(html).toContain('150,00');
    expect(html).not.toMatch(/projeção/i);
    expect(html).not.toContain('Outra central');
    await beta.getByRole('button', { name: 'Copiar painel como imagem', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__goalExports.png.length)).toBe(1);
    await expect(ready).toHaveCount(0);
    await expect(email.getByRole('button', { name: 'Abrir Outlook e colar painel', exact: true })).toBeDisabled();
    await achievement(page, 'Central Bahia teste').getByRole('button', { name: 'Preparar Outlook', exact: true }).click();
    await expect(emailRegion(page, 'Central Bahia teste').getByRole('textbox', { name: 'Destinatários do e-mail', exact: true })).toHaveValue('celia@example.com');
    expect(errors).toEqual([]);
  });

  test('goal exports: blocked clipboard downloads PNG and complete EML, invalid recipients disable delivery and mobile fits', async ({ page, context }, info) => {
    await recordExports(page, true);
    const { errors } = await setup(page);
    await page.getByRole('button', { name: 'Metas atingidas', exact: true }).click();
    const beta = achievement(page, 'Cooperativa Beta');
    const pngDownload = page.waitForEvent('download');
    await beta.getByRole('button', { name: 'Copiar painel como imagem', exact: true }).click();
    const png = await pngDownload;
    expect(png.suggestedFilename()).toMatch(/\.png$/);
    expect(Array.from((await readFile(await png.path())).subarray(0, 8))).toEqual(pngMagic);
    await beta.getByRole('button', { name: 'Preparar Outlook', exact: true }).click();
    const email = emailRegion(page, 'Cooperativa Beta');
    const recipients = email.getByRole('textbox', { name: 'Destinatários do e-mail', exact: true });
    await expect(recipients).toHaveValue('bruno@example.com');
    await email.getByRole('button', { name: 'Copiar painel', exact: true }).click();
    await expect(email.getByRole('alert')).toContainText('A cópia formatada foi bloqueada');
    await expect(email.getByRole('button', { name: 'Abrir Outlook e colar painel', exact: true })).toBeDisabled();
    expect(context.pages()).toHaveLength(1);
    await recipients.fill('email-invalido');
    await expect(email.getByRole('button', { name: 'Copiar painel', exact: true })).toBeDisabled();
    await expect(email.getByRole('button', { name: 'Baixar e-mail (.eml)', exact: true })).toBeDisabled();
    await recipients.fill('bruno@example.com; extra@example.com');
    const emlDownload = page.waitForEvent('download');
    await email.getByRole('button', { name: 'Baixar e-mail (.eml)', exact: true }).click();
    const file = await emlDownload;
    const eml = await readFile(await file.path(), 'utf8');
    expect(eml).toContain('X-Unsent: 1');
    expect(eml).toContain('multipart/alternative');
    expect(eml).toContain('bruno@example.com');
    expect(eml).toContain('extra@example.com');
    const encoded = eml.split('Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0];
    const html = Buffer.from(encoded.replace(/\s/g, ''), 'base64').toString('utf8');
    expect(html).toContain('Cooperativa Beta');
    expect(html).toContain('150,00');
    expect(html).not.toMatch(/projeção/i);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await email.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`goal-outlook-${width}.png`), fullPage: true });
    }
    expect(errors).toEqual([]);
  });

  test('goal exports: a delayed PNG from the previous month cannot overwrite a newer Outlook copy', async ({ page }) => {
    await recordExports(page);
    await page.addInitScript(() => {
      const toBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
        return toBlob.call(this, blob => {
          window.__releaseGoalPng = () => { window.__releaseGoalPng = null; callback(blob); };
        }, ...args);
      };
    });
    const { errors } = await setup(page);
    let downloads = 0;
    page.on('download', () => downloads++);
    await page.getByRole('button', { name: 'Metas atingidas', exact: true }).click();
    await achievement(page, 'Cooperativa Beta').getByRole('button', { name: 'Copiar painel como imagem', exact: true }).click();
    await expect.poll(() => page.evaluate(() => typeof window.__releaseGoalPng)).toBe('function');
    await alertRegion(page).getByRole('combobox', { name: 'Mês de referência', exact: true }).selectOption('6');
    await achievement(page, 'Cooperativa Beta').getByRole('button', { name: 'Preparar Outlook', exact: true }).click();
    const email = emailRegion(page, 'Cooperativa Beta');
    await expect(email.getByRole('textbox', { name: 'Destinatários do e-mail', exact: true })).toHaveValue('bruno@example.com');
    await email.getByRole('button', { name: 'Copiar painel', exact: true }).click();
    const ready = email.getByRole('link', { name: 'Abrir Outlook e colar painel', exact: true });
    await expect(ready).toBeVisible();
    expect(await page.evaluate(() => window.__goalExports.html.at(-1))).toContain('JUL/2026');
    await page.evaluate(() => window.__releaseGoalPng());
    await expect(ready).toHaveCount(0);
    await expect(email.getByRole('button', { name: 'Abrir Outlook e colar painel', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => window.__goalExports.png)).toEqual([]);
    expect(downloads).toBe(0);
    expect(errors).toEqual([]);
  });
}
