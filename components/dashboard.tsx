"use client";
import { goalVariance } from '@/lib/goal-variance.mjs';
import { readWorkbookFile, XLSX_FILE_LIMIT_MB } from "@/lib/xlsx-safety.mjs";
import { Fragment, useEffect, useId, useMemo, useState, useRef } from "react";
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
  LoaderCircle,
  LogOut,
  Mail,
  MessageSquareText,
  Search,
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
import { buildDecisionInsights } from "@/lib/communication.mjs";
import RegistryManager from "@/components/registry-manager";
import ConsolidatedAgenda from "@/components/consolidated-agenda";
import { zonedDateTimeInput } from "@/lib/relationship.mjs";
import type { EntityAppointment } from "@/lib/relationship-store";
import GoalAlerts from "@/components/goal-alerts";
import PortfolioCommunication from "@/components/portfolio-communication";
import PaScenarioShare from "@/components/pa-scenario-share";
import CommunicationStart, { type CommunicationChoice } from './communication-start';
import ResultExport from './result-export';
import CombinedPortfolio from './combined-portfolio';
import type {CurrentViewModel} from '@/lib/current-view.mjs';
import { buildCurrentViewModels } from '@/lib/current-view.mjs';
import { entityFromAnalysis } from "@/lib/portfolio-communication.mjs";
import { initializeRegistry, createEmptyDataset, mergeProduction, analysisRows } from "@/lib/registry.mjs";
import { listWorkspaces, loadWorkspace, saveWorkspace } from "@/lib/workspace-store";
import { supabase } from "@/lib/supabase";
import { compareYears, analysisIndicators, sortAnalysis, SORT_OPTIONS } from "@/lib/scenarios.mjs";
import { NetworkSummary, PaTable, YearComparison } from "@/components/scenario-panels";
import type { ActionState, DataRow, Dataset, ImportConfig, RegistryEntity } from "@/lib/types";
import PeriodSelector, { usePeriodSelection } from './period-selector';
import { periodTitle } from '@/lib/periods.mjs';
import PeriodPerformance from './period-performance';
import { attainmentBand } from '@/lib/attainment.mjs';
import AttainmentLegend from './ui/attainment-legend';
import PanelToggle from './ui/panel-toggle';
import { AnalysisTabs, AnalysisBreadcrumb, OverviewUnits, AnalysisSimulation, UnitLayoutSwitch, type UnitLayout, type AnalysisTab } from './analysis-workspace';
import { analysisEffort, relatedScenarioIds } from '@/lib/analysis-workspace.mjs';
import AnalysisReportShare from './analysis-report-share';
import UnitScenarioMatrix from './unit-scenario-matrix';
import { buildUnitScenarioMatrix } from '@/lib/unit-scenario-matrix.mjs';

