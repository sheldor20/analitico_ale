"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CloudUpload,
  Copy,
  Download,
  FileSpreadsheet,
  Flag,
  History,
  Info,
  LayoutDashboard,
  LoaderCircle,
  LogIn,
  LogOut,
  Mail,
  MessageSquareText,
  Search,
  ShieldCheck,
  Target,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import {
  analyze,
  aggregate,
  summarize,
  actionFor,
  MONTHS,
  CENTRALS,
  PA_GROUP_TARGETS,
  paTargetForGroup,
  money,
  percent,
  sum,
} from "@/lib/analytics.mjs";
import { buildPartialCommunication, buildDecisionInsights } from "@/lib/communication.mjs";
import RegistryManager from "@/components/registry-manager";
import PortfolioCommunication from "@/components/portfolio-communication";
import { entityFromAnalysis } from "@/lib/portfolio-communication.mjs";
import { initializeRegistry, createEmptyDataset, mergeProduction, analysisRows } from "@/lib/registry.mjs";
import { listWorkspaces, loadWorkspace, saveWorkspace } from "@/lib/workspace-store";
import { supabase } from "@/lib/supabase";
import { sortAnalysis, SORT_OPTIONS } from "@/lib/scenarios.mjs";
import { NetworkSummary, PaTable, YearComparison } from "@/components/scenario-panels";
import type { ActionState, DataRow, Dataset, ImportConfig } from "@/lib/types";

type View = "overview" | "cadence" | "actions" | "audit" | "imports" | "registry";
type Analysis = ReturnType<typeof analyze>;
type SourceFiles = { base: File | null; cadence: File | null };
const EMPTY_ACTION: ActionState = {
  owner: "",
  due: "",
  status: "Aberta",
  notes: "",
};
const periodNames: Record<string, string> = {
  daily: "Diário · esforço",
  month: "Mensal",
  quarter: "Trimestral",
  semester: "Semestral",
  annual: "Anual",
  ytd: "Acumulado no ano",
};
const metricName = (metric: string) =>
  metric === "VN" ? "Venda Nova" : "Arrecadação";
const centralName = (central: string) =>
  Object.entries(CENTRALS).find(([id]) => id === central)?.[1] ??
  `Central ${central}`;
const shortDate = (value: string) =>
  new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR");
const tone = (status: string) =>
  ["Em rota", "Meta atingida", "Concluída"].includes(status)
    ? "positive"
    : ["Atenção", "Prazo encerrado"].includes(status)
      ? "warning"
      : "neutral";
function Pill({ children }: { children: string }) {
  return <span className={`pill ${tone(children)}`}>{children}</span>;
}

