export async function openIndividualCommunication(page, format = 'E-mail') {
  await page.getByRole('button', { name: /^Gerar comunicação de / }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Comunicar resultado', exact: true });
  await dialog.waitFor({ state: 'visible' });
  if (format === 'Painel resumido') await step(dialog, 2);
  return dialog;
}

export async function step(dialog, number) {
  await dialog.getByRole('navigation', { name: 'Etapas da comunicação' }).locator('button').nth(number - 1).click();
}
export async function disclosure(dialog, label) {
  const summary = dialog.locator('summary').filter({ hasText: label }).first();
  if (!await summary.evaluate(node => node.parentElement.open)) await summary.click();
}
export async function customize(dialog) { await step(dialog, 1); await disclosure(dialog, 'Editar textos e modelos avançados'); }
export async function emailDelivery(dialog) {
  await step(dialog, 3); await dialog.getByRole('radio', { name: 'E-mail', exact: true }).check();
  await disclosure(dialog, 'Outras opções de e-mail');
}
export async function whatsappDelivery(dialog) {
  await step(dialog, 3); await dialog.getByRole('radio', { name: 'WhatsApp', exact: true }).check();
  await disclosure(dialog, 'Enviar somente texto');
}
