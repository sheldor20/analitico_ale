const navigate = (page, name) => page.getByRole('navigation', { name: 'Navegação principal', exact: true }).getByRole('button', { name, exact: true }).click();
const consolidated = page => page.getByRole('region', { name: 'Agenda consolidada', exact: true });
const appointmentCard = (page, title) => consolidated(page).getByRole('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

function agendaSeed(owner, created) {
  let nextId = 600;
  const appointment = (title, entityId, kind, startsAt, overrides = {}) => {
    const [entityKind, central, cooperative, pa] = entityId.split(':');
    return { id: `00000000-0000-0000-0000-${String(nextId++).padStart(12, '0')}`, owner_id: owner, workspace_year: 2026,
      entity_id: entityId, entity_kind: entityKind, central, cooperative: cooperative ?? null, pa: pa ?? null, title, kind,
      starts_at: startsAt, ends_at: new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString(), timezone: 'America/Sao_Paulo',
      location: 'Local do compromisso', notes: '', status: 'scheduled', updated_at: created, ...overrides };
  };
  return [
    appointment('Reunião Central Bahia', 'central:1002', 'meeting', '2026-09-11T12:00:00.000Z'),
    appointment('Visita Cooperativa Alfa', 'cooperative:1002:3017', 'visit', '2026-09-12T13:00:00.000Z'),
    appointment('Treinamento PA Alfa zero', 'pa:1002:3017:0', 'training', '2026-09-12T15:00:00.000Z'),
    appointment('Ligação Central Nordeste', 'central:2007', 'call', '2026-09-13T12:00:00.000Z'),
    appointment('Reunião Outra central', 'cooperative:2007:3017', 'meeting', '2026-09-14T12:00:00.000Z'),
    appointment('Visita já concluída', 'cooperative:1002:3025', 'visit', '2026-09-12T16:00:00.000Z', { status: 'completed' }),
    appointment('Ligação cancelada', 'cooperative:1002:3025', 'call', '2026-09-15T12:00:00.000Z', { status: 'cancelled' }),
    appointment('Visita outubro', 'cooperative:1002:3017', 'visit', '2026-10-01T12:00:00.000Z'),
    appointment('Compromisso privado de outro usuário', 'cooperative:1002:3017', 'visit', '2026-09-12T13:00:00.000Z', { owner_id: '00000000-0000-0000-0000-000000000002' }),
    appointment('Compromisso de outro ano', 'cooperative:1002:3017', 'visit', '2025-09-12T13:00:00.000Z', { workspace_year: 2025 }),
  ];
}

export function registerConsolidatedAgendaTests({ test, expect, setup, owner, created }) {
  test('consolidated agenda: direct creation accepts a same-day minute and a past visit while preserving compound unit identity', async ({ page }, info) => {
    const { errors, appointmentRows, relationshipWrites, relationshipReads } = await setup(page, value => value, { appointments: agendaSeed(owner, created) });
    await navigate(page, 'Agenda');
    const agenda = consolidated(page);
    await agenda.getByRole('button', { name: '10 de setembro: 0 compromissos', exact: true }).click();
    await agenda.getByRole('button', { name: 'Novo compromisso', exact: true }).click();
    const form = agenda.getByRole('form', { name: 'Novo compromisso', exact: true });
    await expect(form.getByLabel('Início', { exact: true })).toHaveValue('2026-09-10T09:00');
    await expect(form.getByLabel('Fim', { exact: true })).toHaveValue('2026-09-10T10:00');
    await form.getByRole('combobox', { name: 'Nível da unidade', exact: true }).selectOption('pa');
    await form.getByRole('combobox', { name: 'Central do compromisso', exact: true }).selectOption('1002');
    await form.getByRole('combobox', { name: 'Cooperativa do compromisso', exact: true }).selectOption('cooperative:1002:3017');
    await form.getByRole('combobox', { name: 'PA do compromisso', exact: true }).selectOption('pa:1002:3017:0');
    await form.getByLabel('Título do compromisso').fill('Ligação imediata PA zero');
    await form.getByLabel('Tipo de compromisso').selectOption('call');
    await form.getByLabel('Início', { exact: true }).fill('2026-09-10T12:00');
    await form.getByLabel('Fim', { exact: true }).fill('2026-09-10T12:00');
    await form.getByRole('button', { name: 'Salvar compromisso', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText('O fim deve ser posterior');
    expect(relationshipWrites).toHaveLength(0);
    await form.getByLabel('Fim', { exact: true }).fill('2026-09-10T12:01');
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await form.screenshot({ path: info.outputPath('consolidated-create-minute-320.png') });
    await form.getByRole('button', { name: 'Salvar compromisso', exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(agenda.getByText('Compromisso salvo na agenda.', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Agenda', exact: true })).toBeVisible();
    await expect(appointmentCard(page, 'Ligação imediata PA zero')).toContainText('PA Alfa zero');
    const sameDay = appointmentRows.find(row => row.title === 'Ligação imediata PA zero');
    expect(sameDay).toMatchObject({ owner_id: owner, workspace_year: 2026, entity_id: 'pa:1002:3017:0', entity_kind: 'pa', central: '1002', cooperative: '3017', pa: '0',
      starts_at: '2026-09-10T15:00:00.000Z', ends_at: '2026-09-10T15:01:00.000Z', timezone: 'America/Sao_Paulo', kind: 'call', status: 'scheduled' });
    await agenda.getByRole('button', { name: '9 de setembro: 0 compromissos', exact: true }).click();
    await agenda.getByRole('button', { name: 'Novo compromisso', exact: true }).click();
    await form.getByRole('combobox', { name: 'Nível da unidade', exact: true }).selectOption('cooperative');
    await form.getByRole('combobox', { name: 'Central do compromisso', exact: true }).selectOption('2007');
    const cooperative = form.getByRole('combobox', { name: 'Cooperativa do compromisso', exact: true });
    await expect(cooperative.locator('option[value="cooperative:1002:3017"]')).toHaveCount(0);
    await cooperative.selectOption('cooperative:2007:3017');
    await form.getByLabel('Título do compromisso').fill('Visita registrada do dia anterior');
    await form.getByLabel('Tipo de compromisso').selectOption('visit');
    await form.getByLabel('Início', { exact: true }).fill('2026-09-09T09:00');
    await form.getByLabel('Fim', { exact: true }).fill('2026-09-09T09:01');
    await form.getByRole('button', { name: 'Salvar compromisso', exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(appointmentCard(page, 'Visita registrada do dia anterior')).toContainText('Outra central');
    expect(appointmentRows.find(row => row.title === 'Visita registrada do dia anterior')).toMatchObject({ owner_id: owner, workspace_year: 2026,
      entity_id: 'cooperative:2007:3017', entity_kind: 'cooperative', central: '2007', cooperative: '3017', pa: null,
      starts_at: '2026-09-09T12:00:00.000Z', ends_at: '2026-09-09T12:01:00.000Z' });
    expect(relationshipWrites.filter(write => write.table === 'commercial_entity_appointments' && write.method === 'POST')).toHaveLength(2);
    await page.reload();
    await navigate(page, 'Agenda');
    await agenda.getByRole('combobox', { name: 'Central da agenda', exact: true }).selectOption('2007');
    await agenda.getByRole('button', { name: '9 de setembro: 1 compromisso', exact: true }).click();
    await expect(agenda.getByRole('article')).toHaveCount(1);
    await expect(appointmentCard(page, 'Visita registrada do dia anterior')).toContainText('Outra central');
    await expect(appointmentCard(page, 'Ligação imediata PA zero')).toHaveCount(0);
    await expect(agenda).not.toContainText('Compromisso privado de outro usuário');
    await expect(agenda).not.toContainText('Compromisso de outro ano');
    expect(relationshipReads.filter(read => read.table === 'commercial_entity_appointments').every(read => read.filters.owner_id === `eq.${owner}` && read.filters.workspace_year === 'eq.2026')).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await agenda.screenshot({ path: info.outputPath('consolidated-created-visit-desktop.png') });
    expect(errors).toEqual([]);
  });

  test('consolidated agenda: owner/year scoped calendar includes central, cooperatives and PA zero with activity, status and month filters', async ({ page }, info) => {
    const { errors, relationshipReads } = await setup(page, value => value, { appointments: agendaSeed(owner, created) });
    await navigate(page, 'Agenda');
    const agenda = consolidated(page);
    await expect(agenda.getByRole('combobox', { name: 'Situação da agenda', exact: true })).toHaveValue('scheduled');
    await expect(agenda.getByRole('combobox', { name: 'Mês da agenda', exact: true })).toHaveValue('2026-09');
    await expect(agenda.getByRole('article')).toHaveCount(5);
    for (const title of ['Reunião Central Bahia', 'Visita Cooperativa Alfa', 'Treinamento PA Alfa zero', 'Ligação Central Nordeste', 'Reunião Outra central']) await expect(appointmentCard(page, title)).toBeVisible();
    await agenda.screenshot({ path: info.outputPath('consolidated-agenda-desktop.png') });
    await expect(agenda).not.toContainText('Compromisso privado de outro usuário');
    await expect(agenda).not.toContainText('Compromisso de outro ano');
    await expect(appointmentCard(page, 'Visita já concluída')).toHaveCount(0);
    await expect(appointmentCard(page, 'Ligação cancelada')).toHaveCount(0);
    await agenda.getByRole('button', { name: '12 de setembro: 2 compromissos', exact: true }).click();
    await expect(agenda.getByRole('article')).toHaveCount(2);
    await expect(appointmentCard(page, 'Treinamento PA Alfa zero')).toBeVisible();
    await agenda.getByRole('button', { name: 'Ver mês inteiro', exact: true }).click();
    await agenda.getByRole('combobox', { name: 'Central da agenda', exact: true }).selectOption('1002');
    await expect(agenda.getByRole('article')).toHaveCount(3);
    await expect(appointmentCard(page, 'Reunião Outra central')).toHaveCount(0);
    await agenda.getByRole('combobox', { name: 'Tipo de atividade', exact: true }).selectOption('training');
    await expect(agenda.getByRole('article')).toHaveCount(1);
    await expect(appointmentCard(page, 'Treinamento PA Alfa zero')).toContainText('PA Alfa zero');
    await agenda.getByRole('combobox', { name: 'Tipo de atividade', exact: true }).selectOption('all');
    await agenda.getByRole('combobox', { name: 'Situação da agenda', exact: true }).selectOption('all');
    await expect(agenda.getByRole('article')).toHaveCount(5);
    await expect(appointmentCard(page, 'Visita já concluída')).toBeVisible();
    await expect(appointmentCard(page, 'Ligação cancelada')).toBeVisible();
    await agenda.getByRole('combobox', { name: 'Mês da agenda', exact: true }).selectOption('2026-10');
    await expect(agenda.getByRole('article')).toHaveCount(1);
    await expect(appointmentCard(page, 'Visita outubro')).toBeVisible();
    await appointmentCard(page, 'Visita outubro').getByRole('button', { name: 'Abrir agenda da unidade', exact: true }).click();
    const octoberUnit = page.getByRole('region', { name: 'Agenda de Cooperativa Alfa', exact: true });
    await expect(octoberUnit.getByRole('heading', { name: 'Agenda de relacionamento', exact: true })).toBeFocused();
    await expect(octoberUnit.getByRole('article').filter({ has: page.getByText('Visita outubro', { exact: true }) })).toBeVisible();
    await expect(octoberUnit.getByRole('heading', { name: '01 de outubro', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Cadastro e metas', exact: true })).toBeVisible();
    await navigate(page, 'Agenda');
    await agenda.getByRole('combobox', { name: 'Central da agenda', exact: true }).selectOption('all');
    await agenda.getByRole('combobox', { name: 'Situação da agenda', exact: true }).selectOption('scheduled');
    await agenda.getByRole('combobox', { name: 'Mês da agenda', exact: true }).selectOption('2026-10');
    await agenda.getByRole('button', { name: 'Hoje', exact: true }).click();
    await expect(agenda.getByRole('combobox', { name: 'Mês da agenda', exact: true })).toHaveValue('2026-09');
    await expect(agenda.getByRole('button', { name: /^10 de setembro:/ })).toHaveAttribute('aria-current', 'date');
    await expect(agenda.getByRole('article')).toHaveCount(5);
    await agenda.getByRole('combobox', { name: 'Situação da agenda', exact: true }).selectOption('scheduled');
    await agenda.getByRole('combobox', { name: 'Central da agenda', exact: true }).selectOption('2007');
    await expect(agenda.getByRole('article')).toHaveCount(2);
    await expect(appointmentCard(page, 'Reunião Outra central')).toBeVisible();
    await expect(appointmentCard(page, 'Visita Cooperativa Alfa')).toHaveCount(0);
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await agenda.screenshot({ path: info.outputPath('consolidated-agenda-mobile-320.png') });
    await agenda.getByRole('combobox', { name: 'Mês da agenda', exact: true }).selectOption('2026-08');
    await page.clock.setFixedTime(new Date('2026-10-01T03:00:00Z'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(agenda.getByRole('combobox', { name: 'Mês da agenda', exact: true })).toHaveValue('2026-08');
    await agenda.getByRole('button', { name: 'Hoje', exact: true }).click();
    await expect(agenda.getByRole('combobox', { name: 'Mês da agenda', exact: true })).toHaveValue('2026-10');
    await expect(agenda.getByRole('button', { name: /^1 de outubro:/ })).toHaveAttribute('aria-current', 'date');
    await page.clock.setFixedTime(new Date('2026-11-01T03:00:00Z'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(agenda.getByRole('combobox', { name: 'Mês da agenda', exact: true })).toHaveValue('2026-11');
    const reads = relationshipReads.filter(read => read.table === 'commercial_entity_appointments' && !read.filters.entity_id);
    expect(reads.length).toBeGreaterThanOrEqual(2);
    expect(reads.every(read => read.filters.owner_id === `eq.${owner}` && read.filters.workspace_year === 'eq.2026')).toBe(true);
    expect(reads.some(read => read.filters.id?.startsWith('gt.'))).toBe(true);
    expect(errors).toEqual([]);
  });

  test('consolidated agenda: opening a scheduled event allows editing, completing and deleting with refreshed results', async ({ page }) => {
    const { errors, appointmentRows, relationshipReads } = await setup(page, value => value, { appointments: agendaSeed(owner, created) });
    await navigate(page, 'Agenda');
    const agenda = consolidated(page);
    await appointmentCard(page, 'Visita Cooperativa Alfa').getByRole('button', { name: 'Abrir agenda da unidade', exact: true }).click();
    const unit = page.getByRole('region', { name: 'Agenda de Cooperativa Alfa', exact: true });
    await expect(unit.getByRole('heading', { name: 'Agenda de relacionamento', exact: true })).toBeFocused();
    const embedded = page.locator('details[aria-label="Agenda das unidades"]');
    await expect(embedded).not.toHaveAttribute('open', '');
    await expect(agenda).toHaveCount(0);
    await embedded.locator('summary').click();
    await expect(appointmentCard(page, 'Visita Cooperativa Alfa')).toBeVisible();
    const original = unit.getByRole('article').filter({ has: page.getByText('Visita Cooperativa Alfa', { exact: true }) });
    await expect(original).toBeVisible();
    await original.getByRole('button', { name: 'Editar', exact: true }).click();
    await expect(unit.getByRole('textbox', { name: 'Título do compromisso', exact: true })).toHaveValue('Visita Cooperativa Alfa');
    await unit.getByRole('textbox', { name: 'Título do compromisso', exact: true }).fill('Visita Alfa reagendada');
    await unit.getByLabel('Início', { exact: true }).fill('2026-09-18T14:00');
    await unit.getByLabel('Fim', { exact: true }).fill('2026-09-18T15:00');
    await unit.getByRole('button', { name: 'Salvar compromisso', exact: true }).click();
    await expect(unit.getByRole('status')).toContainText('Compromisso salvo');
    await expect(appointmentCard(page, 'Visita Alfa reagendada')).toBeVisible();
    await expect(appointmentCard(page, 'Visita Cooperativa Alfa')).toHaveCount(0);
    const row = appointmentRows.find(item => item.owner_id === owner && item.title === 'Visita Alfa reagendada');
    expect(row.starts_at).toBe('2026-09-18T17:00:00.000Z');
    const revised = unit.getByRole('article').filter({ has: page.getByText('Visita Alfa reagendada', { exact: true }) });
    await revised.getByRole('button', { name: 'Concluir', exact: true }).click();
    await expect(revised.getByText('Concluído', { exact: true })).toBeVisible();
    await expect(appointmentCard(page, 'Visita Alfa reagendada')).toHaveCount(0);
    await agenda.getByRole('combobox', { name: 'Situação da agenda', exact: true }).selectOption('completed');
    await expect(appointmentCard(page, 'Visita Alfa reagendada')).toBeVisible();
    await revised.getByRole('button', { name: 'Excluir', exact: true }).click();
    await revised.getByRole('alertdialog', { name: 'Excluir compromisso', exact: true }).getByRole('button', { name: 'Confirmar exclusão', exact: true }).click();
    await expect(unit.getByRole('status')).toContainText('Compromisso excluído');
    await expect(appointmentCard(page, 'Visita Alfa reagendada')).toHaveCount(0);
    expect(appointmentRows.some(item => item.id === row.id)).toBe(false);
    const countBeforeRefresh = relationshipReads.filter(read => read.table === 'commercial_entity_appointments' && !read.filters.entity_id).length;
    await agenda.getByRole('button', { name: 'Atualizar agenda', exact: true }).click();
    await expect.poll(() => relationshipReads.filter(read => read.table === 'commercial_entity_appointments' && !read.filters.entity_id).length).toBeGreaterThan(countBeforeRefresh);
    await expect(appointmentCard(page, 'Visita já concluída')).toBeVisible();
    await expect(appointmentCard(page, 'Visita Alfa reagendada')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('consolidated agenda: the shortcut preserves an unsaved registry draft unless leaving is confirmed', async ({ page }) => {
    const { errors, relationshipReads } = await setup(page, value => value, { appointments: agendaSeed(owner, created) });
    await navigate(page, 'Cadastro e metas');
    const embedded = page.locator('details[aria-label="Agenda das unidades"]');
    await expect(embedded.locator('summary')).toBeVisible();
    await expect(consolidated(page)).toHaveCount(0);
    expect(relationshipReads.filter(read => read.table === 'commercial_entity_appointments' && !read.filters.entity_id)).toHaveLength(0);
    await embedded.locator('summary').click();
    const open = appointmentCard(page, 'Visita Cooperativa Alfa').getByRole('button', { name: 'Abrir agenda da unidade', exact: true });
    await expect(open).toBeEnabled();
    await page.getByRole('button', { name: 'Nova unidade', exact: true }).click();
    const draftName = page.getByRole('textbox', { name: 'Nome da unidade', exact: true });
    await draftName.fill('Unidade em rascunho');
    const dismissDialog = page.waitForEvent('dialog');
    const declinedClick = open.click();
    const first = await dismissDialog;
    expect(first.type()).toBe('confirm');
    expect(first.message()).toContain('alterações não salvas');
    await first.dismiss();
    await declinedClick;
    await expect(draftName).toHaveValue('Unidade em rascunho');
    await expect(page.getByRole('region', { name: 'Agenda de Cooperativa Alfa', exact: true })).toHaveCount(0);
    const acceptDialog = page.waitForEvent('dialog');
    const acceptedClick = open.click();
    const second = await acceptDialog;
    await second.accept();
    await acceptedClick;
    await expect(draftName).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Agenda de Cooperativa Alfa', exact: true }).getByRole('heading', { name: 'Agenda de relacionamento', exact: true })).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('consolidated agenda: failed read is recoverable and retry keeps owner/year isolation', async ({ page }) => {
    const { errors } = await setup(page, value => value, { appointments: agendaSeed(owner, created) });
    let allowRecovery = false;
    const requestScopes = [];
    await page.route('http://127.0.0.1:4600/rest/v1/commercial_entity_appointments**', async route => {
      if (route.request().method() !== 'GET') return route.fallback();
      const url = new URL(route.request().url());
      if (url.searchParams.has('entity_id')) return route.fallback();
      requestScopes.push({ owner: url.searchParams.get('owner_id'), year: url.searchParams.get('workspace_year') });
      // Keep the outage through PostgREST's automatic retries until the user retries.
      if (allowRecovery) return route.fallback();
      return route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ message: 'Agenda indisponível no teste' }) });
    });
    await navigate(page, 'Agenda');
    const agenda = consolidated(page);
    await expect(agenda.getByRole('alert')).toBeVisible();
    await expect(agenda.getByRole('article')).toHaveCount(0);
    allowRecovery = true;
    await agenda.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await expect(agenda.getByRole('article')).toHaveCount(5);
    await expect(agenda.getByRole('alert')).toHaveCount(0);
    await expect(agenda).not.toContainText('Compromisso privado de outro usuário');
    await expect(agenda).not.toContainText('Compromisso de outro ano');
    expect(requestScopes.length).toBeGreaterThanOrEqual(3);
    expect(requestScopes.every(scope => scope.owner === `eq.${owner}` && scope.year === 'eq.2026')).toBe(true);
    expect(errors).toEqual([]);
  });
}
