import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { upsertEntity, upsertPlanRow } from '../../lib/registry.mjs';
import { captureScenarioDocument } from './scenario-artifacts.mjs';

const select = (root, name) => root.getByRole('combobox', { name, exact: true });
const list = page => page.getByRole('region', { name: 'Lista de unidades', exact: true });
const frame = page => page.frameLocator('iframe[title="Painel do e-mail da carteira"]');
const share = page => page.getByRole('dialog', { name: 'Compartilhar cenário dos PAs', exact: true });
const paRows = page => frame(page).locator('tr[data-pa-id]');
const pngMagic = [137, 80, 78, 71, 13, 10, 26, 10];

function workflowFixture(dataset) {
  for (const entry of [
    { central: '2007', pa: '0', name: 'PA Nordeste zero', target: 900, actual: 800 },
    { pa: '1', name: 'PA Próximo da meta', target: 1000, actual: 950 },
    { pa: '2', name: '=PA Ajuste negativo', target: 100, actual: -25.5 },
    { pa: '3', name: 'PA Sem produção informada', target: 100, actual: null },
  ]) {
    const unit = { kind: 'pa', central: '1002', cooperative: '3017', group: 'P1', ...entry };
    dataset = upsertEntity(dataset, unit);
    dataset = upsertPlanRow(dataset, { entityId: `pa:${unit.central}:${unit.cooperative}:${unit.pa}`, metric: 'VN',
      targets: Array(12).fill(entry.target), annualTarget: entry.target * 12,
      actuals: [...Array(8).fill(entry.actual), null, null, null, null], cutoff: '2026-08-31' });
  }
  return dataset;
}

async function openGenerator(page, content, format = 'E-mail') {
  await page.getByRole('button', { name: 'Gerar comunicação', exact: true }).click();
  const chooser = page.getByRole('dialog', { name: 'Gerar comunicação', exact: true });
  await chooser.getByRole('radio', { name: content, exact: true }).check();
  await chooser.getByRole('radio', { name: format, exact: true }).check();
  await chooser.getByRole('button', { name: 'Continuar', exact: true }).click();
}

async function august(page) {
  await select(page, 'Período').selectOption('month');
  await select(page, 'Mês de referência').selectOption('7');
}

async function captureCopies(page) {
  await page.addInitScript(() => {
    window.__workflowCopies = { text: [], html: [], png: [], drawings: [] };
    const paint = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (value, ...args) {
      this.canvas.__scenarioText ??= [];
      this.canvas.__scenarioText.push(String(value));
      return paint.call(this, value, ...args);
    };
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      const text = [...(this.__scenarioText || [])];
      return toBlob.call(this, blob => {
        if (blob) window.__workflowCopies.drawings.push(text);
        callback(blob);
      }, ...args);
    };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => window.__workflowCopies.text.push(String(text)),
      write: async items => {
        for (const item of items) {
          if (item.types.includes('text/html')) window.__workflowCopies.html.push(await (await item.getType('text/html')).text());
          if (item.types.includes('image/png')) window.__workflowCopies.png.push(Array.from(new Uint8Array(await (await item.getType('image/png')).arrayBuffer()).slice(0, 8)));
        }
      },
    } });
  });
}

