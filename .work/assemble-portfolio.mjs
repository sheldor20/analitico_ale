// One-use integration script, removed before merge. Fails closed on source drift.
import { readFile, writeFile } from 'node:fs/promises';
function once(text, from, to) {
  if (text.split(from).length !== 2) throw new Error(`Expected exactly one integration anchor: ${from.slice(0,100)}`);
  return text.replace(from, to);
}
let dashboard = await readFile('components/dashboard.tsx', 'utf8');
if (!dashboard.includes('import PortfolioCommunication')) {
  dashboard = once(dashboard, 'import RegistryManager from "@/components/registry-manager";', 'import RegistryManager from "@/components/registry-manager";\nimport PortfolioCommunication from "@/components/portfolio-communication";\nimport { entityFromAnalysis } from "@/lib/portfolio-communication.mjs";');
  dashboard = once(dashboard, '  const effectiveSource = view === "cadence" ? "cadence" : source;', '  const [communicationInitialKey, setCommunicationInitialKey] = useState("");\n  const effectiveSource = view === "cadence" ? "cadence" : source;');
  const oldButton = `                {communicationDraft && (
                  <button
                    className="button primary"
                    onClick={() => setShowCommunication(true)}
                  >
                    <MessageSquareText size={17} />
                    {communicationDraft.isPartial
                      ? "Comunicação parcial"
                      : "Comunicação do período"}
                  </button>
                )}`;
  dashboard = once(dashboard, oldButton, `                {displayed.length > 0 && (
                  <button className="button primary" onClick={() => { setCommunicationInitialKey(""); setShowCommunication(true); }}>
                    <MessageSquareText size={17} /> Gerar e-mail / WhatsApp
                  </button>
                )}`);
  const oldModal = `      {showCommunication && communicationDraft && (
        <CommunicationModal
          key={\`${'${communicationDraft.subject}:${communicationDraft.body.length}'}\`}
          draft={communicationDraft}
          onClose={() => setShowCommunication(false)}
        />
      )}`;
  dashboard = once(dashboard, oldModal, `      {showCommunication && dataset && displayed.length > 0 && (
        <PortfolioCommunication dataset={dataset} candidates={displayed.map(entityFromAnalysis)} initialKey={communicationInitialKey}
          metric={effectiveMetric as "VN" | "AR"} period={period} month={month} uplift={uplift}
          onClose={() => setShowCommunication(false)} />
      )}`);
  const detailButton = `                                      <button
                                        className="icon-button"
                                        aria-label={\`Detalhar ${'${r.name}'}\`}`;
  dashboard = once(dashboard, detailButton, `                                      <button type="button" className="icon-button" aria-label={\`Gerar comunicação de ${'${r.name}'}\`} title="Gerar e-mail / WhatsApp"
                                        onClick={() => { setCommunicationInitialKey(entityFromAnalysis(r).id); setShowCommunication(true); }}><Mail size={18} /></button>
${detailButton}`);
  const first = dashboard.indexOf('function CommunicationModal({');
  const last = dashboard.indexOf('function Kpi({', first);
  if (first < 0 || last < first) throw new Error('Old modal anchors missing');
  dashboard = dashboard.slice(0, first) + dashboard.slice(last);
  await writeFile('components/dashboard.tsx', dashboard);
}
let registry = await readFile('components/registry-manager.tsx', 'utf8');
if (!registry.includes('import PortfolioCommunication')) {
  registry = once(registry, 'import { useEffect, useMemo, useState } from "react";', 'import { useEffect, useMemo, useState } from "react";\nimport PortfolioCommunication from "@/components/portfolio-communication";');
  registry = once(registry, '  const [deleting, setDeleting] = useState(false);', '  const [deleting, setDeleting] = useState(false);\n  const [showCommunication, setShowCommunication] = useState(false);');
  registry = once(registry, '  function selectEntity(entity: RegistryEntity) {', '  function selectEntity(entity: RegistryEntity) {\n    setShowCommunication(false);');
  registry = once(registry, '          {deleting ? <div', '          <div className="registry-actions"><button type="button" className="button secondary" disabled={locked || deleting} onClick={() => setShowCommunication(true)}>Gerar e-mail / WhatsApp</button></div>\n          {deleting ? <div');
  registry = once(registry, '  </section>;\n}', `    {showCommunication && selected && <PortfolioCommunication dataset={normalized} candidates={[selected]} initialKey={selected.id} metric={effectiveMetric} period="ytd" month={Number(defaultCutoff(normalized, effectiveMetric, selected.kind).slice(5, 7)) - 1} onClose={() => setShowCommunication(false)} />}
  </section>;
}`);
  await writeFile('components/registry-manager.tsx', registry);
}
console.log('Dashboard and fixed registry integration completed; exact anchors verified.');
