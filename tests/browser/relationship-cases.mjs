// UI regressions share the authenticated, owner-scoped REST fixtures from portfolio.spec.
export function registerRelationshipTests({ test, expect, setup, owner, created }) {
  test('relationships: hierarchy keeps each unit separate and validates and persists the commercial profile', async ({ page }, info) => {
    const profile = (id, entity, overrides = {}) => ({ id, owner_id: owner, workspace_year: 2026, entity_id: entity,
      entity_kind: entity.split(':')[0], central: '1002', cooperative: entity.split(':')[2] || null, pa: null,
      capital_modality: 'Não informado', capital_notes: '', rate_tables: [], collection_notes: '', new_sales_notes: '', general_notes: '', updated_at: created, ...overrides });
    const { errors, profileRows, relationshipWrites, relationshipReads } = await setup(page, value => value, { profiles: [
      profile('00000000-0000-0000-0000-000000000270', 'central:1002', { capital_notes: 'Condições exclusivas da central' }),
      profile('00000000-0000-0000-0000-000000000271', 'cooperative:1002:3017', { owner_id: '00000000-0000-0000-0000-000000000002', capital_notes: 'Informação de outro usuário' }),
      profile('00000000-0000-0000-0000-000000000272', 'cooperative:1002:3017', { workspace_year: 2025, capital_notes: 'Informação de outro ano' }),
    ] });
    await page.getByRole('button', { name: 'Cadastro e metas', exact: true }).click();
    await page.locator('.registry-list').getByRole('button', { name: /Central Bahia teste/ }).click();
    const central = page.getByRole('region', { name: 'Ficha de Central Bahia teste', exact: true });
    await expect(central.getByLabel('Condições do capital')).toHaveValue('Condições exclusivas da central');
    await page.getByRole('button', { name: 'Abrir ficha de Cooperativa Alfa', exact: true }).click();
    const ficha = page.getByRole('region', { name: 'Ficha de Cooperativa Alfa', exact: true });
    await expect(ficha.getByLabel('Condições do capital')).toHaveValue('');
    await ficha.getByLabel('Modalidade de capital').selectOption('Vinculado');
    await ficha.getByLabel('Condições do capital').fill('Capital acompanha o saldo devedor.');
    await ficha.getByRole('button', { name: 'Adicionar tabela', exact: true }).click();
    await ficha.getByLabel('Nome da tabela', { exact: true }).fill('Prestamista PJ');
    await ficha.getByLabel('Taxa', { exact: true }).fill('101');
    await ficha.getByLabel('Unidade', { exact: true }).selectOption('percent');
    await ficha.getByLabel('Período da taxa', { exact: true }).selectOption('monthly');
    await ficha.getByLabel('Vigência inicial').fill('2026-09-01');
    await ficha.getByLabel('Vigência final').fill('2026-12-31');
    await ficha.getByLabel('Arrecadação', { exact: true }).fill('Acompanhar renovações da carteira.');
    await ficha.getByLabel('Venda nova', { exact: true }).fill('Treinar os PAs para novas adesões.');
    await ficha.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
    await expect(ficha.getByRole('alert')).toContainText('taxa fora do limite');
    expect(relationshipWrites).toHaveLength(0);
    await ficha.getByLabel('Taxa', { exact: true }).fill('0,035');
    await ficha.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
    await expect(ficha.getByRole('status')).toContainText('Ficha salva.');
    const saved = profileRows.find(row => row.owner_id === owner && row.workspace_year === 2026 && row.entity_id === 'cooperative:1002:3017');
    expect(saved.capital_modality).toBe('Vinculado');
    expect(saved.rate_tables[0]).toMatchObject({ name: 'Prestamista PJ', rate: 0.035, unit: 'percent', period: 'monthly', validFrom: '2026-09-01', validUntil: '2026-12-31' });
    expect(saved.collection_notes).toContain('renovações');
    expect(saved.new_sales_notes).toContain('novas adesões');
    await page.getByRole('button', { name: 'Contatos', exact: true }).click();
    await expect(page.getByText('Ana Teste', { exact: true })).toBeVisible();
    await expect(page.getByText('Celia Teste', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Ficha da carteira', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir ficha de PA Alfa zero', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Ficha de PA Alfa zero', exact: true }).getByLabel('Condições do capital')).toHaveValue('');
    await page.getByRole('navigation', { name: 'Hierarquia da unidade', exact: true }).getByRole('button', { name: 'Cooperativa Alfa', exact: true }).click();
    await expect(ficha.getByLabel('Taxa', { exact: true })).toHaveValue('0,035');
    await page.reload();
    await page.getByRole('button', { name: 'Cadastro e metas', exact: true }).click();
    await page.locator('.registry-list').getByRole('button', { name: /Cooperativa Alfa/ }).click();
    await expect(ficha.getByLabel('Modalidade de capital')).toHaveValue('Vinculado');
    await expect(ficha.getByLabel('Taxa', { exact: true })).toHaveValue('0,035');
    await expect(ficha.getByLabel('Venda nova', { exact: true })).toHaveValue('Treinar os PAs para novas adesões.');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('relationship-profile-mobile.png'), fullPage: true });
    expect(relationshipReads.filter(read => read.table === 'commercial_entity_profiles').every(read => read.filters.owner_id === `eq.${owner}` && read.filters.workspace_year === 'eq.2026')).toBe(true);
    expect(errors).toEqual([]);
  });

  test('relationships: calendar validates dates, saves local time, edits status and isolates month and unit', async ({ page }, info) => {
    const appointment = (id, title, entity, starts, overrides = {}) => ({ id, owner_id: owner, workspace_year: 2026, entity_id: entity,
      entity_kind: 'cooperative', central: '1002', cooperative: entity.split(':')[2], pa: null, title, kind: 'call',
      starts_at: starts, ends_at: starts.replace('12:00', '13:00'), timezone: 'America/Sao_Paulo', location: '', notes: '', status: 'scheduled', updated_at: created, ...overrides });
    const { errors, appointmentRows, relationshipWrites, relationshipReads } = await setup(page, value => value, { appointments: [
      appointment('00000000-0000-0000-0000-000000000280', 'Ligação de outubro', 'cooperative:1002:3017', '2026-10-01T12:00:00.000Z'),
      appointment('00000000-0000-0000-0000-000000000281', 'Agenda da cooperativa Beta', 'cooperative:1002:3025', '2026-09-10T12:00:00.000Z'),
      appointment('00000000-0000-0000-0000-000000000282', 'Agenda privada de outro usuário', 'cooperative:1002:3017', '2026-09-10T12:00:00.000Z', { owner_id: '00000000-0000-0000-0000-000000000002' }),
      appointment('00000000-0000-0000-0000-000000000283', 'Agenda de outro ano', 'cooperative:1002:3017', '2025-09-10T12:00:00.000Z', { workspace_year: 2025 }),
    ] });
    await page.getByRole('button', { name: 'Cadastro e metas', exact: true }).click();
    await page.locator('.registry-list').getByRole('button', { name: /Cooperativa Alfa/ }).click();
    await page.getByRole('button', { name: 'Agenda', exact: true }).click();
    const agenda = page.getByRole('region', { name: 'Agenda de Cooperativa Alfa', exact: true });
    await expect(agenda.getByRole('heading', { name: 'Nenhum compromisso neste mês', exact: true })).toBeVisible();
    await agenda.getByRole('button', { name: 'Novo compromisso', exact: true }).click();
    await agenda.getByLabel('Título do compromisso').fill('Treinamento prestamista');
    await agenda.getByLabel('Tipo de compromisso').selectOption('training');
    await agenda.getByLabel('Início', { exact: true }).fill('2026-09-18T09:30');
    await agenda.getByLabel('Fim', { exact: true }).fill('2026-09-18T09:30');
    await agenda.getByLabel('Local ou link').fill('Sala da cooperativa');
    await agenda.getByRole('button', { name: 'Salvar compromisso', exact: true }).click();
    await expect(agenda.getByRole('alert')).toContainText('O fim deve ser posterior');
    expect(relationshipWrites).toHaveLength(0);
    await agenda.getByLabel('Fim', { exact: true }).fill('2026-09-18T10:30');
    await agenda.getByRole('button', { name: 'Salvar compromisso', exact: true }).click();
    await expect(agenda.getByRole('status')).toContainText('Compromisso salvo');
    const saved = () => appointmentRows.find(row => row.owner_id === owner && row.entity_id === 'cooperative:1002:3017' && row.kind === 'training');
    expect(saved()).toMatchObject({ starts_at: '2026-09-18T12:30:00.000Z', ends_at: '2026-09-18T13:30:00.000Z', timezone: 'America/Sao_Paulo', status: 'scheduled' });
    const event = agenda.getByRole('article').filter({ has: page.getByText('Treinamento prestamista', { exact: true }) });
    await event.getByRole('button', { name: 'Editar', exact: true }).click();
    await expect(agenda.getByLabel('Início', { exact: true })).toHaveValue('2026-09-18T09:30');
    await agenda.getByLabel('Título do compromisso').fill('Treinamento prestamista revisado');
    await agenda.getByLabel('Início', { exact: true }).fill('2026-09-19T14:00');
    await agenda.getByLabel('Fim', { exact: true }).fill('2026-09-19T15:00');
    await agenda.getByRole('button', { name: 'Salvar compromisso', exact: true }).click();
    const revised = agenda.getByRole('article').filter({ has: page.getByText('Treinamento prestamista revisado', { exact: true }) });
    await expect(revised).toBeVisible();
    expect(appointmentRows.filter(row => row.kind === 'training')).toHaveLength(1);
    expect(saved().starts_at).toBe('2026-09-19T17:00:00.000Z');
    await revised.getByRole('button', { name: 'Concluir', exact: true }).click();
    await expect(revised.getByText('Concluído', { exact: true })).toBeVisible();
    expect(saved().status).toBe('completed');
    await agenda.getByLabel('Filtrar compromissos por situação').selectOption('scheduled');
    await expect(revised).toHaveCount(0);
    await agenda.getByLabel('Filtrar compromissos por situação').selectOption('all');
    await agenda.getByRole('button', { name: 'Próximo mês', exact: true }).click();
    await expect(agenda.getByText('Ligação de outubro', { exact: true })).toBeVisible();
    await expect(revised).toHaveCount(0);
    await agenda.getByRole('button', { name: 'Mês anterior', exact: true }).click();
    await expect(revised).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('relationship-calendar-mobile.png'), fullPage: true });
    await page.locator('.registry-list').getByRole('button', { name: /Cooperativa Beta/ }).click();
    await page.getByRole('button', { name: 'Agenda', exact: true }).click();
    const betaAgenda = page.getByRole('region', { name: 'Agenda de Cooperativa Beta', exact: true });
    await expect(betaAgenda.getByText('Agenda da cooperativa Beta', { exact: true })).toBeVisible();
    await expect(betaAgenda.getByText('Treinamento prestamista revisado', { exact: true })).toHaveCount(0);
    await page.reload();
    await page.getByRole('button', { name: 'Cadastro e metas', exact: true }).click();
    await page.locator('.registry-list').getByRole('button', { name: /Cooperativa Alfa/ }).click();
    await page.getByRole('button', { name: 'Agenda', exact: true }).click();
    await expect(revised.getByText('Concluído', { exact: true })).toBeVisible();
    expect(relationshipReads.filter(read => read.table === 'commercial_entity_appointments').every(read => read.filters.owner_id === `eq.${owner}` && read.filters.workspace_year === 'eq.2026')).toBe(true);
    expect(errors).toEqual([]);
  });
  test('relationships: monthly achievements stay scoped and WhatsApp requires a deliberate handoff', async ({ page, context }) => {
    const otherOwner = '00000000-0000-0000-0000-000000000002';
    let seedId = 290;
    const state = (overrides = {}) => ({
      id: `00000000-0000-0000-0000-${String(seedId++).padStart(12, '0')}`, owner_id: owner, workspace_year: 2026,
      entity_id: 'cooperative:1002:3025', entity_kind: 'cooperative', central: '1002', cooperative: '3025', pa: null,
      month: 8, metric: 'VN', alert_key: '2026:8:cooperative:1002:3025:VN', read_at: created, notified_at: null, ...overrides,
    });
    const { errors, goalStateRows, relationshipWrites, relationshipReads } = await setup(page, dataset => ({
      ...dataset, rows: dataset.rows.map(row => row.source === 'cadence' && row.cooperative === '3025'
        ? { ...row, actuals: row.actuals.map(value => value == null ? null : 500) } : row),
    }), { goalStates: [state({ owner_id: otherOwner }), state({ workspace_year: 2025, alert_key: '2025:8:cooperative:1002:3025:VN' }), state({ month: 7, alert_key: '2026:7:cooperative:1002:3025:VN' })] });
    const outbound = [];
    await context.route('https://wa.me/**', async route => {
      outbound.push(route.request().url());
      await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>WhatsApp test handoff</title>' });
    });
    const notice = page.getByRole('complementary', { name: 'Alerta de metas atingidas' });
    await expect(notice).toContainText('5 metas atingidas');
    await notice.getByRole('button', { name: 'Ver conquistas' }).click();
    const alerts = page.getByRole('region', { name: 'Metas atingidas no mês' });
    await expect(alerts.getByLabel('Mês de referência', { exact: true })).toHaveValue('7');
    for (const name of ['Central Bahia teste', 'Cooperativa Beta', 'PA Beta zero']) await expect(alerts.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(alerts.getByRole('heading', { name: 'Cooperativa Alfa', exact: true })).toHaveCount(0);
    const beta = alerts.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Cooperativa Beta', exact: true }) });
    await expect(beta.getByRole('button', { name: 'Marcar como lida', exact: true })).toBeEnabled();
    expect(relationshipWrites).toHaveLength(0);
    expect(outbound).toHaveLength(0);
    await beta.getByRole('button', { name: 'Marcar como lida', exact: true }).click();
    await expect(beta.getByText('Lida', { exact: true })).toBeVisible();
    const currentState = () => goalStateRows.find(row => row.owner_id === owner && row.workspace_year === 2026 && row.month === 8);
    expect(currentState()?.read_at).toBeTruthy();
    expect(currentState()?.notified_at).toBeNull();
    await alerts.getByLabel('Somente não lidas').check();
    await expect(beta).toHaveCount(0);
    await alerts.getByLabel('Somente não lidas').uncheck();
    await beta.getByRole('button', { name: 'Preparar WhatsApp', exact: true }).click();
    await expect(beta.getByLabel('Responsável da unidade')).toContainText('Bruno Teste');
    await expect(beta.getByLabel('Responsável da unidade')).not.toContainText('Ana Teste');
    expect(outbound).toHaveLength(0);
    expect(context.pages()).toHaveLength(1);
    const link = beta.getByRole('link', { name: 'Abrir mensagem no WhatsApp', exact: true });
    const href = new URL(await link.getAttribute('href'));
    expect(href.hostname).toBe('wa.me');
    expect(href.pathname).toBe('/5571999999999');
    expect(href.searchParams.get('text')).toContain('Cooperativa Beta');
    expect(href.searchParams.get('text')).toContain('150,00');
    const popup = context.waitForEvent('page');
    await link.click();
    const opened = await popup;
    await expect(opened).toHaveTitle('WhatsApp test handoff');
    await opened.close();
    expect(outbound).toHaveLength(1);
    // Opening the service does not claim that a message has actually been sent.
    expect(currentState()?.notified_at).toBeNull();
    await beta.getByRole('button', { name: 'Já enviei: registrar comunicação', exact: true }).click();
    await expect(beta.getByRole('button', { name: 'Comunicação registrada', exact: true })).toBeDisabled();
    expect(currentState()?.read_at).toBeTruthy();
    expect(currentState()?.notified_at).toBeTruthy();
    await alerts.getByLabel('Mês de referência', { exact: true }).selectOption('8');
    await expect(alerts.getByRole('heading', { name: 'Nenhuma meta atingida neste mês', exact: true })).toBeVisible();
    await alerts.getByLabel('Mês de referência', { exact: true }).selectOption('7');
    await expect(beta.getByText('Lida', { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Metas atingidas', exact: true }).click();
    await expect(beta.getByText('Lida', { exact: true })).toBeVisible();
    await expect(beta).toContainText('Comunicação registrada em');
    expect(relationshipReads.filter(read => read.table === 'commercial_goal_alert_states').every(read => read.filters.owner_id === `eq.${owner}` && read.filters.workspace_year === 'eq.2026')).toBe(true);
    expect(errors).toEqual([]);
  });
}
