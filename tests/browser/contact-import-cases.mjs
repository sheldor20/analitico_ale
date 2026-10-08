import ExcelJS from 'exceljs';
import { emailDelivery, whatsappDelivery } from './composer-navigation.mjs';

const importDialog = page => page.getByRole('dialog', { name: 'Importar contatos das cooperativas', exact: true });
const previewRow = (dialog, row) => dialog.locator(`article[data-import-key="1:${row}"]`);
const choice = (dialog, row) => dialog.getByRole('checkbox', { name: `Selecionar contato da linha ${row} da aba BASE`, exact: true });
const savedKeys = ['name', 'job_title', 'teams', 'whatsapp', 'emails'];

async function workbookFile(rows) {
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('BASE');
  sheet.addRow(['Contatos inteiramente sintéticos para regressão']);
  sheet.addRow(['Central', 'Nº', 'SINGULAR', 'Meta anual', 'E-MAIL', 'TELEFONE']);
  rows.forEach(row => sheet.addRow(row));
  return { name: 'contatos-sinteticos.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await workbook.xlsx.writeBuffer()) };
}

function contactRow(owner, created, number, entity, name, emails, overrides = {}) {
  const [, central, cooperative] = entity.split(':');
  return { id: `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`, owner_id: owner, workspace_year: 2026,
    entity_id: entity, entity_kind: 'cooperative', central, cooperative, pa: null, name, emails,
    job_title: '', teams: '', whatsapp: '', created_at: created, updated_at: created, ...overrides };
}

// The mock controls success/failure of one atomic request. SQL transaction and
// RLS guarantees are covered separately by database tests, not inferred here.
function importEndpoint(owner, created, gate = { fail: false }) {
  let sequence = 950;
  return async (payload, contacts) => {
    if (gate.fail) return { status: 409, body: { code: '40001', message: 'Os contatos mudaram. Recarregue a prévia antes de salvar.' } };
    const next = structuredClone(contacts), counts = { created: 0, updated: 0, unchanged: 0 };
    for (const item of payload.p_items) {
      const previous = item.contact_id ? next.find(row => row.id === item.contact_id && row.owner_id === owner && row.workspace_year === payload.p_year && row.entity_id === item.entity_id) : null;
      if (item.contact_id && (!previous || previous.updated_at !== item.expected_updated_at)) return { status: 409, body: { code: '40001', message: 'Recarregue a prévia antes de salvar.' } };
      if (!previous) {
        next.push(contactRow(owner, created, sequence++, item.entity_id, item.name, item.emails, Object.fromEntries(savedKeys.map(key => [key, item[key]]))));
        counts.created++;
      } else if (savedKeys.every(key => JSON.stringify(previous[key]) === JSON.stringify(item[key]))) counts.unchanged++;
      else { Object.assign(previous, Object.fromEntries(savedKeys.map(key => [key, item[key]])), { updated_at: '2026-09-10T15:01:00Z' }); counts.updated++; }
    }
    contacts.splice(0, contacts.length, ...next);
    return { body: counts };
  };
}

export function registerContactImportTests({ test, expect, setup, owner, created }) {
  test('contact import: synthetic workbook previews errors and duplicates, preserves saved details and makes selected contacts available to communication', async ({ page }, info) => {
    const seed = [
      contactRow(owner, created, 910, 'cooperative:1002:3017', 'Contato comercial', ['alfa-antigo@example.com'], { job_title: 'Gerente preservado', teams: 'alfa.teams@example.com', whatsapp: '+5571977771111' }),
      contactRow(owner, created, 911, 'cooperative:1002:3025', 'Bruno Teste', ['bruno@example.com'], { whatsapp: '+5571988883333' }),
      contactRow(owner, created, 912, 'cooperative:2007:3017', 'Contato comercial', ['nordeste-antigo@example.com']),
      contactRow('00000000-0000-0000-0000-000000000002', created, 913, 'cooperative:1002:3017', 'Outro usuário sintético', ['outro-owner@example.com']),
      contactRow(owner, created, 914, 'cooperative:1002:3017', 'Ano anterior sintético', ['ano-anterior@example.com'], { workspace_year: 2025 }),
    ];
    const { errors, writes, relationshipWrites, contactRows, contactReads, contactImports } = await setup(page, value => value,
      { contacts: seed, contactPageSize: 2, importContacts: importEndpoint(owner, created) });
    const workspaceWrites = [];
    page.on('request', request => { if (request.method() !== 'GET' && new URL(request.url()).pathname === '/rest/v1/commercial_workspaces') workspaceWrites.push(request.method()); });
    const file = await workbookFile([
      ['Central Bahia teste', 3017, 'Cooperativa Alfa', 999999, 'ALFA-NOVO@example.com; alfa-novo@example.com', '(71) 98888-1111'],
      ['Central Bahia teste', 3017, 'Cooperativa Alfa', 999999, 'ALFA-NOVO@example.com; alfa-novo@example.com', '(71) 98888-1111'],
      [2007, 3017, 'Outra central', 888888, 'nordeste-novo@example.com', '(81) 98888-2222'],
      [1002, 3025, 'Cooperativa Beta', 777777, 'invalido@', ''],
      [1002, 9999, 'Cooperativa desconhecida sintética', 666666, 'desconhecido@example.com', ''],
      [1002, 3025, 'Cooperativa Beta', 555555, 'telefone-revisado@example.com', '(71) 98888-4444 / (71) 98888-5555'],
    ]);
    await page.getByRole('button', { name: 'Cadastro e metas', exact: true }).click();
    await page.getByRole('button', { name: 'Importar contatos', exact: true }).click();
    const dialog = importDialog(page);
    await dialog.getByLabel('Planilha de contatos', { exact: true }).setInputFiles(file);
    await expect(dialog.getByRole('region', { name: 'Prévia da importação de contatos', exact: true }).locator('article')).toHaveCount(6);
    await expect(previewRow(dialog, 3)).toHaveAttribute('data-import-status', 'update');
    await expect(previewRow(dialog, 4)).toHaveAttribute('data-import-status', 'duplicate');
    await expect(choice(dialog, 4)).toBeDisabled();
    for (const row of [6, 7, 8]) { await expect(previewRow(dialog, row)).toHaveAttribute('data-import-status', 'invalid'); await expect(choice(dialog, row)).toBeDisabled(); }
    await expect(previewRow(dialog, 7)).toContainText('Cooperativa não encontrada');
    await expect(previewRow(dialog, 8)).toContainText('apenas um');
    await expect(dialog.getByLabel('Nome do responsável — 1:3', { exact: true })).toHaveValue('Contato comercial');
    const firstSnapshot = contactReads.filter(read => !read.entity_id);
    expect(firstSnapshot.map(read => Number(read.offset || 0))).toEqual([0, 2, 3]);
    expect(firstSnapshot.every(read => read.owner_id === `eq.${owner}` && read.workspace_year === 'eq.2026' && read.entity_kind === 'eq.cooperative')).toBe(true);
    expect(contactImports).toHaveLength(0);
    await dialog.getByLabel('Nome do responsável — 1:6', { exact: true }).fill('Bia Importada');
    await dialog.getByLabel('E-mails — 1:6', { exact: true }).fill('bia-importada@example.com');
    await expect(previewRow(dialog, 6)).toHaveAttribute('data-import-status', 'create');
    await dialog.getByLabel('Nome do responsável — 1:8', { exact: true }).fill('Telefone revisado');
    await dialog.getByLabel('Celular ou telefone — 1:8', { exact: true }).fill('(71) 98888-4444');
    await expect(previewRow(dialog, 8)).toHaveAttribute('data-import-status', 'create');
    await choice(dialog, 8).uncheck();
    await expect(dialog.getByText('3 contatos selecionados para salvar', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await dialog.evaluate(node => { node.parentElement.scrollTop = 0; });
    await expect(dialog.getByRole('heading', { name: 'Importar contatos das cooperativas', exact: true })).toBeInViewport();
    await page.screenshot({ path: info.outputPath('contact-import-preview-320.png'), fullPage: false });
    await dialog.getByRole('button', { name: 'Salvar contatos selecionados', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('contact-import-actions-320.png'), fullPage: false });
    await dialog.getByRole('button', { name: 'Salvar contatos selecionados', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('1 novos, 2 atualizados e 0 sem alteração');
    expect(contactImports).toHaveLength(1);
    const batch = contactImports[0];
    expect(batch).toMatchObject({ p_year: 2026, p_expected_owner: owner, p_expected_revision: 1 });
    expect(batch.p_items.map(item => item.entity_id)).toEqual(['cooperative:1002:3017', 'cooperative:2007:3017', 'cooperative:1002:3025']);
    expect(batch.p_items[0]).toMatchObject({ name: 'Contato comercial', job_title: 'Gerente preservado', teams: 'alfa.teams@example.com', whatsapp: '+5571988881111', contact_id: seed[0].id, expected_updated_at: created });
    expect(batch.p_items[0].emails.sort()).toEqual(['alfa-antigo@example.com', 'alfa-novo@example.com']);
    expect(contactRows).toHaveLength(seed.length + 1);
    expect(contactRows.find(row => row.id === seed[3].id)).toEqual(seed[3]);
    expect(contactRows.find(row => row.id === seed[4].id)).toEqual(seed[4]);
    await expect(previewRow(dialog, 3)).toHaveAttribute('data-import-status', 'unchanged');
    await expect(previewRow(dialog, 5)).toHaveAttribute('data-import-status', 'unchanged');
    await expect(previewRow(dialog, 6)).toHaveAttribute('data-import-status', 'unchanged');
    await expect(dialog.getByRole('button', { name: 'Salvar contatos selecionados', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Fechar importação de contatos', exact: true }).click();
    await page.reload();
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.getByRole('button', { name: 'Cadastro e metas', exact: true }).click();
    await page.locator('.registry-list').getByRole('button', { name: /Cooperativa Alfa/ }).click();
    await page.getByRole('button', { name: 'Contatos', exact: true }).click();
    const responsible = page.getByRole('region', { name: 'Responsáveis de Cooperativa Alfa', exact: true });
    await expect(responsible).toContainText('alfa-novo@example.com');
    await expect(responsible).toContainText('alfa-antigo@example.com');
    await expect(responsible).toContainText('Gerente preservado');
    for (const excluded of ['nordeste-novo@example.com', 'outro-owner@example.com', 'ano-anterior@example.com']) await expect(responsible).not.toContainText(excluded);
    await page.getByRole('button', { name: 'Gerar e-mail / WhatsApp', exact: true }).click();
    const composer = page.getByRole('dialog', { name: 'Comunicar resultado', exact: true });
    await expect(composer.getByText('Contato comercial', { exact: true })).toBeVisible();
    await emailDelivery(composer);
    const outlook = new URL(await composer.getByRole('link', { name: 'Abrir Outlook somente texto', exact: true }).getAttribute('href'));
    expect(outlook.searchParams.get('to').split(';').sort()).toEqual(['alfa-antigo@example.com', 'alfa-novo@example.com']);
    await whatsappDelivery(composer);
    const whatsapp = new URL(await composer.getByRole('link', { name: 'Abrir WhatsApp', exact: true }).getAttribute('href'));
    expect(whatsapp.pathname).toBe('/5571988881111');
    await composer.getByRole('button', { name: 'Fechar comunicação', exact: true }).click();
    await page.getByRole('button', { name: 'Importar contatos', exact: true }).click();
    await dialog.getByLabel('Planilha de contatos', { exact: true }).setInputFiles(file);
    await expect(previewRow(dialog, 3)).toHaveAttribute('data-import-status', 'unchanged');
    await expect(previewRow(dialog, 5)).toHaveAttribute('data-import-status', 'unchanged');
    await expect(dialog.getByRole('button', { name: 'Salvar contatos selecionados', exact: true })).toBeDisabled();
    expect(contactImports).toHaveLength(1); expect(contactRows).toHaveLength(seed.length + 1);
    expect(workspaceWrites).toEqual([]);expect(writes).toEqual([]);expect(relationshipWrites).toEqual([]);expect(errors).toEqual([]);
  });

  test('contact import: a rejected atomic batch keeps every contact unchanged and requires a fresh preview before retry', async ({ page }, info) => {
    const gate = { fail: true };
    const { errors, contactRows, contactImports, contactReads, writes, relationshipWrites } = await setup(page, value => value,
      { contacts: [], importContacts: importEndpoint(owner, created, gate) });
    await page.getByRole('button', { name: 'Cadastro e metas', exact: true }).click();
    await page.getByRole('button', { name: 'Importar contatos', exact: true }).click();
    const dialog = importDialog(page);
    await dialog.getByLabel('Planilha de contatos', { exact: true }).setInputFiles(await workbookFile([
      [1002, 3017, 'Cooperativa Alfa', 99999, 'alfa-retry@example.com', '(71) 98888-1111'],
      [2007, 3017, 'Outra central', 88888, 'nordeste-retry@example.com', '(81) 98888-2222'],
    ]));
    await expect(dialog.getByText('2 contatos selecionados para salvar', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Salvar contatos selecionados', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Recarregue a prévia');
    await expect(dialog.getByRole('status')).toHaveCount(0);
    expect(contactImports).toHaveLength(1);expect(contactRows).toEqual([]);
    await expect(dialog.getByRole('button', { name: 'Salvar contatos selecionados', exact: true })).toBeDisabled();
    await dialog.screenshot({ path: info.outputPath('contact-import-rejected-desktop.png') });
    const before = contactReads.length;
    gate.fail = false;
    await dialog.getByRole('button', { name: 'Recarregar prévia', exact: true }).click();
    await expect(dialog.getByText('2 contatos selecionados para salvar', { exact: true })).toBeVisible();
    expect(contactReads.length).toBeGreaterThan(before);
    await dialog.getByRole('button', { name: 'Salvar contatos selecionados', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('2 novos, 0 atualizados e 0 sem alteração');
    expect(contactImports).toHaveLength(2);expect(contactImports[1]).toEqual(contactImports[0]);
    expect(contactRows.map(row => row.entity_id)).toEqual(['cooperative:1002:3017', 'cooperative:2007:3017']);
    await expect(dialog.getByRole('button', { name: 'Salvar contatos selecionados', exact: true })).toBeDisabled();
    expect(writes).toEqual([]);expect(relationshipWrites).toEqual([]);expect(errors).toEqual([]);
  });
}