export function registerWorkflowTests({ test, expect, setup }) {
  test('workflow: hierarchy drill and back restore the complete parent filters while keeping duplicate PA zero isolated', async ({ page }, info) => {
    const { errors } = await setup(page, workflowFixture);
    await select(page, 'Período').selectOption('quarter');
    await select(page, 'Trimestre').selectOption('2');
    await select(page, 'Agrupar por').selectOption('central');
    await select(page, 'Ordenar análise').selectOption('production');
    await page.getByLabel('Buscar cooperativa ou PA').fill('Bahia');
    await page.getByRole('button', { name: 'Ver cooperativas de Central Bahia teste', exact: true }).click();
    await expect(select(page, 'Central')).toHaveValue('1002');
    await expect(select(page, 'Agrupar por')).toHaveValue('cooperative');
    await expect(list(page).getByRole('checkbox', { name: /^Selecionar (?!todas)/ })).toHaveCount(2);
    await expect(page.getByLabel('Buscar cooperativa ou PA')).toHaveValue('');
    await page.getByLabel('Buscar cooperativa ou PA').fill('Alfa');
    await select(page, 'Filtrar situação').selectOption('attention');
    await page.getByRole('button', { name: 'Expandir PAs de Cooperativa Alfa', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir cadência de Cooperativa Alfa', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Cadência dos PAs', exact: true })).toBeVisible();
    await expect(select(page, 'Cooperativa')).toHaveValue('1002:3017');
    await expect(select(page, 'Trimestre')).toHaveValue('2');
    await expect(select(page, 'Filtrar situação')).toHaveValue('all');
    await expect(page.getByLabel('Buscar cooperativa ou PA')).toHaveValue('');
    await select(page, 'PA').selectOption('1002:3017:0');
    await expect(list(page).getByRole('checkbox', { name: /^Selecionar (?!todas)/ })).toHaveCount(1);
    await expect(list(page)).toContainText('PA Alfa zero');
    await expect(list(page)).not.toContainText('PA Nordeste zero');
    await page.getByRole('button', { name: 'Voltar ao recorte anterior', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Visão geral', exact: true })).toBeVisible();
    await expect(select(page, 'Central')).toHaveValue('1002');
    await expect(select(page, 'Filtrar situação')).toHaveValue('attention');
    await expect(page.getByLabel('Buscar cooperativa ou PA')).toHaveValue('Alfa');
    await expect(list(page).getByRole('checkbox', { name: /^Selecionar (?!todas)/ })).toHaveCount(1);
    await page.getByRole('button', { name: 'Voltar ao recorte anterior', exact: true }).click();
    await expect(select(page, 'Central')).toHaveValue('all');
    await expect(select(page, 'Agrupar por')).toHaveValue('central');
    await expect(select(page, 'Ordenar análise')).toHaveValue('production');
    await expect(select(page, 'Filtrar situação')).toHaveValue('all');
    await expect(select(page, 'Trimestre')).toHaveValue('2');
    await expect(page.getByLabel('Buscar cooperativa ou PA')).toHaveValue('Bahia');
    await expect(list(page).getByRole('checkbox', { name: /^Selecionar (?!todas)/ })).toHaveCount(1);
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('workflow-hierarchy-320.png'), fullPage: true });
    expect(errors).toEqual([]);
  });

  test('workflow: unified communication routes the current hierarchy and selected PA without adding another central', async ({ page }) => {
    const { errors, writes, relationshipWrites } = await setup(page, workflowFixture);
    await august(page);
    await select(page, 'Central').selectOption('1002');
    await openGenerator(page, 'Cooperativas da seleção');
    const cooperatives = page.getByRole('dialog', { name: 'Compartilhar cenário das cooperativas', exact: true });
    await expect(cooperatives.getByRole('radio', { name: 'E-mail', exact: true })).toBeChecked();
    await expect(frame(page).locator('tr[data-cooperative-id]')).toHaveCount(2);
    await expect(frame(page).locator('body')).toContainText('AGO/2026');
    await expect(frame(page).locator('body')).not.toContainText('Outra central');
    await cooperatives.getByRole('button', { name: 'Fechar compartilhamento', exact: true }).click();
    await select(page, 'Cooperativa').selectOption('1002:3017');
    await openGenerator(page, 'PAs da seleção', 'Imagem para WhatsApp');
    await expect(share(page).getByRole('radio', { name: 'WhatsApp e imagem', exact: true })).toBeChecked();
    await expect(share(page).getByRole('img', { name: 'Cenário dos PAs — parte 1 de 1', exact: true })).toBeVisible();
    await share(page).getByRole('radio', { name: 'E-mail', exact: true }).check();
    await expect(paRows(page)).toHaveCount(4);
    await expect(frame(page).locator('body')).not.toContainText('PA Beta zero');
    await expect(frame(page).locator('body')).not.toContainText('PA Nordeste zero');
    await share(page).getByRole('button', { name: 'Fechar compartilhamento', exact: true }).click();
    await page.getByRole('region', { name: 'PAs da cooperativa', exact: true }).getByRole('button', { name: 'Abrir PAs', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir cadência de Cooperativa Alfa', exact: true }).click();
    await select(page, 'PA').selectOption('1002:3017:0');
    await openGenerator(page, 'Uma unidade');
    const individual = page.getByRole('dialog', { name: 'Comunicar resultado', exact: true });
    await expect(individual.getByLabel('Unidade selecionada')).toHaveValue('pa:1002:3017:0');
    await expect(individual.getByText('Paula Teste', { exact: true })).toBeVisible();
    expect(writes).toEqual([]); expect(relationshipWrites).toEqual([]); expect(errors).toEqual([]);
  });

  test('workflow: explicit CSV and Excel selections preserve compound identities, exact negative amounts and incomplete totals', async ({ page }) => {
    const { errors, writes, relationshipWrites } = await setup(page, workflowFixture);
    await page.getByRole('navigation', { name: 'Navegação principal', exact: true }).getByRole('button', { name: 'Cadência dos PAs', exact: true }).click();
    await august(page);
    for (const name of ['PA Alfa zero', 'PA Nordeste zero', '=PA Ajuste negativo']) {
      await list(page).getByRole('checkbox', { name: `Selecionar ${name}`, exact: true }).check();
    }
    await page.getByRole('button', { name: 'Exportar dados', exact: true }).click();
    const exporter = page.getByRole('dialog', { name: 'Exportar dados', exact: true });
    await select(exporter, 'Escopo da exportação').selectOption('selected');
    const csvEvent = page.waitForEvent('download');
    await exporter.getByRole('button', { name: 'Baixar CSV', exact: true }).click();
    const csvFile = await csvEvent;
    expect(csvFile.suggestedFilename()).toContain('selecionadas');
    const bytes = await readFile(await csvFile.path());
    expect([...bytes.subarray(0, 3)]).toEqual([239, 187, 191]);
    const parsed = bytes.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split('\r\n')
      .map(line => [...line.matchAll(/"((?:[^"]|"")*)"(?:;|$)/g)].map(match => match[1].replaceAll('""', '"')));
    const headers = parsed.shift();
    const records = parsed.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index]])));
    expect(records).toHaveLength(4);
    const units = records.filter(row => row['Tipo de linha'] === 'PA');
    expect(units.map(row => `${row.Central}:${row.Cooperativa}:${row.PA}`).sort()).toEqual(['1002:3017:0', '1002:3017:2', '2007:3017:0']);
    expect(units.find(row => row.PA === '2').Unidade).toBe("'=PA Ajuste negativo");
    expect(units.find(row => row.PA === '2')['Realizado (R$)']).toBe('-25,50');
    const total = records.find(row => row.Unidade === 'TOTAL DO RECORTE');
    expect(total['Meta (R$)']).toBe('1450,00');
    expect(total['Realizado (R$)']).toBe('999,50');
    expect(total['GAP para a meta (R$)']).toBe('450,50');
    expect(total.Período).toBe('Mensal · AGO/2026');
    const excelEvent = page.waitForEvent('download');
    await exporter.getByRole('button', { name: 'Baixar Excel', exact: true }).click();
    const excelFile = await excelEvent;
    expect(excelFile.suggestedFilename()).toMatch(/selecionadas.*\.xlsx$/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await readFile(await excelFile.path()));
    const sheet = workbook.getWorksheet('Resultados');
    expect(sheet.rowCount).toBe(5);
    const column = label => sheet.getRow(1).values.indexOf(label);
    const value = (row, label) => row.getCell(column(label)).value;
    const excelRows = [sheet.getRow(2), sheet.getRow(3), sheet.getRow(4)];
    expect(excelRows.map(row => `${value(row, 'Central')}:${value(row, 'Cooperativa')}:${value(row, 'PA')}`).sort()).toEqual(['1002:3017:0', '1002:3017:2', '2007:3017:0']);
    const negative = excelRows.find(row => value(row, 'PA') === '2');
    expect(value(negative, 'Unidade')).toBe('=PA Ajuste negativo');
    expect(negative.getCell(column('Unidade')).type).toBe(ExcelJS.ValueType.String);
    expect(value(negative, 'Realizado (R$)')).toBe(-25.5);
    expect(value(sheet.getRow(5), 'Meta (R$)')).toBe(1450);
    expect(value(sheet.getRow(5), 'Realizado (R$)')).toBe(999.5);
    expect(value(sheet.getRow(5), 'Atingimento (%)')).toBeCloseTo(999.5 / 1450, 10);
    const metadata = workbook.getWorksheet('Contexto').getSheetValues().slice(2).map(row => [row[1], row[2]]);
    expect(metadata).toContainEqual(['Escopo da exportação', 'Somente unidades selecionadas']);
    expect(metadata).toContainEqual(['Unidades exportadas', 3]);
    await select(exporter, 'Escopo da exportação').selectOption('filtered');
    const allEvent = page.waitForEvent('download');
    await exporter.getByRole('button', { name: 'Baixar Excel', exact: true }).click();
    const allWorkbook = new ExcelJS.Workbook();
    await allWorkbook.xlsx.load(await readFile(await (await allEvent).path()));
    const all = allWorkbook.getWorksheet('Resultados');
    expect(all.rowCount).toBe(8);
    expect(value(all.getRow(8), 'Meta (R$)')).toBe(3000);
    expect(value(all.getRow(8), 'Realizado (R$)')).toBeNull();
    expect(value(all.getRow(8), 'Atingimento (%)')).toBeNull();
    await page.keyboard.press('Escape');
    await select(page, 'Central').selectOption('2007');
    await page.getByRole('button', { name: 'Exportar dados', exact: true }).click();
    await select(exporter, 'Escopo da exportação').selectOption('selected');
    await expect(exporter.getByRole('alert')).toContainText('Selecione pelo menos uma unidade');
    await expect(exporter.getByRole('button', { name: 'Baixar Excel', exact: true })).toBeDisabled();
    expect(writes).toEqual([]); expect(relationshipWrites).toEqual([]); expect(errors).toEqual([]);
  });

  test('workflow: selected units, editable message and order stay consistent across summary, email, caption and real PNG', async ({ page, context }, info) => {
    await captureCopies(page);
    const { errors, writes, relationshipWrites } = await setup(page, workflowFixture);
    await august(page);
    await select(page, 'Cooperativa').selectOption('1002:3017');
    await openGenerator(page, 'PAs da seleção', 'Painel resumido');
    const dialog = share(page);
    await expect(dialog.getByRole('region', { name: 'Prévia do painel resumido', exact: true })).toBeVisible();
    await dialog.getByRole('radio', { name: 'Selecionar unidades', exact: true }).check();
    const selection = dialog.getByRole('region', { name: 'Seleção de unidades', exact: true });
    await selection.getByRole('button', { name: 'Limpar seleção', exact: true }).click();
    await selection.getByRole('checkbox', { name: 'Selecionar PA 0 · PA Alfa zero · Coop. 3017 · Central 1002', exact: true }).check();
    await selection.getByRole('searchbox', { name: 'Buscar unidades para selecionar', exact: true }).fill('Próximo');
    await selection.getByRole('button', { name: 'Selecionar unidades visíveis', exact: true }).click();
    await selection.getByRole('searchbox', { name: 'Buscar unidades para selecionar', exact: true }).fill('negativo');
    await selection.getByRole('button', { name: 'Selecionar unidades visíveis', exact: true }).click();
    await selection.getByRole('searchbox', { name: 'Buscar unidades para selecionar', exact: true }).fill('');
    await expect(selection.getByRole('checkbox', { checked: true })).toHaveCount(3);
    await expect(selection.getByRole('checkbox', { name: 'Selecionar PA 3 · PA Sem produção informada · Coop. 3017 · Central 1002', exact: true })).not.toBeChecked();
    await select(dialog, 'Ordem das unidades').selectOption('production');
    await dialog.locator('summary').filter({ hasText: 'Editar mensagem' }).click();
    const subject = 'Plano <Equipe> & ação de agosto';
    const intro = 'Olá <b>equipe</b> & gestores. Vamos avaliar os resultados.';
    const cta = 'Agendar visita e retornar até sexta-feira.';
    await dialog.getByRole('textbox', { name: 'Assunto da mensagem', exact: true }).fill(subject);
    await dialog.getByRole('textbox', { name: 'Introdução da mensagem', exact: true }).fill(intro);
    await dialog.getByRole('textbox', { name: 'Chamada para ação', exact: true }).fill(cta);
    await dialog.getByRole('radio', { name: 'E-mail', exact: true }).check();
    const ids = ['pa:1002:3017:1', 'pa:1002:3017:0', 'pa:1002:3017:2'];
    await expect(paRows(page)).toHaveCount(3);
    expect(await paRows(page).evaluateAll(nodes => nodes.map(node => node.getAttribute('data-pa-id')))).toEqual(ids);
    await expect(frame(page).locator('body')).toContainText(intro);
    await expect(frame(page).locator('body')).toContainText(cta);
    await expect(frame(page).locator('b').filter({ hasText: 'equipe' })).toHaveCount(0);
    await expect(frame(page).locator('body')).not.toContainText('PA Sem produção informada');
    await dialog.getByRole('textbox', { name: 'Destinatários do e-mail', exact: true }).fill('gestor@example.com');
    await dialog.getByRole('button', { name: 'Copiar painel', exact: true }).click();
    const outlook = dialog.getByRole('link', { name: 'Abrir Outlook e colar painel', exact: true });
    await expect(outlook).toBeVisible();
    const url = new URL(await outlook.getAttribute('href'));
    expect(url.searchParams.get('subject')).toBe(subject);
    expect(url.searchParams.get('body') || '').toBe('');
    const copiedHtml = await page.evaluate(() => window.__workflowCopies.html.at(-1));
    expect(copiedHtml).toContain('&lt;b&gt;equipe&lt;/b&gt;');
    expect((copiedHtml.match(/data-pa-id=/g) || [])).toHaveLength(3);
    const revisedCta = 'Agendar treinamento até sexta-feira.';
    await dialog.getByRole('textbox', { name: 'Chamada para ação', exact: true }).fill(revisedCta);
    await expect(outlook).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Abrir Outlook e colar painel', exact: true })).toBeDisabled();
    await dialog.getByRole('radio', { name: 'Painel resumido', exact: true }).check();
    await expect(dialog.getByRole('region', { name: 'Prévia do painel resumido', exact: true }).locator('tbody tr')).toHaveCount(3);
    await expect(dialog.getByRole('textbox', { name: 'Assunto da mensagem', exact: true })).toHaveValue(subject);
    await dialog.getByRole('radio', { name: 'WhatsApp e imagem', exact: true }).check();
    await expect(select(dialog, 'Texto do WhatsApp')).toHaveValue('caption');
    await dialog.getByRole('button', { name: 'Copiar texto do WhatsApp', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__workflowCopies.text.length)).toBe(1);
    const caption = await page.evaluate(() => window.__workflowCopies.text[0]);
    expect(caption).toContain(intro); expect(caption).toContain(revisedCta);
    expect(caption).not.toContain('PA Alfa zero');
    await expect(dialog.getByRole('img', { name: 'Cenário dos PAs — parte 1 de 1', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Copiar imagem desta parte', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__workflowCopies.png.length)).toBe(1);
    expect(await page.evaluate(() => window.__workflowCopies.png[0])).toEqual(pngMagic);
    const drawing = await page.evaluate(() => window.__workflowCopies.drawings.at(-1));
    const orderedNames = ['PA Próximo da meta', 'PA Alfa zero', '=PA Ajuste negativo'];
    const positions = orderedNames.map(name => drawing.findIndex(value => value.includes(name)));
    expect(positions.every(position => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(drawing.join(' ')).not.toContain(intro);
    expect(drawing.join(' ')).not.toContain('PA Sem produção informada');
    await select(dialog, 'Texto do WhatsApp').selectOption('report');
    await dialog.getByRole('button', { name: 'Copiar texto do WhatsApp', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__workflowCopies.text.length)).toBe(2);
    const text = await page.evaluate(() => window.__workflowCopies.text.at(-1));
    const textPositions = orderedNames.map(name => text.indexOf(name));
    expect(textPositions.every(position => position >= 0)).toBe(true);
    expect(textPositions).toEqual([...textPositions].sort((a, b) => a - b));
    await dialog.getByRole('radio', { name: 'E-mail', exact: true }).check();
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await captureScenarioDocument(page, frame(page), info.outputPath('workflow-edited-email-320.png'));
    expect(context.pages()).toHaveLength(1);
    expect(writes).toEqual([]); expect(relationshipWrites).toEqual([]); expect(errors).toEqual([]);
  });
}
