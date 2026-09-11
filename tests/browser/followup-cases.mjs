import { readFile } from 'node:fs/promises';
import { upsertEntity, upsertPlanRow } from '../../lib/registry.mjs';
import { step, disclosure, customize } from './composer-navigation.mjs';

export function registerFollowupTests({test,expect,setup,composer,selectAugust}) {
  test('followup: login fits desktop and mobile without unnecessary scrolling or clipping',async({page},info)=>{
    for(const [width,height] of [[1440,900],[1366,768],[390,844],[320,568]]) {
      await page.setViewportSize({width,height}); await page.goto('/login');
      await expect(page.getByRole('form',{name:'Entrar na conta'})).toBeVisible();
      const bounds=await page.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight,vw:innerWidth,vh:innerHeight}));
      expect(bounds.w).toBeLessThanOrEqual(bounds.vw+1); expect(bounds.h).toBeLessThanOrEqual(bounds.vh+1);
      await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeInViewport();
      await page.screenshot({path:info.outputPath(`login-${width}.png`),fullPage:true});
    }
    await page.setViewportSize({width:320,height:350});
    await page.getByLabel('Senha',{exact:true}).fill('not-a-real-account');
    await page.getByRole('button',{name:'Entrar',exact:true}).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeInViewport();
  });
  test('followup: all cooperatives use page scrolling, no bounded inner results scrollbar',async({page},info)=>{
    const {errors}=await setup(page,dataset=>{
      for(let i=0;i<24;i++) {
        const cooperative=String(6000+i);
        dataset=upsertEntity(dataset,{kind:'cooperative',central:'1002',cooperative,name:`Unidade de teste ${i}`});
        dataset=upsertPlanRow(dataset,{entityId:`cooperative:1002:${cooperative}`,metric:'VN',targets:Array(12).fill(100),actuals:[...Array(8).fill(50),null,null,null,null],cutoff:'2026-08-31'});
      }
      return dataset;
    });
    const list=page.getByRole('region',{name:'Lista de unidades'});
    await expect(list.locator('tbody tr')).toHaveCount(27);
    const bounds=await list.locator('.table-scroll').evaluate(n=>({max:getComputedStyle(n).maxHeight,h:n.clientHeight,content:n.scrollHeight}));
    expect(bounds.max).toBe('none'); expect(bounds.content).toBeLessThanOrEqual(bounds.h+1);
    await list.locator('tbody tr').last().scrollIntoViewIfNeeded();
    await expect(list.locator('tbody tr').last()).toBeInViewport();
    await page.screenshot({path:info.outputPath('complete-cooperatives.png'),fullPage:false});
    expect(errors).toEqual([]);
  });
  test('followup: goal realized variance projection order and accessible percentages',async({page},info)=>{
    const {errors}=await setup(page);
    await page.getByRole('combobox',{name:'Período',exact:true}).selectOption('month');
    await page.getByRole('combobox',{name:'Mês de referência',exact:true}).selectOption('7');
    const region=page.getByRole('region',{name:'Resultado do período',exact:true});
    await page.getByLabel('Buscar cooperativa ou PA').fill('Beta');
    await expect(region.getByRole('article').nth(0)).toHaveAccessibleName('Meta do período');
    await expect(region.getByRole('article').nth(1)).toHaveAccessibleName('Realizado até o corte');
    await expect(region.getByRole('article').nth(1)).toHaveClass(/accent/);
    await expect(region.getByRole('article').nth(2)).toHaveAccessibleName('Crescimento sobre a meta');
    await expect(region.getByRole('article').nth(2)).toContainText('50,00');
    await expect(region.getByRole('article').nth(2)).toContainText('50% acima da meta');
    await expect(region.getByRole('article').nth(3)).toHaveAccessibleName('Projeção de fechamento');
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:width===1440?1100:844});
      expect(await region.getByRole('article').nth(1).locator('p').evaluate(n=>parseFloat(getComputedStyle(n).fontSize))).toBeGreaterThanOrEqual(15);
      await region.scrollIntoViewIfNeeded(); await page.screenshot({path:info.outputPath(`ordered-kpis-${width}.png`),fullPage:false});
    }
    await page.getByLabel('Buscar cooperativa ou PA').fill('Alfa');
    await expect(region.getByRole('article').nth(2)).toHaveAccessibleName('GAP para a meta');
    await expect(region.getByRole('article').nth(2)).toContainText('50,00');
    await page.getByLabel('Buscar cooperativa ou PA').fill('no match');
    await expect(region.getByRole('article').nth(2).locator('.kpi-value')).toHaveText('—');
    expect(errors).toEqual([]);
  });
  test('followup: three-step composer preserves fields, scales to mobile and previews without inner scroll',async({page},info)=>{
    const {errors}=await setup(page);
    const trigger=page.getByRole('button',{name:'Gerar e-mail / WhatsApp',exact:true}); await trigger.click();
    const dialog=composer(page); await dialog.getByLabel('Unidade selecionada').selectOption('cooperative:1002:3017'); await selectAugust(dialog);
    await expect(dialog.getByRole('heading',{name:'Quem vai receber?'})).toBeVisible();
    await expect(dialog.locator('iframe')).toHaveCount(0);
    await expect(dialog.getByRole('button',{name:'Baixar e-mail (.eml)',exact:true})).toBeHidden();
    await dialog.getByLabel('E-mails adicionais').fill('extra@example.com');
    await disclosure(dialog,'Personalizar abertura e assinatura');
    await dialog.getByLabel('Abertura personalizada').fill('Prioridades da carteira. <script>window.injected=true</script>');
    for(const width of [1440,390,320]) {
      await page.setViewportSize({width,height:width===1440?1100:844});
      for(const n of [1,2,3]) {
        await step(dialog,n);
        await expect(dialog.getByRole('navigation',{name:'Etapas da comunicação'}).locator('button').nth(n-1)).toHaveAttribute('aria-current','step');
        expect(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
        if(n===2) {
          const frame=dialog.locator('iframe'); await expect(frame).toHaveAttribute('sandbox','allow-same-origin');
          await expect(page.frameLocator('iframe').getByRole('heading',{level:1})).toContainText('Cooperativa Alfa');
          await expect.poll(()=>frame.evaluate(n=>n.contentDocument.documentElement.scrollHeight<=n.clientHeight+2)).toBe(true);
          expect(await page.evaluate(()=>window.injected)).toBeUndefined();
        }
        if(width!==320) {await dialog.evaluate(n=>n.scrollTop=0); await page.screenshot({path:info.outputPath(`composer-step-${n}-${width}.png`),fullPage:false});}
      }
    }
    await step(dialog,1); await expect(dialog.getByLabel('E-mails adicionais')).toHaveValue('extra@example.com');
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(trigger).toBeFocused();
    expect(errors).toEqual([]);
  });
  test('followup: Outlook copies actual HTML before enabling blank compose link and invalidates stale copy',async({page,context})=>{
    await context.grantPermissions(['clipboard-read','clipboard-write']);
    const {errors}=await setup(page);
    await page.getByRole('button',{name:'Gerar e-mail / WhatsApp',exact:true}).click();
    const dialog=composer(page); await dialog.getByLabel('Unidade selecionada').selectOption('cooperative:1002:3017'); await selectAugust(dialog);
    await expect(dialog.getByText('Ana Teste',{exact:true})).toBeVisible(); await step(dialog,3);
    await expect(dialog.getByRole('button',{name:'Abrir Outlook e colar painel',exact:true})).toBeDisabled();
    await dialog.getByRole('button',{name:'Copiar painel',exact:true}).click();
    const link=dialog.getByRole('link',{name:'Abrir Outlook e colar painel',exact:true}); await expect(link).toBeVisible();
    const href=new URL(await link.getAttribute('href'));
    expect(href.searchParams.get('body')||'').toBe(''); expect(href.searchParams.get('to')).toBe('ana@example.com');
    expect(href.hostname).toBe('outlook.office.com'); expect(await link.getAttribute('rel')).toContain('noopener');
    const copied=await page.evaluate(async()=>{const items=await navigator.clipboard.read(); const item=items.find(i=>i.types.includes('text/html'));return item?await(await item.getType('text/html')).text():'';});
    expect(copied).toContain('data-metric="Meta do período"'); expect(copied).toContain('data-metric="Realizado informado"'); expect(copied).toContain('50,00');
    await dialog.getByLabel('Mês de referência').selectOption('6');
    await expect(dialog.getByRole('link',{name:'Abrir Outlook e colar painel',exact:true})).toHaveCount(0);
    await expect(dialog.getByRole('button',{name:'Abrir Outlook e colar painel',exact:true})).toBeDisabled();
    expect(errors).toEqual([]);
  });
  test('followup: denied formatted clipboard never opens Outlook; EML contains complete HTML and recipients',async({page,context})=>{
    await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async()=>{throw new DOMException('Test denial','NotAllowedError');}}});});
    await setup(page); await page.getByRole('button',{name:'Gerar e-mail / WhatsApp',exact:true}).click();
    const dialog=composer(page); await dialog.getByLabel('Unidade selecionada').selectOption('cooperative:1002:3017');await selectAugust(dialog);
    await expect(dialog.getByText('Ana Teste',{exact:true})).toBeVisible(); await step(dialog,3);
    await dialog.getByRole('button',{name:'Copiar painel',exact:true}).click();
    await expect(dialog.getByRole('alert')).toContainText('A cópia formatada foi bloqueada');
    await expect(dialog.getByRole('button',{name:'Abrir Outlook e colar painel',exact:true})).toBeDisabled(); expect(context.pages()).toHaveLength(1);
    const waiting=page.waitForEvent('download');await dialog.getByRole('button',{name:'Baixar e-mail (.eml)',exact:true}).click();
    const eml=await readFile(await(await waiting).path(),'utf8');
    expect(eml).toContain('To: ana@example.com');expect(eml).toContain('multipart/alternative');expect(eml).toContain('X-Unsent: 1');
    const part=eml.split('Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0];
    const html=Buffer.from(part.replace(/\s/g,''),'base64').toString('utf8');
    expect(html).toContain('data-metric="Realizado informado"');expect(html).toContain('50,00');expect(html).toContain('Cooperativa Alfa');
  });
  test('followup: text-only custom template is explicit and can restore automatic dashboard',async({page})=>{
    await setup(page);await page.getByRole('button',{name:'Gerar e-mail / WhatsApp',exact:true}).click();const dialog=composer(page);
    await customize(dialog); await dialog.getByLabel('Texto / modelo do e-mail').fill('Mensagem sem painel');
    await step(dialog,3);
    await expect(dialog.getByRole('alert')).toContainText('somente texto');
    await expect(dialog.getByRole('button',{name:'Copiar painel',exact:true})).toBeDisabled();
    await dialog.getByRole('button',{name:'Restaurar painel automático',exact:true}).click();
    await expect(dialog.getByRole('button',{name:'Copiar painel',exact:true})).toBeEnabled();
    await step(dialog,2);await expect(page.frameLocator('iframe').locator('[data-metric="Realizado informado"]')).toBeVisible();
  });

  test('followup review: annual goal conflict cannot claim growth or attainment', async ({page}) => {
    const {errors}=await setup(page,dataset=>({...dataset,rows:dataset.rows.map(row=>row.source==='base' && row.central==='1002' && row.cooperative==='3025' && row.metric==='VN' ? {...row,annualTarget:1000} : row)}));
    await page.getByRole('combobox',{name:'Período',exact:true}).selectOption('annual');
    await page.getByLabel('Buscar cooperativa ou PA').fill('Beta');
    const region=page.getByRole('region',{name:'Resultado do período',exact:true});
    await expect(page.getByRole('region',{name:'Lista de unidades'})).toContainText('Metas divergentes');
    await expect(region.getByRole('article',{name:'Crescimento sobre a meta'})).toHaveCount(0);
    await expect(region.getByRole('article').nth(2)).toContainText('Metas divergentes');
    await expect(region.getByRole('article').nth(2).locator('.kpi-value')).toHaveText('Não disponível');
    await expect(region.getByRole('meter')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
  test('followup review: any other in-app or native copy requires copying the panel again',async({page,context})=>{
    await context.grantPermissions(['clipboard-read','clipboard-write']);
    const {errors}=await setup(page);
    await page.getByRole('button',{name:'Gerar e-mail / WhatsApp',exact:true}).click();
    const dialog=composer(page);await dialog.getByLabel('Unidade selecionada').selectOption('cooperative:1002:3017');await selectAugust(dialog);
    await expect(dialog.getByText('Ana Teste',{exact:true})).toBeVisible();await step(dialog,3);
    const copyPanel=dialog.getByRole('button',{name:'Copiar painel',exact:true});
    const openPanel=dialog.getByRole('link',{name:'Abrir Outlook e colar painel',exact:true});
    await copyPanel.click();await expect(openPanel).toBeVisible();
    await disclosure(dialog,'Outras opções de e-mail');await dialog.getByRole('button',{name:'Copiar e-mail',exact:true}).click();
    await expect(dialog.getByRole('status')).toContainText('Texto do e-mail copiado.');
    await expect(openPanel).toHaveCount(0);
    await expect(dialog.getByRole('button',{name:'Abrir Outlook e colar painel',exact:true})).toBeDisabled();
    for(const event of ['copy','cut']) {
      await copyPanel.click();await expect(openPanel).toBeVisible();
      await page.evaluate(name=>document.dispatchEvent(new Event(name)),event);
      await expect(openPanel).toHaveCount(0);
    }
    await copyPanel.click();await expect(openPanel).toBeVisible();
    expect(errors).toEqual([]);
  });
}
