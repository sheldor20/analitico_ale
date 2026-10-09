import { createEmptyDataset } from '../../lib/registry.mjs';
import { step } from './composer-navigation.mjs';

export function registerRegistryOnboardingTests({test,expect,setup,owner}) {
  test('registry onboarding: a new account persists its own central and cooperative without inherited names or phantom filters',async({page},info)=>{
    await page.goto('/login');
    await expect(page.getByRole('form',{name:'Entrar na conta',exact:true})).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/Bahia|Nordeste|1002|2007/i);
    await page.screenshot({path:info.outputPath('neutral-login.png'),fullPage:false});
    const {errors,writes,workspaceWrites,workspaceRows,relationshipWrites}=await setup(page,()=>createEmptyDataset(2026),{workspaceMissing:true});
    await expect(page.locator('body')).not.toContainText(/Bahia|Nordeste/i);
    await page.getByRole('button',{name:'Começar pelo cadastro manual',exact:true}).click();
    const registry=page.getByRole('region',{name:'Cadastro e metas de 2026',exact:true});
    await expect(registry.getByRole('heading',{name:'Cadastre sua primeira Central',exact:true})).toBeVisible();
    await registry.getByRole('button',{name:'Nova unidade',exact:true}).first().click();
    const form=registry.locator('form.registry-form');
    await expect(form.getByLabel('Código da Central')).toHaveValue('');
    await form.getByLabel('Código da Central').fill('3456');
    await form.getByLabel('Nome da unidade').fill('Central Exemplo');
    await form.getByRole('button',{name:'Salvar cadastro',exact:true}).click();
    await expect(form).toHaveCount(0);
    await expect(registry.locator('.registry-list').getByRole('button')).toHaveCount(1);
    await expect(registry.locator('.registry-list')).toContainText('Central Exemplo');
    await registry.getByRole('button',{name:'Nova unidade',exact:true}).first().click();
    await form.getByLabel('Tipo de unidade').selectOption('cooperative');
    await expect(form.getByLabel(/^Central/)).toHaveValue('3456');
    expect(await form.getByLabel(/^Central/).locator('option').evaluateAll(nodes=>nodes.map(node=>node.value))).toEqual(['','3456']);
    await form.getByLabel('Código da cooperativa').fill('6789');
    await form.getByLabel('Nome da unidade').fill('Cooperativa Exemplo');
    await form.getByRole('button',{name:'Salvar cadastro',exact:true}).click();
    await expect(form).toHaveCount(0);
    await expect(registry.locator('.registry-list').getByRole('button')).toHaveCount(2);
    await expect.poll(()=>workspaceWrites.length).toBe(2);
    expect(workspaceWrites.map(write=>write.method)).toEqual(['POST','PATCH']);
    expect(workspaceWrites[0].payload).toMatchObject({owner_id:owner,year:2026,revision:1});
    expect(workspaceWrites[1].filters).toMatchObject({owner_id:`eq.${owner}`,year:'eq.2026',revision:'eq.1'});
    expect(workspaceRows[0].revision).toBe(2);
    expect(workspaceRows[0].dataset.registry.entities.map(entity=>[entity.id,entity.name])).toEqual([
      ['central:3456','Central Exemplo'],['cooperative:3456:6789','Cooperativa Exemplo'],
    ]);
    await page.reload();
    await page.getByRole('navigation',{name:'Navegação principal',exact:true}).getByRole('button',{name:'Cadastro e metas',exact:true}).click();
    await expect(registry.locator('.registry-list').getByRole('button')).toHaveCount(2);
    await registry.locator('.registry-list').getByRole('button',{name:/Cooperativa Exemplo/}).click();
    await expect(registry.getByRole('navigation',{name:'Hierarquia da unidade',exact:true})).toContainText('Central Exemplo');
    await registry.getByRole('button',{name:'Gerar e-mail / WhatsApp',exact:true}).click();
    const composer=page.getByRole('dialog',{name:'Comunicar resultado',exact:true});
    await step(composer,2);
    const frame=page.frameLocator('iframe[title="Painel do e-mail da carteira"]');
    await expect(frame.locator('[data-communication-header]')).toContainText('Central Exemplo');
    await expect(frame.locator('body')).not.toContainText(/Bahia|Nordeste|1002|2007/i);
    await composer.getByRole('button',{name:'Fechar comunicação',exact:true}).click();
    await page.getByRole('navigation',{name:'Navegação principal',exact:true}).getByRole('button',{name:'Visão geral',exact:true}).click();
    const central=page.getByRole('combobox',{name:'Central',exact:true});
    expect(await central.locator('option').evaluateAll(nodes=>nodes.map(node=>node.value))).toEqual(['all','3456']);
    await central.selectOption('3456');
    const cooperative=page.getByRole('combobox',{name:'Cooperativa',exact:true});
    expect(await cooperative.locator('option').evaluateAll(nodes=>nodes.map(node=>node.value))).toEqual(['all','3456:6789']);
    await cooperative.selectOption('3456:6789');
    await expect(page.getByRole('region',{name:'Lista de unidades',exact:true})).toContainText('Cooperativa Exemplo');
    await expect(page.locator('body')).not.toContainText(/Bahia|Nordeste/i);
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.getByRole('region',{name:'Filtros da análise',exact:true}).evaluate(node=>node.scrollIntoView({block:'start'}));
    await page.screenshot({path:info.outputPath('new-central-filters-390.png'),fullPage:false});
    expect(workspaceWrites).toHaveLength(2);expect(writes).toEqual([]);expect(relationshipWrites).toEqual([]);expect(errors).toEqual([]);
  });
}
