'use client';
import { lockBodyScroll } from '@/lib/body-scroll-lock.mjs';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowRight, CalendarDays, Check, CheckCircle2, ClipboardList, Copy, FileText, LoaderCircle, Mail, MessageSquareText, Pencil, Search, Share2, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { readCnvPdf } from '@/lib/cnv-pdf';
import { extractCnvSummary } from '@/lib/cnv-summary.mjs';
import { createCnvAction, createCnvShareLink, deleteCnvAction, getCnvPdf, listCnvActions, updateCnvAction, type CnvAction, type CnvDraft } from '@/lib/cnv-store';
import styles from './cnv-actions.module.css';

type Editor = { action: CnvAction | null; draft: CnvDraft; file: File | null; pageCount: number; fileHash: string };
type Share = { action: CnvAction; channel: 'whatsapp' | 'email'; text: string; includeRegulation: boolean; link: string; expiresAt: string };
type Status = 'active' | 'upcoming' | 'ended' | 'unknown';
const STATUS: Record<Status, string> = { active: 'Vigente', upcoming: 'A iniciar', ended: 'Encerrada', unknown: 'Período a confirmar' };
const LIST_FIELDS = [
  ['products', 'Produtos participantes'], ['goals', 'Metas e critérios'], ['eligibility', 'Quem participa'],
  ['rewards', 'Premiação e reconhecimento'], ['importantRules', 'Regras importantes'],
] as const;
function todayInBrazil() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}
function actionStatus(draft: CnvDraft, today: string): Status {
  if (draft.endDate && draft.endDate < today) return 'ended';
  if (draft.startDate && draft.startDate > today) return 'upcoming';
  return draft.startDate && draft.endDate ? 'active' : 'unknown';
}
const dateLabel = (value: string) => value.split('-').reverse().join('/');
function periodLabel(draft: CnvDraft) {
  if (draft.startDate && draft.endDate) return `${dateLabel(draft.startDate)} a ${dateLabel(draft.endDate)}`;
  return draft.periodLabel || 'Período não identificado';
}
function summaryMessage(action: CnvAction) {
  const draft = action.details;
  return [draft.title, `Período: ${periodLabel(draft)}`, draft.summary,
    draft.products.length ? `Produtos: ${draft.products.join('; ')}` : '',
    draft.goals.length ? `Metas e critérios:\n${draft.goals.map(item => `• ${item}`).join('\n')}` : '',
    draft.rewards.length ? `Reconhecimento: ${draft.rewards.join('; ')}` : '',
    'Consulte o regulamento completo para condições e critérios de participação.',
  ].filter(Boolean).join('\n\n');
}
const searchText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const errorText = (value: unknown) => value instanceof Error ? value.message : 'Não foi possível concluir. Tente novamente.';
const cleanFilename = (name: string) => name.replace(/[\\/\x00-\x1f\x7f]/g, '_').replace(/\.pdf$/i, '') + '.pdf';
function cloneDraft(draft: CnvDraft): CnvDraft { return JSON.parse(JSON.stringify(draft)) as CnvDraft; }

