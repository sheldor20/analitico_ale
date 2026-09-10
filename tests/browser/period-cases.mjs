import { readFile } from 'node:fs/promises';

export function registerPeriodTests({test,expect,setup,composer}) {
  const select = (root,name) => root.getByRole('combobox',{name,exact:true});
  const target = page => page.getByRole('region',{name:'Resultado do período',exact:true}).locator('article').first();
  test('periods: four explicit quarters, two semesters, annual and automatic YTD across views',async({page},info)=>{
    const {errors}=await setup(page);
    await expect(select(page,'Período').locator('option')).toHaveCount(5);
    await expect(select(page,'Período').locator('option[value="daily"]')).toHaveCount(0);
    await expect(page.getByLabel('Abrangência do período',{exact:true})).toContainText('JAN–SET/2026');
    await expect(select(page,'Mês de referência')).toHaveCount(0);
    await select(page,'Cooperativa').selectOption('1002:3017');
    await expect(target(page)).toContainText('900,00');
    await select(page,'Período').selectOption('quarter');
    await expect(select(page,'Trimestre').locator('option')).toHaveCount(4);
    for(const value of ['1','2','3','4']) {
      await select(page,'Trimestre').selectOption(value);
      await expect(target(page)).toContainText(`${value}º trimestre`);
      await expect(target(page)).toContainText('300,00');
    }
    await select(page,'Trimestre').selectOption('2');
    await page.getByRole('button',{name:'Ver PAs de Cooperativa Alfa',exact:true}).click();
    const pas=page.getByRole('region',{name:'PAs da cooperativa',exact:true});
    await expect(pas).toContainText('2º trimestre');await expect(pas).toContainText('1.350,00');
    await select(page,'Período').selectOption('semester');
    await expect(select(page,'Semestre').locator('option')).toHaveCount(2);
    for(const value of ['1','2']){await select(page,'Semestre').selectOption(value);await expect(target(page)).toContainText(`${value}º semestre`);await expect(target(page)).toContainText('600,00');}
    await select(page,'Período').selectOption('annual');await expect(target(page)).toContainText('1.200,00');
    await expect(page.getByLabel('Abrangência do período',{exact:true})).toContainText('JAN–DEZ/2026');
    await select(page,'Período').selectOption('month');await expect(select(page,'Mês de referência').locator('option')).toHaveCount(12);
    await select(page,'Mês de referência').selectOption('0');await expect(target(page)).toContainText('100,00');
    await select(page,'Período').selectOption('ytd');await expect(target(page)).toContainText('900,00');
    await expect(target(page)).toContainText('JAN–SET/2026');
    await page.getByRole('button',{name:'Cadência dos PAs',exact:true}).click();
    await select(page,'Período').selectOption('quarter');await select(page,'Trimestre').selectOption('1');
    await expect(target(page)).toContainText('1.350,00');
    await page.getByRole('button',{name:'Plano de ação',exact:true}).click();
    await expect(select(page,'Trimestre')).toHaveValue('1');
    await page.getByRole('button',{name:'Conferência da base',exact:true}).click();
    await expect(select(page,'Trimestre')).toHaveValue('1');
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:info.outputPath('period-quarter-mobile.png'),fullPage:true});
    expect(errors).toEqual([]);
  });
  test('periods: exact quarter propagates to CSV, email, WhatsApp and saved draft',async({page},info)=>{
    const {errors,writes}=await setup(page);
    await select(page,'Cooperativa').selectOption('1002:3017');
    await select(page,'Período').selectOption('quarter');await select(page,'Trimestre').selectOption('2');
    const exported=page.waitForEvent('download');await page.getByRole('button',{name:/Exportar/}).first().click();
    const file=await exported, csv=await readFile(await file.path(),'utf8');
    expect(csv).toContain('2º trimestre · 2026');expect(file.suggestedFilename()).toContain('quarter');
    await page.getByRole('button',{name:'Gerar e-mail / WhatsApp',exact:true}).click();
    const dialog=composer(page);await expect(select(dialog,'Trimestre')).toHaveValue('2');
    const frame=page.frameLocator('iframe[title="Painel do e-mail da carteira"]');
    await expect(frame.locator('body')).toContainText('2º trimestre · 2026');
    expect(new URL(await dialog.getByRole('link',{name:'Abrir WhatsApp',exact:true}).getAttribute('href')).searchParams.get('text')).toContain('2º trimestre · 2026');
    await select(dialog,'Período da mensagem').selectOption('semester');await select(dialog,'Semestre').selectOption('2');
    await expect(frame.locator('body')).toContainText('2º semestre · 2026');
    await select(dialog,'Período da mensagem').selectOption('month');await select(dialog,'Mês de referência').selectOption('1');
    await select(dialog,'Período da mensagem').selectOption('ytd');
    await expect(frame.locator('body')).toContainText('Acumulado · JAN–SET/2026');
    await dialog.getByRole('button',{name:'Salvar rascunho',exact:true}).click();
    await expect.poll(()=>writes.length).toBe(1);
    expect(writes[0].report.month).toBe(8);expect(writes[0].report.period).toBe('ytd');
    expect(writes[0].email_body).toContain('JAN–SET/2026');expect(writes[0].whatsapp_body).toContain('JAN–SET/2026');
    await dialog.getByRole('button',{name:'Fechar comunicação',exact:true}).click();
    await expect(select(page,'Período')).toHaveValue('quarter');await expect(select(page,'Trimestre')).toHaveValue('2');
    await page.screenshot({path:info.outputPath('period-quarter-desktop.png'),fullPage:true});
    expect(errors).toEqual([]);
  });
  test('periods: YTD refreshes after calendar rollover without changing source dates',async({page})=>{
    const {errors}=await setup(page);
    await select(page,'Cooperativa').selectOption('1002:3017');
    await page.clock.setFixedTime(new Date('2026-10-01T02:59:59Z'));
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await expect(page.getByLabel('Abrangência do período',{exact:true})).toContainText('JAN–SET/2026');
    await page.clock.setFixedTime(new Date('2026-10-01T03:00:00Z'));
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await expect(page.getByLabel('Abrangência do período',{exact:true})).toContainText('JAN–OUT/2026');
    await expect(target(page)).toContainText('1.000,00');
    await expect(page.locator('.position-line')).toContainText('31/08/2026');
    expect(errors).toEqual([]);
  });
}
