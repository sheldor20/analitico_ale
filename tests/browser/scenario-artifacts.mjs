// A full iframe screenshot inside the scrolling modal can include the page behind it.
// Render the exact preview document in a temporary, network-blocked page for the artifact.
export async function captureScenarioDocument(page, frame, path) {
  const document = await frame.locator('html').evaluate(node => ({ html: node.outerHTML, width: node.ownerDocument.defaultView.innerWidth }));
  const preview = await page.context().newPage();
  try {
    await preview.route('**/*', route => route.abort());
    await preview.setViewportSize({ width: document.width, height: 844 });
    await preview.setContent(document.html);
    await preview.screenshot({ path, fullPage: true });
  } finally { await preview.close(); }
}
