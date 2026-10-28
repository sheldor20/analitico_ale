import { readFile } from 'node:fs/promises';

const CNV_BUCKET = 'commercial-cnv-regulations';
const foreignOwner = '00000000-0000-0000-0000-000000000002';

/** A real, deliberately tiny PDF; no customer or production document is used. */
function regulationPdf({ scanned = false } = {}) {
  const lines = scanned ? [] : [
    'ACAO CNV 2026 - VIDA EMPRESA SINTETICA',
    'Periodo: de 06/07/2026 a 19/07/2026.',
    'Produtos: Seguro de Vida Empresa.',
    'Meta: produzir 20 propostas no periodo da acao.',
    'Premiacao: reconhecimento aos participantes elegiveis.',
    'Regra importante: considerar apenas propostas aceitas.',
  ];
  const escape = value => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const stream = `BT /F1 11 Tf 45 750 Td ${lines.map((line, index) => `${index ? '0 -18 Td ' : ''}(${escape(line)}) Tj`).join('\n')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let output = '%PDF-1.4\n', offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}

function fixtureRow(owner, created, details = {}) {
  const id = '00000000-0000-0000-0000-000000000777';
  return { id, owner_id: owner, year: 2026, details: {
    title: 'Acao privada de outra conta', year: 2026, summary: 'Resumo privado sintetico.', products: ['Vida Empresa'], goals: ['Meta privada'],
    startDate: '2026-07-06', endDate: '2026-07-19', periodLabel: '06 a 19/07/2026', eligibility: [], rewards: [], importantRules: [], needsReview: false, warnings: [], sourcePages: [], ...details,
  }, filename: 'regulamento-privado.pdf', storage_path: `${owner}/${id}/regulamento.pdf`, file_sha256: 'a'.repeat(64), page_count: 1, revision: 1, created_at: created, updated_at: created };
}

/** Request-shape and UI persistence checks. Actual RLS is tested in cnv-database.test.mjs. */
async function mockCnv(page, { owner, created, errors, rows = [fixtureRow(foreignOwner, created)] }) {
  const records = structuredClone(rows), files = new Map(), writes = [], reads = [], uploads = [], downloads = [], signed = [], removals = [];
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  await page.route('http://127.0.0.1:4600/rest/v1/commercial_cnv_actions**', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    const json = (body, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const matches = row => [...url.searchParams].every(([column, filter]) => filter.startsWith('eq.') ? String(row[column]) === filter.slice(3) : filter.startsWith('gt.') ? String(row[column]) > filter.slice(3) : true);
    const answer = values => json((request.headers().accept || '').includes('vnd.pgrst.object') ? values[0] || null : values);
    if (method !== 'POST' && url.searchParams.get('owner_id') !== `eq.${owner}`) errors.push('CNV table request lost owner scope');
    if (method === 'GET') {
      reads.push(Object.fromEntries(url.searchParams));
      const values = records.filter(matches).sort((left, right) => left.id.localeCompare(right.id));
      return answer(values.slice(Number(url.searchParams.get('offset')) || 0, Number(url.searchParams.get('limit')) || values.length));
    }
    if (method === 'POST') {
      const raw = request.postDataJSON(), payload = Array.isArray(raw) ? raw[0] : raw;
      writes.push({ method, payload, filters: Object.fromEntries(url.searchParams) });
      if (payload.owner_id !== owner) errors.push('CNV insert lost owner scope');
      if (!payload.storage_path?.startsWith(`${owner}/`) || payload.storage_path !== `${owner}/${payload.id}/regulamento.pdf`) errors.push('CNV insert used a noncanonical private path');
      if (records.some(row => row.owner_id === owner && row.file_sha256 === payload.file_sha256)) return json({ code: '23505', message: 'duplicate key' }, 409);
      const saved = { revision: 1, created_at: created, updated_at: created, ...payload };
      records.push(saved); return answer([saved]);
    }
    const selected = records.filter(matches);
    if (method === 'PATCH') {
      const payload = request.postDataJSON(); writes.push({ method, payload, filters: Object.fromEntries(url.searchParams) });
      if (!url.searchParams.has('revision')) errors.push('CNV update lost optimistic revision');
      selected.forEach(row => Object.assign(row, payload, { revision: row.revision + 1, updated_at: '2026-09-10T15:01:00Z' }));
      return answer(selected);
    }
    if (method === 'DELETE') {
      writes.push({ method, filters: Object.fromEntries(url.searchParams) });
      selected.forEach(row => records.splice(records.indexOf(row), 1)); return answer(selected);
    }
    errors.push(`Unexpected CNV table operation ${method}`); return json({ message: 'Unsupported synthetic operation' }, 400);
  });
  await page.route('http://127.0.0.1:4600/storage/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    const json = (body, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const signPrefix = `/storage/v1/object/sign/${CNV_BUCKET}/`;
    const filePrefixes = [`/storage/v1/object/authenticated/${CNV_BUCKET}/`, `/storage/v1/object/${CNV_BUCKET}/`];
    if (url.pathname.startsWith(signPrefix)) {
      const path = decodeURIComponent(url.pathname.slice(signPrefix.length)); signed.push({ path, payload: request.postDataJSON() });
      if (!path.startsWith(`${owner}/`)) errors.push('CNV signed link crossed owner boundary');
      return json({ signedURL: `/object/sign/${CNV_BUCKET}/${path}?token=synthetic-cnv-signed-token` });
    }
    if (method === 'DELETE' && url.pathname === `/storage/v1/object/${CNV_BUCKET}`) {
      const paths = request.postDataJSON()?.prefixes ?? []; removals.push(...paths);
      for (const path of paths) { if (!path.startsWith(`${owner}/`)) errors.push('CNV removal crossed owner boundary'); files.delete(path); }
      return json(paths.map(name => ({ name })));
    }
    const prefix = filePrefixes.find(value => url.pathname.startsWith(value));
    if (prefix) {
      const path = decodeURIComponent(url.pathname.slice(prefix.length));
      if (!new RegExp(`^${owner}/[0-9a-f-]{36}/regulamento\\.pdf$`).test(path)) errors.push('CNV file access used a noncanonical private path');
      if (method === 'POST' || method === 'PUT') {
        // Supabase sends FormData; keep the complete original bytes for its later download.
        const raw = request.postDataBuffer() || Buffer.alloc(0), start = raw.indexOf(Buffer.from('%PDF-'));
        const end = raw.lastIndexOf(Buffer.from('%%EOF'));
        const pdf = start >= 0 && end > start ? raw.subarray(start, end + 6) : raw;
        files.set(path, pdf); uploads.push({ path, bytes: pdf });
        return json({ Key: `${CNV_BUCKET}/${path}`, Id: path.split('/')[1] });
      }
      if (method === 'GET') {
        downloads.push(path); const pdf = files.get(path);
        if (!pdf) return json({ message: 'Synthetic file missing' }, 404);
        return route.fulfill({ status: 200, headers: { ...headers, 'content-type': 'application/pdf' }, body: pdf });
      }
    }
    errors.push(`Unexpected CNV storage operation: ${method} ${url.pathname}`); return json({ message: 'Unsupported synthetic storage request' }, 400);
  });
  return { records, files, writes, reads, uploads, downloads, signed, removals };
}

export function registerCnvTests({ test, expect, setup, owner, created }) {
  const panel = page => page.getByRole('region', { name: 'Ações CNV', exact: true });
  const review = page => page.getByRole('dialog', { name: 'Revisar regulamento importado', exact: true });
  const detail = page => page.getByRole('region', { name: 'Painel da ação CNV', exact: true });
  const importInput = page => panel(page).getByLabel('Importar PDF de uma ação CNV', { exact: true });
  const confirmReviewed = dialog => dialog.getByRole('checkbox', { name: /^Conferi o período, os produtos e os critérios/ });
  async function enterCnv(page) {
    await page.getByRole('navigation', { name: 'Navegação principal', exact: true }).getByRole('button', { name: 'Ações CNV', exact: true }).click();
    await expect(panel(page).getByRole('button', { name: 'Importar regulamento PDF', exact: true })).toBeEnabled();
  }
  async function fillDraft(dialog, title = 'Ação CNV sintética revisada') {
    await dialog.getByLabel('Nome da ação CNV', { exact: true }).fill(title);
    await dialog.getByLabel('Resumo da ação CNV', { exact: true }).fill('Mobilizar a equipe para ampliar a proteção das empresas durante a ação.');
    await dialog.getByLabel('Início da ação CNV', { exact: true }).fill('2026-07-06');
    await dialog.getByLabel('Fim da ação CNV', { exact: true }).fill('2026-07-19');
    await dialog.getByLabel('Descrição do período CNV', { exact: true }).fill('Participação de 06 a 19 de julho de 2026.');
    await dialog.getByLabel('Produtos participantes', { exact: true }).fill('Vida Empresa\nVida Individual');
    await dialog.getByLabel('Metas e critérios', { exact: true }).fill('Produzir 20 propostas aceitas durante a ação.');
    await dialog.getByLabel('Quem participa', { exact: true }).fill('Equipes das cooperativas participantes.');
    await dialog.getByLabel('Premiação e reconhecimento', { exact: true }).fill('Reconhecimento conforme os critérios do regulamento.');
    await dialog.getByLabel('Regras importantes', { exact: true }).fill('Conferir as propostas aceitas antes da apuração.');
  }

  test('CNV: PDF import requires review and preserves private original, edited summary and explicit sharing through reload', async ({ page }, info) => {
    const { errors, writes: communications, workspaceWrites } = await setup(page);
    const mock = await mockCnv(page, { owner, created, errors });
    await enterCnv(page);
    await expect(panel(page).getByRole('heading', { name: 'Cadastre a primeira ação', exact: true })).toBeVisible();
    await expect(panel(page)).not.toContainText('Acao privada de outra conta');
    const pdf = regulationPdf();
    await importInput(page).setInputFiles({ name: 'regulamento-cnv-sintetico.pdf', mimeType: 'application/pdf', buffer: pdf });
    const editor = review(page);
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel('Início da ação CNV', { exact: true })).toHaveValue('2026-07-06');
    await expect(editor.getByLabel('Fim da ação CNV', { exact: true })).toHaveValue('2026-07-19');
    await expect(editor.getByRole('button', { name: 'Cadastrar ação', exact: true })).toBeDisabled();
    expect(mock.uploads).toHaveLength(0); expect(mock.writes).toHaveLength(0);
    await fillDraft(editor);
    await confirmReviewed(editor).check();
    await editor.getByLabel('Resumo da ação CNV', { exact: true }).fill('Mobilizar a equipe para ampliar a proteção das empresas; resumo conferido.');
    await expect(confirmReviewed(editor)).not.toBeChecked();
    await confirmReviewed(editor).check();
    await editor.getByRole('button', { name: 'Cadastrar ação', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(detail(page).getByRole('heading', { name: 'Ação CNV sintética revisada', exact: true })).toBeVisible();
    await expect(detail(page)).toContainText('Produzir 20 propostas aceitas');
    await expect(detail(page)).toContainText('Vida Individual');
    const own = mock.records.find(row => row.owner_id === owner);
    expect(own.details).toMatchObject({ title: 'Ação CNV sintética revisada', year: 2026, needsReview: false, startDate: '2026-07-06', endDate: '2026-07-19', products: ['Vida Empresa', 'Vida Individual'] });
    expect(mock.uploads).toHaveLength(1);
    expect(mock.uploads[0].bytes).toEqual(pdf);
    expect(mock.uploads[0].path).toBe(`${owner}/${own.id}/regulamento.pdf`);
    expect(own.file_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(own.page_count).toBe(1);
    await detail(page).getByRole('button', { name: 'Editar resumo', exact: true }).click();
    const editing = page.getByRole('dialog', { name: 'Editar ação CNV', exact: true });
    await editing.getByLabel('Nome da ação CNV', { exact: true }).fill('Ação CNV edição confirmada');
    await confirmReviewed(editing).check();
    await editing.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
    await expect(editing).toHaveCount(0);
    expect(mock.writes.filter(write => write.method === 'PATCH')).toHaveLength(1);
    expect(mock.writes.find(write => write.method === 'PATCH').filters).toMatchObject({ owner_id: `eq.${owner}`, id: `eq.${own.id}`, revision: 'eq.1' });
    expect(own.revision).toBe(2);
    await page.reload();
    await enterCnv(page);
    await expect(panel(page).getByRole('heading', { name: 'Ação CNV edição confirmada', exact: true })).toBeVisible();
    await panel(page).getByRole('button', { name: 'Abrir painel', exact: true }).click();
    await detail(page).getByRole('button', { name: 'Ver regulamento', exact: true }).click();
    const original = page.getByRole('dialog', { name: 'Regulamento original', exact: true });
    await expect(original.locator('iframe[title="PDF original: regulamento-cnv-sintetico.pdf"]')).toHaveAttribute('src', /^blob:/);
    await original.getByRole('button', { name: 'Fechar regulamento original', exact: true }).click();
    const downloadEvent = page.waitForEvent('download');
    await detail(page).getByRole('button', { name: 'Baixar PDF', exact: true }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe('regulamento-cnv-sintetico.pdf');
    expect(await readFile(await download.path())).toEqual(pdf);
    await detail(page).getByRole('button', { name: 'Compartilhar', exact: true }).click();
    const sharing = page.getByRole('dialog', { name: 'Compartilhar ação CNV', exact: true });
    const message = sharing.getByLabel('Mensagem de compartilhamento CNV', { exact: true });
    await expect(message).toHaveValue(/Ação CNV edição confirmada/);
    await expect(message).toHaveValue(/Vida Empresa/);
    await expect(message).toHaveValue(/20 propostas aceitas/);
    expect(mock.signed).toHaveLength(0);
    const whatsappWithoutFile = new URL(await sharing.getByRole('link', { name: 'Abrir WhatsApp', exact: true }).getAttribute('href'));
    expect(whatsappWithoutFile.searchParams.get('text')).not.toContain('synthetic-cnv-signed-token');
    await sharing.getByRole('checkbox', { name: /^Incluir link para baixar o regulamento/ }).check();
    expect(mock.signed).toHaveLength(0);
    await expect(sharing.getByRole('button', { name: 'Gere o link para continuar', exact: true })).toBeDisabled();
    await sharing.getByRole('button', { name: 'Gerar link do regulamento', exact: true }).click();
    await expect(sharing.getByText(/Link gerado\. Válido até/)).toBeVisible();
    expect(mock.signed).toHaveLength(1);
    expect(mock.signed[0]).toMatchObject({ path: `${owner}/${own.id}/regulamento.pdf`, payload: { expiresIn: 86400 } });
    await message.fill('Mensagem revisada para a equipe.');
    const whatsapp = new URL(await sharing.getByRole('link', { name: 'Abrir WhatsApp', exact: true }).getAttribute('href'));
    expect(whatsapp.hostname).toBe('wa.me');
    expect(whatsapp.searchParams.get('text')).toContain('Mensagem revisada para a equipe.');
    expect(whatsapp.searchParams.get('text')).toContain('link válido por 24 horas');
    expect(whatsapp.searchParams.get('text')).toContain('synthetic-cnv-signed-token');
    await sharing.getByRole('button', { name: 'E-mail', exact: true }).click();
    const email = new URL(await sharing.getByRole('link', { name: 'Abrir e-mail', exact: true }).getAttribute('href'));
    expect(email.protocol).toBe('mailto:');
    expect(email.searchParams.get('subject')).toBe('Ação CNV edição confirmada');
    expect(email.searchParams.get('body')).toContain('Mensagem revisada para a equipe.');
    expect(email.searchParams.get('body')).toContain('synthetic-cnv-signed-token');
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
    });
    const nativeFallbackDownload = page.waitForEvent('download');
    await sharing.getByRole('button', { name: 'Compartilhar PDF', exact: true }).click();
    expect(await readFile(await (await nativeFallbackDownload).path())).toEqual(pdf);
    await expect(sharing.getByRole('alert')).toContainText('O PDF foi baixado. Anexe o arquivo');
    await sharing.getByRole('button', { name: 'Fechar compartilhar ação cnv', exact: true }).click();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await page.screenshot({ path: info.outputPath('cnv-private-action-panel-320.png'), fullPage: true });
    await detail(page).getByRole('button', { name: 'Excluir ação', exact: true }).click();
    const deletion = page.getByRole('dialog', { name: 'Excluir ação CNV', exact: true });
    await expect(deletion).toContainText('Ação CNV edição confirmada');
    expect(mock.writes.filter(write => write.method === 'DELETE')).toHaveLength(0);
    await deletion.getByRole('button', { name: 'Cancelar', exact: true }).click();
    expect(mock.records.filter(row => row.owner_id === owner)).toHaveLength(1);
    await detail(page).getByRole('button', { name: 'Excluir ação', exact: true }).click();
    await deletion.getByRole('button', { name: 'Confirmar exclusão', exact: true }).click();
    await expect(deletion).toHaveCount(0);
    await expect(panel(page).getByRole('heading', { name: 'Cadastre a primeira ação', exact: true })).toBeVisible();
    expect(mock.records.filter(row => row.owner_id === owner)).toHaveLength(0);
    expect(mock.records.filter(row => row.owner_id === foreignOwner)).toHaveLength(1);
    expect(mock.removals).toEqual([`${owner}/${own.id}/regulamento.pdf`]);
    expect(mock.reads.every(filters => filters.owner_id === `eq.${owner}`)).toBe(true);
    expect(workspaceWrites).toEqual([]); expect(communications).toEqual([]); expect(errors).toEqual([]);
  });

  test('CNV: duplicate PDF reopens its action and filters keep every saved action available without a commercial workspace', async ({ page }) => {
    const { errors, workspaceWrites } = await setup(page, value => value, { workspaceMissing: true });
    const mock = await mockCnv(page, { owner, created, errors });
    await enterCnv(page);
    await expect(page.getByRole('heading', { name: 'Ações CNV', level: 1, exact: true })).toBeVisible();
    const pdf = regulationPdf();
    await importInput(page).setInputFiles({ name: 'regulamento-cnv-independente.pdf', mimeType: 'application/pdf', buffer: pdf });
    const editor = review(page); await expect(editor).toBeVisible();
    await fillDraft(editor, 'Ação independente da base');
    await confirmReviewed(editor).check();
    await editor.getByRole('button', { name: 'Cadastrar ação', exact: true }).click();
    await expect(detail(page)).toContainText('Ação independente da base');
    await importInput(page).setInputFiles({ name: 'mesmo-regulamento-renomeado.pdf', mimeType: 'application/pdf', buffer: pdf });
    await expect(panel(page).getByRole('status')).toContainText('Este regulamento já está cadastrado');
    await expect(review(page)).toHaveCount(0);
    expect(mock.uploads).toHaveLength(1);
    expect(mock.records.filter(row => row.owner_id === owner)).toHaveLength(1);
    await panel(page).getByLabel('Produto da ação CNV', { exact: true }).selectOption('Vida Empresa');
    await expect(panel(page).getByRole('button', { name: 'Abrir painel', exact: true })).toHaveCount(1);
    await panel(page).getByLabel('Situação da ação CNV', { exact: true }).selectOption('active');
    await expect(panel(page).getByRole('button', { name: 'Abrir painel', exact: true })).toHaveCount(0);
    await expect(panel(page)).toContainText('Nenhuma ação corresponde aos filtros');
    await panel(page).getByRole('button', { name: 'Limpar filtros', exact: true }).click();
    await expect(panel(page).getByRole('button', { name: 'Abrir painel', exact: true })).toHaveCount(1);
    expect(workspaceWrites).toEqual([]); expect(errors).toEqual([]);
  });

  test('CNV: invalid files never upload and a PDF without selectable text remains an explicit manual review', async ({ page }) => {
    const { errors } = await setup(page);
    const mock = await mockCnv(page, { owner, created, errors });
    await enterCnv(page);
    await importInput(page).setInputFiles({ name: 'nao-e-pdf.pdf', mimeType: 'application/pdf', buffer: Buffer.from('Este arquivo nao e um PDF.') });
    await expect(panel(page).getByRole('alert')).toContainText('PDF válido');
    expect(mock.uploads).toHaveLength(0); expect(mock.writes).toHaveLength(0);
    await importInput(page).setInputFiles({ name: 'limite-excedido.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(20 * 1024 * 1024 + 1) });
    await expect(panel(page).getByRole('alert')).toContainText('20 MB');
    expect(mock.uploads).toHaveLength(0);
    await importInput(page).setInputFiles({ name: 'regulamento-digitalizado.pdf', mimeType: 'application/pdf', buffer: regulationPdf({ scanned: true }) });
    const editor = review(page); await expect(editor).toBeVisible();
    await expect(editor).toContainText(/texto|digitalizad|manual/i);
    await expect(editor.getByRole('button', { name: 'Cadastrar ação', exact: true })).toBeDisabled();
    await fillDraft(editor, 'Ação preenchida após conferência manual');
    await confirmReviewed(editor).check();
    await editor.getByRole('button', { name: 'Cadastrar ação', exact: true }).click();
    await expect(detail(page)).toContainText('Ação preenchida após conferência manual');
    expect(mock.uploads).toHaveLength(1);
    expect(mock.records.find(row => row.owner_id === owner).details.needsReview).toBe(false);
    expect(errors).toEqual([]);
  });
}
