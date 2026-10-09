import { portfolioFixture } from '../portfolio-fixture.mjs';
import { upsertEntity, upsertPlanRow } from '../../lib/registry.mjs';
import { money } from '../../lib/analytics.mjs';
export function registerUxTests({test,expect,setup,owner,created}) {
 test('cooperative table: exact large and negative values, optional indicators and row actions fit without horizontal scrolling',async({page},testInfo)=>{
  const betaName='Cooperativa Beta de Desenvolvimento Regional e Apoio Comercial';
  const {errors,writes,relationshipWrites}=await setup(page,dataset=>{
   dataset=upsertEntity(dataset,{kind:'cooperative',central:'1002',cooperative:'3025',name:betaName},'cooperative:1002:3025');
   return {...dataset,rows:dataset.rows.map(row=>row.source==='base'&&row.central==='1002'&&row.metric==='VN'
    ? {...row,targets:Array(12).fill(9279000),annualTarget:9279000*12,actuals:row.actuals.map(value=>value==null?null:row.cooperative==='3017'?186000000.17:-186000000.17)}:row)};
  });
  await page.getByRole('combobox',{name:'Central',exact:true}).selectOption('1002');
  await page.getByRole('combobox',{name:'Período',exact:true}).selectOption('month');
  await page.getByRole('combobox',{name:'Mês de referência',exact:true}).selectOption('7');
  await page.getByRole('combobox',{name:'Ordenar análise',exact:true}).selectOption('production');
  const list=page.getByRole('region',{name:'Lista de unidades',exact:true});
  const table=list.locator('.table-scroll > table').first(),wrapper=table.locator('..');
  const rows=table.locator('tbody > tr:has(> td[data-field="actual"])');
  const beta=rows.filter({has:page.getByRole('checkbox',{name:`Selecionar ${betaName}`,exact:true})});
  const alfa=rows.filter({has:page.getByRole('checkbox',{name:'Selecionar Cooperativa Alfa',exact:true})});
  const selection=beta.getByRole('checkbox',{name:`Selecionar ${betaName}`,exact:true});
  async function inlinePasFit(){
   await list.getByRole('button',{name:'Expandir PAs de Cooperativa Alfa',exact:true}).click();
   const nested=list.getByRole('region',{name:'PAs da cooperativa',exact:true});
   await expect(nested.getByRole('table')).toBeVisible();await expect(nested).toContainText('PA Alfa zero');
   for(const node of [wrapper,table])expect(await node.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   await list.getByRole('button',{name:'Recolher PAs de Cooperativa Alfa',exact:true}).click();
   await expect(nested).toHaveCount(0);
  }
  await selection.check();
  await expect(alfa.locator('[data-field="target"]')).toContainText(money(9279000));
  await expect(alfa.locator('[data-field="actual"]')).toContainText(money(186000000.17));
  await expect(beta.locator('[data-field="actual"]')).toContainText(money(-186000000.17));
  await expect(beta.locator('[data-field="variance"]')).toContainText(money(195279000.17));
  for(const width of [1440,1280,1024,390,320]){
   await page.setViewportSize({width,height:width<=390?844:1000});
   for(const more of [false,true]){
    await list.getByRole('checkbox',{name:'Mais indicadores',exact:true}).setChecked(more);
    await expect(rows).toHaveCount(2);await expect(selection).toBeChecked();
    await expect(table.locator('dt').filter({hasText:/^Projeção$/})).toHaveCount(more?2:0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`document at ${width}/${more}`).toBe(true);
    for(const node of [wrapper,table]){
     const box=await node.evaluate(element=>({scroll:element.scrollWidth,client:element.clientWidth,left:element.getBoundingClientRect().left,right:element.getBoundingClientRect().right}));
     expect(box.scroll,`table or wrapper at ${width}/${more}`).toBeLessThanOrEqual(box.client+1);
     expect(box.left).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(width+1);
    }
    const amounts=await table.evaluate(element=>{
     const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT),values=[];let node;
     while((node=walker.nextNode())){
      if(!/R\$\s*[\d.,]+/.test(node.textContent||''))continue;
      const range=document.createRange();range.selectNodeContents(node);
      const rects=[...range.getClientRects()].filter(rect=>rect.width&&rect.height),parent=node.parentElement.closest('dd,td');
      if(!parent||!rects.length)continue;
      const cell=parent.getBoundingClientRect();values.push({text:node.textContent.trim(),lines:rects.length,left:Math.min(...rects.map(rect=>rect.left)),right:Math.max(...rects.map(rect=>rect.right)),cellLeft:cell.left,cellRight:cell.right});
     }
     return values;
    });
    expect(amounts.length,`financial values inspected at ${width}/${more}`).toBeGreaterThanOrEqual(more?9:6);
    for(const value of amounts){
     expect(value.lines,`${width}: ${value.text}`).toBe(1);
     expect(value.left,`${width}: ${value.text}`).toBeGreaterThanOrEqual(value.cellLeft-1);
     expect(value.right,`${width}: ${value.text}`).toBeLessThanOrEqual(value.cellRight+1);
    }
    for(const name of ['Cooperativa Alfa',betaName])for(const action of ['Ver PAs de','Detalhar']){
     const button=list.getByRole('button',{name:`${action} ${name}`,exact:true});await expect(button).toBeVisible();
     const box=await button.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width+1);
    }
    if((width===1440&&!more)||(width===1024&&more))await list.screenshot({path:testInfo.outputPath(`cooperative-table-${width}-${more?'details':'primary'}.png`)});
    if(width===390&&more){
     await alfa.evaluate(element=>element.scrollIntoView({block:'start'}));
     await page.screenshot({path:testInfo.outputPath('cooperative-table-390.png'),fullPage:false});
    }
    if(width===1440&&more)await inlinePasFit();
   }
  }
  await inlinePasFit();
  await list.getByRole('button',{name:`Detalhar ${betaName}`,exact:true}).focus();await page.keyboard.press('Enter');
  const detail=page.getByRole('dialog',{name:betaName,exact:true});await expect(detail).toBeVisible();
  await expect(detail.getByRole('table',{name:`Detalhamento mensal de ${betaName}`,exact:true}).locator('tbody tr').nth(7)).toContainText(money(-186000000.17));
  await page.keyboard.press('Escape');await expect(detail).toHaveCount(0);await expect(selection).toBeChecked();
  await list.getByRole('button',{name:'Ver PAs de Cooperativa Alfa',exact:true}).click();
  const pas=page.getByRole('region',{name:'PAs da cooperativa',exact:true});
  await expect(pas).toContainText('PA Alfa zero');await expect(pas).not.toContainText('PA Beta zero');
  await page.getByRole('button',{name:'Voltar ao recorte anterior',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Central',exact:true})).toHaveValue('1002');
  await expect(page.getByRole('combobox',{name:'Mês de referência',exact:true})).toHaveValue('7');
  await expect(rows).toHaveCount(2);
  expect(writes).toEqual([]);expect(relationshipWrites).toEqual([]);expect(errors).toEqual([]);
 });
 test('compact overview: collapsing panels preserves the filtered selection and priority actions reopen the unit list',async({page},testInfo)=>{
  const {errors,writes,relationshipWrites}=await setup(page);
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('combobox',{name:'Central',exact:true}).selectOption('1002');
  await page.getByRole('combobox',{name:'Período',exact:true}).selectOption('month');
  await page.getByRole('combobox',{name:'Mês de referência',exact:true}).selectOption('7');
  await page.getByLabel('Buscar cooperativa ou PA').fill('Cooperativa');
  await page.getByRole('combobox',{name:'Ordenar análise',exact:true}).selectOption('production');
  const metrics=page.getByRole('region',{name:'Resultado do período',exact:true});
  const list=page.getByRole('region',{name:'Lista de unidades',exact:true});
  const priorities=page.getByRole('region',{name:'Prioridades da carteira',exact:true});
  const selected=list.getByRole('checkbox',{name:'Selecionar Cooperativa Beta',exact:true});
  await selected.check();
  await expect(list.locator('tbody tr')).toHaveCount(2);
  await expect(list.locator('tbody tr').first()).toContainText('Cooperativa Beta');
  const before=await metrics.locator('article').allTextContents();
  const controls=[
   [metrics,'indicadores do período',metrics.locator('article').first()],
   [list,'lista de unidades',list.locator('table')],
   [priorities,'prioridades',priorities.getByRole('button',{name:'Ver unidades: Maior contribuição',exact:true})],
  ];
  for(const [panel,label,content] of controls){
   const toggle=panel.getByRole('button',{name:`Recolher ${label}`,exact:true});
   await expect(toggle).toHaveAttribute('aria-expanded','true');
   expect(await toggle.getAttribute('aria-controls')).toBeTruthy();
   await toggle.focus();await page.keyboard.press('Enter');
   await expect(panel.getByRole('button',{name:`Expandir ${label}`,exact:true})).toHaveAttribute('aria-expanded','false');
   await expect(content).toBeHidden();
  }
  await page.getByRole('button',{name:'Recolher resultados por período',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Central',exact:true})).toHaveValue('1002');
  await expect(page.getByRole('combobox',{name:'Mês de referência',exact:true})).toHaveValue('7');
  await expect(list.getByRole('heading',{name:'Resultado por cooperativa',exact:true})).toBeVisible();
  await expect(list.getByRole('button',{name:'Compartilhar cooperativas',exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('compact-overview-desktop.png'),fullPage:true});
  await page.setViewportSize({width:320,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  for(const [panel,label] of controls){
   const toggle=panel.getByRole('button',{name:`Expandir ${label}`,exact:true});
   const box=await toggle.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320);
  }
  await page.screenshot({path:testInfo.outputPath('compact-overview-320.png'),fullPage:true,style:'.sidebar, .skip-link { visibility: hidden !important; }'});
  for(const [panel,label,content] of controls){
   await panel.getByRole('button',{name:`Expandir ${label}`,exact:true}).focus();await page.keyboard.press('Space');
   await expect(panel.getByRole('button',{name:`Recolher ${label}`,exact:true})).toHaveAttribute('aria-expanded','true');
   await expect(content).toBeVisible();
  }
  await expect(selected).toBeChecked();
  await expect(page.getByLabel('Buscar cooperativa ou PA')).toHaveValue('Cooperativa');
  await expect(page.getByRole('combobox',{name:'Ordenar análise',exact:true})).toHaveValue('production');
  await expect(page.getByRole('combobox',{name:'Filtrar situação',exact:true})).toHaveValue('all');
  await expect(list.locator('tbody tr')).toHaveCount(2);
  await expect(list.locator('tbody tr').first()).toContainText('Cooperativa Beta');
  expect(await metrics.locator('article').allTextContents()).toEqual(before);
  await list.getByRole('button',{name:'Recolher lista de unidades',exact:true}).click();
  await expect(list.locator('table')).toBeHidden();
  await priorities.getByRole('button',{name:'Ver unidades: Maior contribuição',exact:true}).click();
  await expect(list.getByRole('button',{name:'Recolher lista de unidades',exact:true})).toHaveAttribute('aria-expanded','true');
  await expect(list.locator('table')).toBeVisible();
  await expect(list).toBeFocused();
  await expect(page.getByRole('button',{name:'Limpar prioridade',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Limpar prioridade',exact:true}).click();
  await page.getByRole('combobox',{name:'Cooperativa',exact:true}).selectOption('1002:3017');
  const pas=page.getByRole('region',{name:'PAs da cooperativa',exact:true});
  await pas.getByRole('button',{name:'Abrir PAs',exact:true}).click();
  await list.getByRole('button',{name:'Recolher lista de unidades',exact:true}).click();
  await pas.getByRole('button',{name:'Abrir cadência de Cooperativa Alfa',exact:true}).click();
  await expect(list.getByRole('heading',{name:'Cadência por PA',exact:true})).toBeVisible();
  await expect(list.getByRole('button',{name:'Recolher lista de unidades',exact:true})).toHaveAttribute('aria-expanded','true');
  await expect(list.locator('table')).toBeVisible();
  await expect(list.locator('tbody tr')).toContainText('PA Alfa zero');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect(writes).toEqual([]);expect(relationshipWrites).toEqual([]);expect(errors).toEqual([]);
 });
 test('UX: primary data comes before optional panels; PAs toggle by keyboard and selected unit',async({page},testInfo)=>{
  const {errors}=await setup(page);
  await page.setViewportSize({width:1440,height:900});
  await expect(page.getByText('Cadastro carregado.',{exact:true})).toHaveCount(0);
  const metrics = page.getByRole('region',{name:'Resultado do período',exact:true});
  expect((await metrics.boundingBox()).y).toBeLessThan(520);
  const years = page.locator('details').filter({has:page.locator('summary').filter({hasText:'Gerenciar anos'})});
  await expect(years.getByRole('button',{name:'Recarregar cadastro salvo',exact:true})).toBeHidden();
  await years.locator('summary').click();
  await expect(years.getByRole('button',{name:'Recarregar cadastro salvo',exact:true})).toBeEnabled();
  await years.locator('summary').click();
  await page.setViewportSize({width:320,height:844});
  await years.locator('summary').click();
  await expect(years.getByRole('button',{name:'Recarregar cadastro salvo',exact:true})).toBeVisible();
  const yearMenu = await years.locator(':scope > div').boundingBox();
  expect(yearMenu.x).toBeGreaterThanOrEqual(0);expect(yearMenu.x+yearMenu.width).toBeLessThanOrEqual(320);
  expect(yearMenu.y).toBeGreaterThanOrEqual(0);expect(yearMenu.y+yearMenu.height).toBeLessThanOrEqual(844);
  await years.locator('summary').click();
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('combobox',{name:'Período',exact:true}).selectOption('month');
  await page.getByRole('combobox',{name:'Mês de referência',exact:true}).selectOption('7');
  await expect(page.getByRole('heading',{level:1,name:'Visão geral',exact:true})).toBeVisible();
  const result=page.getByRole('region',{name:'Resultado do período',exact:true}),list=page.getByRole('region',{name:'Lista de unidades',exact:true});
  const resultBox=await result.boundingBox(),listBox=await list.boundingBox();
  expect(listBox.y).toBeGreaterThanOrEqual(resultBox.y+resultBox.height);
  expect(listBox.y-resultBox.y-resultBox.height).toBeLessThan(100);
  expect(listBox.y).toBeLessThan((await page.getByRole('region',{name:'Prioridades da carteira',exact:true}).boundingBox()).y);
  expect((await list.boundingBox()).y).toBeLessThan((await page.getByRole('region',{name:'Comparativo entre anos',exact:true}).boundingBox()).y);
  await expect(list.getByRole('columnheader',{name:'Crescimento / GAP',exact:true})).toBeVisible();
  await expect(list.getByRole('columnheader',{name:'Projeção',exact:true})).toHaveCount(0);
  await list.getByLabel('Mais indicadores').check();await expect(list.locator('dt').filter({hasText:/^Projeção$/}).first()).toBeVisible();
  await list.getByLabel('Mais indicadores').uncheck();
  await page.screenshot({path:testInfo.outputPath('ux-overview-desktop.png'),fullPage:true});
  await page.getByRole('combobox',{name:'Cooperativa',exact:true}).selectOption('1002:3017');
  const pas=page.getByRole('region',{name:'PAs da cooperativa',exact:true});
  await expect(pas.getByRole('button',{name:'Abrir PAs',exact:true})).toHaveAttribute('aria-expanded','false');
  await expect(pas.locator('table')).toBeHidden();
  await pas.getByRole('button',{name:'Abrir PAs',exact:true}).focus();await page.keyboard.press('Enter');await expect(pas.locator('table')).toBeVisible();
  await pas.getByRole('button',{name:'Fechar PAs',exact:true}).focus();await page.keyboard.press('Space');await expect(pas.locator('table')).toBeHidden();
  await page.getByRole('button',{name:'Ver PAs de Cooperativa Alfa',exact:true}).click();await expect(pas.locator('table')).toBeVisible();
  await page.getByRole('combobox',{name:'Cooperativa',exact:true}).selectOption('1002:3025');await expect(pas.locator('table')).toBeHidden();
  await pas.getByRole('button',{name:'Abrir PAs',exact:true}).click();await expect(pas).toContainText('PA Beta zero');await expect(pas).not.toContainText('PA Alfa zero');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('ux-overview-mobile.png'),fullPage:true});
  expect(errors).toEqual([]);
 });
 test('UX: actions and audit exclude unrelated comparisons; hidden simulation stays explicit',async({page},testInfo)=>{
  const {errors}=await setup(page, dataset => {
    for (let index=1;index<=13;index++) {
      const cooperative=String(4000+index);
      dataset=upsertEntity(dataset,{kind:'cooperative',central:'1002',cooperative,name:`Cooperativa adicional ${index}`});
      dataset=upsertPlanRow(dataset,{entityId:`cooperative:1002:${cooperative}`,metric:'VN',targets:Array(12).fill(100),annualTarget:1200,actuals:[...Array(8).fill(50),null,null,null,null],cutoff:'2026-08-31'});
    }
    return dataset;
  });
  await page.locator('summary').filter({hasText:'Evolução e simulação'}).click();
  await page.getByLabel('Simular aumento de ritmo').focus();
  await page.keyboard.press('Home');
  for(let step=0;step<5;step++)await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('Simular aumento de ritmo')).toHaveValue('25');
  await page.locator('summary').filter({hasText:'Evolução e simulação'}).click();
  await expect(page.getByText('Simulação de ritmo +25% ativa · somente projeções',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Limpar simulação',exact:true}).click();
  await page.getByRole('button',{name:'Plano de ação',exact:true}).click();
  await expect(page.getByRole('region',{name:'Lista de ações',exact:true})).toBeVisible();
  await expect(page.locator('.action-card')).toHaveCount(16);
  const laterAction=page.locator('.action-card').filter({has:page.getByText('Cooperativa adicional 13',{exact:true})});
  await laterAction.scrollIntoViewIfNeeded();await expect(laterAction).toBeVisible();
  await expect(laterAction).toContainText('Tarefa: Não iniciada');
  await expect(page.getByRole('region',{name:'Comparativo entre anos',exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Resumo da rede filtrada',exact:true})).toHaveCount(0);
  await page.getByRole('combobox',{name:'Ordenar análise',exact:true}).selectOption('production');
  await page.getByLabel('Buscar cooperativa ou PA').fill('Alfa');await expect(page.locator('.action-card')).toHaveCount(1);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:testInfo.outputPath('ux-actions-mobile.png'),fullPage:true});
  await page.getByRole('button',{name:'Conferência da base',exact:true}).click();
  await expect(page.getByRole('region',{name:'Comparativo entre anos',exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Conferência das fontes',exact:true})).toBeVisible();
  await expect(page.getByText('REGRAS DE CÁLCULO',{exact:true})).toBeHidden();
  expect(errors).toEqual([]);
 });
 test('UX: visual comparison reflects current filters, lazy loading and mobile dashboard',async({page},testInfo)=>{
  const {errors}=await setup(page),current=portfolioFixture();
  const previous=JSON.parse(JSON.stringify(current).replaceAll('2026','2025'));
  previous.rows.forEach(row=>{row.actuals=row.actuals.map(value=>value==null?null:value/2);});
  const datasets=[current,previous];let historicalReads=0;
  await page.route('http://127.0.0.1:4600/rest/v1/commercial_workspaces**',async route=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
    const url=new URL(route.request().url()),year=url.searchParams.get('year');if(year==='eq.2025')historicalReads++;
    const rows=datasets.filter(value=>!year||`eq.${value.year}`===year).map((dataset,index)=>({id:`00000000-0000-0000-0000-00000000001${index}`,owner_id:owner,year:dataset.year,revision:1,updated_at:created,dataset}));
    await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify((route.request().headers().accept||'').includes('vnd.pgrst.object')?rows[0]||null:rows)});
  });
  await page.locator('summary').filter({hasText:'Gerenciar anos'}).click();
  await page.getByRole('button',{name:'Recarregar cadastro salvo',exact:true}).click();
  await page.locator('summary').filter({hasText:'Gerenciar anos'}).click();
  await page.getByRole('combobox',{name:'Central',exact:true}).selectOption('1002');
  await expect(page.getByLabel('Abrangência do período',{exact:true})).toContainText('JAN–SET/2026');
  expect(historicalReads).toBe(0);
  const comparison=page.getByRole('region',{name:'Comparativo entre anos',exact:true});
  await comparison.getByRole('button',{name:'Comparar anos',exact:true}).click();
  await expect(comparison.getByLabel('Dashboard comparativo',{exact:true})).toBeVisible();
  await expect(comparison.getByLabel('Resumo de 2026',{exact:true})).toContainText('1.600,00');
  await expect(comparison.getByLabel('Resumo de 2025',{exact:true})).toContainText('800,00');
  await expect(comparison.getByLabel('Variação da produção',{exact:true})).toContainText('800,00');
  await expect(comparison.getByLabel('Comparação do atingimento',{exact:true})).toContainText('+50 p.p.');
  await expect(comparison.locator('.comparison-unit-table')).toBeHidden();
  await comparison.screenshot({path:testInfo.outputPath('ux-comparison-desktop.png')});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await comparison.screenshot({path:testInfo.outputPath('ux-comparison-mobile.png')});
  await page.getByRole('combobox',{name:'Cooperativa',exact:true}).selectOption('1002:3017');
  await expect(comparison.getByLabel('Resumo de 2026',{exact:true})).toContainText('400,00');
  await page.getByRole('combobox',{name:'Período',exact:true}).selectOption('month');
  await page.getByRole('combobox',{name:'Mês de referência',exact:true}).selectOption('8');
  await expect(comparison.getByLabel('Dashboard comparativo',{exact:true})).toHaveCount(0);
  await expect(comparison).toContainText('Não há mês fechado comum');
  expect(errors).toEqual([]);
 });
}