export default function CnvActions({ ownerId, onDirtyChange, onSavingChange }: { ownerId: string; onDirtyChange?: (dirty: boolean) => void; onSavingChange?: (saving: boolean) => void }) {
  const [records, setRecords] = useState<CnvAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [year,setYear]=useState(new Date().getFullYear());
  const [product, setProduct] = useState('all');
  const [status, setStatus] = useState('all');
  const [today, setToday] = useState(todayInBrazil);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [share, setShare] = useState<Share | null>(null);
  const [shareError, setShareError] = useState('');
  const [remove, setRemove] = useState<CnvAction | null>(null);
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const owner = useRef(ownerId); owner.current = ownerId;
  const fileInput = useRef<HTMLInputElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const objectUrls = useRef(new Set<string>());
  const alive = (expected: string, version: number) => mounted.current && owner.current === expected && generation.current === version;

  useEffect(() => { onDirtyChange?.(Boolean(editor)); return () => { onDirtyChange?.(false); }; }, [Boolean(editor), onDirtyChange]);
  useEffect(() => { onSavingChange?.(Boolean(busy)); return () => { onSavingChange?.(false); }; }, [Boolean(busy), onSavingChange]);

  const load = useCallback(async () => {
    const expected = ownerId, version = generation.current;
    setLoading(true); setError('');
    try { const rows = await listCnvActions(expected); if (alive(expected, version)) setRecords(rows); }
    catch (cause) { if (alive(expected, version)) setError(errorText(cause)); }
    finally { if (alive(expected, version)) setLoading(false); }
  }, [ownerId]);

  useEffect(() => {
    mounted.current = true; generation.current++;
    setRecords([]); setSelectedId(''); setEditor(null); setShare(null); setRemove(null); setPreview(null); setBusy(''); setNotice(''); setQuery(''); setProduct('all'); setStatus('all');
    void load();
    return () => { mounted.current = false; generation.current++; for (const url of objectUrls.current) URL.revokeObjectURL(url); objectUrls.current.clear(); };
  }, [load]);
  useEffect(() => {
    const refresh = () => setToday(todayInBrazil());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    if (!preview) return;
    const url = preview.url;
    return () => { URL.revokeObjectURL(url); objectUrls.current.delete(url); };
  }, [preview]);

  const recordsForYear=useMemo(()=>records.filter(row=>row.details.year===year),[records,year]);
  const products = useMemo(() => [...new Set(recordsForYear.flatMap(row => row.details.products))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [recordsForYear]);
  const filtered = useMemo(() => {
    const search = searchText(query.trim());
    return recordsForYear.filter(row => (product === 'all' || row.details.products.includes(product)) && (status === 'all' || actionStatus(row.details, today) === status)
      && (!search || searchText([row.details.title, row.details.summary, ...row.details.products, ...row.details.goals].join(' ')).includes(search)))
      .sort((a, b) => (b.details.startDate || '').localeCompare(a.details.startDate || '') || a.details.title.localeCompare(b.details.title, 'pt-BR'));
  }, [recordsForYear, query, product, status, today]);
  const selected = recordsForYear.find(row => row.id === selectedId) ?? null;
  const counts = useMemo(() => ({ total: recordsForYear.length, active: recordsForYear.filter(row => actionStatus(row.details, today) === 'active').length, upcoming: recordsForYear.filter(row => actionStatus(row.details, today) === 'upcoming').length, ended: recordsForYear.filter(row => actionStatus(row.details, today) === 'ended').length }), [recordsForYear, today]);

  function makeUrl(blob: Blob) { const url = URL.createObjectURL(blob); objectUrls.current.add(url); return url; }
  function saveBlob(blob: Blob, filename: string) {
    const url = makeUrl(blob), link = document.createElement('a'); link.href = url; link.download = cleanFilename(filename); document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => { URL.revokeObjectURL(url); objectUrls.current.delete(url); }, 60_000);
  }
  function chooseAction(action: CnvAction) { setSelectedId(action.id); requestAnimationFrame(() => detailHeading.current?.focus()); }
  function closeEditor() {
    if (busy === 'save') return;
    if (editor && !window.confirm('Descartar as alterações desta ação?')) return;
    setEditor(null); setEditorError(''); setReviewed(false);
  }
  async function importFile(file: File) {
    if (busy) return;
    const expected = ownerId, version = generation.current; setBusy('import'); setError(''); setNotice('');
    try {
      const extracted = await readCnvPdf(file);
      if (!alive(expected, version)) return;
      const duplicate = records.find(row => row.fileHash === extracted.fileHash);
      if (duplicate) { chooseAction(duplicate); setNotice('Este regulamento já está cadastrado. A ação existente foi aberta.'); return; }
      const draft = extractCnvSummary(extracted.pages, file.name) as CnvDraft;
      setEditor({ action: null, draft, file, pageCount: extracted.pageCount, fileHash: extracted.fileHash }); setReviewed(false); setEditorError('');
    } catch (cause) { if (alive(expected, version)) setError(errorText(cause)); }
    finally { if (alive(expected, version)) setBusy(''); }
  }
  async function saveEditor() {
    if (!editor || busy || !reviewed) return;
    if (!editor.draft.title.trim() || !editor.draft.summary.trim()) { setEditorError('Preencha o nome e o resumo da ação antes de salvar.'); return; }
    if (editor.draft.startDate && editor.draft.endDate && editor.draft.endDate < editor.draft.startDate) { setEditorError('A data final deve ser igual ou posterior à data inicial.'); return; }
    const expected = ownerId, version = generation.current, current = editor;
    setBusy('save'); setEditorError('');
    try {
      const draft: CnvDraft = { ...current.draft, needsReview: false };
      for (const [field] of LIST_FIELDS) draft[field] = current.draft[field].map(item => item.trim()).filter(Boolean);
      const saved = current.action ? await updateCnvAction(expected, current.action, draft) : await createCnvAction(expected, draft, current.file!, current.pageCount, current.fileHash);
      if (!alive(expected, version)) return;
      setRecords(rows => [saved, ...rows.filter(row => row.id !== saved.id)]); setSelectedId(saved.id); setYear(saved.details.year); setEditor(null); setNotice(current.action ? 'Ação atualizada.' : 'Ação cadastrada. O regulamento original está disponível no painel.');
    } catch (cause) { if (alive(expected, version)) setEditorError(errorText(cause)); }
    finally { if (alive(expected, version)) setBusy(''); }
  }
  async function openPdf(action?: CnvAction) {
    if (busy) return;
    const expected = ownerId, version = generation.current; setBusy('preview'); setError(''); setEditorError('');
    try {
      const blob = action ? await getCnvPdf(expected, action) : editor?.file;
      if (!blob || !alive(expected, version)) return;
      setPreview({ url: makeUrl(blob), title: action?.filename ?? editor?.file?.name ?? 'Regulamento da ação' });
    } catch (cause) { if (alive(expected, version)) { if (editor) setEditorError(errorText(cause)); else setError(errorText(cause)); } }
    finally { if (alive(expected, version)) setBusy(''); }
  }
  async function downloadPdf(action: CnvAction) {
    if (busy) return;
    const expected = ownerId, version = generation.current; setBusy('download'); setError('');
    try { const blob = await getCnvPdf(expected, action); if (alive(expected, version)) { saveBlob(blob, action.filename); setNotice('Download do regulamento iniciado.'); } }
    catch (cause) { if (alive(expected, version)) { setError(errorText(cause)); if (share) setShareError(errorText(cause)); } }
    finally { if (alive(expected, version)) setBusy(''); }
  }
  async function removeAction() {
    if (!remove || busy) return;
    const expected = ownerId, version = generation.current, action = remove; setBusy('delete'); setError('');
    try {
      await deleteCnvAction(expected, action);
      if (!alive(expected, version)) return;
      setRecords(rows => rows.filter(row => row.id !== action.id)); if (selectedId === action.id) setSelectedId(''); setRemove(null); setNotice('Ação e regulamento excluídos.');
    } catch (cause) { if (alive(expected, version)) setError(errorText(cause)); }
    finally { if (alive(expected, version)) setBusy(''); }
  }
  function openShare(action: CnvAction) { setShare({ action, channel: 'whatsapp', text: summaryMessage(action), includeRegulation: false, link: '', expiresAt: '' }); setShareError(''); }
  async function generateLink() {
    if (!share || busy) return;
    const expected = ownerId, version = generation.current, current = share; setBusy('link'); setShareError('');
    try {
      const result = await createCnvShareLink(expected, current.action);
      if (alive(expected, version)) setShare(value => value?.action.id === current.action.id ? { ...value, link: result.url, expiresAt: result.expiresAt } : value);
    } catch (cause) { if (alive(expected, version)) setShareError(errorText(cause)); }
    finally { if (alive(expected, version)) setBusy(''); }
  }
  const sharedText = share ? [share.text, share.includeRegulation && share.link ? `Regulamento completo (link válido por 24 horas):\n${share.link}` : ''].filter(Boolean).join('\n\n') : '';
  const shareReady = share && (!share.includeRegulation || Boolean(share.link));
  const emailSubject = share ? `mailto:?subject=${encodeURIComponent(share.action.details.title)}` : '';
  const emailWithBody = `${emailSubject}&body=${encodeURIComponent(sharedText)}`;
  const emailNeedsPaste = emailWithBody.length > 1800;
  const emailHref = emailNeedsPaste ? emailSubject : emailWithBody;
  async function copyMessage() {
    if (!shareReady) return;
    const expected = ownerId, version = generation.current;
    try { await navigator.clipboard.writeText(sharedText); if (alive(expected, version)) { setNotice('Mensagem copiada. Cole no WhatsApp ou no e-mail.'); setShareError(''); } }
    catch { if (alive(expected, version)) setShareError('Não foi possível copiar automaticamente. Selecione e copie o texto da mensagem.'); }
  }
  async function nativeShare() {
    if (!share || busy) return;
    const expected = ownerId, version = generation.current, current = share; setBusy('native-share'); setShareError('');
    let downloaded: Blob | null = null;
    try {
      const blob = await getCnvPdf(expected, current.action); downloaded = blob;
      if (!alive(expected, version)) return;
      const file = new File([blob], cleanFilename(current.action.filename), { type: 'application/pdf' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) await navigator.share({ title: current.action.details.title, text: current.text, files: [file] });
      else { saveBlob(blob, current.action.filename); setShareError('O PDF foi baixado. Anexe o arquivo à conversa do WhatsApp ou ao e-mail e use a mensagem preparada abaixo.'); }
    } catch (cause) { if (alive(expected, version) && !(cause instanceof DOMException && cause.name === 'AbortError')) { if (downloaded) { saveBlob(downloaded, current.action.filename); setShareError('O dispositivo não abriu o compartilhamento. O PDF foi baixado para você anexar à mensagem.'); } else setShareError(errorText(cause)); } }
    finally { if (alive(expected, version)) setBusy(''); }
  }
  function updateDraft(field: keyof CnvDraft, value: string | string[] | number | null) {
    setEditor(valueBefore => valueBefore ? { ...valueBefore, draft: { ...valueBefore.draft, [field]: value } } : valueBefore); setReviewed(false);
  }

  return <section className={styles.root} aria-label="Ações CNV"><label className="cnv-year">Ano das ações<select aria-label="Ano das ações CNV" value={year} disabled={Boolean(busy)||!!editor} onChange={event=>{setYear(Number(event.target.value));setSelectedId('');}}>{[...new Set([2026,new Date().getFullYear(),...records.map(row=>row.details.year)])].sort((a,b)=>b-a).map(value=><option key={value} value={value}>{value}</option>)}</select></label>
    <div className={styles.intro}><div><h2>Regulamentos e campanhas</h2></div><div><input ref={fileInput} type="file" accept="application/pdf,.pdf" className={styles.fileInput} aria-label="Importar PDF de uma ação CNV" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file); }} /><button type="button" className="button primary" disabled={Boolean(busy) || loading} onClick={() => fileInput.current?.click()}>{busy === 'import' ? <LoaderCircle size={18} className={styles.spinner} /> : <Upload size={18} />}Importar regulamento PDF</button><small className={styles.fileHint}>Até 20 MB · revise o resumo antes de cadastrar</small></div></div>
    {error && <div className={styles.error} role="alert"><span>{error}</span>{loading ? null : <button type="button" className="button quiet" onClick={() => void load()}>Tentar novamente</button>}</div>}
    {notice && <p className={styles.notice} role="status"><CheckCircle2 size={17} />{notice}<button type="button" aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={16} /></button></p>}
    <dl className={styles.metrics} aria-label="Painel das ações CNV"><div><dt>Ações cadastradas</dt><dd>{loading ? '—' : counts.total}</dd><small>Regulamentos disponíveis</small></div><div><dt>Vigentes</dt><dd>{loading ? '—' : counts.active}</dd><small>No período de participação</small></div><div><dt>A iniciar</dt><dd>{loading ? '—' : counts.upcoming}</dd><small>Próximas ações</small></div><div><dt>Encerradas</dt><dd>{loading ? '—' : counts.ended}</dd><small>Histórico para consulta</small></div></dl>
    <div className={styles.filters} aria-label="Filtros de ações CNV"><label className={styles.search}><span>Buscar ação</span><div><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Nome, produto ou meta" /></div></label><label>Produto<select aria-label="Produto da ação CNV" value={product} onChange={event => setProduct(event.target.value)}><option value="all">Todos os produtos</option>{products.map(item => <option key={item}>{item}</option>)}</select></label><label>Período da ação<select aria-label="Situação da ação CNV" value={status} onChange={event => setStatus(event.target.value)}><option value="all">Todas as ações</option>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{(query || product !== 'all' || status !== 'all') && <button type="button" className="button quiet" onClick={() => { setQuery(''); setProduct('all'); setStatus('all'); }}>Limpar filtros</button>}</div>
    {loading ? <div className={styles.empty} role="status"><LoaderCircle size={25} className={styles.spinner} /><p>Carregando suas ações…</p></div> : !recordsForYear.length ? <div className={styles.empty}><div className={styles.emptyIcon}><FileText size={30} /></div><h3>Cadastre a primeira ação</h3><p>Importe o regulamento em PDF. O sistema organiza as informações para você conferir e salvar.</p><button type="button" className="button secondary" onClick={() => fileInput.current?.click()} disabled={Boolean(busy)}><Upload size={17} />Selecionar PDF</button><small><ShieldCheck size={15} />Seus regulamentos ficam vinculados à sua conta.</small></div> : <>
      <div className={styles.listHeading}><h3>Regulamentos da campanha</h3><span>{filtered.length} de {records.length} ações</span></div>
      {!filtered.length ? <p className={styles.empty}>Nenhuma ação corresponde aos filtros selecionados.</p> : <div className={styles.cards}>{filtered.map(action => { const currentStatus = actionStatus(action.details, today); return <article className={`${styles.card} ${selectedId === action.id ? styles.selectedCard : ''}`} key={action.id}><div className={styles.cardTop}><span className={styles.status} data-status={currentStatus}>{STATUS[currentStatus]}</span><small>CNV {action.details.year}</small></div><h3>{action.details.title}</h3><p className={styles.period}><CalendarDays size={16} />{periodLabel(action.details)}</p><p className={styles.cardSummary}>{action.details.summary}</p><div className={styles.products}>{action.details.products.length ? action.details.products.map(item => <span key={item}>{item}</span>) : <span>Produtos a confirmar</span>}</div><div className={styles.cardGoal}><TargetIcon /><div><strong>Metas e critérios</strong><p>{action.details.goals[0] || 'Consulte os critérios no regulamento.'}</p>{action.details.goals.length > 1 && <small>+ {action.details.goals.length - 1} critérios no painel</small>}</div></div><div className={styles.cardActions}><button type="button" className="button quiet" onClick={() => chooseAction(action)}>Abrir painel <ArrowRight size={16} /></button><button type="button" className="button quiet" aria-label={`Compartilhar ${action.details.title}`} onClick={() => openShare(action)} disabled={Boolean(busy)}><Share2 size={17} /><span>Compartilhar</span></button></div></article>; })}</div>}
    </>}
    {selected && <section className={styles.detail} aria-label="Painel da ação CNV"><div className={styles.detailHeading}><div><span className={styles.eyebrow}>Regulamento da ação</span><h3 ref={detailHeading} tabIndex={-1}>{selected.details.title}</h3><p><CalendarDays size={16} />{periodLabel(selected.details)}</p></div><button type="button" className="button quiet" aria-label="Fechar painel da ação" onClick={() => setSelectedId('')}><X size={19} /></button></div><div className={styles.detailToolbar}><button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => void openPdf(selected)}><FileText size={17} />Ver regulamento</button><button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => void downloadPdf(selected)}><ArrowDownToLine size={17} />Baixar PDF</button><button type="button" className="button primary" disabled={Boolean(busy)} onClick={() => openShare(selected)}><Share2 size={17} />Compartilhar</button><button type="button" className="button quiet" disabled={Boolean(busy)} onClick={() => { setEditor({ action: selected, draft: cloneDraft(selected.details), file: null, pageCount: selected.pageCount, fileHash: selected.fileHash }); setReviewed(false); setEditorError(''); }}><Pencil size={16} />Editar resumo</button></div><div className={styles.detailSummary}><h4>Resumo da ação</h4><p>{selected.details.summary}</p></div><div className={styles.detailGrid}>{LIST_FIELDS.map(([field, label]) => <section key={field}><h4>{label}</h4><RuleList items={selected.details[field]} /></section>)}</div><SourcePages draft={selected.details} /><footer className={styles.detailFooter}><span><ShieldCheck size={15} />Resumo revisado · {selected.pageCount} páginas · {selected.filename}</span><button type="button" className="button quiet" disabled={Boolean(busy)} onClick={() => setRemove(selected)}><Trash2 size={16} />Excluir ação</button></footer></section>}

    {editor && <Modal title={editor.action ? 'Editar ação CNV' : 'Revisar regulamento importado'} onClose={closeEditor} wide><div className={styles.editorIntro}><FileText size={23} /><div><strong>{editor.file?.name ?? editor.action?.filename}</strong><p>{editor.pageCount} páginas · confira as informações com o regulamento original.</p></div><button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => void openPdf(editor.action ?? undefined)}>Ver PDF</button></div>{editor.draft.warnings?.length ? <aside className={styles.reviewWarning}><strong>Pontos para conferir</strong><ul>{editor.draft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></aside> : null}<form onSubmit={event => { event.preventDefault(); void saveEditor(); }}><div className={styles.formGrid}><label className={styles.full}>Nome da ação<input aria-label="Nome da ação CNV" value={editor.draft.title} maxLength={200} required onChange={event => updateDraft('title', event.target.value)} /></label><label>Ano<input aria-label="Ano da ação CNV" type="number" min={2020} max={2100} value={editor.draft.year} readOnly={!!editor.action} onChange={event=>updateDraft('year',Number(event.target.value))} /></label><label>Início da participação<input aria-label="Início da ação CNV" type="date" value={editor.draft.startDate ?? ''} onChange={event => updateDraft('startDate', event.target.value || null)} /></label><label>Fim da participação<input aria-label="Fim da ação CNV" type="date" value={editor.draft.endDate ?? ''} onChange={event => updateDraft('endDate', event.target.value || null)} /></label><label className={styles.full}>Descrição do período<input aria-label="Descrição do período CNV" maxLength={300} value={editor.draft.periodLabel} onChange={event => updateDraft('periodLabel', event.target.value)} /></label><label className={styles.full}>Resumo da ação<textarea aria-label="Resumo da ação CNV" rows={4} maxLength={6000} required value={editor.draft.summary} onChange={event => updateDraft('summary', event.target.value)} /></label>{LIST_FIELDS.map(([field, label]) => <label key={field} className={field === 'products' || field === 'importantRules' ? styles.full : undefined}>{label}<textarea aria-label={label} rows={field === 'products' ? 3 : 5} maxLength={15000} value={editor.draft[field].join('\n')} onChange={event => updateDraft(field, event.target.value.split('\n'))} /><small>Uma informação por linha. Valores e condições devem seguir o regulamento.</small></label>)}</div><SourcePages draft={editor.draft} /><label className={styles.reviewCheck}><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} /><span>Conferi o período, os produtos e os critérios com o regulamento e revisei o resumo.</span></label>{editorError && <p className={styles.error} role="alert">{editorError}</p>}<div className={styles.modalActions}><button type="button" className="button secondary" onClick={closeEditor} disabled={busy === 'save'}>Cancelar</button><button type="submit" className="button primary" disabled={!reviewed || Boolean(busy)}>{busy === 'save' ? <LoaderCircle className={styles.spinner} size={18} /> : <Check size={18} />}{editor.action ? 'Salvar alterações' : 'Cadastrar ação'}</button></div></form></Modal>}
    {preview && <Modal title="Regulamento original" onClose={() => setPreview(null)} wide><p className={styles.previewName}>{preview.title}</p><iframe className={styles.preview} src={preview.url} title={`PDF original: ${preview.title}`} /><p className={styles.fineprint}>Se o navegador não exibir o PDF, abra o arquivo ou faça o download.</p><div className={styles.modalActions}><a className="button secondary" href={preview.url} target="_blank" rel="noopener noreferrer">Abrir PDF em outra aba</a><a className="button primary" href={preview.url} download={cleanFilename(preview.title)}><ArrowDownToLine size={17} />Baixar regulamento</a></div></Modal>}
    {remove && <Modal title="Excluir ação CNV" onClose={() => !busy && setRemove(null)}><p>Excluir <strong>{remove.details.title}</strong> e seu regulamento PDF?</p><p className={styles.fineprint}>Esta exclusão afeta apenas a ação cadastrada na sua conta.</p>{error && <p className={styles.error} role="alert">{error}</p>}<div className={styles.modalActions}><button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => setRemove(null)}>Cancelar</button><button type="button" className="button primary" disabled={Boolean(busy)} onClick={() => void removeAction()}>{busy === 'delete' ? <LoaderCircle size={17} className={styles.spinner} /> : <Trash2 size={17} />}Confirmar exclusão</button></div></Modal>}
    {share && <Modal title="Compartilhar ação CNV" onClose={() => { if (!busy) setShare(null); }}><p className={styles.shareTitle}>{share.action.details.title}</p><div className={styles.channelButtons} role="group" aria-label="Canal de compartilhamento"><button type="button" className="button secondary" aria-pressed={share.channel === 'whatsapp'} onClick={() => setShare({ ...share, channel: 'whatsapp' })}><MessageSquareText size={17} />WhatsApp</button><button type="button" className="button secondary" aria-pressed={share.channel === 'email'} onClick={() => setShare({ ...share, channel: 'email' })}><Mail size={17} />E-mail</button></div><label className={styles.messageLabel}>Mensagem da ação<textarea aria-label="Mensagem de compartilhamento CNV" rows={11} value={share.text} maxLength={12000} onChange={event => setShare({ ...share, text: event.target.value })} /></label><label className={styles.reviewCheck}><input type="checkbox" checked={share.includeRegulation} onChange={event => setShare({ ...share, includeRegulation: event.target.checked })} /><span>Incluir link para baixar o regulamento <small>Quem receber o link poderá acessar o PDF por 24 horas.</small></span></label>{share.includeRegulation && <div className={styles.linkPanel}>{share.link ? <><CheckCircle2 size={17} /><span>Link gerado. Válido até {new Date(share.expiresAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Brasília).</span></> : <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => void generateLink()}>{busy === 'link' ? <LoaderCircle size={17} className={styles.spinner} /> : <ShieldCheck size={17} />}Gerar link do regulamento</button>}</div>}{shareError && <p className={styles.error} role="alert">{shareError}</p>}<div className={styles.shareFile}><strong>Encaminhar o arquivo PDF</strong><p>Use o compartilhamento do dispositivo ou baixe o regulamento e anexe à mensagem.</p><div><button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => void nativeShare()}><Share2 size={17} />Compartilhar PDF</button><button type="button" className="button quiet" disabled={Boolean(busy)} onClick={() => void downloadPdf(share.action)}><ArrowDownToLine size={17} />Baixar PDF</button></div></div><div className={styles.modalActions}><button type="button" className="button secondary" disabled={!shareReady} onClick={() => void copyMessage()}><Copy size={17} />Copiar mensagem</button>{shareReady ? <a className="button primary" href={share.channel === 'whatsapp' ? `https://wa.me/?text=${encodeURIComponent(sharedText)}` : emailHref} target={share.channel === 'whatsapp' ? '_blank' : undefined} rel="noopener noreferrer">{share.channel === 'whatsapp' ? <MessageSquareText size={17} /> : <Mail size={17} />}{share.channel === 'whatsapp' ? 'Abrir WhatsApp' : emailNeedsPaste ? 'Abrir e-mail e colar mensagem' : 'Abrir e-mail'}</a> : <button type="button" className="button primary" disabled>Gere o link para continuar</button>}</div>{share.channel === 'email' && emailNeedsPaste && <p className={styles.fineprint}>Esta mensagem é longa. Use Copiar mensagem e cole no corpo do e-mail após abrir o aplicativo.</p>}<p className={styles.fineprint}>Confira a mensagem e escolha o destinatário no aplicativo. O envio é feito por você.</p></Modal>}
  </section>;
}

