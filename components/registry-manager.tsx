"use client";

import { useEffect, useMemo, useState } from "react";
import PortfolioCommunication from "@/components/portfolio-communication";
import { Building2, Check, Info, LoaderCircle, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import { MONTHS, money, paTargetForGroup } from "@/lib/analytics.mjs";
import { deleteEntity, distributeAmount, entityId as registryEntityId, getPlanRow, initializeRegistry, upsertEntity, upsertPlanRow } from "@/lib/registry.mjs";
import type { DataRow, Dataset, Metric, PlanRowInput, RegistryEntity } from "@/lib/types";
import ResponsibleManager from "@/components/responsible-manager";

type RegistryManagerProps = {
  dataset: Dataset;
  onChange: (next: Dataset) => Promise<void>;
  busy?: boolean;
};
type EntityDraft = {
  kind: RegistryEntity["kind"];
  central: string;
  cooperative: string;
  pa: string;
  name: string;
  group: string;
};
const kindLabel = { central: "Central", cooperative: "Cooperativa", pa: "PA" };
const normalizeText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const formatInput = (value: number | null | undefined) => value == null ? "" : value.toLocaleString("pt-BR", { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 });
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Não foi possível salvar. Confira os dados e tente novamente.";
const blankMonths = () => Array<string>(12).fill("");

/** Accept Brazilian currency formatting without interpreting an empty cell as zero. */
function parseAmount(value: string, label: string, allowNegative = false): number | null {
  const raw = value.trim().replace(/^R\$\s*/, "").replace(/\s/g, "");
  if (!raw) return null;
  let normalized = raw;
  if (raw.includes(",")) {
    if (!/^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(raw))
      throw new Error(`${label}: use um valor como 1.250,50, com até duas casas decimais.`);
    normalized = raw.replaceAll(".", "").replace(",", ".");
  } else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(raw)) {
    normalized = raw.replaceAll(".", "");
  } else if (!/^-?\d+(?:\.\d{1,2})?$/.test(raw)) {
    throw new Error(`${label}: informe um número com até duas casas decimais.`);
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(Math.round(amount * 100)))
    throw new Error(`${label}: o valor informado é muito alto.`);
  if (!allowNegative && amount < 0) throw new Error(`${label}: a meta não pode ser negativa.`);
  return Math.round(amount * 100) / 100;
}
function sumAmounts(values: (number | null)[]): number | null {
  return values.every((value) => value == null) ? null : values.reduce<number>((total, value) => total + Math.round((value ?? 0) * 100), 0) / 100;
}
function previewTotal(values: string[], allowNegative = false): number | null {
  try { return sumAmounts(values.map((value) => parseAmount(value, "Valor", allowNegative))); }
  catch { return null; }
}
function entityContains(parent: RegistryEntity, entity: RegistryEntity): boolean {
  if (parent.kind === "central") return parent.central === entity.central;
  if (parent.kind === "cooperative") return parent.central === entity.central && parent.cooperative === entity.cooperative;
  return parent.id === entity.id;
}
function defaultCutoff(dataset: Dataset, metric: Metric, kind: RegistryEntity["kind"]): string {
  const configured = kind === "pa" ? dataset.config.cadenceCutoff : metric === "VN" ? dataset.config.vnCutoff : dataset.config.arCutoff;
  if (configured?.startsWith(`${dataset.year}-`)) return configured.slice(0, 10);
  const today = new Date();
  return dataset.year === today.getFullYear() ? today.toISOString().slice(0, 10) : `${dataset.year}-${dataset.year < today.getFullYear() ? "12-31" : "01-31"}`;
}

