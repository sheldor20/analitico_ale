import { readFile } from 'node:fs/promises';
import { upsertEntity, upsertPlanRow } from '../../lib/registry.mjs';

const pngMagic = [137, 80, 78, 71, 13, 10, 26, 10];
const alertRegion = page => page.getByRole('region', { name: 'Metas atingidas no mês', exact: true });
const achievement = (page, name) => alertRegion(page).getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
const emailRegion = (page, name) => page.getByRole('region', { name: `E-mail de ${name}`, exact: true });

// Keep the actual local canvas and PNG encoder; inspect what is offered to the clipboard.
async function recordExports(page, denied = false) {
  await page.addInitScript(({ denied }) => {
    window.__goalExports = { png: [], html: [], texts: [], draws: [], rects: [] };
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (value, x, y, ...args) {
      window.__goalExports.texts.push(String(value));
      const metrics = this.measureText(String(value));
      window.__goalExports.draws.push({ text: String(value), x, y, right: x + metrics.width, bottom: y + metrics.actualBoundingBoxDescent });
      return fillText.call(this, value, x, y, ...args);
    };
    const fillRect = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, width, height) {
      window.__goalExports.rects.push({ x, y, width, height, fill: this.fillStyle });
      return fillRect.call(this, x, y, width, height);
    };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: async items => {
      if (denied) throw new DOMException('Clipboard denied for fallback test', 'NotAllowedError');
      for (const item of items) {
        if (item.types.includes('image/png')) {
          const blob = await item.getType('image/png');
          const bytes = new Uint8Array(await blob.arrayBuffer()), dimensions = new DataView(bytes.buffer);
          window.__goalExports.png.push({ type: blob.type, size: blob.size, bytes: Array.from(bytes.slice(0, 8)), width: dimensions.getUint32(16), height: dimensions.getUint32(20) });
        }
        if (item.types.includes('text/html')) window.__goalExports.html.push(await (await item.getType('text/html')).text());
      }
    } } });
  }, { denied });
}

function hierarchyFixture(dataset) {
  dataset.rows = dataset.rows.map(row => row.central === '1002' && row.cooperative === '3017' && row.metric === 'VN'
    ? { ...row, actuals: row.actuals.map(value => value == null ? null : row.source === 'cadence' ? 450 : 100) } : row);
  dataset = upsertEntity(dataset, { kind: 'pa', central: '2007', cooperative: '3017', pa: '0', name: 'PA Nordeste zero', group: 'P1' });
  return upsertPlanRow(dataset, { entityId: 'pa:2007:3017:0', metric: 'VN', targets: Array(12).fill(450), annualTarget: 5400,
    actuals: [...Array(8).fill(450), null, null, null, null], cutoff: '2026-08-31' });
}