function TargetIcon() { return <ClipboardList size={18} aria-hidden="true" />; }
function RuleList({ items }: { items: string[] }) { const visible = items.filter(item => item.trim()); return visible.length ? <ul>{visible.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className={styles.unavailable}>Não identificado. Consulte o regulamento.</p>; }
function SourcePages({ draft }: { draft: CnvDraft }) {
  return draft.sourcePages?.length ? <details className={styles.sources}><summary>Conferir informações extraídas do PDF <span>{draft.sourcePages.length} referências</span></summary><p>Referências da extração original. As alterações feitas no resumo não modificam o PDF.</p><div>{draft.sourcePages.map((source, index) => <blockquote key={index}><strong>Página {source.page} · {source.field}</strong><p>{source.excerpt}</p></blockquote>)}</div></details> : null;
}
function Modal({ children, title, onClose, wide = false }: { children: ReactNode; title: string; onClose: () => void; wide?: boolean }) {
  const titleId = useId(), element = useRef<HTMLDivElement>(null), close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null, releaseScroll = lockBodyScroll(); element.current?.focus();
    return () => { releaseScroll(); active?.focus(); };
  }, []);
  return <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) close.current(); }}><div ref={element} tabIndex={-1} className={`${styles.modal} ${wide ? styles.wideModal : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); close.current(); }
    if (event.key !== 'Tab') return;
    const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,iframe')).filter(node => node.offsetParent !== null), first = nodes[0], last = nodes.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === element.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element.current)) { event.preventDefault(); first.focus(); }
  }}><header className={styles.modalHeading}><h3 id={titleId}>{title}</h3><button type="button" className="button quiet" aria-label={`Fechar ${title.toLocaleLowerCase('pt-BR')}`} onClick={() => close.current()}><X size={20} /></button></header>{children}</div></div>;
}