import PortalNavigation, { VIEW_TITLES, type PortalView as View } from './ui/portal-navigation';
import Kpi from './ui/metric-card';
import FilterPanel from './ui/filter-panel';
import { effortLabel, filterDashboardRows, visibleLeafRows } from '@/lib/dashboard-view.mjs';
import { clearLocalAuth } from '@/lib/session-cleanup';
type Analysis = ReturnType<typeof analyze> & { contribution?: number | null; recentGrowth?: number | null; recentLabel?: string };
type FilterSnapshot = { tab: AnalysisTab; unitLayout:UnitLayout; scrollY:number; selection:{context:string;keys:string[]}; expandedCoops:string[]; view: View; source: 'base' | 'cadence'; metric: string; central: string; coop: string; pa: string; group: string; level: string; search: string; status: string; sortBy: string; month: number; period: string; uplift: number; expandedPaKey: string; priorityFocus: {context:string;keys:string[];label:string} | null };
type SourceFiles = { base: File | null; cadence: File | null };
const EMPTY_ACTION: ActionState = {
  owner: "",
  due: "",
  status: "Aberta",
  notes: "",
};
const metricName = (metric: string) =>
  metric === "both" ? "Venda Nova + Arrecadação" : metric === "VN" ? "Venda Nova" : "Arrecadação";
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
  const [analysisTab,setAnalysisTab] = useState<AnalysisTab>('overview');
  const [unitLayout,setUnitLayout] = useState<UnitLayout>('period');
  const [visitedTabs,setVisitedTabs] = useState<AnalysisTab[]>(['overview','units']);
  const tabPositions=useRef<Partial<Record<AnalysisTab,number>>>({});
  const [periodShareRequest,setPeriodShareRequest]=useState(0);
  const [shareScenario,setShareScenario]=useState('summary');
  const [reportShare,setReportShare]=useState<{title:string;context:string[];columns:string[];rows:string[][];notes:string[]}|null>(null);
  const [metric, setMetric] = useState("VN"),
    [central, setCentral] = useState("all"),
    [coop, setCoop] = useState("all"),
    [pa, setPa] = useState("all"),
    [group, setGroup] = useState("all");
  const { period, month, setPeriod, setMonth } = usePeriodSelection();
  const [level, setLevel] = useState("cooperative"),
    [search, setSearch] = useState("");
  const [workspaceRevision, setWorkspaceRevision] = useState<number | null>(null);
  const [workspaces, setWorkspaces] = useState<{id:string;year:number;revision:number;updatedAt:string}[]>([]);
  const [historical, setHistorical] = useState(false);
  const [registryDirty, setRegistryDirty] = useState(false);
  const [registrySaving, setRegistrySaving] = useState(false);
  const [agendaRequest, setAgendaRequest] = useState<{ owner: string; year: number; entityId: string; date: string; request: number } | null>(null);
  const [importMode, setImportMode] = useState("production");
  const [sortBy, setSortBy] = useState("attainment-desc");
  const [requestedYear, setRequestedYear] = useState(new Date().getFullYear() - 1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedPaKey, setExpandedPaKey] = useState("");
  const [expandedCoops, setExpandedCoops] = useState<string[]>([]);
  const [drillHistory, setDrillHistory] = useState<FilterSnapshot[]>([]);
  const [rowSelection, setRowSelection] = useState<{ context: string; keys: string[] }>({ context: '', keys: [] });
  const selectionCarry=useRef<string[]|null>(null);
  const priorityCarry=useRef<{keys:string[];label:string}|null>(null);
  const [priorityFocus, setPriorityFocus] = useState<{ context: string; keys: string[]; label: string } | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [exportMetric, setExportMetric] = useState<'VN' | 'AR'>('VN');
  const [exportMode, setExportMode] = useState<'filtered' | 'selected'>('filtered');
  const [showCommunicationStart, setShowCommunicationStart] = useState(false);
  const [communicationFormat, setCommunicationFormat] = useState<'email' | 'image' | 'summary'>('email');
  const [communicationProjection, setCommunicationProjection] = useState(false);
  const [showMoreIndicators, setShowMoreIndicators] = useState(false);
  const [metricsExpanded, setMetricsExpanded] = useState(true);
  const [unitsExpanded, setUnitsExpanded] = useState(true);
  const [periodExpandRequest, setPeriodExpandRequest] = useState(0);
  const metricContentId = useId();
  const unitContentId = useId();
  const [leaving, setLeaving] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const communicationButton = useRef<HTMLButtonElement>(null);
  const communicationOpener = useRef<HTMLElement | null>(null);
  const communicationFromStart = useRef(false);
  const activeOwner = useRef<string | null>(null);
  const sessionYears = useRef(new Map<number,Dataset>());
  const [simulationUplift, setUplift] = useState(0),
    [selected, setSelected] = useState<Analysis | null>(null),
    [showImport, setShowImport] = useState(false),
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
  const [communicationInitialKey, setCommunicationInitialKey] = useState("");
  const [sharing, setSharing] = useState<{ related?:boolean; kind: "central" | "pa" | "cooperative"; central?: string; coop?: string; metric?: "VN" | "AR"; unitIdsByMetric?: Partial<Record<"VN" | "AR", string[]>>; format?: "email" | "image" | "summary"; showProjection?: boolean } | null>(null);
  const uplift = view === "overview" && analysisTab === "simulation" ? simulationUplift : 0;
  const effectiveSource = view === "cadence" ? "cadence" : source;
  const selectedMetric = effectiveSource === "cadence" || view === "actions" && metric === "both" ? "VN" : metric;
  const combinedPortfolios = selectedMetric === "both";
  const effectiveMetric = selectedMetric === "AR" ? "AR" : "VN";
  const periodDescription = periodTitle(period, month, dataset?.year ?? config.year);
  const paPanelKey = `${dataset?.year}:${coop}`;
  useEffect(() => { setDrillHistory([]); setExpandedCoops([]); setPriorityFocus(null); setRowSelection({context:'',keys:[]}); setShowExport(false); setShowCommunicationStart(false); }, [user?.id, dataset?.year]);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const nextId = session?.user.id ?? null;
      if (event === "SIGNED_OUT" || (activeOwner.current && activeOwner.current !== nextId)) {
        setDataset(null); setDatasetId(null); setSelected(null); setActions({});
        setFiles({base:null,cadence:null}); setWorkspaceRevision(null); setWorkspaces([]);
        setHistorical(false); sessionYears.current.clear(); setExpandedPaKey("");
        setSharing(null);
        setDrillHistory([]); setRowSelection({context:'',keys:[]}); setPriorityFocus(null); setPa('all'); setShowExport(false); setShowCommunicationStart(false);
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
    if (!selected && !showImport && !showCommunication && !showExport && !showCommunicationStart) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        setShowImport(false);
        setShowCommunication(false);
        setShowExport(false); setShowCommunicationStart(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, showImport, showCommunication, showExport, showCommunicationStart]);
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
  const cooperatives = useMemo(() => {
    const names = new Map<string, string>();
    const rows = view === "audit" ? dataset?.rows ?? [] : combinedPortfolios && dataset ? analysisRows(dataset).filter(row => row.source === effectiveSource) : sourceRows;
    for (const row of rows) if (row.cooperative && (central === "all" || row.central === central))
      names.set(`${row.central}:${row.cooperative}`, `${row.cooperative} · ${row.cooperativeName}`);
    if (view === "audit") {
      for (const entity of dataset?.registry?.entities ?? []) if (entity.kind === "cooperative" && (central === "all" || entity.central === central))
        names.set(`${entity.central}:${entity.cooperative}`, `${entity.cooperative} · ${entity.name}`);
      for (const issue of dataset?.issues ?? []) if (issue.central && issue.cooperative && (central === "all" || issue.central === central)) {
        const key = `${issue.central}:${issue.cooperative}`;
        if (!names.has(key)) names.set(key, `${issue.cooperative} · Central ${issue.central}`);
      }
    }
    return [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [sourceRows, central, dataset, view, combinedPortfolios, effectiveSource]);
  const groups = [...new Set(sourceRows.map((r) => r.group))].sort();
  const paOptions = useMemo(() => [...new Map(sourceRows.filter(row => row.pa != null && (central === 'all' || row.central === central) && (coop === 'all' || `${row.central}:${row.cooperative}` === coop) && (group === 'all' || row.group === group)).map(row => [`${row.central}:${row.cooperative}:${row.pa}`, `PA ${row.pa} · ${row.name} · Coop. ${row.cooperative}`])).entries()].sort((a,b) => a[1].localeCompare(b[1], 'pt-BR', {numeric:true})), [sourceRows, central, coop, group]);
  const filtered = useMemo(
    () =>
      sourceRows.filter(
        (r) =>
          (central === "all" || r.central === central) &&
          (coop === "all" || `${r.central}:${r.cooperative}` === coop) &&
          (group === "all" || r.group === group) &&
          (effectiveSource !== 'cadence' || pa === 'all' || `${r.central}:${r.cooperative}:${r.pa}` === pa),
      ),
    [sourceRows, central, coop, group, pa, effectiveSource],
  );
  const options = { year: dataset?.year ?? config.year, month, period, uplift };
  const actualLevel =
    effectiveSource === "cadence"
      ? "pa"
      : view === "actions"
        ? "cooperative"
        : level === "pa" ? "cooperative" : level;
  const analyses = useMemo(
    () =>
      aggregate(filtered, actualLevel)
        .map((r) =>
          analyze(r, {
            year: dataset?.year ?? config.year,
            month,
            period,
            uplift:0,
          }),
        )
        .sort(
          (a, b) =>
            (b.projectionGap ?? b.gap ?? -1) - (a.projectionGap ?? a.gap ?? -1),
        ),
    [filtered, actualLevel, dataset, config.year, month, period, uplift],
  );
  const filterContext = JSON.stringify([user?.id, dataset?.year, dataset?.importedAt, dataset?.registry?.updatedAt, effectiveSource, selectedMetric, central, coop, pa, group, actualLevel, period, month, search, statusFilter]);
  useEffect(()=>{if(priorityCarry.current){setPriorityFocus({context:filterContext,...priorityCarry.current});priorityCarry.current=null;}},[filterContext]);
  const focus = priorityFocus?.context === filterContext ? priorityFocus : null;
  const scopedRows: Analysis[] = analysisIndicators(filterDashboardRows(analyses, search, statusFilter), options);
  const cohort = focus ? scopedRows.filter(row => focus.keys.includes(row.key)) : scopedRows;
  const displayed: Analysis[] = sortAnalysis(analysisIndicators(uplift ? cohort.map(row=>analyze(row,options)) : cohort, options), sortBy);
  const selectionContext = `${filterContext}:${focus?.label ?? ''}`;
  useEffect(()=>{
    if(selectionCarry.current===null)return;
    const keys=selectionCarry.current.filter(key=>displayed.some(row=>row.key===key));
    selectionCarry.current=null;setRowSelection({context:selectionContext,keys});
  },[selectionContext]);
  const selectedKeys = rowSelection.context === selectionContext ? rowSelection.keys.filter(key => displayed.some(row => row.key === key)) : [];
  const summary = summarize(displayed);
  const baselineSummary = summarize(displayed.map(row=>analyze(row,{year:dataset?.year??config.year,month,period,uplift:0})));
  const effort = analysisEffort(displayed,summary);
  const hasGoalConflict = displayed.some((row) => row.annualConflict);
  const variance = goalVariance(summary.actual, summary.target, summary.gap != null && !hasGoalConflict);
  const visibleLeaves: (DataRow & { cutoffMin?: string })[] = visibleLeafRows(aggregate(filtered, effectiveSource === 'cadence' ? 'pa' : 'cooperative'), displayed, actualLevel);
  const leafSummary = summarize(visibleLeaves.map(row => analyze(row, { year: dataset?.year ?? config.year, month, period, uplift })));
  const scenarioFilters = { central, coop, pa: effectiveSource === 'cadence' ? pa : 'all', source: effectiveSource, metric: effectiveMetric, group, level: actualLevel, period, month, uplift, sortBy, search, status: statusFilter };
  const currentFilters = { ...scenarioFilters, metric: selectedMetric };
  const currentModels = useMemo(() => dataset && combinedPortfolios ? buildCurrentViewModels({dataset, filters: {central, coop, pa:'all', source:effectiveSource, metric:'both', group, level:actualLevel, period, month, uplift, sortBy, search, status:statusFilter}}) : [], [dataset, combinedPortfolios, central, coop, effectiveSource, group, actualLevel, period, month, uplift, sortBy, search, statusFilter]);
  const currentCount = combinedPortfolios ? currentModels.reduce((count, model) => count + model.count, 0) : displayed.length;
  const activeExportModel = combinedPortfolios ? currentModels.find(model => model.metric === exportMetric) : undefined;
  const baseSharingFilters = sharing?.coop
    ? { ...currentFilters, source: 'cadence', metric: 'VN', level: 'pa', central: sharing.central || central, coop: sharing.coop, pa: 'all', group: 'all', search: '', status: 'all' }
    : sharing?.central
      ? { ...currentFilters, source: 'base', level: 'cooperative', central: sharing.central, coop, pa: 'all', search: '', status: 'all' }
      : { ...currentFilters, ...(sharing?.metric ? {metric:sharing.metric} : {}) };
  const sharingFilters = {...baseSharingFilters,...(sharing?.related?{search:'',status:'all',group:'all',pa:'all'}:{})};
  const insights = buildDecisionInsights(displayed);
  const cutoffs = [...new Set(visibleLeaves.flatMap((r) => [r.cutoffMin || r.cutoff, r.cutoff]))].sort();
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
    if (view !== "audit" && group !== "all") labels.push(`Grupo ${group}`);
    if (view !== "audit" && pa !== "all") labels.push(paOptions.find(([key]) => key === pa)?.[1] ?? `PA ${pa.split(':').at(-1)}`);
    return labels.length ? labels.join(" · ") : "Todas as centrais da seleção";
  }, [central, coop, group, pa, paOptions, cooperatives, centralOptions, view]);
  const [auditKind, setAuditKind] = useState("data");
  const audits = (dataset?.issues ?? []).filter(
    (i) =>
      (central === "all" || !i.central || i.central === central) &&
      (coop === "all" || !i.cooperative || `${i.central}:${i.cooperative}` === coop),
  );
  const visibleAudits = audits.filter(i => auditKind === "all" || (auditKind === "method" ? i.kind === "method" : i.kind !== "method"));
  const activeAgendaRequest = agendaRequest && agendaRequest.owner === user?.id && agendaRequest?.year === dataset?.year ? agendaRequest : undefined;
  useEffect(() => {
    if (view === "registry" && activeAgendaRequest) return;
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [view, activeAgendaRequest]);
  function canLeaveRegistry() {
    if (registrySaving) return false;
    if (registryDirty && !window.confirm(view === "agenda" ? "Há um compromisso não salvo na agenda. Deseja sair sem salvar?" : "Há alterações não salvas no cadastro. Deseja sair sem salvar?")) return false;
    setRegistryDirty(false); return true;
  }
  function navigate(next: View) {
    if (next !== view && !canLeaveRegistry()) return false;
    if (next !== view && (next === 'overview' || next === 'cadence')) setUnitsExpanded(true);
    setSharing(null);
    if(next!=='overview'&&next!=='cadence'&&next!=='actions'){setDrillHistory([]);setPriorityFocus(null);setExpandedCoops([]);}
    setAgendaRequest(null);
    if (next === view) { headingRef.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
    if ((next === "registry" || next === "agenda") && !dataset) setDataset(createEmptyDataset(config.year));
    setView(next);
    setExpandedPaKey("");
    if (next === "cadence") {
      setSource("cadence");
      setMetric("VN");
      setGroup("all");
    }
    if (next === "overview") {
      if(view === "cadence"){setSource("base");setPa("all");setLevel('cooperative');}
    }
    return true;
  }
  function openAgendaEntity(entity: RegistryEntity, appointment: EntityAppointment) {
    if (!dataset || !user || historical || !navigate("registry")) return;
    setAgendaRequest({ owner: user.id, year: dataset.year, entityId: entity.id, date: zonedDateTimeInput(appointment.startsAt, appointment.timezone).slice(0, 10), request: Date.now() });
  }
  function resetFilters() {
    setCentral("all");
    setCoop("all");
    setGroup("all");
    setSearch("");
    setUplift(0);
    setStatusFilter("all");
    setSortBy("attainment-desc");
    setPa('all'); setPriorityFocus(null); setRowSelection({context:'',keys:[]}); setExpandedCoops([]);
  }
  function rememberFilters() {
    setDrillHistory(items => [...items, {tab:analysisTab,unitLayout,scrollY:window.scrollY,selection:rowSelection,expandedCoops,view, source, metric, central, coop, pa, group, level, search, status:statusFilter, sortBy, month, period, uplift:simulationUplift, expandedPaKey, priorityFocus:focus}]);
  }
  function openCentral(row: Analysis) {
    rememberFilters();setMetric(row.metric); changeAnalysisTab('units',false); setCentral(row.central); setCoop('all'); setPa('all'); setGroup('all'); setSearch(''); setStatusFilter('all'); setLevel('cooperative'); setPriorityFocus(null);
  }
  function openCooperative(row: Analysis, cadence = false) {
    rememberFilters(); changeAnalysisTab('units',false);
    setUnitsExpanded(true);
    setCentral(row.central); setCoop(`${row.central}:${row.cooperative}`); setPa('all'); setGroup('all'); setSearch(''); setStatusFilter('all'); setPriorityFocus(null);
    if (cadence) { setView('cadence'); setSource('cadence'); setMetric('VN'); }
    else { setLevel('cooperative'); setExpandedCoops([row.key]); setExpandedPaKey(`${dataset?.year}:${row.central}:${row.cooperative}`); }
  }
  function goBack() {
    const previous = drillHistory.at(-1); if (!previous) return;
    setAnalysisTab(previous.tab);setUnitLayout(previous.unitLayout); setVisitedTabs(items=>[...new Set([...items,previous.tab])]); setRowSelection(previous.selection); setExpandedCoops(previous.expandedCoops);
    requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:previous.scrollY,behavior:"instant"})));
    setView(previous.view); setSource(previous.source); setMetric(previous.metric); setCentral(previous.central); setCoop(previous.coop); setPa(previous.pa); setGroup(previous.group); setLevel(previous.level); setSearch(previous.search); setStatusFilter(previous.status); setSortBy(previous.sortBy); setMonth(previous.month); setPeriod(previous.period); setUplift(previous.uplift); setExpandedPaKey(previous.expandedPaKey); setPriorityFocus(previous.priorityFocus); setDrillHistory(items => items.slice(0, -1));
  }
  function changeAnalysisTab(next:AnalysisTab,restore=true) {
    document.querySelectorAll<HTMLDetailsElement>('.year-management[open]').forEach(element=>{element.open=false;});
    tabPositions.current[analysisTab]=window.scrollY;
    setAnalysisTab(next);setVisitedTabs(items=>items.includes(next)?items:[...items,next]);
    if(restore)requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:tabPositions.current[next]??0,behavior:'instant'})));
  }
  function openUnitAnalysis(row:Analysis) {
    if(row.source==='cadence'){openUnitHistory(row);return;}
    if(!row.cooperative){openCentral(row);return;}
    rememberFilters();selectionCarry.current=[...selectedKeys];setMetric(row.metric);setCentral(row.central);setCoop(`${row.central}:${row.cooperative}`);setPa('all');setSearch('');setStatusFilter('all');setPriorityFocus(null);setLevel('cooperative');changeAnalysisTab('units',false);
  }
  function openUnitHistory(row:Analysis) {
    rememberFilters();setCentral(row.central);setCoop(row.cooperative?`${row.central}:${row.cooperative}`:'all');setPa(row.pa!=null?`${row.central}:${row.cooperative}:${row.pa}`:'all');setSource(row.source==='cadence'?'cadence':'base');setMetric(row.metric);setGroup('all');setSearch('');setStatusFilter('all');setPriorityFocus(null);setLevel(row.pa!=null?'pa':'cooperative');setView('overview');changeAnalysisTab('periods',false);
  }
  function returnToAncestor(kind:'central'|'cooperative'){
    const index=drillHistory.findLastIndex(item=>item.source==='base'&&item.central===central&&(kind==='central'?item.coop==='all':item.coop===coop));
    if(index>=0){restoreSnapshot(drillHistory[index],drillHistory.slice(0,index));return;}
    setSource('base');setLevel('cooperative');setPa('all');if(kind==='central')setCoop('all');changeAnalysisTab('units');
  }
  function returnToRoot() {
    if(drillHistory.length){const first=drillHistory[0];setDrillHistory([first]);requestAnimationFrame(()=>restoreSnapshot(first));return;}
    setCentral('all');setCoop('all');setPa('all');changeAnalysisTab('overview');
  }
  function restoreSnapshot(previous:FilterSnapshot,history:FilterSnapshot[]=[]){
    setView(previous.view);setAnalysisTab(previous.tab);setUnitLayout(previous.unitLayout);setSource(previous.source);setMetric(previous.metric);setCentral(previous.central);setCoop(previous.coop);setPa(previous.pa);setGroup(previous.group);setLevel(previous.level);setSearch(previous.search);setStatusFilter(previous.status);setSortBy(previous.sortBy);setMonth(previous.month);setPeriod(previous.period);setUplift(previous.uplift);setExpandedPaKey(previous.expandedPaKey);setPriorityFocus(previous.priorityFocus);setRowSelection(previous.selection);setExpandedCoops(previous.expandedCoops);setDrillHistory(history);requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:previous.scrollY,behavior:'instant'})));
  }
  function selectRow(key: string) {
    setRowSelection({context: selectionContext, keys: selectedKeys.includes(key) ? selectedKeys.filter(item => item !== key) : [...selectedKeys, key]});
  }
  function openCommunicationStart() { communicationOpener.current = document.activeElement as HTMLElement | null;setShareScenario(view==='overview'&&analysisTab==='units'&&unitLayout==='matrix'?'matrix':view==='overview'&&['periods','comparison','simulation'].includes(analysisTab)?analysisTab:'summary'); setShowCommunicationStart(true); }
  function shareMatrix(model?:CurrentViewModel,onlyRow?:Analysis){
    if(!dataset)return;
    const scopes=model?[{label:model.label,rows:onlyRow?[onlyRow]:model.rows}]:combinedPortfolios?currentModels.map(item=>({label:item.label,rows:item.rows})):[{label:metricName(selectedMetric),rows:onlyRow?[onlyRow]:displayed}];
    const matrices=scopes.map(scope=>({...scope,matrix:buildUnitScenarioMatrix({rows:scope.rows,year:dataset.year,month})}));
    const labels=matrices[0]?.matrix.horizons??[];
    setShowCommunicationStart(false);
    setReportShare({title:'Mês · trimestre · ano',context:[scopeLabel,`Referência: ${MONTHS[month]}/${dataset.year}`,`Filtro da lista: ${periodDescription}`,`Ordenação: ${SORT_OPTIONS[sortBy as keyof typeof SORT_OPTIONS]}`,search?`Busca: ${search}`:'',statusFilter!=='all'?`Situação: ${statusFilter}`:'',focus?.label??''].filter(Boolean),columns:['Carteira · Unidade',...labels.flatMap(horizon=>[`${horizon.label} · Meta`,`${horizon.label} · Realizado`,`${horizon.label} · %`]),'Corte'],rows:matrices.flatMap(scope=>scope.matrix.rows.map(item=>[`${scope.label} · ${item.unit.name} · Central ${item.unit.central}${item.unit.cooperative?` · Coop. ${item.unit.cooperative}`:''}${item.unit.pa!=null?` · PA ${item.unit.pa}`:''}`,...scope.matrix.horizons.flatMap(horizon=>{const value=item.periods[horizon.id];return [money(value.target),money(value.actual),value.annualConflict?'Revisar meta':value.target==null?'Sem meta':value.target===0?'Meta zero':value.phaseKey==='future'?'Futuro':!value.complete?'Sem avaliação':percent(value.attainment)];}),item.cutoffMin!==item.cutoff?`${shortDate(item.cutoffMin)} a ${shortDate(item.cutoff)}`:shortDate(item.cutoff)])),notes:['Mesmas unidades nos três horizontes, conforme filtros e ordenação da lista.','Realizado registrado até o corte de cada unidade. Períodos futuros e ausências não são zero.','Carteiras e fontes permanecem separadas; cooperativas não são somadas aos PAs.']});
  }
  function shareComparison(comparison:ReturnType<typeof compareYears>,previousYear:number,model?:CurrentViewModel){
    const dates=(side:'current'|'previous')=>[...new Set(comparison.rows.flatMap(row=>{const value=row[side];return value?[value.cutoffMin??value.cutoff,value.cutoff].filter(Boolean):[];}))].sort();
    setReportShare({title:'Comparativo entre anos',context:[scopeLabel,model?.label??metricName(selectedMetric),`Recorte efetivamente comparado: ${MONTHS[comparison.first]}–${MONTHS[comparison.last]}`,`${dataset?.year} × ${previousYear} · meses fechados equivalentes`,`${dataset?.year} cortes: ${dates('current').map(shortDate).join(' a ')||'Não informado'}`,`${previousYear} cortes: ${dates('previous').map(shortDate).join(' a ')||'Não informado'}`],columns:['Unidade',`Realizado ${dataset?.year}`,`Realizado ${previousYear}`,'Variação R$','Variação %'],rows:comparison.rows.map(row=>[row.name,money(row.current?.actual),money(row.previous?.actual),money(row.delta),percent(row.growth)]),notes:['Mesmos meses fechados nos dois anos. Ausência de dado não é zero.','Variação percentual exige base anterior positiva.',search?`Busca: ${search}`:'',statusFilter!=='all'?`Situação: ${statusFilter}`:'',focus?.label??''].filter(Boolean)});
  }
  function shareSimulation(model?:CurrentViewModel){
    const models=model?[model]:combinedPortfolios?currentModels:[];
    const simulations=models.length?models.map(item=>({label:item.label,rows:item.rows,cutoffs:[...new Set([item.cutoffMin,item.cutoff].filter((value):value is string=>!!value))]})):[{label:metricName(selectedMetric),rows:displayed,cutoffs}];
    const rows:string[][]=[];
    for(const item of simulations){
      const base=summarize(item.rows.map(row=>analyze(row,{year:dataset?.year??config.year,month,period,uplift:0})));
      const simulation=summarize(item.rows.map(row=>analyze(row,{year:dataset?.year??config.year,month,period,uplift:simulationUplift})));
      const temporal=analysisEffort(item.rows,base);
      const gap=simulation.target!=null&&simulation.projected!=null?Math.max(0,simulation.target-simulation.projected):null;
      rows.push(...[['Meta',money(base.target),periodDescription],['Realizado',money(base.actual),'Registrado até o corte'],['Projeção atual',money(base.projected),'Estimativa sem aumento'],['Cenário simulado',money(simulation.projected),`+${simulationUplift}% no ritmo futuro`],['Impacto',money(simulation.projected!=null&&base.projected!=null?simulation.projected-base.projected:null),'Diferença entre projeções'],['GAP projetado',money(gap),'Mesma meta e horizonte'],['Esforço por dia útil',money(temporal.daily),temporal.remainingDays==null?'Cortes ou prazos distintos':`${temporal.remainingDays} dias úteis restantes`]].map(row=>[`${item.label} · ${row[0]}`,row[1],row[2]]));
    }
    setShowCommunicationStart(false);changeAnalysisTab('simulation');
    setReportShare({title:`Simulação de ritmo +${simulationUplift}%`,context:[scopeLabel,model?.label??metricName(selectedMetric),periodDescription,...simulations.map(item=>`${item.label} · cortes: ${item.cutoffs.map(shortDate).join(' a ')||'Não informado'}`)],columns:['Carteira / indicador','Valor','Referência'],rows,notes:['Simulação: altera somente a produção futura estimada. Metas e realizado permanecem iguais.','Estimativa baseada no ritmo observado e nas metas restantes; não é probabilidade.','Dias úteis: segunda a sexta, sem descontar feriados.',search?`Busca: ${search}`:'',focus?.label??''].filter(Boolean)});
  }
  function startCommunication(choice: CommunicationChoice, fromStart = true, portfolio?: 'VN' | 'AR') {
    setShowCommunicationStart(false); communicationFromStart.current = fromStart;
    const related=choice.content!==actualLevel;
    const cohortModels=combinedPortfolios?currentModels.filter(model=>!portfolio||model.metric===portfolio):[{metric:effectiveMetric,rows:displayed,unitIds:displayed.map(row=>entityFromAnalysis(row).id)}];
    const unitIdsByMetric=related&&dataset?Object.fromEntries((choice.content==='pa'?['VN']:cohortModels.map(model=>model.metric)).map(targetMetric=>[targetMetric,relatedScenarioIds(analysisRows(dataset),cohortModels.flatMap(model=>model.rows),choice.content,targetMetric)])):Object.fromEntries(cohortModels.map(model=>[model.metric,model.unitIds]));
    setSharing({kind:choice.content,related,format:choice.format,showProjection:choice.showProjection,unitIdsByMetric,...(choice.content==='pa'&&coop!=='all'?{coop,central}:{}),...(portfolio?{metric:portfolio}:{})});
  }
  function showAllPeriods() {
    changeAnalysisTab('periods',false);
    setPeriodExpandRequest(value => value + 1);
    requestAnimationFrame(() => { const panel = document.getElementById('resultados-por-periodo'); panel?.focus({preventScroll:true}); panel?.scrollIntoView({block:'start',behavior:'smooth'}); });
  }
  function restoreCommunicationFocus() { if (communicationFromStart.current) (communicationOpener.current?.isConnected ? communicationOpener.current : communicationButton.current)?.focus(); communicationFromStart.current = false; }
  function closeCommunication() { setShowCommunication(false); restoreCommunicationFocus(); }
  function closeSharing() { setSharing(null); restoreCommunicationFocus(); }
  function refreshWorkspaces(owner: string) {
    void listWorkspaces(owner).then((items) => { if (activeOwner.current === owner) setWorkspaces(items); }).catch(() => {});
  }
  async function openWorkspace(year: number) {
    if (!canLeaveRegistry()) return;
    setAgendaRequest(null);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) { setError("Informe um ano entre 2020 e 2100."); return; }
    setBusy("Abrindo cadastro anual…"); setError("");
    const owner = user?.id ?? null;
    if (dataset && !historical) sessionYears.current.set(dataset.year, dataset);
    try {
      const saved = user ? await loadWorkspace(user.id, year) : null;
      if (activeOwner.current !== owner) return;
      const next = saved ? initializeRegistry(saved.dataset) : sessionYears.current.get(year) ?? createEmptyDataset(year);
      sessionYears.current.set(next.year, next);
      setDataset(next); setWorkspaceRevision(saved?.revision ?? null); setConfig(next.config);
      if (owner) refreshWorkspaces(owner);
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
    if (registrySaving) return;
    if (view === "agenda" && registryDirty && !window.confirm("A importação encerrará o compromisso não salvo na agenda. Deseja continuar?")) return;
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
      const allowedCentrals = current?.registry?.entities.filter((entity) => entity.kind === "central").map((entity) => entity.central) ?? [];
      const parts = [];
      for (const [expectedSource, file] of selectedFiles) {
        const parsed = await parseWorkbook(
          await readWorkbookFile(file),
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
  async function logout() {
    if (view === "agenda" && registryDirty && !window.confirm("Há um compromisso não salvo na agenda. Deseja sair sem salvar?")) return;
    setLeaving(true);
    setSharing(null);
    activeOwner.current = null;
    setDataset(null); setSelected(null); setActions({}); setHistory([]); setWorkspaces([]);
    setFiles({ base: null, cadence: null }); sessionYears.current.clear();
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10000) });
    } catch { /* Local access is removed even when the provider is unavailable. */ } finally {
      clearLocalAuth();
      try { localStorage.setItem('commercial:logout', String(Date.now())); } catch { /* Storage may be disabled. */ }
      try { const channel = new BroadcastChannel('commercial:session'); channel.postMessage('logout'); channel.close(); } catch { /* Storage/visibility checks remain available. */ }
      window.location.replace('/login');
    }
  }
  async function saveDataset() {
    if (!dataset || !supabase || !user) {
      window.location.replace("/login");
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
  const analysisRefinements = <>
                            <label className="control-field"><span>Situação</span><select aria-label="Filtrar situação" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                              <option value="all">Todas as situações</option><option value="attention">Precisam de atenção</option><option value="track">Em rota / meta atingida</option><option value="missing">Dados ou metas pendentes</option>
                            </select></label>
                            {effectiveSource === "base" && view !== "actions" && (
                              <label className="control-field">
                                <span>Agrupar por</span>
                                <select
                                  aria-label="Agrupar por"
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
  </>;
  const listControls = <>
                            <label className="control-field"><span>Ordenar por</span><select aria-label="Ordenar análise" value={sortBy} onChange={event => setSortBy(event.target.value)}>{Object.entries(SORT_OPTIONS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
  </>;
  const resultContextPanels = <>
    {summary.gap!=null&&leafSummary.individualGap!=null&&leafSummary.individualGap>summary.gap+0.01&&<aside className="gap-reconciliation"><Info size={16}/><span><strong>Déficits das unidades: {money(leafSummary.individualGap)}.</strong> Superações compensam parte desse valor no consolidado.</span><button className="button quiet" onClick={()=>{rememberFilters();setView('actions');}}>Abrir plano de ação</button></aside>}
  </>;
  const importPanel = (
    <>
      <h2>Importar planilhas</h2>
      <p className="muted">
        Escolha o objetivo do envio e as planilhas.
      </p>
      <label className="import-mode">Objetivo deste envio
        <select value={importMode} onChange={(e) => { setImportMode(e.target.value); if (e.target.value === "history") { const year = (dataset?.year ?? new Date().getFullYear()) - 1; setConfig({ ...config, year, vnCutoff: `${year}-12-31`, arCutoff: `${year}-12-31`, cadenceCutoff: `${year}-12-31`, paTargetMode: "source" }); } }}>
          <option value="production">Atualizar produção</option>
          <option value="fixed">Cadastrar unidades e metas</option>
          <option value="history">Importar outro ano</option>
        </select>
      </label>
      {importMode === "history" && <p className="helper">As metas, a produção e as unidades serão guardadas somente no ano informado. Confirme os cortes; não use 31/12 se a base ainda for parcial. Novas cooperativas e PAs não serão incluídos retroativamente em outros anos.</p>}
      <label className="import-mode">Metas PA deste ano<select value={config.paTargetMode ?? (config.year < 2026 ? "source" : "group")} onChange={event => setConfig({ ...config, paTargetMode: event.target.value as "source" | "group" })}><option value="source">Metas da planilha</option><option value="group">Regra fixa P1–P5 (2026)</option></select></label>
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
        {selectedFileCount}/2 fontes selecionadas · até {XLSX_FILE_LIMIT_MB} MB por arquivo
      </p>
      <div className="import-guidance">
        <Info size={18} />
        <span>
          {importMode === "production" && "Metas cadastradas são mantidas. "}
          {importMode === "fixed" ? "Importa unidades, metas e realizados disponíveis. Preserva cadastros existentes." : "Confirme a posição de cada fonte. Valores enviados substituem a produção mensal correspondente; meses vazios e fontes não enviadas são preservados."}
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
        Informe a posição apenas das fontes enviadas. Para um mês fechado, use o último dia do mês.
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
  if (leaving) return <main className="auth-check" role="status">Encerrando sessão…</main>;
  return (
    <div className="app-shell portal">
      <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Sicoob Gestão Comercial — início">
          <img className="brand-logo" src="/brand/sicoob-logo-light.svg" alt="Sicoob" width="152" height="36" />
          <span className="brand-caption">GESTÃO COMERCIAL</span>
        </a>
        <PortalNavigation view={view} disabled={!!busy || registrySaving} issueCount={dataset?.issues.filter(i => i.kind !== 'method').length ?? 0} onNavigate={navigate} />
        <div className="sidebar-foot">
          <div className="session-state">
            <span className="avatar">
              {user?.email?.slice(0, 2).toUpperCase() ?? "AC"}
            </span>
            <span>
              Conta conectada
              <small>Acesso restrito</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <img className="mobile-brand" src="/brand/sicoob-logo.svg" alt="Sicoob" width="108" height="25" />
            Gestão comercial
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
              aria-label="Sair"
              onClick={logout}
            >
              <LogOut size={17} />
              <span>Sair</span>
            </button>
            <button
              className="button primary"
              disabled={!!busy || registrySaving}
              onClick={() => setShowImport(true)}
            >
              <Upload size={17} />
              Importar base
            </button>
          </div>
        </header>
        <main id="conteudo" className={`workspace-content view-${view} analysis-${analysisTab}`} tabIndex={-1}>
          <div className="page-heading">
            <div>
              <h1 ref={headingRef} tabIndex={-1}>{VIEW_TITLES[view]}</h1>
              {!dataset && <p>Escolha uma base para começar.</p>}
            </div>
            {dataset && ["overview", "cadence", "actions"].includes(view) && (
              <div className="page-heading-actions">
                {currentCount > 0 && (
                  <button ref={communicationButton} className="button primary" onClick={openCommunicationStart}>
                    <MessageSquareText size={17} /> Compartilhar cenário
                  </button>
                )}
                <button className="button secondary" onClick={() => {setExportMode('filtered');setShowExport(true);}}>
                  <ArrowDownToLine size={17} />
                  Exportar dados
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
          {dataset && !historical && !["overview","cadence","actions"].includes(view) && <div className="workspace-toolbar" aria-label="Contexto do cadastro">
            <label>Ano <select aria-label="Ano do cadastro" value={dataset.year} disabled={!!busy || registrySaving} onChange={(e) => openWorkspace(Number(e.target.value))}>
              {[...new Set([dataset.year, ...workspaces.map((w)=>w.year), ...sessionYears.current.keys()])].sort((a,b)=>b-a).map((y)=><option key={y} value={y}>{y}</option>)}
            </select></label>
            <details className="year-management"><summary>Gerenciar anos</summary><div>            <button className="button secondary" disabled={!!busy || registrySaving} onClick={() => openWorkspace(dataset.year + 1)}>Novo ano</button>
            <label>Abrir outro ano<input aria-label="Ano para abrir" type="number" min="2020" max="2100" value={requestedYear} onChange={event => setRequestedYear(Number(event.target.value))} /></label><button className="button secondary" disabled={!!busy || registrySaving} onClick={() => openWorkspace(requestedYear)}>Abrir ano</button>
            {user && <button className="button secondary" disabled={!!busy || registrySaving} onClick={() => openWorkspace(dataset.year)}>Recarregar cadastro salvo</button>}
</div></details>
            <span className="muted">{user && workspaceRevision ? "Cadastro salvo" : "Dados nesta sessão"}</span>
          </div>}
          {view === "alerts" && dataset && user ? (
            <GoalAlerts key={`${user.id}:${dataset.year}:${historical}`} dataset={dataset} userId={user.id} />
          ) : view === "agenda" && dataset && user ? (
            historical ? <section className="panel empty"><p>A agenda pertence ao cadastro atual.</p><button className="button secondary" disabled={!!busy} onClick={() => openWorkspace(dataset.year)}>Retomar cadastro atual</button></section> : <ConsolidatedAgenda key={`${user.id}:${dataset.year}`} entities={dataset.registry?.entities ?? []} year={dataset.year} userId={user.id} refreshKey={0} onOpenEntity={openAgendaEntity} onDirtyChange={setRegistryDirty} onSavingChange={setRegistrySaving} disabled={!!busy} />
          ) : view === "registry" && dataset ? (
            historical ? <section className="panel empty"><p>Retome o cadastro atual para incluir, editar ou excluir unidades.</p></section> : <RegistryManager key={`${user?.id ?? 'session'}:${dataset.year}`} userId={user?.id ?? ''} dataset={dataset} workspaceRevision={workspaceRevision} onChange={changeRegistry} busy={!!busy} initialAgenda={activeAgendaRequest} onDirtyChange={setRegistryDirty} onSavingChange={setRegistrySaving}/>
          ) : !dataset && view !== "imports" ? (
            <div className="welcome-grid">
              <section className="panel import-panel">{importPanel}</section>
              <section className="welcome-aside">
                <div className="welcome-target"><Target size={32} aria-hidden="true" /></div>
                <h2>Sem planilha agora?</h2>
                <p>Comece pelas unidades e metas. A produção pode ser atualizada depois.</p>
                <button className="button secondary" disabled={!!busy} onClick={() => navigate("registry")}>Começar pelo cadastro manual</button>
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
                {history.length ? (
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
              {view==='overview'&&<><AnalysisBreadcrumb items={[
                {label:'Análises',onClick:returnToRoot},
                ...(central!=='all'?[{label:centralOptions.find(([id])=>id===central)?.[1]??`Central ${central}`,onClick:()=>returnToAncestor('central')}]:[]),
                ...(coop!=='all'?[{label:cooperatives.find(([id])=>id===coop)?.[1]??`Cooperativa ${coop.split(':')[1]}`,onClick:()=>returnToAncestor('cooperative')}]:[]),
                ...(pa!=='all'?[{label:paOptions.find(([id])=>id===pa)?.[1]??`PA ${pa.split(':').at(-1)}`}]:[]),
              ]}/><AnalysisTabs active={analysisTab} onChange={changeAnalysisTab}/></>}
              <FilterPanel compact={view==='overview'&&analysisTab==='overview'} primary={view!=='audit'?<>
                {dataset&&<label>Ano<select aria-label="Ano do cadastro" value={dataset.year} disabled={!!busy||registrySaving} onChange={event=>openWorkspace(Number(event.target.value))}>{[...new Set([dataset.year,...workspaces.map(item=>item.year),...sessionYears.current.keys()])].sort((a,b)=>b-a).map(year=><option key={year} value={year}>{year}</option>)}</select></label>}
                <label>Carteira<select aria-label="Carteira" value={selectedMetric} disabled={effectiveSource==='cadence'} onChange={event=>setMetric(event.target.value)}><option value="VN">Venda Nova</option><option value="AR">Arrecadação</option>{view==='overview'&&<option value="both">Venda Nova + Arrecadação</option>}</select></label>
                <label>Central<select aria-label="Central" value={central} onChange={event=>{setCentral(event.target.value);setCoop('all');setPa('all');setExpandedCoops([]);setPriorityFocus(null);}}><option value="all">Todas as centrais</option>{centralOptions.map(([id,name])=><option value={id} key={id}>{id} · {name.replace('Sicoob Central ','')}</option>)}</select></label>
                {view==='overview'&&analysisTab==='overview'&&<label>Cooperativa<select aria-label="Cooperativa" value={coop} disabled={central==='all'} onChange={event=>{setCoop(event.target.value);setPa('all');setExpandedCoops([]);setPriorityFocus(null);}}><option value="all">{central==='all'?'Selecione uma central':'Todas as cooperativas'}</option>{cooperatives.map(([id,name])=><option key={id} value={id}>{name.replace('SICOOB ','')}</option>)}</select></label>}
                <PeriodSelector showCoverage={!(view==='overview'&&analysisTab==='overview')} period={period} month={month} year={dataset?.year??config.year} onPeriodChange={setPeriod} onMonthChange={setMonth}/>
              </>:undefined} description={view==='audit'?scopeLabel:[metricName(selectedMetric),scopeLabel,periodDescription,cutoff?`Corte ${shortDate(cutoff)}`:'Sem corte',...new Set(displayed.map(row=>row.phase)),statusFilter!=='all'?({attention:'Precisam de atenção',track:'Em rota / meta atingida',missing:'Dados ou metas pendentes'} as Record<string,string>)[statusFilter]:'',search?`Busca: ${search}`:''].filter(Boolean).join(' · ')} onReset={resetFilters} active={pa!=='all'||central!=='all'||coop!=='all'||group!=='all'||Boolean(search)||statusFilter!=='all'||uplift>0}>
                {view!=='audit'&&<label>Fonte<select value={effectiveSource} onChange={event=>{setSource(event.target.value as 'base'|'cadence');setPa('all');setGroup('all');if(view==='cadence')setView('overview');}}><option value="base">Cooperativas</option><option value="cadence">Cadência PA</option></select></label>}
                {view==='audit'&&<label>Central<select aria-label="Central" value={central} onChange={event=>{setCentral(event.target.value);setCoop('all');}}><option value="all">Todas as centrais</option>{centralOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>}
                <label>Cooperativa<select value={coop} onChange={event=>{setCoop(event.target.value);setPa('all');setExpandedCoops([]);if(event.target.value!=='all')setCentral(event.target.value.split(':')[0]);}}><option value="all">Todas as cooperativas</option>{cooperatives.map(([id,name])=><option key={id} value={id}>{name.replace('SICOOB ','')}</option>)}</select></label>
                {view!=='audit'&&effectiveSource==='cadence'&&<><label>Grupo do PA<select value={group} onChange={event=>{setGroup(event.target.value);setPa('all');}}><option value="all">Todos os grupos</option>{groups.map(item=><option key={item} value={item}>{item}</option>)}</select></label><label>PA<select aria-label="PA" value={pa} onChange={event=>{setPa(event.target.value);if(event.target.value!=='all'){const [parentCentral,parentCoop]=event.target.value.split(':');setCentral(parentCentral);setCoop(`${parentCentral}:${parentCoop}`);}}}><option value="all">Todos os PAs</option>{paOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label></>}
                {view!=='audit'&&analysisRefinements}
                {view==='overview'&&dataset&&<details className="year-management"><summary>Gerenciar anos</summary><div><button className="button secondary" disabled={!!busy||registrySaving} onClick={()=>openWorkspace(dataset.year+1)}>Novo ano</button><label>Abrir outro ano<input aria-label="Ano para abrir" type="number" min="2020" max="2100" value={requestedYear} onChange={event=>setRequestedYear(Number(event.target.value))}/></label><button className="button secondary" onClick={()=>openWorkspace(requestedYear)}>Abrir ano</button>{user&&<button className="button secondary" onClick={()=>openWorkspace(dataset.year)}>Recarregar cadastro salvo</button>}</div></details>}
              </FilterPanel>
              {view !== 'audit' && (drillHistory.length > 0 || focus) && <div className="scope-navigation" aria-label="Navegação do recorte">
                {drillHistory.length > 0 && <button type="button" className="button quiet" onClick={goBack}><ChevronLeft size={16} />Voltar ao recorte anterior</button>}
                {focus && <span className="focus-chip">{focus.label}<button type="button" className="button quiet" onClick={() => setPriorityFocus(null)}>Limpar prioridade</button></span>}
              </div>}
              {uplift > 0 && view !== "audit" && <div className="simulation-banner"><span>Simulação de ritmo +{uplift}% ativa · somente projeções</span><button className="button quiet" onClick={() => setUplift(0)}>Limpar simulação</button></div>}
              {view === "audit" ? (
                <>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Conferência das fontes</h2>
                        <p>
                          Verifique os avisos antes de compartilhar o cenário.
                        </p>
                      </div>
                      <span className="pill neutral">
                        {visibleAudits.length} avisos
                      </span>
                    </div>
                    <div className="audit-list">
                      <label className="audit-kind">Tipo de aviso<select value={auditKind} onChange={e => setAuditKind(e.target.value)}><option value="all">Todos os avisos</option><option value="data">Dados e importação</option><option value="method">Critérios de cálculo</option></select></label>
                      {!visibleAudits.length && <p className="empty">Nenhum aviso nesta seleção.</p>}
                      {visibleAudits.map((i, n) => (
                        <div key={n}>
                          <Info size={18} />
                          <p>{i.message}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <details className="progressive-panel"><summary>Fontes e regras de cálculo</summary>
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
                        <strong>Cadência PA:</strong> metas do cadastro anual. Metas históricas da planilha e ajustes manuais têm prioridade sobre a referência P1–P5 de 2026.
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
                        <strong>Esforço por dia útil:</strong> meta rateada e esforço
                        estimado; realizado diário indisponível.
                      </p>
                    </div>
                  </section>
                  </details>
                </>
              ) : combinedPortfolios && dataset ? (
                <>
                  <div className="overview-period-shortcut"><button type="button" className="button quiet" onClick={showAllPeriods}>Ver todos os períodos <ArrowRight size={16} aria-hidden="true" /></button></div>
                  <CombinedPortfolio onAction={setSelected} unitLayout={unitLayout} onMatrixShare={shareMatrix} mode={analysisTab} onAnalysisTab={changeAnalysisTab} years={[...workspaces.map(item=>item.year),...sessionYears.current.keys()]} sessionDatasets={sessionYears.current} simulationUplift={simulationUplift} onUplift={setUplift} onComparisonShare={shareComparison} onSimulationShare={shareSimulation} onHistory={openUnitHistory} onPaShare={row=>setSharing({kind:'pa',central:row.central,coop:`${row.central}:${row.cooperative}`})} shareRequest={periodShareRequest}
                    onPriority={(action,portfolio)=>{priorityCarry.current={keys:action.keys,label:({pace:'Unidades abaixo do ritmo','near-goal':'Próximas da meta',gap:'Maiores déficits',review:'Dados para conferir',production:'Maiores produções'} as const)[action.kind]};setMetric(portfolio);setSortBy(action.sortBy);changeAnalysisTab('units');}}
                    dataset={dataset} filters={currentFilters} models={currentModels} ownerId={user?.id} expandRequest={periodExpandRequest} controls={<div className="table-controls combined-controls"><UnitLayoutSwitch value={unitLayout} onChange={setUnitLayout}/>{listControls}</div>}
                    onSelect={openUnitAnalysis} onDrill={row => actualLevel === 'central' ? openCentral(row) : openCooperative(row, true)}
                    onShare={portfolio => startCommunication({content:actualLevel === 'central' ? 'central' : 'cooperative',format:'image',showProjection:false}, false, portfolio)}
                    onExport={portfolio => {setExportMetric(portfolio);setExportMode('filtered');setShowExport(true);}} />
                </>
              ) : !filtered.length ? (
                <section className="panel empty">
                  <FileSpreadsheet size={34} />
                  <h2>Sem dados para esta seleção.</h2>
                  <p>Importe a fonte correspondente ou ajuste os filtros.</p>
                  <button className="button secondary" onClick={resetFilters}>
                    Limpar filtros
                  </button>
                  {sourceRows.some(row => row.cooperative && (central === "all" || row.central === central) && (coop === "all" || `${row.central}:${row.cooperative}` === coop)) && <button type="button" className="button secondary pa-share-trigger" onClick={() => unitLayout==='matrix'&&view==='overview'?shareMatrix():startCommunication({content:actualLevel === "central" ? "central" : actualLevel === "pa" ? "pa" : "cooperative",format:"image",showProjection:false},false)}><MessageSquareText size={17} aria-hidden="true" />{actualLevel === "central" ? "Compartilhar centrais" : actualLevel === "pa" ? "Compartilhar PAs" : "Compartilhar cooperativas"}</button>}
                </section>
              ) : (
                <>
                  <section className="overview-metrics" aria-label="Resultado do período" hidden={view==='overview'&&!(['overview','units'] as AnalysisTab[]).includes(analysisTab)}>
                    <div className="overview-block-heading"><div><h2>Resultado do período</h2><p className="overview-cutoff">{cutoff ? cutoffs.length > 1 ? `Cortes: ${shortDate(cutoff)} a ${shortDate(cutoffs[cutoffs.length-1])}` : `Dados até ${shortDate(cutoff)}` : 'Sem data de atualização'}{displayed.length > 0 && ` · ${[...new Set(displayed.map(row => row.phase))].join(' / ')}`}</p></div><div className="overview-block-actions">{view !== 'actions' && <button type="button" className="button quiet" onClick={showAllPeriods}>Ver todos os períodos <ArrowRight size={16} aria-hidden="true" /></button>}<PanelToggle expanded={metricsExpanded} onToggle={() => setMetricsExpanded(value => !value)} controls={metricContentId} label="indicadores do período" /></div></div>
                    <div className="kpi-grid" id={metricContentId} hidden={!metricsExpanded}>
                    <Kpi title="Meta do período" value={displayed.length ? money(summary.target) : '—'} sub={periodDescription} icon={<Target size={20} />} />
                    <Kpi title="Realizado até o corte" value={displayed.length ? money(summary.actual) : '—'}
                      sub={hasGoalConflict ? 'Metas divergentes · confira a base' : displayed.length ? `${percent(summary.attainment)} da meta do período` : 'Nenhuma unidade na seleção'}
                      icon={<BarChart3 size={20} />} accent progress={displayed.length && !hasGoalConflict ? summary.attainment : null} />
                    <Kpi title={variance.kind==='growth'?'Superação consolidada':'GAP consolidado'} value={displayed.length ? money(variance.value) : '—'}
                      sub={summary.target === 0 ? 'Meta zero · sem avaliação percentual' : variance.kind === 'growth' ? (variance.ratio == null ? 'Meta zero · sem base percentual' : `${percent(variance.ratio)} acima da meta`) : variance.kind === 'unknown' ? (hasGoalConflict ? 'Metas divergentes · confira a base' : 'Dados insuficientes para avaliar a meta') : effort.sameDeadline&&effort.remainingDays!=null&&effort.remainingDays>0?`${money(effort.daily)}/dia útil · ${effort.remainingDays} dias restantes`:'GAP do período · esforço por unidade nos detalhes'}
                      icon={variance.kind === 'growth' ? <TrendingUp size={20} /> : <Flag size={20} />} growth={variance.kind === 'growth'} />
                    <Kpi title={`Projeção ${period==='month'?'do mês':period==='annual'?'anual':'do período'}`} value={displayed.length ? money(summary.projected) : '—'}
                      sub={displayed.length ? `${percent(summary.projectedAttainment)} da mesma meta · GAP projetado ${money(effort.projectedGap)}` : 'Nenhuma unidade na seleção'} icon={<TrendingUp size={20} />} />
                    </div>
                  </section>
                  {view === 'actions' && resultContextPanels}
                  {view==='overview'&&<div hidden={analysisTab!=='overview'} id="analysis-panel-overview" role="tabpanel" aria-labelledby="analysis-tab-overview"><OverviewUnits rows={displayed} onAnalyze={openUnitAnalysis} onAll={()=>changeAnalysisTab('units')}/></div>}
                  {view === "actions" ? (
                    <section className="panel action-panel" aria-label="Lista de ações">
                      <div className="panel-heading">
                        <div>
                          <h2>Prioridades para atingir a meta</h2>
                          <p>
                            Defina um responsável e um prazo para cada unidade.
                          </p>
                        </div>
                        <span className="pill warning">
                          {summary.attention} em atenção
                        </span>
                      </div>
                      <div className="table-controls action-controls">{listControls}</div>
                      {!displayed.length && <p className="empty">Nenhuma ação corresponde aos filtros.</p>}
                      <div className="action-list">
                        {displayed
                          .map((r, i) => {
                            const a = actionFor(r);
                            return (
                              <button
                                key={r.key}
                                className="action-card"
                                onClick={() => setSelected(r)}
                              >
                                <span className="rank">
                                  {i + 1}
                                </span>
                                <div>
                                  <div className="action-title">
                                    <strong>{r.name}</strong>
                                    <Pill>
                                      {a.priority}
                                    </Pill>
                                  </div>
                                  <span className="task-state">Tarefa: {actions[r.key]?.status ?? "Não iniciada"}</span>
                                  <p>Falta para a meta: {money(r.gap)}{r.requiredDaily != null ? ` · Necessário: ${money(r.requiredDaily)}/dia útil` : ""}</p>
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
                      <p className="action-count">{displayed.length} unidades exibidas</p>
                    </section>
                  ) : (
                    <>
                      <div id="analysis-panel-units" role={view==='overview'?'tabpanel':undefined} aria-labelledby={view==='overview'?'analysis-tab-units':undefined} hidden={view==='overview'&&analysisTab!=='units'}><section className="panel table-panel overview-units" aria-label="Lista de unidades" tabIndex={-1}>
                        <div className="panel-heading table-heading overview-units-heading">
                          <div>
                            <h2>
                              {actualLevel === "pa"
                                ? "Cadência por PA"
                                : actualLevel === "central"
                                  ? "Resultado por central"
                                  : "Resultado por cooperativa"}
                            </h2>
                            <p>{displayed.length} de {analyses.length} unidades</p>
                          </div>
                          <div className="overview-block-actions">
                            {view==='overview'&&<UnitLayoutSwitch value={unitLayout} onChange={setUnitLayout}/>}
                            <div className="table-controls overview-unit-controls">
                              {listControls}
                              {(unitLayout==='period'||view!=='overview')&&<label className="indicator-toggle"><input type="checkbox" aria-label="Mais indicadores" checked={showMoreIndicators} onChange={e => setShowMoreIndicators(e.target.checked)} />Indicadores</label>}
                            </div>
                            <button type="button" className="button secondary pa-share-trigger" onClick={() => unitLayout==='matrix'&&view==='overview'?shareMatrix():startCommunication({content:actualLevel === "central" ? "central" : actualLevel === "pa" ? "pa" : "cooperative",format:"image",showProjection:false},false)}><MessageSquareText size={17} aria-hidden="true" />{unitLayout==='matrix'&&view==='overview'?"Compartilhar matriz":actualLevel === "central" ? "Compartilhar centrais" : actualLevel === "pa" ? "Compartilhar PAs" : "Compartilhar cooperativas"}</button>
                            <PanelToggle expanded={unitsExpanded} onToggle={() => setUnitsExpanded(value => !value)} controls={unitContentId} label="lista de unidades" />
                          </div>
                        </div>
                        <div id={unitContentId} hidden={!unitsExpanded}>
                        <div className="selection-toolbar" aria-live="polite">
                          <label className="unit-select-all"><input className="row-selector" type="checkbox" aria-label="Selecionar todas as unidades filtradas" checked={displayed.length > 0 && selectedKeys.length === displayed.length} ref={element => { if(element) element.indeterminate = selectedKeys.length > 0 && selectedKeys.length < displayed.length; }} onChange={event => setRowSelection({context:selectionContext, keys:event.target.checked ? displayed.map(row => row.key) : []})} />Selecionar todas</label>
                          <span>{selectedKeys.length ? `${selectedKeys.length} unidades selecionadas` : 'Selecione unidades para exportar.'}</span>
                          {selectedKeys.length > 0 && <><button className="button quiet" onClick={() => setRowSelection({context:selectionContext,keys:[]})}>Limpar seleção</button><button className="button secondary" onClick={() => {setExportMode('selected');setShowExport(true);}}>Exportar selecionadas</button></>}
                        </div>
                        {unitLayout==='matrix'&&view==='overview'&&dataset?<UnitScenarioMatrix rows={displayed} year={dataset.year} month={month} metric={effectiveMetric as 'VN'|'AR'} onAnalyze={openUnitAnalysis} onHistory={openUnitHistory} onShare={row=>shareMatrix(undefined,row)} onAction={setSelected} selectedKeys={selectedKeys} onSelect={selectRow} expandedKeys={expandedCoops} onExpand={actualLevel==='cooperative'&&effectiveSource==='base'?row=>setExpandedCoops(keys=>keys.includes(row.key)?keys.filter(key=>key!==row.key):[...keys,row.key]):undefined} renderExpanded={row=><PaTable dataset={dataset} filters={{...scenarioFilters,central:row.central,coop:`${row.central}:${row.cooperative}`,pa:'all'}} expanded onToggle={()=>setExpandedCoops(keys=>keys.filter(key=>key!==row.key))} onSelect={setSelected} onHistory={openUnitHistory} onShare={()=>setSharing({kind:'pa',central:row.central,coop:`${row.central}:${row.cooperative}`})} onOpenCadence={()=>openCooperative(row,true)}/>}/>:<div className="table-scroll unit-results">
                          <table className="unit-results-table" role="table" aria-label="Resultados das unidades filtradas">
                            <thead role="rowgroup">
                              <tr role="row">
                                <th role="columnheader" scope="col">

                                  {actualLevel === "pa"
                                    ? "PA / Cooperativa"
                                    : actualLevel === "central"
                                      ? "Central"
                                      : "Cooperativa"}
                                </th>
                                <th role="columnheader" scope="col" className="numeric">Meta</th>
                                <th role="columnheader" scope="col" className="numeric">Realizado</th>
                                <th role="columnheader" scope="col" className="numeric">Atingimento</th>
                                <th role="columnheader" scope="col" className="numeric">GAP / Superação</th>
                                <th role="columnheader" scope="col" className="numeric">Projeção</th>
                                <th role="columnheader" scope="col">
                                  Ações
                                </th>
                              </tr>
                            </thead>
                            <tbody role="rowgroup">
                              {displayed.map((r) => (
                                <Fragment key={r.key}>
                                  <tr role="row" className={`unit-result-row${selectedKeys.includes(r.key) ? ' selected-result' : ''}`}>
                                    <td role="cell" className="unit-identity">
                                      <div className="entity-cell"><input className="row-selector" type="checkbox" aria-label={`Selecionar ${r.name}`} checked={selectedKeys.includes(r.key)} onChange={() => selectRow(r.key)} />
                                      <button
                                        className="entity-button"
                                        title={`${r.name} · ${r.cooperative || r.central}`}
                                        onClick={() => openUnitAnalysis(r)}
                                        aria-label={`${r.pa!=null?'Analisar PA':r.cooperative?'Analisar cooperativa':'Analisar central'} ${r.name}`}
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
                                          <span className="unit-status"><Pill>{r.status}</Pill></span>
                                        </small>
                                      </button>
                                      </div>
                                    </td>
                                    <td role="cell" className="numeric unit-metric" data-field="target">
                                      <span className="unit-field-label" aria-hidden="true">Meta</span>
                                      <span className="unit-money">{money(r.target)}</span>
                                    </td>
                                    <td role="cell" className="numeric unit-metric" data-field="actual" data-attainment={attainmentBand(r.annualConflict ? null : r.attainment).key}>
                                      <span className="unit-field-label" aria-hidden="true">Realizado</span>
                                      <strong className="unit-money">{money(r.actual)}</strong>
                                    </td>
                                    <td role="cell" className="numeric unit-metric unit-attainment-cell" data-field="attainment">
                                      <span className="unit-attainment-badge" data-attainment={attainmentBand(r.complete && !r.annualConflict ? r.attainment : null).key}>{r.complete && !r.annualConflict ? r.target === 0 ? 'Meta zero' : percent(r.attainment) : 'Sem avaliação'}</span>
                                    </td>
                                    <td role="cell" className="numeric unit-metric" data-field="variance">
                                      <span className="unit-field-label" aria-hidden="true">Crescimento / GAP</span>
                                      <div><ResultVariance actual={r.actual} target={r.target} complete={r.complete} conflict={!!r.annualConflict} /></div>
                                    </td>
                                    <td role="cell" className="numeric unit-metric" data-field="projected" title={`${percent(r.projectedAttainment)} da meta · estimativa`}><span className="unit-money">{money(r.projected)}</span></td>
                                    <td role="cell" className="unit-actions-cell">
                                      <div className="unit-row-actions">
                                      {actualLevel === 'central' && <button type="button" className="button quiet" aria-label={`Ver cooperativas de ${r.name}`} onClick={() => openCentral(r)}>Ver cooperativas</button>}
                                      {actualLevel === "central" && effectiveSource === "base" && <button type="button" className="button quiet" aria-label={`Compartilhar cooperativas de ${r.name}`} onClick={() => setSharing({ kind: "cooperative", central: r.central })}>Compartilhar cooperativas</button>}
                                      {actualLevel === "cooperative" && effectiveSource === "base" && r.cooperative && <>
                                        <button type="button" className="button quiet" aria-label={`Ver PAs de ${r.name}`} aria-expanded={expandedCoops.includes(r.key)} onClick={() => setExpandedCoops(keys=>keys.includes(r.key)?keys.filter(key=>key!==r.key):[...keys,r.key])}>Ver PAs</button>

                                      </>}
                                      <button type="button" className="icon-button" aria-label={`Compartilhar cenário de ${r.name}`} title="Compartilhar cenário"
                                        onClick={() => { communicationFromStart.current = false; setCommunicationFormat('email'); setCommunicationProjection(false); setCommunicationInitialKey(entityFromAnalysis(r).id); setShowCommunication(true); }}><Mail size={18} /></button>
                                      <button type="button" className="icon-button" aria-label={`Ver histórico de ${r.name}`} title="Ver histórico" onClick={()=>openUnitHistory(r)}><History size={17}/></button>
                                      <button
                                        className="icon-button"
                                        aria-label={`Registrar ação de ${r.name}`} title="Registrar ação"
                                        onClick={() => setSelected(r)}
                                      >
                                        <ChevronRight size={18} />
                                      </button>
                                      </div>
                                    </td>
                                  </tr>
                                  {(showMoreIndicators || sortBy === 'contribution' || sortBy === 'evolution') && <tr role="row" className={`unit-indicators-row${selectedKeys.includes(r.key) ? ' selected-result' : ''}`}>
                                    <td role="cell" colSpan={7}>
                                      <dl className="unit-indicators" aria-label={`Indicadores adicionais de ${r.name}`}>
                                        {showMoreIndicators && <>
                                          <div><dt>Necessário/dia</dt><dd><span className="unit-money">{money(r.requiredDaily)}</span></dd></div>
                                        </>}
                                        {(showMoreIndicators || sortBy === 'contribution') && <div><dt>Contribuição</dt><dd>{percent(r.contribution)}<small>{r.contribution == null ? 'Sem base comparável' : 'do realizado da seleção'}</small></dd></div>}
                                        {(showMoreIndicators || sortBy === 'evolution') && <div><dt>Evolução · 3 meses</dt><dd>{percent(r.recentGrowth)}<small>{r.recentGrowth == null ? 'Sem seis meses comparáveis' : r.recentLabel}</small></dd></div>}
                                      </dl>
                                    </td>
                                  </tr>}
                                  {actualLevel === 'cooperative' && expandedCoops.includes(r.key) && dataset && <tr role="row" className="expanded-unit"><td role="cell" colSpan={7}><PaTable dataset={dataset} filters={{...scenarioFilters,central:r.central,coop:`${r.central}:${r.cooperative}`,pa:'all'}} expanded onToggle={() => setExpandedCoops(keys => keys.filter(key => key !== r.key))} onSelect={setSelected} onHistory={openUnitHistory} onShare={() => setSharing({kind:'pa',central:r.central,coop:`${r.central}:${r.cooperative}`})} onOpenCadence={() => openCooperative(r,true)} /></td></tr>}
                                </Fragment>
                                ))}
                            </tbody>
                          </table>
                        </div>}
                        <div className="overview-table-legend"><AttainmentLegend /></div>
                        {!displayed.length && (
                          <p className="empty">Nenhum registro encontrado.</p>
                        )}
                        </div>
                      </section>
                      </div>
                      {view==='overview'&&dataset&&<>
                        {visitedTabs.includes('periods')&&<div id="analysis-panel-periods" role="tabpanel" aria-labelledby="analysis-tab-periods" hidden={analysisTab!=='periods'}><PeriodPerformance dataset={dataset} ownerId={user?.id??null} standalone filters={scenarioFilters} unitIds={displayed.map(row=>entityFromAnalysis(row).id)} shareRequest={periodShareRequest}/></div>}
                        {visitedTabs.includes('comparison')&&<div id="analysis-panel-comparison" role="tabpanel" aria-labelledby="analysis-tab-comparison" hidden={analysisTab!=='comparison'}><YearComparison key={`${user?.id??'session'}:${dataset.year}`} standalone dataset={dataset} filters={scenarioFilters} owner={user?.id??null} years={[...workspaces.map(item=>item.year),...sessionYears.current.keys()]} sessionDatasets={sessionYears.current} onShare={shareComparison}/></div>}
                        {visitedTabs.includes('simulation')&&<div id="analysis-panel-simulation" role="tabpanel" aria-labelledby="analysis-tab-simulation" hidden={analysisTab!=='simulation'}><AnalysisSimulation baseline={baselineSummary} simulated={summary} uplift={simulationUplift} onChange={setUplift} period={periodDescription} days={effort.remainingDays} daily={effort.daily} monthly={effort.monthly}/></div>}
                      </>}
                    </>
                  )}
                </>
              )}
              <details className="progressive-panel calculation-notes"><summary>Critérios de cálculo</summary><footer className="method-footer">
                <Info size={16} />
                <span>
                  Projeções estimadas a partir do corte de cada fonte. Dias
                  úteis: segunda a sexta, sem feriados. Valores faltantes não
                  são zero.{" "}
                  <button onClick={() => setView("audit")}>
                    Ver critérios e conferência
                  </button>
                </span>
              </footer></details>
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
      {showCommunicationStart && dataset && currentCount > 0 && <Modal title="Compartilhar cenário" onClose={() => setShowCommunicationStart(false)}>
        <label className="share-scenario-choice">Cenário do compartilhamento<select value={shareScenario} onChange={event=>setShareScenario(event.target.value)}><option value="summary">Resumo do cenário atual</option><option value="matrix">Mês · trimestre · ano</option><option value="cooperative">Cooperativas</option><option value="pa">PAs · Venda Nova</option><option value="periods">Períodos</option><option value="comparison">Comparativo entre anos</option><option value="simulation">Simulação</option></select></label>
        {shareScenario==='matrix'?<><p>{scopeLabel} · mesmas unidades no mês, trimestre e ano.</p><button className="button primary" onClick={()=>shareMatrix()}>Abrir prévia da matriz</button></>:shareScenario==='periods'?<><p>{scopeLabel} · {metricName(selectedMetric)} · {periodDescription}</p><button className="button primary" onClick={()=>{setShowCommunicationStart(false);changeAnalysisTab('periods');setPeriodShareRequest(value=>value+1);}}>Abrir prévia dos períodos</button></>:shareScenario==='comparison'?<><p>Compare anos e recortes equivalentes antes de gerar a prévia.</p><button className="button primary" onClick={()=>{setShowCommunicationStart(false);changeAnalysisTab('comparison');setNotice('Selecione os anos e use Compartilhar cenário no comparativo validado.');}}>Abrir comparativo</button></>:shareScenario==='simulation'?<><p>{scopeLabel} · {periodDescription} · aumento de ritmo +{simulationUplift}%</p><button className="button primary" onClick={()=>shareSimulation()}>Abrir prévia da simulação</button></>:<CommunicationStart key={shareScenario} level={shareScenario==='summary'?actualLevel:shareScenario==='pa'?'pa':'cooperative'} scope={scopeLabel} period={`${metricName(shareScenario==='pa'?'VN':selectedMetric)} · ${periodDescription}`} onContinue={startCommunication}/>}
      </Modal>}
      {reportShare&&<AnalysisReportShare {...reportShare} onClose={()=>setReportShare(null)}/>}
      {showExport && dataset && <Modal title="Exportar dados" onClose={() => setShowExport(false)}>
        {combinedPortfolios && <label className="export-portfolio">Carteira para exportar<select value={exportMetric} onChange={event => setExportMetric(event.target.value as 'VN' | 'AR')}><option value="VN">Venda Nova</option><option value="AR">Arrecadação</option></select></label>}
        <ResultExport key={combinedPortfolios ? exportMetric : effectiveMetric} rows={activeExportModel?.rows ?? displayed} selectedIds={combinedPortfolios ? [] : selectedKeys} initialMode={exportMode} ownerId={user?.id ?? 'local'} context={{year:dataset.year, month, period, source:effectiveSource, metric:activeExportModel?.metric ?? effectiveMetric, level:actualLevel, scopeLabel, filterLabel:[search ? `Busca: ${search}` : '', statusFilter !== 'all' ? `Situação: ${statusFilter}` : '', focus?.label ?? ''].filter(Boolean).join(' · '), uplift}} />
      </Modal>}
      {showCommunication && dataset && displayed.length > 0 && (
        <PortfolioCommunication dataset={dataset} candidates={displayed.map(entityFromAnalysis)} initialKey={communicationInitialKey} initialFormat={communicationFormat} initialShowProjection={communicationProjection} scopedUnitIds={visibleLeaves.map(row => entityFromAnalysis({ ...row, kind: row.source === 'cadence' ? 'pa' : row.cooperative ? 'cooperative' : 'central' }).id)}
          metric={effectiveMetric as "VN" | "AR"} period={period} month={month} uplift={uplift}
          onClose={closeCommunication} />
      )}
      {sharing && dataset && user && <PaScenarioShare key={`${user.id}:${dataset.year}:${sharing.kind}`} unitKind={sharing.kind} userId={user.id} dataset={dataset} filters={sharingFilters} initialFormat={sharing.format} unitIdsByMetric={sharing.unitIdsByMetric} initialShowProjection={sharing.showProjection ?? false} onClose={closeSharing} />}
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
                  {periodDescription}
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
                    <th scope="col">Mês</th>
                    <th scope="col" className="numeric">Meta</th>
                    <th scope="col" className="numeric">Realizado</th>
                    <th scope="col" className="numeric">Atingimento</th>
                    <th scope="col">Posição</th>
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
                        <td className="numeric" data-attainment={attainmentBand(a.annualConflict ? null : a.attainment).key}>{money(a.actual)}</td>
                        <td className="numeric" data-attainment={attainmentBand(a.annualConflict ? null : a.attainment).key}>{percent(a.attainment)}</td>
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

function ResultVariance({ actual, target, complete, conflict }: { actual: number | null; target: number | null; complete: boolean; conflict: boolean }) {
  const value = goalVariance(actual, target, complete && !conflict);
  return <span className="unit-money unit-variance" data-variance={value.kind} title={value.label}><span className="sr-only">{value.label}: </span>{value.kind === 'growth' ? '+ ' : value.kind === 'gap' ? '− ' : ''}{money(value.value)}</span>;
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
                {m.month}: meta {money(m.target)}; realizado {money(m.actual)}; atingimento {percent(m.attainment)}
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
                  fill={attainmentBand(m.attainment).color}
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
                <th scope="col">Mês</th>
                <th scope="col" className="numeric">Meta</th>
                <th scope="col" className="numeric">Realizado</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.month}>
                  <td>{m.month}</td>
                  <td className="numeric">{money(m.target)}</td>
                  <td className="numeric" data-attainment={attainmentBand(m.attainment).key}>{money(m.actual)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
