import { step, disclosure, customize, emailDelivery, whatsappDelivery } from './composer-navigation.mjs';
import { registerFollowupTests } from './followup-cases.mjs';
import { registerPortalV2Tests } from './portal-v2-cases.mjs';
import { registerPeriodTests } from './period-cases.mjs';
import { registerUxTests } from './ux-cases.mjs';
import { registerScenarioTests } from "./scenario-cases.mjs";
import { registerDashboardTests } from "./dashboard-cases.mjs";
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { portfolioFixture } from '../portfolio-fixture.mjs';
const owner = '00000000-0000-0000-0000-000000000001';
const created = '2026-09-10T12:00:00Z';
const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'browser-test@example.com', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: created };
function contact(entity, name, email, index) { return { id: `00000000-0000-0000-0000-${String(100 + index).padStart(12,'0')}`, owner_id: owner, workspace_year: 2026, entity_id: entity.id, entity_kind: entity.kind, central: entity.central, cooperative: entity.cooperative ?? null, pa: entity.pa ?? null, name, job_title: 'Gerente', teams: '', whatsapp: '(71) 99999-9999', emails: [email], created_at: created, updated_at: created }; }
async function setup(page, transform = value => value) {
  await page.clock.setFixedTime(new Date("2026-09-10T15:00:00Z"));
  const dataset = transform(portfolioFixture());
  const errors = [];
  const writes = [];
  const drafts = [];
  const templates = new Map();
  page.on('pageerror', (error) => errors.push(error.message));
  const names = { 'cooperative:1002:3017': ['Ana Teste', 'ana@example.com'], 'cooperative:1002:3025': ['Bruno Teste','bruno@example.com'], 'central:1002': ['Celia Teste','celia@example.com'], 'pa:1002:3017:0': ['Paula Teste','paula@example.com'] };
  const contacts = dataset.registry.entities.flatMap((entity, index) => names[entity.id] ? [contact(entity, ...names[entity.id], index)] : []);
  await page.route('http://127.0.0.1:4600/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.startsWith('/auth/') || url.pathname === '/rest/v1/rpc/commercial_session_allowed') return route.continue();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const answer = (body) => route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/auth/v1/token') {
      const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600, iat: Math.floor(Date.now()/1000) })}.synthetic-test-signature`;
      return answer({ access_token: token, token_type: 'bearer', refresh_token: 'synthetic-refresh', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user });
    }
    if (url.pathname === '/auth/v1/user') return answer(user);
    if (url.pathname === '/auth/v1/logout') return answer({});
    if (url.pathname === '/rest/v1/commercial_workspaces') {
      const row = { id: '00000000-0000-0000-0000-000000000010', owner_id: owner, year: 2026, revision: 1, updated_at: created, dataset };
      return answer((request.headers().accept || '').includes('vnd.pgrst.object') ? row : [row]);
    }
    if (url.pathname === '/rest/v1/commercial_message_templates') {
      const key = `${url.searchParams.get('entity_kind')}:${url.searchParams.get('metric')}`;
      if (['POST','PATCH'].includes(request.method())) {
        const row = request.postDataJSON(); templates.set(`eq.${row.entity_kind}:eq.${row.metric}`, row); return answer(row);
      }
      return answer(templates.get(key) || null);
    }
    if (url.pathname === '/rest/v1/commercial_entity_contacts') return answer(contacts.filter((entry) => `eq.${entry.entity_id}` === url.searchParams.get('entity_id')));
    if (url.pathname === '/rest/v1/commercial_communication_drafts') {
      if (request.method() === 'POST') {
        const payload = request.postDataJSON(); writes.push(payload);
        const saved = { ...payload, id: '00000000-0000-0000-0000-000000000099', created_at: created }; drafts.push(saved); return answer(saved);
      }
      if (request.method() === 'DELETE') return answer([]);
      return answer(drafts.filter((entry) => `eq.${entry.entity_id}` === url.searchParams.get('entity_id')));
    }
    if (['/rest/v1/commercial_imports', '/rest/v1/commercial_actions'].includes(url.pathname)) return answer([]);
    errors.push(`Unexpected test request: ${request.method()} ${url.pathname}`); return answer([]);
  });
  await page.goto('/');
  const login = page.getByRole('form', { name: 'Entrar na conta' });
  await login.getByLabel('E-mail', { exact: true }).fill(user.email);
  await login.getByLabel('Senha', { exact: true }).fill('Synthetic-only-password-123!');
  await login.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(login).toBeHidden();
  await expect(page.getByRole('button', { name: 'Gerar e-mail / WhatsApp', exact: true })).toBeVisible();
  return { errors, writes };
}
const composer = (page) => page.getByRole('dialog', { name: 'Comunicar resultado' });
async function selectAugust(dialog) { await dialog.getByLabel('Período da mensagem').selectOption('month'); await dialog.getByLabel('Mês de referência').selectOption('7'); }

test('desktop: contact isolation, dashboard, Outlook, WhatsApp, file and saved draft', async ({ page }, testInfo) => {
  const { errors, writes } = await setup(page);
  await page.getByRole('button', { name: 'Gerar e-mail / WhatsApp', exact: true }).click();
  const dialog = composer(page);
  await dialog.getByLabel('Unidade selecionada').selectOption('cooperative:1002:3017');
  await selectAugust(dialog);
  await expect(dialog.getByText('Ana Teste', { exact: true })).toBeVisible();
  await dialog.getByLabel('E-mails adicionais').fill('ANA@example.com; extra@example.com');
  await disclosure(dialog, 'Personalizar abertura e assinatura');
  await dialog.getByLabel('Abertura personalizada').fill('Vamos priorizar as oportunidades desta carteira.');
  await dialog.getByLabel('Assinatura / orientação final').fill('Equipe Comercial teste');
  await dialog.getByLabel('Incluir Venda Nova e Arrecadação, separadamente').check();
  await step(dialog, 2);
  const frame = page.frameLocator('iframe[title="Painel do e-mail da carteira"]');
  await expect(frame.getByRole('heading', { level: 1 })).toContainText('Cooperativa Alfa');
  await expect(frame.getByRole('heading', { name: 'Arrecadação', exact: true })).toBeVisible();
  await emailDelivery(dialog);
  const outlook = new URL(await dialog.getByRole('link', { name: 'Abrir Outlook somente texto', exact: true }).getAttribute('href'));
  expect(outlook.hostname).toBe('outlook.office.com');
  expect(outlook.searchParams.get('to').split(';').sort()).toEqual(['ana@example.com', 'extra@example.com']);
  expect(outlook.searchParams.get('body')).toContain('Vamos priorizar');
  expect(outlook.searchParams.get('body')).toContain('400,00');
  await whatsappDelivery(dialog);
  const wa = new URL(await dialog.getByRole('link', { name: 'Abrir WhatsApp', exact: true }).getAttribute('href'));
  expect(wa.pathname).toBe('/5571999999999');
  expect(wa.searchParams.get('text')).toContain('Olá, Ana Teste!');
  expect(wa.searchParams.get('text')).toContain('400,00');
  await dialog.evaluate((node) => { node.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath('desktop-portfolio.png'), fullPage: true });
  await emailDelivery(dialog);
  const fileEvent = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Baixar e-mail (.eml)', exact: true }).click();
  const file = await fileEvent;
  const eml = await readFile(await file.path(), 'utf8');
  expect(eml).toContain('X-Unsent: 1'); expect(eml).toContain('multipart/alternative');
  await dialog.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Rascunho salvo');
  expect(writes).toHaveLength(1); expect(writes[0].entity_id).toBe('cooperative:1002:3017');
  expect(writes[0].recipients.sort()).toEqual(['ana@example.com','extra@example.com']);
  await dialog.getByLabel('Unidade selecionada').selectOption('cooperative:1002:3025');
  await expect(dialog.getByText('Bruno Teste', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('E-mails adicionais')).toHaveValue('');
  await emailDelivery(dialog);
  const next = new URL(await dialog.getByRole('link', { name: 'Abrir Outlook somente texto', exact: true }).getAttribute('href'));
  expect(next.searchParams.get('to')).toBe('bruno@example.com');
  expect(errors).toEqual([]);
});

test('central and PA use their own responsible contacts and original level', async ({ page }, testInfo) => {
  const { errors } = await setup(page);
  await page.getByLabel('Agrupar por').selectOption('central');
  await page.getByRole('button', { name: 'Gerar comunicação de Central Bahia teste', exact: true }).click();
  const dialog = composer(page);
  await selectAugust(dialog);
  await expect(dialog.getByText('Celia Teste', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Unidade selecionada')).toHaveValue('central:1002');
  await step(dialog, 2);
  await dialog.getByRole('button', { name: 'Texto do e-mail', exact: true }).click();
  await expect(dialog.getByLabel('E-mail gerado')).toHaveValue(/todas as 2 cooperativas/);
  await dialog.getByRole('button', { name: 'Fechar comunicação', exact: true }).click();
  await page.getByRole('button', { name: 'Cadência dos PAs', exact: true }).click();
  await page.getByRole('button', { name: 'Gerar comunicação de PA Alfa zero', exact: true }).click();
  await selectAugust(composer(page));
  await expect(composer(page).getByText('Paula Teste', { exact: true })).toBeVisible();
  await expect(composer(page).getByLabel('Unidade selecionada')).toHaveValue('pa:1002:3017:0');
  await emailDelivery(composer(page));
  expect(new URL(await composer(page).getByRole('link', { name: 'Abrir Outlook somente texto', exact: true }).getAttribute('href')).searchParams.get('to')).toBe('paula@example.com');
  await page.screenshot({ path: testInfo.outputPath('pa-portfolio.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('mobile: fixed registry entry exposes usable communication without horizontal overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { errors } = await setup(page);
  await page.getByRole('button', { name: 'Cadastro e metas', exact: true }).click();
  await page.getByRole('button', { name: /PA Alfa zero/ }).click();
  await page.getByRole('button', { name: 'Gerar e-mail / WhatsApp', exact: true }).click();
  const dialog = composer(page);
  await expect(dialog.getByLabel('Unidade selecionada')).toHaveValue('pa:1002:3017:0');
  await expect(dialog.getByText('Paula Teste', { exact: true })).toBeVisible();
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await dialog.evaluate((node) => { node.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath('mobile-portfolio.png'), fullPage: true });
  await step(dialog, 2);
  await dialog.getByRole('button', { name: 'Painel do WhatsApp', exact: true }).click();
  await disclosure(dialog, 'Ver texto do WhatsApp');
  await expect(dialog.getByLabel('WhatsApp gerado')).toHaveValue(/Paula Teste/);
  await page.screenshot({ path: testInfo.outputPath('mobile-whatsapp.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('long valid recipient list keeps complete EML export and draft while Outlook link is unavailable', async ({ page }) => {
  const { errors, writes } = await setup(page);
  await page.getByRole('button', { name: 'Gerar e-mail / WhatsApp', exact: true }).click();
  const dialog = composer(page);
  await dialog.getByLabel('Unidade selecionada').selectOption('cooperative:1002:3017');
  await expect(dialog.getByText('Ana Teste', { exact: true })).toBeVisible();
  const addresses = Array.from({ length: 35 }, (_, i) => `${'a'.repeat(60)}${i}@${'b'.repeat(60)}.${'c'.repeat(60)}.${'d'.repeat(60)}.com`);
  await dialog.getByLabel('E-mails adicionais').fill(addresses.join(';'));
  await emailDelivery(dialog);
  await expect(dialog.getByText('Muitos destinatários para um link. Reduza a seleção ou baixe o arquivo de e-mail.', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Abrir Outlook somente texto', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Baixar e-mail (.eml)', exact: true })).toBeEnabled();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Baixar e-mail (.eml)', exact: true }).click();
  const file = await download;
  const eml = await readFile(await file.path(), 'utf8');
  for (const address of addresses) expect(eml).toContain(address);
  await dialog.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Rascunho salvo');
  expect(writes).toHaveLength(1); expect(writes[0].recipients).toHaveLength(36);
  expect(errors).toEqual([]);
});

registerDashboardTests({ setup, composer, selectAugust });

registerScenarioTests({ test, expect, setup, composer, owner, created });

registerUxTests({test,expect,setup,owner,created});

registerPeriodTests({ test, expect, setup, composer });

registerPortalV2Tests({ test, expect, setup });

registerFollowupTests({test,expect,setup,composer,selectAugust});