export default function Dashboard() {
  const [dataset, setDataset] = useState<Dataset | null>(null),
    [datasetId, setDatasetId] = useState<string | null>(null);
  const [view, setView] = useState<View>("overview"),
    [source, setSource] = useState<"base" | "cadence">("base");
  const [metric, setMetric] = useState("VN"),
    [central, setCentral] = useState("all"),
    [coop, setCoop] = useState("all"),
    [group, setGroup] = useState("all");
  const [period, setPeriod] = useState("ytd"),
    [month, setMonth] = useState(new Date().getMonth()),
    [level, setLevel] = useState("cooperative"),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0);
  const [workspaceRevision, setWorkspaceRevision] = useState<number | null>(null);
  const [workspaces, setWorkspaces] = useState<{id:string;year:number;revision:number;updatedAt:string}[]>([]);
  const [historical, setHistorical] = useState(false);
  const [importMode, setImportMode] = useState("production");
  const [sortBy, setSortBy] = useState("gap");
  const [requestedYear, setRequestedYear] = useState(new Date().getFullYear() - 1);
  const [statusFilter, setStatusFilter] = useState("all");
  const activeOwner = useRef<string | null>(null);
  const sessionYears = useRef(new Map<number,Dataset>());
  const [uplift, setUplift] = useState(0),
    [selected, setSelected] = useState<Analysis | null>(null),
    [showImport, setShowImport] = useState(false),
    [showLogin, setShowLogin] = useState(false),
    [showCommunication, setShowCommunication] = useState(false);
  const [user, setUser] = useState<User | null>(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [history, setHistory] = useState<
      {
        id: string;
        created_at: string;
        title: string;
        year: number;
        source_count: number;
        has_cooperative_base: boolean;
        has_pa_cadence: boolean;
      }[]
    >([]),
    [actions, setActions] = useState<Record<string, ActionState>>({});
  const [files, setFiles] = useState<SourceFiles>({
      base: null,
      cadence: null,
    }),
    [config, setConfig] = useState<ImportConfig>({
      year: new Date().getFullYear(),
      vnCutoff: "",
      arCutoff: "",
      cadenceCutoff: "",
    });
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [communicationInitialKey, setCommunicationInitialKey] = useState("");
  const effectiveSource = view === "cadence" ? "cadence" : source;
  const effectiveMetric = effectiveSource === "cadence" ? "VN" : metric;
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const nextId = session?.user.id ?? null;
      if (event === "SIGNED_OUT" || (activeOwner.current && activeOwner.current !== nextId)) {
        setDataset(null); setDatasetId(null); setSelected(null); setActions({});
        setFiles({base:null,cadence:null}); setWorkspaceRevision(null); setWorkspaces([]);
        setHistorical(false); sessionYears.current.clear();
      }
      activeOwner.current = nextId;
      setUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!user || !supabase) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("commercial_imports")
      .select(
        "id,created_at,title,year,source_count,has_cooperative_base,has_pa_cadence",
      )
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(25)
      .then(({ data, error }) => {
        if (cancelled || activeOwner.current !== user.id) return;
        if (error)
          setError(
            "Não foi possível consultar o histórico. Verifique a configuração do banco.",
          );
        else setHistory(data ?? []);
      });
    return () => { cancelled = true; };
  }, [user, datasetId]);
  useEffect(() => {
    setPage(0);
  }, [
    view,
    source,
    metric,
    central,
    coop,
    group,
    period,
    month,
    search,
    level,
  ]);
  useEffect(() => {
    if (!selected && !showImport && !showLogin && !showCommunication) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        setShowImport(false);
        setShowLogin(false);
        setShowCommunication(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, showImport, showLogin, showCommunication]);
  useEffect(() => {
    activeOwner.current = user?.id ?? null;
    let cancelled = false;
    if (!user) { setWorkspaces([]); return; }
    setBusy("Recuperando seu cadastro fixo…");
    listWorkspaces(user.id).then(async (items) => {
      if (cancelled) return;
      setWorkspaces(items);
      if (!items.length || dataset) return;
      const saved = await loadWorkspace(user.id, items[0].year);
      if (saved && !cancelled) {
        setDataset(initializeRegistry(saved.dataset));
        setWorkspaceRevision(saved.revision);
        setConfig(initializeRegistry(saved.dataset).config);
        setHistorical(false);
        setNotice("Cadastro fixo recuperado. As alterações serão salvas automaticamente.");
      }
    }).catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setBusy(""); });
    return () => { cancelled = true; };
  }, [user?.id]);
  const centralOptions = useMemo(() => {
    const names = new Map<string,string>();
    dataset?.registry?.entities.filter((e) => e.kind === "central").forEach((e) => names.set(e.central,e.name));
    dataset?.rows.forEach((r) => { if (!names.has(r.central)) names.set(r.central,centralName(r.central)); });
    return [...names.entries()].sort((a,b) => a[1].localeCompare(b[1]));
  }, [dataset]);
  const sourceRows = useMemo(
    () =>
      (dataset ? analysisRows(dataset) : []).filter(
        (r) => r.source === effectiveSource && r.metric === effectiveMetric,
      ),
    [dataset, effectiveSource, effectiveMetric],
  );
  const cooperatives = useMemo(
    () =>
      [
        ...new Map(
          sourceRows
            .filter((r) => central === "all" || r.central === central)
            .filter((r) => r.cooperative)
            .map((r) => [`${r.central}:${r.cooperative}`, `${r.cooperative} · ${r.cooperativeName}`]),
        ).entries(),
      ].sort((a, b) => a[1].localeCompare(b[1])),
    [sourceRows, central],
  );
  const groups = [...new Set(sourceRows.map((r) => r.group))].sort();
  const filtered = useMemo(
    () =>
      sourceRows.filter(
        (r) =>
          (central === "all" || r.central === central) &&
          (coop === "all" || `${r.central}:${r.cooperative}` === coop) &&
          (group === "all" || r.group === group),
      ),
    [sourceRows, central, coop, group],
  );
  const options = { year: dataset?.year ?? config.year, month, period, uplift };
  const actualLevel =
    effectiveSource === "cadence"
      ? "pa"
      : view === "actions"
        ? "cooperative"
        : level;
  const analyses = useMemo(
    () =>
      aggregate(filtered, actualLevel)
        .map((r) =>
          analyze(r, {
            year: dataset?.year ?? config.year,
            month,
            period,
            uplift,
          }),
        )
        .sort(
          (a, b) =>
            (b.projectionGap ?? b.gap ?? -1) - (a.projectionGap ?? a.gap ?? -1),
        ),
    [filtered, actualLevel, dataset, config.year, month, period, uplift],
  );
  const summary = summarize(analyses);
  const leafSummary = useMemo(
    () =>
      summarize(
        filtered.map((r) =>
          analyze(r, {
            year: dataset?.year ?? config.year,
            month,
            period,
            uplift,
          }),
        ),
      ),
    [filtered, dataset, config.year, month, period, uplift],
  );
  const displayed = sortAnalysis(analyses.filter((r) =>
    `${r.name} ${r.cooperative} ${r.pa ?? ""}`.toLowerCase().includes(search.toLowerCase()) &&
    (statusFilter === "all" || (statusFilter === "attention" ? ["Atenção", "Prazo encerrado"].includes(r.status) :
      statusFilter === "missing" ? !r.complete || r.status === "Sem meta" : ["Em rota", "Meta atingida"].includes(r.status))),
  ), sortBy);
  const scenarioFilters = { central, coop, source: effectiveSource, metric: effectiveMetric, group, level: actualLevel, period, month, uplift, sortBy, search, status: statusFilter };
  const insights = buildDecisionInsights(analyses);
  const cutoffs = [...new Set(filtered.map((r) => r.cutoff))].sort();
  const cutoff = cutoffs[0];
  const selectedFileCount = Number(!!files.base) + Number(!!files.cadence);
  const scopeLabel = useMemo(() => {
    const labels = [];
    if (central !== "all") labels.push(centralOptions.find(([id])=>id===central)?.[1] ?? centralName(central));
    if (coop !== "all") {
      const selectedCoop = cooperatives.find(([id]) => id === coop);
      labels.push(
        selectedCoop ? selectedCoop[1] : `Cooperativa ${coop}`,
      );
    }
    if (group !== "all") labels.push(`Grupo ${group}`);
    return labels.length ? labels.join(" · ") : "Todas as centrais da seleção";
  }, [central, coop, group, cooperatives, centralOptions]);
  const communicationDraft = useMemo(() => {
    if (
      period === "daily" ||
      !cutoff ||
      !analyses.length
    )
      return null;
    return buildPartialCommunication({
      analyses,
      source: effectiveSource,
      metric: effectiveMetric,
      year: dataset?.year ?? config.year,
      month,
      periodLabel: periodNames[period],
      scopeLabel,
      cutoff,
      group,
      uplift,
    });
  }, [
    effectiveSource,
    effectiveMetric,
    cutoff,
    analyses,
    dataset,
    config.year,
    month,
    period,
    scopeLabel,
    group,
    uplift,
  ]);
  const audits = (dataset?.issues ?? []).filter(
    (i) =>
      (central === "all" || !i.central || i.central === central) &&
      (coop === "all" || !i.cooperative || `${i.central}:${i.cooperative}` === coop),
  );
  function navigate(next: View) {
    if (next === "registry" && !dataset) setDataset(createEmptyDataset(config.year));
    setView(next);
    setSearch("");
    if (next === "cadence") {
      setSource("cadence");
      setMetric("VN");
      setGroup("all");
    }
    if (next === "overview") {
      setSource("base");
      setGroup("all");
    }
  }
  function resetFilters() {
    setCentral("all");
    setCoop("all");
    setGroup("all");
    setSearch("");
    setUplift(0);
    setStatusFilter("all");
  }
  function refreshWorkspaces(owner: string) {
    void listWorkspaces(owner).then((items) => { if (activeOwner.current === owner) setWorkspaces(items); }).catch(() => {});
  }
  async function openWorkspace(year: number) {
    if (!Number.isInteger(year) || year < 2020 || year > 2100) { setError("Informe um ano entre 2020 e 2100."); return; }
    setBusy("Abrindo cadastro anual…"); setError("");
    const owner = user?.id ?? null;
    if (dataset && !historical) sessionYears.current.set(dataset.year, dataset);
    try {
      const saved = user ? await loadWorkspace(user.id, year) : null;
      if (activeOwner.current !== owner) return;
      const next = saved ? initializeRegistry(saved.dataset) : sessionYears.current.get(year) ?? createEmptyDataset(year);
      setDataset(next); setWorkspaceRevision(saved?.revision ?? null); setConfig(next.config);
      setHistorical(false); setDatasetId(null); setSelected(null); setActions({}); resetFilters();
      setNotice(saved ? "Cadastro anual recuperado." : "Novo cadastro anual. Inclua as unidades ou importe a base fixa.");
    } catch(e) { setError(e instanceof Error ? e.message : "Não foi possível abrir o cadastro."); }
    finally { setBusy(""); }
  }
  async function changeRegistry(next: Dataset) {
    if (historical) throw new Error("Retome o cadastro atual antes de editar uma análise histórica.");
    setBusy("Salvando cadastro e recalculando indicadores…"); setError("");
    try {
      if (user) {
        const saved = await saveWorkspace(user.id, next, workspaceRevision);
        if (activeOwner.current !== user.id) return;
        setWorkspaceRevision(saved.revision);
      }
      sessionYears.current.set(next.year, next);
      setDataset(next); setConfig(next.config); setDatasetId(null); setSelected(null);
      if (user) refreshWorkspaces(user.id);
      setNotice(user ? "Cadastro salvo. Metas, acumulados e indicadores recalculados." : "Cadastro atualizado nesta sessão. Entre e salve para retomar depois.");
    } finally { setBusy(""); }
  }
  async function importFiles() {
    setError("");
    setNotice("");
    const selectedFiles = (Object.entries(files) as [keyof SourceFiles, File | null][])
      .filter((item): item is [keyof SourceFiles, File] => Boolean(item[1]));
    if (!selectedFiles.length) {
      setError(
        "Selecione a base de cooperativas, a cadência PA ou os dois arquivos.",
      );
      return;
    }
    setBusy("Lendo as planilhas e conferindo os valores…");
    try {
      const { parseWorkbook, combineImports } = await import(
        "@/lib/importer.mjs"
      );
      if (dataset && !historical) sessionYears.current.set(dataset.year, dataset);
      let current = !historical && dataset?.year === config.year ? dataset : sessionYears.current.get(config.year) ?? null;
      let revision = !historical && dataset?.year === config.year ? workspaceRevision : null;
      if (user && (!current || revision === null)) {
        const saved = await loadWorkspace(user.id, config.year);
        if (saved) { current = initializeRegistry(saved.dataset); revision = saved.revision; }
      }
      const allowedCentrals = [...new Set(["1002", "2007", ...(current?.registry?.entities.filter((e) => e.kind === "central").map((e) => e.central) ?? [])])];
      const parts = [];
      for (const [expectedSource, file] of selectedFiles) {
        if (file.size > 10 * 1024 * 1024) throw new Error("Cada arquivo pode ter até 10 MB.");
        const parsed = await parseWorkbook(
          await file.arrayBuffer(),
          file.name,
          { ...config, allowedCentrals,
            ...(importMode === "fixed" ? { vnCutoff: `${config.year}-01-01`, arCutoff: `${config.year}-01-01`, cadenceCutoff: `${config.year}-01-01` } : {}) },
        );
        if (parsed.source !== expectedSource)
          throw new Error(
            expectedSource === "base"
              ? "O arquivo selecionado em Cooperativas/Centrais tem layout de Cadência PA. Troque os arquivos de campo."
              : "O arquivo selecionado em Cadência PA tem layout de Cooperativas/Centrais. Troque os arquivos de campo.",
          );
        parts.push(parsed);
      }
      let incoming = combineImports(parts, config) as Dataset;
      if (importMode === "fixed") incoming = { ...incoming, rows: incoming.rows.map((r) => ({ ...r, actuals: Array(12).fill(null) })) };
      const data = mergeProduction(current, incoming, { goalsOnly: importMode === "fixed" });
      if (user) {
        const saved = await saveWorkspace(user.id, data, revision);
        if (activeOwner.current !== user.id) return;
        setWorkspaceRevision(saved.revision);
      } else setWorkspaceRevision(null);
      sessionYears.current.set(data.year, data);
      setDataset(data);
      setConfig(data.config);
      if (user) refreshWorkspaces(user.id);
      setHistorical(false);
      setDatasetId(null);
      setSelected(null);
      resetFilters();
      const hasBase = data.rows.some((r) => r.source === "base");
      setSource(hasBase ? "base" : "cadence");
      setView(hasBase ? "overview" : "cadence");
      setMonth(
        Math.max(...data.rows.map((r) => new Date(r.cutoff).getUTCMonth())),
      );
      setShowImport(false);
      setNotice(
        `${incoming.rows.length} registros recebidos · ${data.rows.length} no cadastro anual. Metas fixas e meses ausentes preservados. ${user ? "Atualização salva automaticamente." : "Entre para salvar e retomar depois."}`,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível importar os arquivos.",
      );
    } finally {
      setBusy("");
    }
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy("Entrando…");
    setError("");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy("");
    if (error) setError("Não foi possível entrar. Confira o e-mail e a senha.");
    else {
      setShowLogin(false);
      setPassword("");
    }
  }
  async function logout() {
    if (supabase) await supabase.auth.signOut();
    activeOwner.current = null;
    setUser(null);
    setDataset(null);
    setWorkspaceRevision(null);
    setHistorical(false);
    setWorkspaces([]);
    setDatasetId(null);
    setActions({});
    setFiles({ base: null, cadence: null });
    setNotice("Sessão encerrada.");
  }
  async function saveDataset() {
    if (!dataset || !supabase || !user) {
      setShowLogin(true);
      return;
    }
    setBusy("Salvando a análise…");
    setError("");
    try {
      if (!historical) {
        const saved = await saveWorkspace(user.id, dataset, workspaceRevision);
        if (activeOwner.current !== user.id) return;
        setWorkspaceRevision(saved.revision);
        refreshWorkspaces(user.id);
      }
      if (!dataset.rows.length) { setNotice("Cadastro anual salvo."); return; }
      const normalized = JSON.stringify({
        version: dataset.version,
        year: dataset.year,
        config: dataset.config,
        paTargetPolicy: dataset.paTargetPolicy,
        rows: dataset.rows,
        registry: dataset.registry,
        sources: dataset.sources,
      });
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(normalized),
      );
      const fingerprint = Array.from(new Uint8Array(bytes))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const { data: existing, error: findError } = await supabase
        .from("commercial_imports")
        .select("id")
        .eq("fingerprint", fingerprint)
        .maybeSingle();
      if (findError) throw findError;
      let savedId = existing?.id;
      if (!savedId) {
        const { data, error } = await supabase
          .from("commercial_imports")
          .insert({
            owner_id: user.id,
            title: `${dataset.year} · ${dataset.sources.map((s) => (s.type === "base" ? "Cooperativas" : "Cadência PA")).join(" + ")}`,
            year: dataset.year,
            fingerprint,
            dataset,
          })
          .select("id")
          .single();
        if (error) throw error;
        savedId = data.id;
      }
      if (Object.keys(actions).length) {
        const { error } = await supabase.from("commercial_actions").upsert(
          Object.entries(actions).map(([entity_key, a]) => ({
            owner_id: user.id,
            import_id: savedId,
            entity_key,
            owner_name: a.owner,
            due_date: a.due || null,
            status: a.status,
            notes: a.notes,
          })),
          { onConflict: "import_id,entity_key" },
        );
        if (error) throw error;
      }
      const { data: tasks, error: taskError } = await supabase
        .from("commercial_actions")
        .select("entity_key,owner_name,due_date,status,notes")
        .eq("import_id", savedId);
      if (taskError) throw taskError;
      if (activeOwner.current !== user?.id) return;
      setActions(
        Object.fromEntries(
          (tasks ?? []).map((t) => [
            t.entity_key,
            {
              owner: t.owner_name ?? "",
              due: t.due_date ?? "",
              status: t.status,
              notes: t.notes ?? "",
            },
          ]),
        ),
      );
      setDatasetId(savedId);
      setNotice(
        existing
          ? "Esta análise já estava salva. O plano foi recuperado e as alterações foram guardadas."
          : "Análise e plano de ação salvos. Retome em Importações.",
      );
    } catch {
      setError(
        "Não foi possível salvar. A análise continua aberta; confira a conexão e a configuração do banco.",
      );
    } finally {
      setBusy("");
    }
  }
  async function loadDataset(id: string) {
    if (!supabase) return;
    setBusy("Abrindo a análise…");
    setError("");
    try {
      const { data, error } = await supabase
        .from("commercial_imports")
        .select("dataset")
        .eq("id", id)
        .single();
      if (error) throw error;
      const d = data.dataset as Dataset;
      if (![1, 2].includes(d.version) || !Array.isArray(d.rows))
        throw new Error("Formato inválido");
      const { data: tasks, error: taskError } = await supabase
        .from("commercial_actions")
        .select("entity_key,owner_name,due_date,status,notes")
        .eq("import_id", id);
      if (taskError) throw taskError;
      if (activeOwner.current !== user?.id) return;
      setActions(
        Object.fromEntries(
          (tasks ?? []).map((t) => [
            t.entity_key,
            {
              owner: t.owner_name ?? "",
              due: t.due_date ?? "",
              status: t.status,
              notes: t.notes ?? "",
            },
          ]),
        ),
      );
      setDataset(initializeRegistry(d));
      setHistorical(true);
      setDatasetId(id);
      setConfig(initializeRegistry(d).config);
      setFiles({ base: null, cadence: null });
      resetFilters();
      setMonth(
        Math.max(...d.rows.map((r) => new Date(r.cutoff).getUTCMonth())),
      );
      navigate(
        d.rows.some((r) => r.source === "base") ? "overview" : "cadence",
      );
      setNotice("Versão histórica aberta. Retome o cadastro atual para editar ou atualizar produção.");
    } catch {
      setError("Não foi possível abrir esta análise.");
    } finally {
      setBusy("");
    }
  }
  async function saveAction(row: Analysis) {
    if (!supabase || !user || !datasetId) {
      setNotice(
        "As alterações estão nesta sessão. Salve a análise e entre na conta para guardar o plano.",
      );
      return;
    }
    setBusy("Salvando ação…");
    setError("");
    const state = actions[row.key] ?? EMPTY_ACTION;
    const { error } = await supabase
      .from("commercial_actions")
      .upsert(
        {
          owner_id: user.id,
          import_id: datasetId,
          entity_key: row.key,
          owner_name: state.owner,
          due_date: state.due || null,
          status: state.status,
          notes: state.notes,
        },
        { onConflict: "import_id,entity_key" },
      );
    setBusy("");
    if (error) setError("Não foi possível salvar a ação.");
    else setNotice("Ação salva.");
  }
  function exportCsv() {
    const safe = (v: unknown) => {
      let s =
        typeof v === "number" && Number.isFinite(v)
          ? v.toLocaleString("pt-BR", {
              useGrouping: false,
              maximumFractionDigits: 12,
            })
          : String(v ?? "");
      if (typeof v !== "number" && /^[=+@\-\t\r]/.test(s)) s = `'${s}`;
      return `"${s.replaceAll('"', '""')}"`;
    };
    const records = [
      [
        "Fonte",
        "Métrica",
        "Central",
        "Cooperativa",
        "PA",
        "Grupo PA",
        "Meta mensal PA cadastrada",
        "Meta anual PA cadastrada",
        "Nome",
        "Período",
        "Mês",
        "Corte",
        "Meta",
        "Realizado",
        "Atingimento",
        "Projeção",
        "GAP projetado",
        "Necessário/dia útil",
        "Status",
        "Ação",
      ],
      ...displayed.map((r) => [
        effectiveSource,
        metricName(effectiveMetric),
        r.central,
        r.cooperative,
        r.pa,
        r.source === "cadence" ? r.group : "",
        r.source === "cadence" ? r.targets[month] : "",
        r.source === "cadence" ? r.annualTarget : "",
        r.name,
        periodNames[period],
        MONTHS[month],
        r.cutoff,
        r.target,
        r.actual,
        r.attainment,
        r.projected,
        r.projectionGap,
        r.requiredDaily,
        r.status,
        actionFor(r).text,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + records.map((r) => r.map(safe).join(";")).join("\r\n")],
        { type: "text/csv;charset=utf-8;" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `analitico-${effectiveSource}-${dataset?.year}-${month + 1}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const importPanel = (
    <>
      <div className="section-label">
        <FileSpreadsheet size={19} /> IMPORTAR PLANILHAS
      </div>
      <h2>Transforme a base em decisões.</h2>
      <p className="muted">
        Cadastre as unidades e metas uma vez. Nos próximos envios, atualize a produção mantendo seu planejamento anual.
      </p>
      <label className="import-mode">Objetivo deste envio
        <select value={importMode} onChange={(e) => { setImportMode(e.target.value); if (e.target.value === "history") { const year = (dataset?.year ?? new Date().getFullYear()) - 1; setConfig({ ...config, year, vnCutoff: `${year}-12-31`, arCutoff: `${year}-12-31`, cadenceCutoff: `${year}-12-31`, paTargetMode: "source" }); } }}>
          <option value="production">Atualizar produção · preservar metas cadastradas</option>
          <option value="fixed">Cadastrar base fixa · unidades e metas</option>
          <option value="history">Base e produção de outro ano · comparativo histórico</option>
        </select>
      </label>
      {importMode === "history" && <p className="helper">As metas, a produção e as unidades serão guardadas somente no ano informado. Confirme os cortes; não use 31/12 se a base ainda for parcial. Novas cooperativas e PAs não serão incluídos retroativamente em outros anos.</p>}
      <label className="import-mode">Metas PA deste ano<select value={config.paTargetMode ?? (config.year < 2026 ? "source" : "group")} onChange={event => setConfig({ ...config, paTargetMode: event.target.value as "source" | "group" })}><option value="source">Metas da planilha · preservar histórico</option><option value="group">Regra fixa P1–P5 (2026)</option></select></label>
      <div className="source-upload-grid">
        <FileSlot
          id="base-file"
          title="Cooperativas e centrais"
          description="Metas e realizados de Venda Nova e Arrecadação"
          file={files.base}
          onSelect={(file) => {
            setFiles((current) => ({ ...current, base: file }));
            setError("");
          }}
          onRemove={() => setFiles((current) => ({ ...current, base: null }))}
        />
        <FileSlot
          id="cadence-file"
          title="Cadência comercial PA"
          description="PAs, grupos P1–P5 e realizados mensais"
          file={files.cadence}
          onSelect={(file) => {
            setFiles((current) => ({ ...current, cadence: file }));
            setError("");
          }}
          onRemove={() =>
            setFiles((current) => ({ ...current, cadence: null }))
          }
        />
      </div>
      <p className="upload-count">
        {selectedFileCount}/2 fontes selecionadas · até 10 MB por arquivo
      </p>
      <div className="import-guidance">
        <Info size={18} />
        <span>
          {importMode === "fixed" ? "Este envio cadastra as unidades e metas; os realizados serão enviados depois. Cadastros já existentes são preservados." : "Confirme a posição de cada fonte. Valores enviados substituem a produção mensal correspondente; meses vazios e fontes não enviadas são preservados."}
        </span>
      </div>
      <div className="form-grid">
        <label>
          Ano das metas
          <input
            type="number"
            min="2020"
            max="2100"
            value={config.year}
            onChange={(e) =>
              setConfig({ ...config, year: Number(e.target.value), vnCutoff: "", arCutoff: "", cadenceCutoff: "", paTargetMode: Number(e.target.value) < 2026 ? "source" : config.paTargetMode })
            }
          />
        </label>
        <label>
          Venda Nova · posição em
          <input
            type="date"
            disabled={importMode === "fixed"}
            value={config.vnCutoff}
            onChange={(e) => setConfig({ ...config, vnCutoff: e.target.value })}
          />
        </label>
        <label>
          Arrecadação · posição em
          <input
            type="date"
            disabled={importMode === "fixed"}
            value={config.arCutoff}
            onChange={(e) => setConfig({ ...config, arCutoff: e.target.value })}
          />
        </label>
        <label>
          Cadência PA · posição em
          <input
            type="date"
            disabled={importMode === "fixed"}
            value={config.cadenceCutoff}
            onChange={(e) =>
              setConfig({ ...config, cadenceCutoff: e.target.value })
            }
          />
        </label>
      </div>
      <p className="helper">
        Preencha apenas os cortes das fontes enviadas. Para mês fechado, informe
        o último dia do mês. O sistema mantém metas fixas, unidades ausentes e demais períodos. Corrija metas e realizados em Cadastro e metas.
      </p>
      <button
        className="button primary wide"
        onClick={importFiles}
        disabled={!!busy || !selectedFileCount}
      >
        {busy ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <ArrowRight size={18} />
        )}
        {importMode === "fixed" ? "Cadastrar base fixa" : importMode === "history" ? "Importar ano histórico" : "Atualizar produção"}
      </button>
    </>
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Sicoob Gestão Comercial — início">
          <img className="brand-logo" src="/brand/sicoob-logo-light.svg" alt="Sicoob" width="152" height="36" />
          <span className="brand-caption">GESTÃO COMERCIAL</span>
        </a>
        <div className="nav-label">ACOMPANHAMENTO</div>
        <nav aria-label="Navegação principal">
          {(
            [
              { id: "overview", label: "Visão geral", icon: LayoutDashboard },
              { id: "cadence", label: "Cadência dos PAs", icon: Building2 },
              { id: "actions", label: "Plano de ação", icon: ClipboardList },
              { id: "audit", label: "Conferência da base", icon: ShieldCheck },
              { id: "imports", label: "Importações", icon: History },
              { id: "registry", label: "Cadastro e metas", icon: Building2 },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              aria-label={item.label}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              disabled={!!busy}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
              {item.id === "audit" && dataset && (
                <span className="nav-count">
                  {dataset.issues.filter((i) => i.kind !== "method").length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="central-label">BAHIA & NORDESTE</div>
          <p>
            Uma visão clara.
            <br />
            Uma ação por vez.
          </p>
          <div className="session-state">
            <span className="avatar">
              {user?.email?.slice(0, 2).toUpperCase() ?? "AC"}
            </span>
            <span>
              {user ? "Conta conectada" : "Análise nesta sessão"}
              <small>{user ? "Histórico privado" : "Entre para salvar"}</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <img className="mobile-brand" src="/brand/sicoob-logo.svg" alt="Sicoob" width="108" height="25" />
            Gestão comercial <span>/</span>{" "}
            <strong>
              {view === "registry" ? "Cadastro e metas" : view === "cadence"
                ? "PAs"
                : view === "actions"
                  ? "Plano de ação"
                  : view === "audit"
                    ? "Conferência"
                    : view === "imports"
                      ? "Importações"
                      : "Visão geral"}
            </strong>
          </div>
          <div className="top-actions">
            {dataset && (
              <button
                className="button quiet"
                disabled={!!busy || !!datasetId}
                onClick={saveDataset}
              >
                {datasetId ? (
                  <CheckCircle2 size={17} />
                ) : (
                  <CloudUpload size={17} />
                )}
                <span>{datasetId ? "Salvo" : "Salvar análise"}</span>
              </button>
            )}
            <button
              className="button quiet"
              disabled={!!busy}
              aria-label={user ? "Sair" : "Entrar"}
              onClick={() => (user ? logout() : setShowLogin(true))}
            >
              {user ? <LogOut size={17} /> : <LogIn size={17} />}
              <span>{user ? "Sair" : "Entrar"}</span>
            </button>
            <button
              className="button primary"
              disabled={!!busy}
              onClick={() => setShowImport(true)}
            >
              <Upload size={17} />
              Importar base
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">PERFORMANCE COMERCIAL</div>
              <h1>
                {view === "registry" ? "Sua base, sempre atualizada." : view === "cadence"
                  ? "Cada PA faz a diferença."
                  : view === "actions"
                    ? "Da análise à ação."
                    : view === "audit"
                      ? "Confiança em cada número."
                      : view === "imports"
                        ? "Suas bases, organizadas."
                        : "O caminho para os 100%."}
              </h1>
              <p>
                {view === "registry" ? "Cadastre unidades, distribua metas e ajuste a produção. Os indicadores acompanham cada alteração." : view === "audit"
                  ? "Confira as fontes, as diferenças e as regras dos indicadores."
                  : view === "imports"
                    ? "Importe uma nova posição ou retome uma análise salva."
                    : dataset
                      ? `${dataset.year} · ${effectiveSource === "cadence" ? "Cadência comercial dos PAs" : metricName(effectiveMetric)} · ${periodNames[period]}`
                      : "Metas, resultados e prioridades das centrais Bahia e Nordeste."}
              </p>
            </div>
            {dataset && view !== "imports" && view !== "registry" && (
              <div className="page-heading-actions">
                {displayed.length > 0 && (
                  <button className="button primary" onClick={() => { setCommunicationInitialKey(""); setShowCommunication(true); }}>
                    <MessageSquareText size={17} /> Gerar e-mail / WhatsApp
                  </button>
                )}
                <button className="button secondary" onClick={exportCsv}>
                  <ArrowDownToLine size={17} />
                  Exportar análise
                </button>
              </div>
            )}
          </div>
          {(error || notice || busy) && (
            <div className="messages" aria-live="polite">
              {error && (
                <div role="alert" className="message error">
                  <Info size={18} />
                  <span>{error}</span>
                  <button
                    aria-label="Fechar aviso"
                    onClick={() => setError("")}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {notice && (
                <div className="message success">
                  <CheckCircle2 size={18} />
                  <span>{notice}</span>
                  <button
                    aria-label="Fechar mensagem"
                    onClick={() => setNotice("")}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {busy && (
                <div className="message">
                  <LoaderCircle className="spin" size={18} />
                  {busy}
                </div>
              )}
            </div>
          )}
          {historical && dataset && <div className="message"><History size={18}/><span>Você está consultando uma versão histórica.</span><button className="button secondary" disabled={!!busy} onClick={() => openWorkspace(dataset.year)}>Retomar cadastro atual</button></div>}
          {dataset && !historical && <div className="workspace-toolbar">
            <label>Ano do cadastro <select value={dataset.year} disabled={!!busy} onChange={(e) => openWorkspace(Number(e.target.value))}>
              {[...new Set([dataset.year, ...workspaces.map((w)=>w.year), ...sessionYears.current.keys()])].sort((a,b)=>b-a).map((y)=><option key={y} value={y}>{y}</option>)}
            </select></label>
            <button className="button secondary" disabled={!!busy} onClick={() => openWorkspace(dataset.year + 1)}>Novo ano</button>
            <label>Abrir outro ano<input aria-label="Ano para abrir" type="number" min="2020" max="2100" value={requestedYear} onChange={event => setRequestedYear(Number(event.target.value))} /></label><button className="button secondary" disabled={!!busy} onClick={() => openWorkspace(requestedYear)}>Abrir ano</button>
            {user && <button className="button secondary" disabled={!!busy} onClick={() => openWorkspace(dataset.year)}>Recarregar cadastro salvo</button>}
            <span className="muted">{user && workspaceRevision ? `Salvo · revisão ${workspaceRevision}` : "Dados nesta sessão"}</span>
          </div>}
          {view === "registry" && dataset ? (
            historical ? <section className="panel empty"><p>Retome o cadastro atual para incluir, editar ou excluir unidades.</p></section> : <RegistryManager dataset={dataset} onChange={changeRegistry} busy={!!busy}/>
          ) : !dataset && view !== "imports" ? (
            <div className="welcome-grid">
              <section className="panel import-panel">{importPanel}</section>
              <section className="welcome-aside">
                <div className="welcome-target">
                  <Target size={44} />
                </div>
                <h2>Saiba onde atuar primeiro.</h2>
                <button className="button secondary" disabled={!!busy} onClick={() => navigate("registry")}>Começar pelo cadastro manual</button>
                <p>
                  Acompanhe o resultado de cada cooperativa e PA, veja o ritmo
                  necessário e organize a recuperação das metas.
                </p>
                <div className="welcome-feature">
                  <span>01</span>
                  <div>
                    <strong>Metas e resultados</strong>
                    <p>Mensal, trimestral, semestral, anual e acumulado.</p>
                  </div>
                </div>
                <div className="welcome-feature">
                  <span>02</span>
                  <div>
                    <strong>Projeções com contexto</strong>
                    <p>
                      Posições separadas para Venda Nova, Arrecadação e PAs.
                    </p>
                  </div>
                </div>
                <div className="welcome-feature">
                  <span>03</span>
                  <div>
                    <strong>Prioridades em reais</strong>
                    <p>GAP, esforço por dia útil e ação recomendada.</p>
                  </div>
                </div>
                <div className="source-note">
                  <Info size={18} />
                  <p>
                    As fontes são mensais. A visão diária apresenta o esforço
                    calculado; o realizado diário não está disponível.
                  </p>
                </div>
              </section>
            </div>
          ) : view === "imports" ? (
            <div className="imports-grid">
              <section className="panel import-panel">{importPanel}</section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Histórico de análises</h2>
                  <History size={21} />
                </div>
                {!user ? (
                  <div className="empty compact">
                    <History size={30} />
                    <h3>Retome de onde parou.</h3>
                    <p>Entre para guardar suas importações e planos de ação.</p>
                    <button
                      className="button secondary"
                      onClick={() => setShowLogin(true)}
                    >
                      Entrar na conta
                    </button>
                  </div>
                ) : history.length ? (
                  <div className="history-list">
                    {history.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => loadDataset(item.id)}
                        disabled={!!busy}
                      >
                        <FileSpreadsheet size={24} />
                        <span>
                          <strong>{item.title}</strong>
                          <small>
                            {new Date(item.created_at).toLocaleString("pt-BR")} ·{" "}
                            {item.source_count} {item.source_count === 1 ? "fonte" : "fontes"}
                          </small>
                        </span>
                        <ArrowRight size={18} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="muted">Nenhuma análise salva ainda.</p>
                )}
              </section>
            </div>
          ) : (
            <>
              <section
                className="filters panel"
                aria-label="Filtros da análise"
              >
                <label>
                  Fonte
                  <select
                    value={effectiveSource}
                    onChange={(e) => {
                      setSource(e.target.value as "base" | "cadence");
                      if (view === "cadence") setView("overview");
                      resetFilters();
                    }}
                  >
                    <option value="base">Cooperativas</option>
                    <option value="cadence">Cadência PA</option>
                  </select>
                </label>
                {effectiveSource === "cadence" ? (
                  <label>
                    Grupo do PA
                    <select
                      value={group}
                      onChange={(e) => setGroup(e.target.value)}
                    >
                      <option value="all">Todos os grupos</option>
                      {groups.map((item) => (
                        <option value={item} key={item}>
                          {item} · {money(paTargetForGroup(item)?.monthly)}/mês
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label>
                    Carteira
                    <select
                      value={effectiveMetric}
                      onChange={(e) => setMetric(e.target.value)}
                    >
                      <option value="VN">Venda Nova</option>
                      <option value="AR">Arrecadação</option>
                    </select>
                  </label>
                )}
                <label>
                  Central
                  <select
                    value={central}
                    onChange={(e) => {
                      setCentral(e.target.value);
                      setCoop("all");
                    }}
                  >
                    <option value="all">Todas as centrais</option>
                    {centralOptions.map(([id, name]) => (
                      <option value={id} key={id}>
                        {id} · {name.replace("Sicoob Central ", "")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Cooperativa
                  <select
                    value={coop}
                    onChange={(e) => setCoop(e.target.value)}
                  >
                    <option value="all">Todas as cooperativas</option>
                    {cooperatives.map(([id, name]) => (
                      <option value={id} key={id}>
                        {name.replace("SICOOB ", "")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Período
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                  >
                    {Object.entries(periodNames).map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Mês de referência
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                  >
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i}>
                        {m} / {dataset?.year}
                      </option>
                    ))}
                  </select>
                </label>
                <label>Organizar lista<select aria-label="Ordenar análise" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>{Object.entries(SORT_OPTIONS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              </section>
              {dataset && <NetworkSummary dataset={dataset} filters={scenarioFilters} />}
              <div className="position-line">
                <span>
                  <span className="position-dot" />
                  Posição da fonte:{" "}
                  <strong>
                    {cutoff ? cutoffs.length > 1 ? `${shortDate(cutoff)} a ${shortDate(cutoffs[cutoffs.length-1])} · cortes diferentes` : shortDate(cutoff) : "não importada"}
                  </strong>
                  {analyses.length > 0 && <> · {analyses[0].phase}</>}
                </span>
                <span>
                  {effectiveSource === "cadence"
                    ? "Metas próprias da cadência · não somadas às cooperativas"
                    : "Consolidado das cooperativas · sem dupla contagem dos PAs"}
                </span>
              </div>
              {dataset && view === "overview" && effectiveSource === "base" && actualLevel === "cooperative" && coop !== "all" && <PaTable dataset={dataset} filters={scenarioFilters} onSelect={setSelected} />}
              {dataset && <YearComparison key={user?.id ?? "session"} dataset={dataset} filters={scenarioFilters} owner={user?.id ?? null} years={[...workspaces.map(item => item.year), ...sessionYears.current.keys()]} sessionDatasets={sessionYears.current} />}
              {effectiveSource === "cadence" && (
                <section
                  className="pa-target-policy"
                  aria-label="Metas fixas mensais por grupo de PA"
                >
                  <div>
                    <span className="section-label">META FIXA POR GRUPO</span>
                    <p>Referência inicial. Metas editadas no cadastro têm prioridade em todos os períodos.</p>
                  </div>
                  <div className="pa-target-groups">
                    {Object.entries(PA_GROUP_TARGETS).map(([name, target]) => (
                      <button
                        key={name}
                        className={group === name ? "active" : ""}
                        onClick={() => setGroup(group === name ? "all" : name)}
                        aria-pressed={group === name}
                      >
                        <strong>{name}</strong>
                        <span>{money(target.monthly)}/mês</span>
                        <small>{money(target.annual)}/ano</small>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {view === "audit" ? (
                <>
                  <section className="audit-top">
                    <div className="panel">
                      <div className="section-label">FONTES IMPORTADAS</div>
                      {dataset?.sources.map((s) => (
                        <div className="source-row" key={s.type}>
                          <FileSpreadsheet size={23} />
                          <div>
                            <strong>{s.filename}</strong>
                            <p>
                              {s.rows} registros · {s.skipped} linhas de outras
                              centrais ignoradas
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="panel method">
                      <div className="section-label">REGRAS DE CÁLCULO</div>
                      <p>
                        <strong>Atingimento:</strong> soma do realizado ÷ soma
                        das metas do mesmo período.
                      </p>
                      <p>
                        <strong>Cadência PA:</strong> P1 R$ 450, P2 R$ 600, P3
                        R$ 750, P4 R$ 850 e P5 R$ 1.000 por mês. O anual
                        corresponde a 12 meses.
                      </p>
                      <p>
                        <strong>Projeção:</strong> realizado + meta restante ×
                        ritmo observado sobre a meta proporcional ao corte.
                        Preserva a sazonalidade das metas.
                      </p>
                      <p>
                        <strong>Esforço:</strong> GAP para a meta ÷ dias úteis
                        restantes após o corte.
                      </p>
                      <p>
                        <strong>Calendário:</strong> segunda a sexta, sem
                        descontar feriados. Média mensal usa meses equivalentes
                        restantes.
                      </p>
                      <p>
                        <strong>Diário:</strong> meta rateada e esforço
                        estimado; realizado diário indisponível.
                      </p>
                    </div>
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Conferência das fontes</h2>
                        <p>
                          Diferenças são sinalizadas e os valores originais são
                          preservados.
                        </p>
                      </div>
                      <span className="pill neutral">
                        {audits.length} registros
                      </span>
                    </div>
                    <div className="audit-list">
                      {audits.map((i, n) => (
                        <div key={n}>
                          <Info size={18} />
                          <p>{i.message}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              ) : !filtered.length ? (
                <section className="panel empty">
                  <FileSpreadsheet size={34} />
                  <h2>Sem dados para esta seleção.</h2>
                  <p>Importe a fonte correspondente ou ajuste os filtros.</p>
                  <button className="button secondary" onClick={resetFilters}>
                    Limpar filtros
                  </button>
                </section>
              ) : (
                <>
                  {period === "daily" && (
                    <div className="message">
                      <Info size={18} />
                      <span>
                        <strong>Realizado diário indisponível.</strong> As bases
                        trazem totais mensais. Meta diária estimada:{" "}
                        <strong>{money(leafSummary.dailyTarget)}</strong> (meta
                        mensal ÷ dias úteis do mês). Abaixo, o GAP do mês e o
                        esforço por dia útil após o corte.
                      </span>
                    </div>
                  )}
                  <section className="kpi-grid">
                    <Kpi
                      title="Meta do período"
                      value={money(summary.target)}
                      sub={`${periodNames[period === "daily" ? "month" : period]} · ${MONTHS[month]}/${dataset?.year}`}
                      icon={<Target size={20} />}
                    />
                    <Kpi
                      title="Realizado até o corte"
                      value={money(summary.actual)}
                      sub={`${percent(summary.attainment)} da meta do período`}
                      icon={<BarChart3 size={20} />}
                    />
                    <Kpi
                      title="Projeção de fechamento"
                      value={money(summary.projected)}
                      sub={`${percent(summary.projectedAttainment)} da meta${uplift ? ` · cenário +${uplift}%` : ""}`}
                      icon={<TrendingUp size={20} />}
                      accent
                    />
                    <Kpi
                      title="GAP para a meta"
                      value={money(summary.gap)}
                      sub={`Esforço total: ${money(summary.requiredDaily)}/dia útil`}
                      icon={<Flag size={20} />}
                    />
                  </section>
                  <div className="all-goals-note">
                    <Info size={16} />
                    <span>
                      Para todos atingirem 100%:{" "}
                      <strong>{money(leafSummary.individualGap)}</strong> de
                      GAP somado entre{" "}
                      {effectiveSource === "cadence" ? "PAs" : "cooperativas"} (
                      {money(leafSummary.requiredDaily)}/dia útil). A superação
                      de uma unidade não elimina o GAP das demais.
                    </span>
                  </div>
                  <section className="decision-insights" aria-label="Informações para decidir">
                    {insights.slice(0,3).map((insight) => <article className={`panel insight ${insight.tone}`} key={insight.title}><h3>{insight.title}</h3><p>{insight.detail}</p></article>)}
                  </section>
                  {view === "actions" ? (
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Prioridades para atingir a meta</h2>
                          <p>
                            Ordem conforme o critério selecionado. Abra uma
                            ação para definir responsável e prazo.
                          </p>
                        </div>
                        <span className="pill warning">
                          {summary.attention} em atenção
                        </span>
                      </div>
                      <div className="action-list">
                        {displayed
                          .slice(page * 12, page * 12 + 12)
                          .map((r, i) => {
                            const a = actionFor(r);
                            return (
                              <button
                                key={r.key}
                                className="action-card"
                                onClick={() => setSelected(r)}
                              >
                                <span className="rank">
                                  {page * 12 + i + 1}
                                </span>
                                <div>
                                  <div className="action-title">
                                    <strong>{r.name}</strong>
                                    <Pill>
                                      {actions[r.key]?.status ?? a.priority}
                                    </Pill>
                                  </div>
                                  <p>{a.text}</p>
                                  <small>
                                    {r.cooperative}
                                    {r.pa != null ? ` · PA ${r.pa}` : ""} ·{" "}
                                    {actions[r.key]?.owner ||
                                      "Responsável a definir"}
                                    {actions[r.key]?.due
                                      ? ` · ${shortDate(actions[r.key].due)}`
                                      : ""}
                                  </small>
                                </div>
                                <ChevronRight size={20} />
                              </button>
                            );
                          })}
                      </div>
                      <Pagination
                        page={page}
                        setPage={setPage}
                        total={displayed.length}
                      />
                    </section>
                  ) : (
                    <>
                      <section className="chart-grid">
                        <div className="panel chart-panel">
                          <div className="panel-heading">
                            <div>
                              <h2>Evolução no ano</h2>
                              <p>Meta e realizado mensal · valores em reais</p>
                            </div>
                            <div className="legend">
                              <span>
                                <i className="legend-target" />
                                Meta
                              </span>
                              <span>
                                <i className="legend-actual" />
                                Realizado
                              </span>
                            </div>
                          </div>
                          <MonthlyChart rows={filtered} year={dataset!.year} />
                        </div>
                        <div className="panel pace-panel">
                          <div className="section-label">ROTA PARA A META</div>
                          <div className="route-number">
                            {summary.onTrack}
                            <span> / {analyses.length}</span>
                          </div>
                          <p>
                            {actualLevel === "pa"
                              ? "PAs"
                              : actualLevel === "central"
                                ? "centrais"
                                : "cooperativas"}{" "}
                            com meta atingida ou em rota
                          </p>
                          <div className="route-progress">
                            <span
                              style={{
                                width: `${analyses.length ? (summary.onTrack / analyses.length) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <div className="route-split">
                            <span>Precisam de atenção</span>
                            <strong>{summary.attention}</strong>
                          </div>
                          <button
                            className="button secondary wide"
                            onClick={() => setView("actions")}
                          >
                            Ver plano de ação
                            <ArrowRight size={17} />
                          </button>
                          <div className="scenario">
                            <label htmlFor="uplift">
                              Simular aumento de ritmo
                              <strong>+{uplift}%</strong>
                            </label>
                            <input
                              id="uplift"
                              type="range"
                              min="0"
                              max="100"
                              step="5"
                              value={uplift}
                              onChange={(e) =>
                                setUplift(Number(e.target.value))
                              }
                            />
                            <p>
                              Aplica o aumento apenas à produção futura
                              projetada. Não altera metas nem realizado.
                            </p>
                          </div>
                        </div>
                      </section>
                      <section className="panel table-panel">
                        <div className="panel-heading table-heading">
                          <div>
                            <h2>
                              {actualLevel === "pa"
                                ? "Cadência por PA"
                                : actualLevel === "central"
                                  ? "Resultado por central"
                                  : "Resultado por cooperativa"}
                            </h2>
                            <p>{displayed.length} de {analyses.length} unidades · todas na mesma página</p>
                          </div>
                          <div className="table-controls">
                            <select aria-label="Filtrar situação" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                              <option value="all">Todas as situações</option><option value="attention">Precisam de atenção</option><option value="track">Em rota / meta atingida</option><option value="missing">Dados ou metas pendentes</option>
                            </select>
                            {effectiveSource === "base" && (
                              <label className="sr-only-label">
                                <span>Agrupar por</span>
                                <select
                                  value={level}
                                  onChange={(e) => setLevel(e.target.value)}
                                >
                                  <option value="cooperative">
                                    Cooperativas
                                  </option>
                                  <option value="central">Centrais</option>
                                </select>
                              </label>
                            )}
                            <label className="search-input">
                              <Search size={17} />
                              <input
                                aria-label="Buscar cooperativa ou PA"
                                placeholder="Buscar nome ou código"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                              />
                            </label>
                          </div>
                        </div>
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>
                                  {actualLevel === "pa"
                                    ? "PA / Cooperativa"
                                    : actualLevel === "central"
                                      ? "Central"
                                      : "Cooperativa"}
                                </th>
                                <th className="numeric">Meta</th>
                                <th className="numeric">Realizado</th>
                                <th>Atingimento</th>
                                <th className="numeric">Projeção</th>
                                <th className="numeric">Necessário/dia</th>
                                <th>Situação</th>
                                <th>
                                  <span className="sr-only">Detalhes</span>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {displayed.map((r) => (
                                  <tr key={r.key}>
                                    <td>
                                      <button
                                        className="entity-button"
                                        onClick={() => setSelected(r)}
                                      >
                                        <strong>
                                          {r.name.replace(
                                            /^SICOOB\s*-?\s*/i,
                                            "",
                                          )}
                                        </strong>
                                        <small>
                                          {actualLevel === "central"
                                            ? r.central
                                            : `${r.cooperative}${r.pa != null ? ` · PA ${r.pa} · ${r.group}` : ""} · ${centralOptions.find(([id])=>id===r.central)?.[1] ?? centralName(r.central)}`}
                                        </small>
                                      </button>
                                    </td>
                                    <td className="numeric">
                                      {money(r.target)}
                                    </td>
                                    <td className="numeric">
                                      {money(r.actual)}
                                    </td>
                                    <td>
                                      <div className="attainment">
                                        <strong>{percent(r.attainment)}</strong>
                                        <span className="mini-progress">
                                          <i
                                            style={{
                                              width: `${Math.max(0, Math.min(100, (r.attainment ?? 0) * 100))}%`,
                                            }}
                                          />
                                        </span>
                                      </div>
                                    </td>
                                    <td className="numeric">
                                      {money(r.projected)}
                                      <small className="cell-note">
                                        {percent(r.projectedAttainment)} da meta
                                      </small>
                                    </td>
                                    <td className="numeric">
                                      {money(r.requiredDaily)}
                                    </td>
                                    <td>
                                      <Pill>{r.status}</Pill>
                                    </td>
                                    <td>
                                      {actualLevel === "cooperative" && effectiveSource === "base" && r.cooperative && <button type="button" className="button quiet" aria-label={`Ver PAs de ${r.name}`} onClick={() => { setCoop(`${r.central}:${r.cooperative}`); setLevel("cooperative"); }}>Ver PAs</button>}
                                      <button type="button" className="icon-button" aria-label={`Gerar comunicação de ${r.name}`} title="Gerar e-mail / WhatsApp"
                                        onClick={() => { setCommunicationInitialKey(entityFromAnalysis(r).id); setShowCommunication(true); }}><Mail size={18} /></button>
                                      <button
                                        className="icon-button"
                                        aria-label={`Detalhar ${r.name}`}
                                        onClick={() => setSelected(r)}
                                      >
                                        <ChevronRight size={18} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                        {!displayed.length && (
                          <p className="empty">Nenhum registro encontrado.</p>
                        )}
                        <div className="pagination">{displayed.length} unidades exibidas · exportação inclui a seleção completa</div>
                      </section>
                    </>
                  )}
                </>
              )}
              <footer className="method-footer">
                <Info size={16} />
                <span>
                  Projeções estimadas a partir do corte de cada fonte. Dias
                  úteis: segunda a sexta, sem feriados. Valores faltantes não
                  são zero.{" "}
                  <button onClick={() => setView("audit")}>
                    Ver critérios e conferência
                  </button>
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {showImport && (
        <Modal title="Importar base" onClose={() => setShowImport(false)}>
          <div className="import-panel">{importPanel}</div>
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
        </Modal>
      )}
      {showCommunication && dataset && displayed.length > 0 && (
        <PortfolioCommunication dataset={dataset} candidates={displayed.map(entityFromAnalysis)} initialKey={communicationInitialKey}
          metric={effectiveMetric as "VN" | "AR"} period={period} month={month} uplift={uplift}
          onClose={() => setShowCommunication(false)} />
      )}
      {showLogin && (
        <Modal title="Entrar na conta" onClose={() => setShowLogin(false)}>
          <div className="login-panel">
            <div className="upload-icon">
              <ShieldCheck size={28} />
            </div>
            <h2>Guarde suas análises.</h2>
            <p className="muted">
              Acesse seu histórico privado e acompanhe os planos de ação.
            </p>
            {supabase ? (
              <form onSubmit={login}>
                <label>
                  E-mail
                  <input
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Senha
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </label>
                <button className="button primary wide" disabled={!!busy}>
                  Entrar
                </button>
                <p className="helper">
                  Use a conta liberada pelo administrador.
                </p>
              </form>
            ) : (
              <div className="message">
                <Info size={19} />
                <p>
                  O acesso ainda precisa ser configurado. Você pode importar e
                  analisar as planilhas nesta sessão.
                </p>
              </div>
            )}
            {error && (
              <p role="alert" className="inline-error">
                {error}
              </p>
            )}
          </div>
        </Modal>
      )}
      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)} wide>
          <div className="detail-content">
            <div className="detail-header">
              <div>
                <span className="section-label">
                  {metricName(selected.metric)} ·{" "}
                  {selected.source === "cadence"
                    ? "CADÊNCIA PA"
                    : "COOPERATIVAS"}
                </span>
                <h2>{selected.name}</h2>
                <p>
                  Posição em {shortDate(selected.cutoff)} ·{" "}
                  {periodNames[period]} · {MONTHS[month]}/{dataset?.year}
                </p>
              </div>
              <Pill>{selected.status}</Pill>
            </div>
            <div className="detail-metrics">
              <div>
                <span>GAP para a meta</span>
                <strong>{money(selected.gap)}</strong>
              </div>
              <div>
                <span>Por dia útil restante</span>
                <strong>{money(selected.requiredDaily)}</strong>
              </div>
              <div>
                <span>Média mensal equivalente</span>
                <strong>{money(selected.requiredMonthly)}</strong>
              </div>
            </div>
            <div className="recommendation">
              <Flag size={21} />
              <p>{actionFor(selected).text}</p>
            </div>
            <div className="detail-meta">
              {selected.source === "cadence" && (
                <>
                  Grupo {selected.group} · Meta cadastrada em {MONTHS[month]}:{" "}
                  {money(selected.targets[month])} · Meta anual cadastrada:{" "}
                  {money(selected.annualTarget)} ·{" "}
                </>
              )}
              Meta esperada até o corte: {money(selected.expected)} · GAP
              projetado: {money(selected.projectionGap)} ·{" "}
              {selected.remainingDays} dias úteis restantes
              {selected.acceleration != null
                ? ` · Aceleração necessária: ${percent(selected.acceleration)}`
                : ""}
            </div>
            <div className="table-scroll">
              <table>
                <caption className="sr-only">
                  Detalhamento mensal de {selected.name}
                </caption>
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th className="numeric">Meta</th>
                    <th className="numeric">Realizado</th>
                    <th className="numeric">Atingimento</th>
                    <th>Posição</th>
                  </tr>
                </thead>
                <tbody>
                  {MONTHS.map((m, i) => {
                    const a = analyze(selected, {
                      ...options,
                      month: i,
                      period: "month",
                    });
                    return (
                      <tr key={m}>
                        <td>{m}</td>
                        <td className="numeric">{money(a.target)}</td>
                        <td className="numeric">{money(a.actual)}</td>
                        <td className="numeric">{percent(a.attainment)}</td>
                        <td>{a.phase}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="action-editor">
              <h3>Acompanhar esta ação</h3>
              <div className="form-grid">
                <label>
                  Responsável
                  <input
                    value={actions[selected.key]?.owner ?? ""}
                    maxLength={120}
                    placeholder="Nome do responsável"
                    onChange={(e) =>
                      setActions({
                        ...actions,
                        [selected.key]: {
                          ...EMPTY_ACTION,
                          ...actions[selected.key],
                          owner: e.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Prazo
                  <input
                    type="date"
                    value={actions[selected.key]?.due ?? ""}
                    onChange={(e) =>
                      setActions({
                        ...actions,
                        [selected.key]: {
                          ...EMPTY_ACTION,
                          ...actions[selected.key],
                          due: e.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Situação
                  <select
                    value={actions[selected.key]?.status ?? "Aberta"}
                    onChange={(e) =>
                      setActions({
                        ...actions,
                        [selected.key]: {
                          ...EMPTY_ACTION,
                          ...actions[selected.key],
                          status: e.target.value as ActionState["status"],
                        },
                      })
                    }
                  >
                    <option>Aberta</option>
                    <option>Em andamento</option>
                    <option>Concluída</option>
                  </select>
                </label>
              </div>
              <label>
                Observações
                <textarea
                  rows={3}
                  maxLength={4000}
                  value={actions[selected.key]?.notes ?? ""}
                  placeholder="Próximo passo e acompanhamento combinado"
                  onChange={(e) =>
                    setActions({
                      ...actions,
                      [selected.key]: {
                        ...EMPTY_ACTION,
                        ...actions[selected.key],
                        notes: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <button
                className="button primary"
                onClick={() => saveAction(selected)}
                disabled={!!busy}
              >
                <Check size={18} />
                Salvar ação
              </button>
            </div>
            <p className="helper">
              Origem: {selected.sourceFile} · {selected.sheet} ·{" "}
              {actualLevel === "pa"
                ? "linha " + selected.sourceRow
                : "consolidado dos registros selecionados"}
              . Valores preservados; projeções não são garantia de resultado.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FileSlot({
  id,
  title,
  description,
  file,
  onSelect,
  onRemove,
}: {
  id: string;
  title: string;
  description: string;
  file: File | null;
  onSelect: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <div className={`file-slot ${file ? "selected" : ""}`}>
      <label htmlFor={id}>
        <span className="file-slot-icon">
          {file ? <CheckCircle2 size={22} /> : <CloudUpload size={22} />}
        </span>
        <span>
          <strong>{title}</strong>
          <small>{file?.name ?? description}</small>
        </span>
        <span className="file-slot-action">{file ? "Trocar" : "Selecionar"}</span>
      </label>
      <input
        id={id}
        type="file"
        accept=".xlsx"
        aria-label={`Selecionar ${title}`}
        onChange={(event) => {
          const next = event.target.files?.[0];
          if (next) onSelect(next);
          event.target.value = "";
        }}
      />
      {file && (
        <button
          type="button"
          className="file-slot-remove icon-button"
          aria-label={`Remover ${file.name}`}
          onClick={onRemove}
        >
          <X size={17} />
        </button>
      )}
    </div>
  );
}

function Kpi({
  title,
  value,
  sub,
  icon,
  accent = false,
}: {
  title: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <article className={`kpi panel ${accent ? "accent" : ""}`}>
      <div className="kpi-heading">
        <span>{title}</span>
        {icon}
      </div>
      <strong className="kpi-value">{value}</strong>
      <p>{sub}</p>
    </article>
  );
}
function Pagination({
  page,
  setPage,
  total,
}: {
  page: number;
  setPage: (p: number) => void;
  total: number;
}) {
  const last = Math.max(0, Math.ceil(total / 12) - 1);
  return (
    <div className="pagination">
      <span>
        {total
          ? `${page * 12 + 1}–${Math.min(total, (page + 1) * 12)} de ${total} registros`
          : "0 registros"}
      </span>
      <div>
        <button
          className="icon-button"
          aria-label="Página anterior"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <span>
          {page + 1} / {last + 1}
        </span>
        <button
          className="icon-button"
          aria-label="Próxima página"
          disabled={page >= last}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
function Modal({
  children,
  title,
  onClose,
  wide = false,
}: {
  children: React.ReactNode;
  title: string;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const active = document.activeElement as HTMLElement;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = document.querySelector<HTMLElement>(".modal-close");
    close?.focus();
    return () => {
      document.body.style.overflow = previous;
      active?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const nodes = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
            ),
          ).filter((n) => n.offsetParent !== null);
          const first = nodes[0],
            last = nodes[nodes.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
      >
        <button
          className="modal-close icon-button"
          aria-label="Fechar"
          onClick={onClose}
        >
          <X size={22} />
        </button>
        {children}
      </section>
    </div>
  );
}
function MonthlyChart({ rows, year }: { rows: DataRow[]; year: number }) {
  const monthly = useMemo(
    () =>
      MONTHS.map((month, i) => {
        const values = rows.map((r) =>
          analyze(r, { year, month: i, period: "month" }),
        );
        return { month, ...summarize(values) };
      }),
    [rows, year],
  );
  const max = Math.max(
    1,
    ...monthly.flatMap((m) => [m.target ?? 0, m.actual ?? 0]),
  );
  const negative = Math.min(0, ...monthly.map((m) => m.actual ?? 0));
  const chartHeight = 175,
    baseline = (chartHeight * max) / (max - negative),
    factor = chartHeight / (max - negative);
  return (
    <div className="monthly-chart">
      <svg
        viewBox="0 0 760 230"
        role="img"
        aria-label="Gráfico mensal de metas e realizado. Valores disponíveis também na tabela de evolução."
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1="58"
              x2="750"
              y1={15 + baseline - baseline * f}
              y2={15 + baseline - baseline * f}
              stroke="#e4eae9"
              strokeDasharray="3 4"
            />
            <text
              x="49"
              y={19 + baseline - baseline * f}
              textAnchor="end"
              fill="#74807e"
              fontSize="12"
            >
              {new Intl.NumberFormat("pt-BR", {
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(max * f)}
            </text>
          </g>
        ))}
        {monthly.map((m, i) => {
          const x = 65 + i * 57;
          return (
            <g key={m.month}>
              <title>
                {m.month}: meta {money(m.target)}; realizado {money(m.actual)}
              </title>
              {m.target != null && (
                <rect
                  x={x}
                  y={15 + baseline - m.target * factor}
                  width="17"
                  height={Math.max(0, m.target * factor)}
                  rx="3"
                  fill="var(--chart-target)"
                />
              )}
              {m.actual != null && (
                <rect
                  x={x + 20}
                  y={
                    m.actual < 0
                      ? 15 + baseline
                      : 15 + baseline - m.actual * factor
                  }
                  width="17"
                  height={Math.max(1, Math.abs(m.actual) * factor)}
                  rx="3"
                  fill={m.actual < 0 ? "var(--chart-negative)" : "var(--chart-actual)"}
                />
              )}
              <text
                x={x + 18}
                y="220"
                textAnchor="middle"
                fill="#65736f"
                fontSize="12"
              >
                {m.month}
              </text>
            </g>
          );
        })}
      </svg>
      <details>
        <summary>
          Ver valores do gráfico
          <ChevronDown size={15} />
        </summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Mês</th>
                <th className="numeric">Meta</th>
                <th className="numeric">Realizado</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.month}>
                  <td>{m.month}</td>
                  <td className="numeric">{money(m.target)}</td>
                  <td className="numeric">{money(m.actual)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