export function registerGoalExportTests({ test, expect, setup, owner, created }) {
  test('goal filters: central and composite cooperative scopes preserve PA zero and reset without changing the month', async ({ page }, info) => {
    await recordExports(page);
    const { errors } = await setup(page, hierarchyFixture);
    await page.getByRole('button', { name: 'Metas atingidas', exact: true }).click();
    const alerts = alertRegion(page);
    const central = alerts.getByRole('combobox', { name: 'Central', exact: true });
    const cooperative = alerts.getByRole('combobox', { name: 'Cooperativa', exact: true });
    const kind = alerts.getByRole('combobox', { name: 'Tipo de unidade', exact: true });
    const order = alerts.getByRole('combobox', { name: 'Ordem das metas atingidas', exact: true });
    await expect(order).toHaveValue('attainment-desc');
    await expect(alerts.getByText('7 metas atingidas', { exact: true })).toBeVisible();
    await expect(cooperative.locator('option[value="cooperative:1002:3017"]')).toHaveCount(1);
    await expect(cooperative.locator('option[value="cooperative:2007:3017"]')).toHaveCount(1);
    await kind.selectOption('cooperative');
    const names = ['Cooperativa Alfa', 'Cooperativa Beta', 'Outra central'];
    let images = 0;
    for (const [value, indices] of [['attainment-desc', [1, 0, 2]], ['production', [2, 1, 0]], ['name', [0, 1, 2]]]) {
      await order.selectOption(value);
      const expected = indices.map(index => names[index]);
      await expect(alerts.getByRole('article').getByRole('heading', { level: 3 })).toHaveText(expected);
      await expect(achievement(page, 'Cooperativa Alfa')).toContainText('Central 1002 · Cooperativa 3017');
      await expect(achievement(page, 'Outra central')).toContainText('Central 2007 · Cooperativa 3017');
      await page.evaluate(() => { window.__goalExports.texts = []; });
      await alerts.getByRole('button', { name: 'Copiar painel filtrado como imagem', exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.__goalExports.png.length)).toBe(++images);
      const exported = await page.evaluate(() => window.__goalExports);
      expect(exported.png.at(-1).bytes).toEqual(pngMagic);
      const text = exported.texts.join(' '), positions = expected.map(name => text.indexOf(name));
      expect(positions.every(position => position >= 0)).toBe(true);
      expect(positions[0]).toBeLessThan(positions[1]); expect(positions[1]).toBeLessThan(positions[2]);
      expect(text).toContain('Cooperativa 3017 · Cooperativa Alfa · Venda nova · Central 1002');
      expect(text).toContain('Cooperativa 3017 · Outra central · Venda nova · Central 2007');
    }
    await kind.selectOption('all');
    await central.selectOption('1002');
    await expect(alerts.getByText('4 metas atingidas', { exact: true })).toBeVisible();
    await expect(cooperative.locator('option[value="cooperative:2007:3017"]')).toHaveCount(0);
    await cooperative.selectOption('cooperative:1002:3017');
    await expect(alerts.getByText('2 metas atingidas', { exact: true })).toBeVisible();
    await expect(alerts.getByRole('article')).toHaveCount(2);
    await expect(achievement(page, 'Cooperativa Alfa')).toBeVisible();
    await expect(achievement(page, 'PA Alfa zero')).toBeVisible();
    await expect(achievement(page, 'Central Bahia teste')).toHaveCount(0);
    await kind.selectOption('cooperative');
    await expect(alerts.getByRole('article')).toHaveCount(1);
    await expect(achievement(page, 'Cooperativa Alfa')).toBeVisible();
    await kind.selectOption('pa');
    await expect(achievement(page, 'PA Alfa zero')).toBeVisible();
    await expect(alerts.getByText('1 meta atingida', { exact: true })).toBeVisible();
    await central.selectOption('2007');
    await expect(cooperative).toHaveValue('all');
    await expect(achievement(page, 'PA Nordeste zero')).toBeVisible();
    await expect(achievement(page, 'PA Alfa zero')).toHaveCount(0);
    await kind.selectOption('all');
    await expect(alerts.getByText('3 metas atingidas', { exact: true })).toBeVisible();
    await cooperative.selectOption('cooperative:2007:3017');
    await expect(alerts.getByRole('article')).toHaveCount(2);
    await expect(achievement(page, 'Outra central')).toBeVisible();
    await expect(achievement(page, 'PA Nordeste zero')).toBeVisible();
    await expect(achievement(page, 'Cooperativa Alfa')).toHaveCount(0);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1100 : 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await alerts.screenshot({ path: info.outputPath(`goal-hierarchy-${width}.png`) });
    }
    await kind.selectOption('central');
    await expect(cooperative).toHaveValue('all');
    await expect(cooperative).toBeDisabled();
    await expect(alerts.getByText('1 meta atingida', { exact: true })).toBeVisible();
    await expect(achievement(page, 'Central Nordeste teste')).toBeVisible();
    await kind.selectOption('pa');
    await expect(cooperative).toBeEnabled();
    await central.selectOption('1002');
    await cooperative.selectOption('cooperative:1002:3025');
    await expect(alerts.getByRole('article')).toHaveCount(0);
    await expect(alerts.getByText('0 metas atingidas', { exact: true })).toBeVisible();
    await expect(alerts.getByRole('button', { name: 'Copiar painel filtrado como imagem', exact: true })).toHaveCount(0);
    await alerts.getByRole('combobox', { name: 'Mês de referência', exact: true }).selectOption('6');
    await alerts.getByRole('checkbox', { name: 'Somente não lidas', exact: true }).check();
    await alerts.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
    await expect(central).toHaveValue('all');
    await expect(cooperative).toHaveValue('all');
    await expect(kind).toHaveValue('all');
    await expect(order).toHaveValue('attainment-desc');
    await expect(alerts.getByRole('checkbox', { name: 'Somente não lidas', exact: true })).not.toBeChecked();
    await expect(alerts.getByRole('combobox', { name: 'Mês de referência', exact: true })).toHaveValue('6');
    await expect(alerts.getByText('7 metas atingidas', { exact: true })).toBeVisible();
    await expect(alerts.getByRole('article')).toHaveCount(7);
    expect(errors).toEqual([]);
  });

  test('goal filters: scoped unread PNG preserves hierarchy and excludes totals and same-code units from another central', async ({ page }) => {
    await recordExports(page);
    const { errors } = await setup(page, hierarchyFixture);
    await page.getByRole('button', { name: 'Metas atingidas', exact: true }).click();
    const alerts = alertRegion(page);
    await alerts.getByRole('combobox', { name: 'Central', exact: true }).selectOption('1002');
    await alerts.getByRole('combobox', { name: 'Cooperativa', exact: true }).selectOption('cooperative:1002:3017');
    await achievement(page, 'Cooperativa Alfa').getByRole('button', { name: 'Marcar como lida', exact: true }).click();
    await expect(achievement(page, 'Cooperativa Alfa').getByText('Lida', { exact: true })).toBeVisible();
    await alerts.getByRole('checkbox', { name: 'Somente não lidas', exact: true }).check();
    await expect(alerts.getByText('2 metas atingidas', { exact: true })).toBeVisible();
    await expect(alerts.getByText(/^1 para reconhecer/)).toBeVisible();
    await expect(alerts.getByRole('article')).toHaveCount(1);
    await expect(achievement(page, 'PA Alfa zero')).toBeVisible();
    await page.evaluate(() => { window.__goalExports.texts = []; });
    await alerts.getByRole('button', { name: 'Copiar painel filtrado como imagem', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__goalExports.png.length)).toBe(1);
    const { texts, png } = await page.evaluate(() => window.__goalExports);
    const text = texts.join(' ');
    expect(png[0].bytes).toEqual(pngMagic);
    expect(text).toContain('PA Alfa zero');
    expect(text).toContain('Central 1002');
    expect(text).toContain('Cooperativa 3017');
    expect(text).toContain('AGO/2026');
    expect(text).not.toContain('PA Nordeste zero');
    expect(text).not.toContain('Outra central');
    expect(text).not.toContain('Cooperativa Beta');
    expect(text).not.toContain('2007');
    expect(text).toContain('450,00');
    expect(errors).toEqual([]);
  });

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
    expect(text.split('Central Nordeste teste')).toHaveLength(2);
    expect(text).not.toContain('Central 2007 · Central Nordeste teste');
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

  test('goal exports: email-only contacts stay isolated and Outlook copy is invalidated by an image copy', async ({ page }, info) => {
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
    const exported = await page.evaluate(() => window.__goalExports);
    expect(exported.draws.slice(0, 3).map(item => item.text)).toEqual([
      'Gestão comercial · Venda nova', 'Central Bahia teste', 'Mensal · AGO/2026',
    ]);
    const headerRect = exported.rects.find(rect => rect.x === 0 && rect.y === 0 && rect.width === 1080 && rect.fill === '#003641');
    expect(headerRect).toBeTruthy(); expect(headerRect.height).toBeLessThanOrEqual(180);
    const cutoff = exported.draws.find(item => item.text.includes('31/08/2026'));
    expect(cutoff).toBeTruthy(); expect(cutoff.y).toBeGreaterThanOrEqual(headerRect.height);
    expect(exported.draws.filter(item => item.text.includes('31/08/2026'))).toHaveLength(1);
    const firstMetric = exported.draws.find(item => item.text === 'Meta do mês');
    expect(firstMetric).toBeTruthy(); expect(firstMetric.y - headerRect.height).toBeLessThanOrEqual(180);
    for (const item of exported.draws) {
      expect(item.right, item.text).toBeLessThanOrEqual(exported.png[0].width);
      expect(item.bottom, item.text).toBeLessThanOrEqual(exported.png[0].height);
    }
    await achievement(page, 'Central Bahia teste').getByRole('button', { name: 'Preparar Outlook', exact: true }).click();
    await expect(emailRegion(page, 'Central Bahia teste').getByRole('textbox', { name: 'Destinatários do e-mail', exact: true })).toHaveValue('celia@example.com');
    const preview = await page.context().newPage();
    try {
      await preview.route('**/*', route => route.abort());
      await preview.setContent(html);
      const header = preview.locator('[data-communication-header]');
      const detail = preview.locator('[data-communication-context]');
      expect((await header.innerText()).split(/\n+/).map(line => line.trim()).filter(Boolean)).toEqual([
        'Gestão comercial · Venda nova', 'Central Bahia teste', 'Mensal · AGO/2026',
      ]);
      await expect(detail).toContainText('Cooperativa Beta');
      await expect(detail).toContainText('31/08/2026');
      expect((await preview.locator('body').innerText()).split('31/08/2026')).toHaveLength(2);
      for (const width of [680, 320]) {
        await preview.setViewportSize({ width, height: 844 });
        const headerBox = await header.boundingBox(), detailBox = await detail.boundingBox();
        const cards = await preview.locator('[data-layout="metric-cards"]').first().boundingBox();
        expect(headerBox.height).toBeLessThanOrEqual(180);
        expect(detailBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
        expect(cards.y).toBeGreaterThanOrEqual(detailBox.y + detailBox.height);
        expect(cards.y - headerBox.y - headerBox.height).toBeLessThanOrEqual(180);
        expect(await preview.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await preview.screenshot({ path: info.outputPath(`goal-compact-email-${width}.png`), fullPage: true });
      }
    } finally { await preview.close(); }
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
    await png.saveAs(info.outputPath('goal-compact-achievement.png'));
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