export default function RegistryManager({ dataset, onChange, busy = false }: RegistryManagerProps) {
  const normalized = useMemo(() => initializeRegistry(dataset) as Dataset, [dataset]);
  const entities = normalized.registry?.entities ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(entities[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [centralFilter, setCentralFilter] = useState("all");
  const [cooperativeFilter, setCooperativeFilter] = useState("all");
  const [metric, setMetric] = useState<Metric>("VN");
  const [entityForm, setEntityForm] = useState<EntityDraft | null>(null);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [deleting, setDeleting] = useState(false);
  const [showCommunication, setShowCommunication] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const locked = busy || saving;
  const selected = entities.find((entity) => entity.id === selectedId) ?? null;
  const effectiveMetric = selected?.kind === "pa" ? "VN" : metric;
  const row = useMemo(() => selected ? getPlanRow(normalized, selected.id, effectiveMetric) as DataRow | null : null, [normalized, selected, effectiveMetric]);
  const centrals = entities.filter((entity) => entity.kind === "central");
  const cooperatives = entities.filter((entity) => entity.kind === "cooperative");
  const selectedCooperativeFilter = cooperatives.find((entity) => entity.id === cooperativeFilter);
  const visible = entities.filter((entity) =>
    (kindFilter === "all" || entity.kind === kindFilter) &&
    (centralFilter === "all" || entity.central === centralFilter) &&
    (cooperativeFilter === "all" || entity.kind !== "central" && entity.central === selectedCooperativeFilter?.central && entity.cooperative === selectedCooperativeFilter?.cooperative) &&
    normalizeText(`${entity.name} ${entity.central} ${entity.cooperative ?? ""} ${entity.pa ?? ""} ${entity.group ?? ""}`).includes(normalizeText(query)),
  ).sort((a, b) => a.central.localeCompare(b.central, "pt-BR", { numeric: true }) || (a.cooperative ?? "").localeCompare(b.cooperative ?? "", "pt-BR", { numeric: true }) || (a.pa ?? "").localeCompare(b.pa ?? "", "pt-BR", { numeric: true }));
  const descendants = selected ? entities.filter((entity) => entity.id !== selected.id && entityContains(selected, entity)) : [];
  const affectedRows = selected ? normalized.rows.filter((item) => item.central === selected.central && (selected.kind === "central" || item.cooperative === selected.cooperative) && (selected.kind !== "pa" || item.source === "cadence" && item.pa === selected.pa)).length : 0;
  const centralChildren = selected?.kind === "central" ? cooperatives.filter((entity) => entity.central === selected.central).length : 0;

  useEffect(() => {
    if (selectedId && !entities.some((entity) => entity.id === selectedId)) setSelectedId(entities[0]?.id ?? null);
  }, [entities, selectedId]);

  function clearFeedback() { setError(""); setNotice(""); }
  function selectEntity(entity: RegistryEntity) {
    setShowCommunication(false);
    setSelectedId(entity.id); setEntityForm(null); setDeleting(false); clearFeedback();
  }
  function startCreate() {
    const central = centralFilter !== "all" ? centralFilter : selected?.central ?? centrals[0]?.central ?? "";
    setEditingId(undefined);
    setEntityForm({ kind: centrals.length ? "cooperative" : "central", central, cooperative: "", pa: "", name: "", group: "" });
    setDeleting(false); clearFeedback();
  }
  function startEdit() {
    if (!selected) return;
    setEditingId(selected.id);
    setEntityForm({ kind: selected.kind, central: selected.central, cooperative: selected.cooperative ?? "", pa: selected.pa ?? "", name: selected.name, group: selected.group ?? "" });
    setDeleting(false); clearFeedback();
  }
  async function persist(next: Dataset, message: string) {
    setSaving(true); clearFeedback();
    try { await onChange(next); setNotice(message); }
    finally { setSaving(false); }
  }
  async function saveEntity(event: React.FormEvent) {
    event.preventDefault();
    if (!entityForm) return;
    clearFeedback();
    try {
      const draft = { ...entityForm, central: entityForm.central.trim(), cooperative: entityForm.cooperative.trim(), pa: entityForm.pa.trim(), name: entityForm.name.trim() };
      if (!draft.name) throw new Error("Informe o nome da unidade.");
      if (!/^\d+$/.test(draft.central)) throw new Error("Informe um código numérico para a Central.");
      if (draft.kind !== "central" && !/^\d+$/.test(draft.cooperative)) throw new Error("Informe um código numérico para a cooperativa.");
      if (draft.kind === "pa" && !/^\d+$/.test(draft.pa)) throw new Error("Informe um código numérico para o PA. Os códigos 0 e 97 são aceitos.");
      draft.central = String(Number(draft.central));
      if (draft.kind !== "central") draft.cooperative = String(Number(draft.cooperative));
      if (draft.kind === "pa") draft.pa = String(Number(draft.pa));
      const id = registryEntityId(draft);
      if (entities.some((entity) => entity.id === id && entity.id !== editingId)) throw new Error("Esta unidade já está cadastrada. Selecione-a na lista para editar.");
      const next = upsertEntity(normalized, { kind: draft.kind, central: draft.central, cooperative: draft.kind === "central" ? undefined : draft.cooperative, pa: draft.kind === "pa" ? draft.pa : undefined, name: draft.name, group: draft.kind === "pa" ? draft.group : undefined }, editingId) as Dataset;
      await persist(next, editingId ? "Cadastro atualizado. Os vínculos e acumulados foram recalculados." : "Unidade cadastrada. Preencha as metas e a produção abaixo.");
      setSelectedId(id); setEntityForm(null); setKindFilter("all"); setCentralFilter("all"); setCooperativeFilter("all"); setQuery("");
    } catch (reason) { setError(errorMessage(reason)); }
  }
  async function confirmDelete() {
    if (!selected) return;
    try {
      const next = deleteEntity(normalized, selected.id) as Dataset;
      await persist(next, "Cadastro excluído. Os acumulados do ano foram recalculados.");
      setDeleting(false); setSelectedId(null);
    } catch (reason) { setError(errorMessage(reason)); }
  }

  return <section className="registry-manager" aria-label={`Cadastro e metas de ${dataset.year}`}>
    <div className="panel-heading">
      <div><h2>Base fixa · {dataset.year}</h2><p>{centrals.length} centrais · {cooperatives.length} cooperativas · {entities.filter((entity) => entity.kind === "pa").length} PAs. As atualizações de produção preservam suas metas cadastradas.</p></div>
      <button type="button" className="button primary" onClick={startCreate} disabled={locked}><Plus size={18} /> Nova unidade</button>
    </div>
    {error && <div className="message error registry-error" role="alert"><Info size={18} /><span>{error}</span><button type="button" aria-label="Fechar erro" onClick={() => setError("")}><X size={16} /></button></div>}
    {notice && <div className="message success" role="status"><Check size={18} /><span>{notice}</span></div>}
    <div className="registry-toolbar">
      <label className="search-input"><Search size={17} /><span className="sr-only">Buscar cadastro por nome ou código</span><input type="search" placeholder="Buscar nome, código ou PA" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label>Tipo<select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}><option value="all">Todos os cadastros</option><option value="central">Centrais</option><option value="cooperative">Cooperativas</option><option value="pa">PAs</option></select></label>
      <label>Central<select value={centralFilter} onChange={(event) => { setCentralFilter(event.target.value); setCooperativeFilter("all"); }}><option value="all">Todas as centrais</option>{centrals.map((entity) => <option key={entity.id} value={entity.central}>{entity.central} · {entity.name}</option>)}</select></label>
      <label>Cooperativa<select value={cooperativeFilter} onChange={(event) => setCooperativeFilter(event.target.value)}><option value="all">Todas as cooperativas</option>{cooperatives.filter((entity) => centralFilter === "all" || entity.central === centralFilter).map((entity) => <option key={entity.id} value={entity.id}>{entity.central} / {entity.cooperative} · {entity.name}</option>)}</select></label>
    </div>
    <div className="registry-layout">
      <div className="panel">
        <div className="panel-heading"><h3>Unidades cadastradas</h3><span className="helper">{visible.length} resultados</span></div>
        <div className="registry-list" aria-label="Todas as unidades do filtro">
          {visible.map((entity) => <button key={entity.id} type="button" className={`registry-unit ${entity.id === selectedId && !entityForm ? "active" : ""}`} aria-pressed={entity.id === selectedId && !entityForm} disabled={locked} onClick={() => selectEntity(entity)}>
            <span className="section-label">{kindLabel[entity.kind]} {entity.kind === "central" ? entity.central : entity.kind === "cooperative" ? entity.cooperative : entity.pa}{entity.group ? ` · ${entity.group}` : ""}</span>
            <strong>{entity.name}</strong><small>Central {entity.central}{entity.cooperative ? ` · Cooperativa ${entity.cooperative}` : ""}</small>
          </button>)}
          {!visible.length && <div className="empty compact"><Building2 size={28} /><h3>{entities.length ? "Nenhum cadastro neste filtro" : "Cadastre sua primeira Central"}</h3><p>{entities.length ? "Ajuste os filtros ou busque outro nome ou código." : "Depois, inclua cooperativas, PAs e metas para acompanhar o ano."}</p></div>}
        </div>
      </div>
      <div className="panel">
        {entityForm ? <form className="registry-form" onSubmit={saveEntity}>
          <div className="panel-heading"><div><h3>{editingId ? "Editar cadastro" : "Nova unidade"}</h3><p>Vínculos e valores pertencem ao ano {dataset.year}.</p></div><button type="button" className="button quiet" aria-label="Cancelar cadastro" disabled={locked} onClick={() => setEntityForm(null)}><X size={18} /></button></div>
          <fieldset disabled={locked} className="registry-fieldset">
            <div className="registry-grid">
              <label>Tipo de unidade<select value={entityForm.kind} disabled={!!editingId} onChange={(event) => setEntityForm({ ...entityForm, kind: event.target.value as EntityDraft["kind"], cooperative: "", pa: "", group: "" })}><option value="central">Central</option><option value="cooperative" disabled={!centrals.length}>Cooperativa</option><option value="pa" disabled={!cooperatives.length}>PA</option></select></label>
              {entityForm.kind === "central" ? <label>Código da Central<input required inputMode="numeric" value={entityForm.central} onChange={(event) => setEntityForm({ ...entityForm, central: event.target.value })} placeholder="Ex.: 1002" /></label> : <label>Central<select required value={entityForm.central} onChange={(event) => setEntityForm({ ...entityForm, central: event.target.value, cooperative: "" })}><option value="">Selecione a Central</option>{centrals.map((entity) => <option key={entity.id} value={entity.central}>{entity.central} · {entity.name}</option>)}</select></label>}
              {entityForm.kind === "cooperative" && <label>Código da cooperativa<input required inputMode="numeric" value={entityForm.cooperative} onChange={(event) => setEntityForm({ ...entityForm, cooperative: event.target.value })} placeholder="Ex.: 3017" /></label>}
              {entityForm.kind === "pa" && <><label>Cooperativa<select required value={entityForm.cooperative} onChange={(event) => setEntityForm({ ...entityForm, cooperative: event.target.value })}><option value="">Selecione a cooperativa</option>{cooperatives.filter((entity) => entity.central === entityForm.central).map((entity) => <option key={entity.id} value={entity.cooperative}>{entity.cooperative} · {entity.name}</option>)}</select></label><label>Código do PA<input required inputMode="numeric" value={entityForm.pa} onChange={(event) => setEntityForm({ ...entityForm, pa: event.target.value })} placeholder="Ex.: 0, 1 ou 97" /></label><label>Grupo do PA<select required value={entityForm.group} onChange={(event) => setEntityForm({ ...entityForm, group: event.target.value })}><option value="">Selecione o grupo</option>{["P1", "P2", "P3", "P4", "P5"].map((group) => <option key={group} value={group}>{group}</option>)}</select></label></>}
              <label>Nome da unidade<input required value={entityForm.name} onChange={(event) => setEntityForm({ ...entityForm, name: event.target.value })} placeholder="Nome para exibir nos acompanhamentos" /></label>
            </div>
            {editingId && <p className="registry-notice"><Info size={17} /> Alterar código ou vínculo também atualiza os cadastros dependentes e os registros de produção desta unidade.</p>}
            <div className="registry-actions"><button type="button" className="button secondary" onClick={() => setEntityForm(null)}>Cancelar</button><button type="submit" className="button primary">{saving ? <LoaderCircle size={18} className="spin" /> : <Save size={18} />} Salvar cadastro</button></div>
          </fieldset>
        </form> : selected ? <>
          <div className="panel-heading"><div><span className="section-label">{kindLabel[selected.kind]} · {selected.kind === "pa" ? selected.pa : selected.kind === "cooperative" ? selected.cooperative : selected.central}</span><h3>{selected.name}</h3><p>Central {selected.central}{selected.cooperative ? ` · Cooperativa ${selected.cooperative}` : ""}{selected.group ? ` · ${selected.group}` : ""}</p></div><div className="registry-actions"><button type="button" className="button secondary" onClick={startEdit} disabled={locked}><Pencil size={16} /> Editar</button><button type="button" className="button quiet registry-danger" onClick={() => { clearFeedback(); setDeleting(true); }} disabled={locked}><Trash2 size={16} /> Excluir</button></div></div>
          <div className="registry-actions"><button type="button" className="button secondary" disabled={locked || deleting} onClick={() => setShowCommunication(true)}>Gerar e-mail / WhatsApp</button></div>
          {deleting ? <div className="registry-delete-confirm" role="alertdialog" aria-labelledby="registry-delete-title" aria-describedby="registry-delete-description">
            <h3 id="registry-delete-title">Excluir {selected.name}?</h3><p id="registry-delete-description">Serão removidos deste cadastro de {dataset.year}: esta unidade{descendants.length ? `, ${descendants.filter((entity) => entity.kind === "cooperative").length} cooperativas e ${descendants.filter((entity) => entity.kind === "pa").length} PAs vinculados` : ""}, além de {affectedRows} registros de metas e produção. Os acumulados serão recalculados. Esta alteração não pode ser desfeita nesta tela.</p><div className="registry-actions"><button type="button" className="button secondary" onClick={() => setDeleting(false)} disabled={locked}>Manter cadastro</button><button type="button" className="button registry-danger" disabled={locked} onClick={confirmDelete}><Trash2 size={17} /> Confirmar exclusão</button></div>
          </div> : <>
            <details className="registry-responsibles progressive-panel" key={`responsibles:${selected.id}:${dataset.year}`}><summary>Responsáveis e contatos</summary><ResponsibleManager key={`${selected.id}:${dataset.year}`} entity={selected} year={dataset.year} disabled={locked} /></details>
            <label className="registry-metric">Indicador<select value={effectiveMetric} disabled={locked || selected.kind === "pa"} onChange={(event) => setMetric(event.target.value as Metric)}><option value="VN">Venda Nova</option>{selected.kind !== "pa" && <option value="AR">Arrecadação</option>}</select></label>
            <PlanEditor key={`${selected.id}:${effectiveMetric}`} dataset={normalized} entity={selected} metric={effectiveMetric} row={row} busy={locked} centralChildren={centralChildren} onSave={async (input) => {
              clearFeedback();
              await persist(upsertPlanRow(normalized, { entityId: selected.id, metric: effectiveMetric, ...input }) as Dataset, "Metas e produção salvas. Todos os períodos e acumulados foram atualizados.");
            }} />
          </>}
        </> : <div className="empty compact"><Building2 size={30} /><h3>Selecione uma unidade</h3><p>Selecione à esquerda para editar metas, produção ou contatos.</p><button type="button" className="button primary" onClick={startCreate} disabled={locked}><Plus size={17} /> Nova unidade</button></div>}
      </div>
    </div>
    {showCommunication && selected && <PortfolioCommunication dataset={normalized} candidates={[selected]} initialKey={selected.id} metric={effectiveMetric} period="ytd" month={Number(defaultCutoff(normalized, effectiveMetric, selected.kind).slice(5, 7)) - 1} onClose={() => setShowCommunication(false)} />}
  </section>;
}

type PlanValues = Pick<PlanRowInput, "annualTarget" | "targets" | "actuals" | "cutoff">;
function PlanEditor({ dataset, entity, metric, row, busy, centralChildren, onSave }: {
  dataset: Dataset; entity: RegistryEntity; metric: Metric; row: DataRow | null; busy: boolean; centralChildren: number; onSave: (input: PlanValues) => Promise<void>;
}) {
  const policy = entity.kind === "pa" ? paTargetForGroup(entity.group) : null;
  const initialTargets: (number | null)[] = row?.targets ?? Array(12).fill(policy?.monthly ?? null);
  const initialAnnual: number | null = row?.annualTarget ?? (row ? null : policy?.annual ?? null);
  const [annual, setAnnual] = useState(formatInput(initialAnnual));
  const [targets, setTargets] = useState(initialTargets.map(formatInput));
  const [actuals, setActuals] = useState(row?.actuals.map(formatInput) ?? blankMonths());
  const [cutoff, setCutoff] = useState(row?.cutoff?.slice(0, 10) || defaultCutoff(dataset, metric, entity.kind));
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const currentPolicy = entity.kind === "pa" ? paTargetForGroup(entity.group) : null;
    setAnnual(formatInput(row?.annualTarget ?? (row ? null : currentPolicy?.annual)));
    setTargets((row?.targets ?? Array(12).fill(currentPolicy?.monthly ?? null)).map(formatInput));
    setActuals(row?.actuals.map(formatInput) ?? blankMonths()); setCutoff(row?.cutoff?.slice(0, 10) || defaultCutoff(dataset, metric, entity.kind)); setDirty(false); setError("");
  }, [row, dataset, entity.kind, entity.group, metric]);
  const monthlyTotal = previewTotal(targets);
  const actualTotal = previewTotal(actuals, true);
  function updateMonth(type: "targets" | "actuals", month: number, value: string) {
    setDirty(true); setError("");
    if (type === "targets") {
      const next = targets.map((old, index) => index === month ? value : old);
      setTargets(next);
      try { const values = next.map((item, index) => parseAmount(item, `Meta de ${MONTHS[index]}`)); setAnnual(formatInput(values.some((item) => item == null) ? null : sumAmounts(values))); } catch { /* Keep the annual field while the user finishes a number. */ }
    } else setActuals(actuals.map((old, index) => index === month ? value : old));
  }
  function distributeAnnual() {
    setError("");
    try {
      const value = parseAmount(annual, "Meta anual");
      if (value == null) throw new Error("Informe a meta anual para distribuí-la nos 12 meses.");
      setTargets(distributeAmount(value).map(formatInput));
      setAnnual(formatInput(value)); setDirty(true);
    } catch (reason) { setError(errorMessage(reason)); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    try {
      const parsedTargets = targets.map((value, month) => parseAmount(value, `Meta de ${MONTHS[month]}`));
      const parsedActuals = actuals.map((value, month) => parseAmount(value, `Realizado de ${MONTHS[month]}`, true));
      const parsedAnnual = parseAmount(annual, "Meta anual");
      const sumTargets = parsedTargets.some((value) => value == null) ? null : sumAmounts(parsedTargets);
      const targetsChanged = parsedTargets.some((value, month) => value !== initialTargets[month]) || parsedAnnual !== initialAnnual;
      if (targetsChanged && parsedAnnual != null && (sumTargets == null || Math.abs(parsedAnnual - sumTargets) >= 0.005)) throw new Error("A meta anual precisa corresponder à soma dos 12 meses. Clique em “Distribuir nos 12 meses” ou ajuste as metas mensais.");
      if (!cutoff || !cutoff.startsWith(`${dataset.year}-`)) throw new Error(`Informe uma data de posição dentro de ${dataset.year}.`);
      const patch: PlanValues = { cutoff };
      if (targetsChanged) { patch.targets = parsedTargets; patch.annualTarget = parsedAnnual ?? sumTargets; }
      if (parsedActuals.some((value, month) => value !== (row?.actuals[month] ?? null))) patch.actuals = parsedActuals;
      await onSave(patch); setDirty(false);
    } catch (reason) { setError(errorMessage(reason)); }
  }
  return <form className="registry-form" onSubmit={submit}>
    <fieldset disabled={busy} className="registry-fieldset">
      {entity.kind === "central" && centralChildren > 0 && <p className="registry-notice"><Info size={18} /><span>Ao salvar valores da Central, o sistema distribuirá os meses alterados entre as {centralChildren} cooperativas, pela proporção das metas atuais. Sem metas de referência, a divisão será igual. Os totais da Central serão preservados.</span></p>}
      {entity.kind === "cooperative" && <p className="helper">Os valores desta cooperativa compõem o total da Central. A cadência dos PAs tem acompanhamento próprio.</p>}
      {entity.kind === "pa" && <p className="helper">Venda Nova da cadência PA. A meta manual substitui a regra do grupo para este PA e permanece nas próximas atualizações.</p>}
      {row && <p className="helper registry-source">{entity.kind === "central" && centralChildren > 0 ? "Origem: consolidado das cooperativas cadastradas." : <>Origem: {row.sourceFile || "Cadastro manual"}{row.sheet ? ` · ${row.sheet}` : ""}{row.sourceRow > 0 ? ` · linha ${row.sourceRow}` : ""}.</>} {row.targetRule === "manual" || row.targetRule === "registry" ? "Metas do cadastro fixo." : row.targetRule === "group-fixed" ? "Meta inicial do grupo PA." : "Metas da base importada."}</p>}
      <div className="registry-grid">
        <label>Meta anual de {dataset.year} (R$)<input inputMode="decimal" value={annual} placeholder="Ex.: 12.000,00" onChange={(event) => { setAnnual(event.target.value); setDirty(true); setError(""); }} /><button type="button" className="button secondary" onClick={distributeAnnual}>Distribuir nos 12 meses</button></label>
        <label>Produção atualizada até<input type="date" required min={`${dataset.year}-01-01`} max={`${dataset.year}-12-31`} value={cutoff} onChange={(event) => { setCutoff(event.target.value); setDirty(true); }} /><span className="helper">O mês desta data determina até onde há produção apurada.</span></label>
      </div>
      <p className="helper">Informe o total de cada mês. Campo vazio significa dado não informado; zero significa resultado apurado sem produção. Ajustes negativos de realizado são aceitos.</p>
      <div className="registry-month-grid" aria-label="Metas e produção por mês">
        <div className="registry-month-heading"><span>Mês / {dataset.year}</span><span>Meta (R$)</span><span>Realizado (R$)</span></div>
        {MONTHS.map((month: string, index: number) => <div className="registry-month-row" key={month}>
          <strong>{month}</strong><label><span className="sr-only">Meta {month} {dataset.year}</span><input inputMode="decimal" value={targets[index] ?? ""} placeholder="Não informado" onChange={(event) => updateMonth("targets", index, event.target.value)} /></label><label><span className="sr-only">Realizado {month} {dataset.year}</span><input inputMode="decimal" value={actuals[index] ?? ""} placeholder="Não informado" onChange={(event) => updateMonth("actuals", index, event.target.value)} /></label>
        </div>)}
        <div className="registry-month-row registry-month-total"><strong>Total lançado</strong><strong>{money(monthlyTotal)}</strong><strong>{money(actualTotal)}</strong></div>
      </div>
      <p className="helper">Avance a data de posição antes de lançar a produção de meses posteriores. Mensal, trimestral, semestral, anual e acumulado são recalculados ao salvar.</p>
      {error && <div className="message error registry-error" role="alert"><Info size={17} /><span>{error}</span></div>}
      <div className="registry-actions"><span className="helper" role="status">{dirty ? "Alterações ainda não salvas" : row ? "Valores atuais do cadastro" : "Pronto para cadastrar os valores"}</span><button type="submit" className="button primary">{busy ? <LoaderCircle size={18} className="spin" /> : <Save size={18} />} Salvar metas e produção</button></div>
    </fieldset>
  </form>;
}