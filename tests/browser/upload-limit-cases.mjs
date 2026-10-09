import ExcelJS from 'exceljs';
import { createEmptyDataset } from '../../lib/registry.mjs';
import { money } from '../../lib/analytics.mjs';
import { sizedXlsx } from '../helpers/sized-xlsx.mjs';

export function registerUploadLimitTests({test,expect,setup,owner}) {
  test('workbook upload: an exact 40 MiB XLSX imports through the UI and persists normalized PA zero, amounts and missing months',async({page},info)=>{
    test.setTimeout(90000);
    const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Cadência');
    sheet.addRow(['GRUPO','Nº CENTRAL','CENTRAL','Nº COOP','NOME COOP','Nº PA','CPA','NOME DO PA','MÊS','ANO','REAL JAN','REAL FEV','REAL MAR','ABR','MAI','JUN','JUL','AGO']);
    sheet.addRow(['P1',3456,'Central Exemplo',6789,'Cooperativa Exemplo',0,'6789-0','PA Limite 40 MB',450,5400,-25.5,0,null,0,0,0,0,987.65]);
    const buffer=Buffer.from(await sizedXlsx(workbook,40*1024*1024));
    expect(buffer.byteLength).toBe(41943040);
    const {errors,writes,workspaceWrites,workspaceRows,relationshipWrites}=await setup(page,()=>createEmptyDataset(2026),{workspaceMissing:true});
    await expect(page.getByText('0/2 fontes selecionadas · até 40 MB por arquivo',{exact:true})).toBeVisible();
    await page.getByLabel('Cadência PA · posição em',{exact:true}).fill('2026-08-31');
    await page.getByLabel('Selecionar Cadência comercial PA',{exact:true}).setInputFiles({name:'cadencia-limite-40mb.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});
    await expect(page.getByText('1/2 fontes selecionadas · até 40 MB por arquivo',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Atualizar produção',exact:true}).click();
    await expect.poll(()=>workspaceWrites.length,{timeout:60000}).toBe(1);
    await expect(page.getByRole('region',{name:'Lista de unidades',exact:true})).toContainText('PA Limite 40 MB');
    expect(workspaceWrites[0]).toMatchObject({method:'POST',payload:{owner_id:owner,year:2026,revision:1}});
    const saved=workspaceRows[0].dataset,rows=saved.rows.filter(row=>row.source==='cadence');
    expect(saved.registry.entities.map(entity=>entity.id).sort()).toEqual(['central:3456','cooperative:3456:6789','pa:3456:6789:0']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({central:'3456',cooperative:'6789',pa:'0',name:'PA Limite 40 MB',metric:'VN',group:'P1',annualTarget:5400,cutoff:'2026-08-31'});
    expect(rows[0].targets).toEqual(Array(12).fill(450));
    expect(rows[0].actuals).toEqual([-25.5,0,null,0,0,0,0,987.65,null,null,null,null]);
    // A reload must recover the saved normalization, not just the in-memory import.
    await page.reload();
    await page.getByRole('navigation',{name:'Navegação principal',exact:true}).getByRole('button',{name:'Cadência dos PAs',exact:true}).click();
    await page.getByRole('combobox',{name:'Período',exact:true}).selectOption('month');
    await page.getByRole('combobox',{name:'Mês de referência',exact:true}).selectOption('7');
    const list=page.getByRole('region',{name:'Lista de unidades',exact:true});
    const row=list.locator('tbody tr.unit-result-row');
    await expect(row).toHaveCount(1);await expect(row).toContainText('PA Limite 40 MB');
    await expect(row.locator('[data-field="target"]')).toContainText(money(450));
    await expect(row.locator('[data-field="actual"]')).toContainText(money(987.65));
    await list.screenshot({path:info.outputPath('uploaded-40mb-persisted-result.png')});
    expect(workspaceWrites).toHaveLength(1);expect(writes).toEqual([]);expect(relationshipWrites).toEqual([]);expect(errors).toEqual([]);
  });
}
