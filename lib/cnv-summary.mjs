/** Deterministic PDF preview extraction. Every inferred field must be reviewed before saving. */
const fold = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const compact = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\u00ad/g, '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, ' ').trim();
const unique = values => [...new Set(values.map(compact).filter(Boolean))];
const productPatterns = [
  /Sicoob\s+Seguro\s+Vida\s+Individual\s+ou\s+Mulher/iu,
  /Sicoob\s+Seguro\s+Acidentes\s+Pessoais/iu,
  /Sicoob\s+Seguro\s+Vida\s+Master/iu,
  /Sicoob\s+Seguro\s+Vida\s+Digital/iu,
  /Sicoob\s+Seguro\s+Vida\s+Simples/iu,
  /Sicoob\s+Seguro\s+Vida\s+Mais/iu,
  /Sicoob\s+Seguro\s+Personalizado/iu,
  /Benef[ií]cios\s+de\s+Risco\s+Sicoob\s+Previ/iu,
  /(?:Sicoob\s+Seguro\s+Vida\s+PraViver|Linha\s+PraViver)/iu,
  /Sicoob\s+Seguro\s+Vida\s+Empresarial/iu,
  /Seguro\s+Renda\s+Protegida/iu,
  /VG\s+Cotado\*?/iu,
  /AP\s+Prazo\s+Curto\*?/iu,
];
const nextSection = /(?:\b(?:\d+(?:\.\d+)*\.?\s*)?(?:COOPERATIVAS\s+PARTICIPANTES|PREMIA[ÇC][ÕO]ES|DISPOSI[ÇC][ÕO]ES\s+GERAIS|REGRAS\s+DA\s+PREMIA[ÇC][ÃA]O|RECONHECIMENTO)\b)/iu;

function section(text, start, end = nextSection) {
  const match = start.exec(text);
  if (!match) return '';
  const tail = text.slice(match.index + match[0].length);
  const stop = end.exec(tail);
  return tail.slice(0, stop ? stop.index : undefined).trim();
}
function cleanBlock(text, max = 2400) {
  // Repeated headers and footers are not campaign rules. A fragmented table is never reassembled by guessing.
  return compact(text.split('\n').filter(line => {
    const letters = line.replace(/[^\p{L}\p{N}]/gu, '');
    return !/^\s*(?:SE\s*G\s*U\s*RO\s*D\s*E\s*VI\s*D\s*A|CNV\s*26\s*CRAQUES\s*DO\s*CONSIGNADO)/iu.test(line)
      && !/^\s*\d{1,3}\s*$/.test(line) && letters.length > 1
      && !/^(?:[\p{L}/][ \t]+)+[\p{L}/]$/u.test(line.trim());
  }).join('\n')).slice(0, max).trim();
}
function validDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value ?? '');
  if (!match) return null;
  const [, d, m, y] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d) ? `${y}-${m}-${d}` : null;
}
function dateLabel(value) { return value ? value.split('-').reverse().join('/') : ''; }
function limitedMatches(text, pattern, max = 100) {
  const values = [];
  for (const value of text.matchAll(pattern)) { if (values.length === max) { values.truncated = true; break; } values.push(value); }
  return values;
}
function pageReference(pages, field, fragment, sourcePages) {
  if (sourcePages.length >= 120) return;
  const needle = fold(compact(fragment)).slice(0, 100);
  if (!needle) return;
  const found = pages.find(page => fold(compact(page.text)).includes(needle));
  const excerpt = compact(fragment).slice(0, 240);
  if (found && !sourcePages.some(source => source.field === field && source.page === found.number && source.excerpt === excerpt)) sourcePages.push({ field, page: found.number, excerpt });
}

/**
 * @param {{number:number,text:string}[]} inputPages Text pages in reading order, numbered from 1.
 * @param {string} [filename] Used only as a fallback title, never as evidence for rules or dates.
 */
export function extractCnvSummary(inputPages, filename = '') {
  if (!Array.isArray(inputPages)) throw new TypeError('As páginas extraídas do PDF são obrigatórias.');
  const pages = inputPages.filter(page => page && typeof page.text === 'string').map((page, index) => ({ number: Number.isInteger(page.number) && page.number > 0 ? page.number : index + 1, text: page.text.replace(/\r\n?/g, '\n') }));
  const text = pages.map(page => page.text).join('\n');
  const flat = compact(text);
  if (flat.replace(/[^\p{L}\p{N}]/gu, '').length < 50) {
    const title = compact(String(filename).replace(/\.pdf$/iu, '').replace(/_/g, ' ').replace(/^regulamento\s*(?:cnv)?\s*[-–:]?\s*/iu, '').replace(/\s*\(\d+\)\s*$/u, '')) || 'Nova ação CNV 2026';
    return { title: title.slice(0, 180), year: 2026, summary: '', products: [], goals: [], startDate: null, endDate: null, periodLabel: '', eligibility: [], rewards: [], importantRules: [], sourcePages: [], needsReview: true, warnings: ['PDF sem texto selecionável ou com texto insuficiente. Preencha os campos manualmente e confira o regulamento original antes de salvar.'] };
  }
  const normalized = fold(flat);
  const sourcePages = [];
  const warnings = [];
  let title = /empresa protegida/.test(normalized) ? 'Seguro de Vida - Empresa Protegida'
    : /dia dos pais/.test(normalized) ? 'Seguro de Vida - Dia dos Pais'
      : /dia da(?:s)? mulher(?:es)?/.test(normalized) ? 'Seguro de Vida - Dia da Mulher' : '';
  if (!title) {
    const candidate = pages.flatMap(page => page.text.split('\n')).map(compact).find(line => /(?:a[çc][ãa]o|campanha|seguro)/iu.test(line) && line.length >= 10 && line.length <= 160 && !/campanha\s+nacional\s+de\s+vendas|cnv\s+26\s+craques/iu.test(line));
    title = candidate || String(filename).replace(/\.pdf$/iu, '').replace(/_/g, ' ').replace(/^regulamento\s*(?:cnv)?\s*[-–:]?\s*/iu, '').replace(/\s*\(\d+\)\s*$/u, '').trim() || 'Nova ação CNV 2026';
  }
  title = compact(title).slice(0, 180);
  pageReference(pages, 'title', title.replace(' - ', ' – '), sourcePages);
  const coverage = section(text, /(?:2\.2\s+Vig[êe]ncia\b|(?:^|\n)\s*Vig[êe]ncia\s*\n)/iu, /(?:2\.3\s*)?Produtos\s+V[áa]lidos/iu);
  const range = /\b(\d{2}\/\d{2}\/\d{4})\s*(?:a|até|at[eé]|[-–])\s*(\d{2}\/\d{2}\/\d{4})\b/iu.exec(compact(coverage) || flat);
  let startDate = range ? validDate(range[1]) : null;
  let endDate = range ? validDate(range[2]) : null;
  if (range && (!startDate || !endDate)) { startDate = null; endDate = null; warnings.push('Há datas inválidas na vigência do documento. Confirme o intervalo.'); }
  if (startDate && endDate && endDate < startDate) { startDate = null; endDate = null; warnings.push('O intervalo de datas aparece invertido no documento. Confirme a vigência.'); }
  const periodLabel = startDate && endDate ? `${dateLabel(startDate)} a ${dateLabel(endDate)}` : '';
  if (range) pageReference(pages, 'period', range[0], sourcePages);
  if (!startDate || !endDate) warnings.push('Vigência não identificada com segurança. Preencha as datas antes de salvar.');
  const year = startDate ? Number(startDate.slice(0, 4)) : /\b20\d{2}\b/.exec(flat)?.[0] ? Number(/\b20\d{2}\b/.exec(flat)[0]) : 2026;
  const objective = cleanBlock(section(text, /(?:2\.1\s+Objetivo\b|(?:^|\n)\s*Objetivo\s*\n)/iu, /(?:2\.2\s*)?\bVig[êe]ncia\b/iu), 1200);
  // A combined heading is followed by a repeated "Objetivo" subheading in the supplied models.
  const objectiveText = objective.replace(/^,?\s*VIG[ÊE]NCIA\s+E\s+PRODUTOS\s*(?:2\.1\s*)?Objetivo\s*/iu, '').trim();
  const summary = objectiveText || cleanBlock(section(text, /\bDEFINI[ÇC][ÕO]ES\b/iu, /\bOBJETIVO(?:,\s*VIG[ÊE]NCIA\s+E\s+PRODUTOS)?\b/iu), 1200);
  if (summary) pageReference(pages, 'summary', summary, sourcePages);
  else warnings.push('Objetivo não identificado. Revise o resumo da ação.');
  const productSection = section(text, /\bProdutos\s+V[áa]lidos\s+na\s+A[çc][ãa]o\b/iu, /(?:3\.?\s*)?\bCOOPERATIVAS\s+PARTICIPANTES\b/iu);
  const products = unique(productPatterns.map(pattern => pattern.exec(productSection || text)?.[0] ?? ''));
  if (!products.length && productSection) {
    products.push(...unique(productSection.split(/\n|[•ƭ]/u).map(line => cleanBlock(line, 300))).filter(line => line && !/^\d+\.?\s*$/.test(line)).slice(0, 30));
  }
  if (!products.length) warnings.push('Produtos não identificados. Preencha os produtos válidos conforme o regulamento.');
  for (const product of products) pageReference(pages, 'products', product, sourcePages);

  const eligibility = [];
  const participants = cleanBlock(section(text, /\bCOOPERATIVAS\s+PARTICIPANTES\b/iu, /(?:4\.?\s*)?\bPREMIA[ÇC][ÕO]ES\b/iu), 1300);
  if (participants) eligibility.push(participants);
  const groups = /Ser[ãa]o\s+considerados\s+para\s+a\s+a[çc][ãa]o[\s\S]{0,180}?utilizados\s+na\s+CNV\.?/iu.exec(text)?.[0];
  if (groups) eligibility.push(compact(groups));

  const ranking = section(text, /Premia[çc][ãa]o\s+pelo\s+Ranking\s+dos\s+Grupos/iu, /(?:NOVIDADE\s+NA\s+PREMIA[ÇC][ÃA]O|O\s+QUE\s+[ÉE]\s+BOM|4\.1\.2\s*Protegeu|Premia[çc][ãa]o\s+por\s+Sorteio|RECONHECIMENTO|\bImportante\b)/iu);
  const rewards = [];
  const goals = [];
  for (const [label, start, end] of [
    ['Centrais', /\bCentrais\b/iu, /\b(?:Elegibilidade|Singulares)\b/iu],
    ['Singulares', /\bSingulares\b/iu, /\bPontos\s+de\s+Atendimento\s*\(PAs\)/iu],
    ['PAs', /\bPontos\s+de\s+Atendimento\s*\(PAs\)\.?/iu, /\b(?:Vendedores|Premia[çc][ãa]o\s+Extra|O\s+QUE\s+[ÉE]\s+BOM|NOVIDADE|4\.1\.2\s*Protegeu)\b/iu],
    ['Vendedores', /\bVendedores\.?/iu, /\b(?:Observa[çc][ãa]o|NOVIDADE|Premia[çc][ãa]o\s+por\s+Sorteio)\b/iu],
  ]) {
    const block = cleanBlock(section(ranking, start, end), 1400);
    if (block) {
      rewards.push(`${label}: ${block}`);
      const criterion = /(?:As?\s+)?(?:Centrais|singulares|PAs)[\s\S]+?(?:ter[ãa]o\s+direito|far[ãa]o\s+jus)[\s\S]{0,90}?(?:abaixo\s*:|a\s+seguir\s*:)/iu.exec(block)?.[0];
      if (criterion) goals.push(`${label}: ${compact(criterion).replace(/\s*(?:ter[ãa]o\s+direito|far[ãa]o\s+jus)[\s\S]*$/iu, '').replace(/[,:;.]\s*$/u, '')}.`);
    }
  }
  // Explicit currency rows only: reference values for prizes and examples are never treated as goals.
  const minimumRows = limitedMatches(text, /\b(C[1-4])\s+(SICOOB[^\n]{1,100}?)\s+([\d.]+,\d{2})(?=\s|$)/giu);
  if (minimumRows.truncated) warnings.push('A extração da tabela de metas foi limitada a 100 ocorrências. Confira as linhas restantes no regulamento.');
  const minimumByGroup = new Map();
  for (const row of minimumRows) {
    const key = `${row[1].toUpperCase()}:${row[3]}`;
    if (!minimumByGroup.has(key)) minimumByGroup.set(key, `${row[1].toUpperCase()}: produção mínima de R$ ${row[3]}.`);
    pageReference(pages, 'goals', row[0], sourcePages);
  }
  goals.push(...minimumByGroup.values());
  const thresholdMatches = limitedMatches(flat, /\bACIMA\s+DE\s+R\$\s*([\d.]+,\d{2})/giu);
  if (thresholdMatches.truncated) warnings.push('A extração de faixas de produção foi limitada a 100 ocorrências. Confira as faixas restantes no regulamento.');
  if (thresholdMatches.length) {
    goals.push(...unique(thresholdMatches.map(match => `PAs - Protegeu, Já Ganhou!: produção acima de R$ ${match[1]}.`)));
    const tierTable = cleanBlock(section(text, /4\.1\.2\s*Protegeu\s*,?\s*J[áa]\s*Ganhou\s*!?/iu, /(?:\bObserva[çc][ãa]o\s*:|\bAten[çc][ãa]o\s*:|\bImportante\b)/iu), 1900);
    if (tierTable) rewards.push(`Protegeu, Já Ganhou!: ${tierTable}`);
    warnings.push('Confira no PDF a associação entre faixas de produção e prêmios da tabela; a extração de tabelas pode alterar a ordem de leitura.');
    for (const match of thresholdMatches) pageReference(pages, 'goals', match[0], sourcePages);
  }
  const sellerDraw = /Estar[ãa]o\s+eleg[ií]veis\s+ao\s+sorteio\s+di[áa]rio[\s\S]{0,550}?(?:06\/03\.?|\bPremia[çc][ãa]o\s+di[áa]ria\s*:)/iu.exec(text)?.[0];
  if (sellerDraw) { goals.push(compact(sellerDraw)); rewards.push(`Sorteio de vendedores: ${compact(sellerDraw)}`); }
  const extraCadence = cleanBlock(section(text, /Premia[çc][ãa]o\s+Extra\s+Cad[êe]ncia\s+PA/iu, /O\s+QUE\s+[ÉE]\s+BOM|4\.1\.2\s*Protegeu/iu), 900);
  if (extraCadence) rewards.push(`Premiação extra de cadência PA: ${extraCadence}`);

  const importantRules = [];
  for (const expression of [
    /Para\s+crit[ée]rio\s+de\s+apura[çc][ãa]o[\s\S]{0,400}?ativas\s+na\s+data\s+da\s+apura[çc][ãa]o\.?/iu,
    /Para\s+as\s+vendas\s+com\s+periodicidade[\s\S]{0,500}?(?:trimestral,\s*semestral\s+ou\s+anual|semestral\s+ou\s+anual)\.?/iu,
    /(?:Observa[çc][ãa]o\s*:|Aten[çc][ãa]o\s*:)?\s*Os\s+pr[êe]mios\s+n[ãa]o\s+s[ãa]o\s+cumulativos\.[\s\S]{0,650}?(?:demais\s+faixas\.?|faixa\s+anterior\.?)/iu,
    /\*?\s*Os\s+seguros\s+VG\s+Cotado\s+e\s+AP\s+Prazo\s+Curto\s+ter[ãa]o\s+um\s+teto\s+limitador\s+de\s+R\$\s*15\s*mil\.?/iu,
    /O\s+resultado\s+interno\s+da\s+campanha\s+ser[áa]\s+divulgado\s+at[ée]\s+o\s+dia\s+\d{2}\/\d{2}\/\d{4}\.?/iu,
    /Os\s+pr[êe]mios\s+n[ãa]o\s+poder[ãa]o[\s\S]{0,400}?transferidos\.?/iu,
    /Para\s+(?:poderem\s+)?participa(?:r|rem)\s+da\s+viagem[\s\S]{0,250}?data\s+da\s+viagem\.?/iu,
  ]) {
    const match = expression.exec(text);
    if (match) importantRules.push(compact(match[0]));
  }
  const inclusion = /Para\s+apura[çc][ãa]o\s+dos\s+valores\s+de\s+venda[\s\S]{0,600}?cooperativas\s+singulares\.?/iu.exec(text)?.[0];
  if (inclusion) importantRules.push(compact(inclusion));
  // Unrecognized templates retain explicit goal/reward sections rather than a silent empty preview.
  if (!goals.length) {
    const explicit = cleanBlock(section(text, /(?:^|\n)\s*(?:\d+(?:\.\d+)*\.?\s*)?METAS?\s*[:\n]/iu), 1800);
    if (explicit) goals.push(explicit);
  }
  if (!rewards.length) {
    const explicit = cleanBlock(section(text, /(?:^|\n)\s*(?:\d+(?:\.\d+)*\.?\s*)?PREMIA[ÇC][ÕO]ES\s*[:\n]/iu), 2200);
    if (explicit) rewards.push(explicit);
  }
  if (!goals.length) warnings.push('Metas numéricas não identificadas. Não foi criada uma meta a partir de exemplos ou valores de prêmios.');
  if (!rewards.length) warnings.push('Premiação não identificada. Confira o regulamento.');
  if (/empresa protegida/.test(normalized) && /(?:produ[çc][ãa]o\s+m[ií]nima|meta\s+m[ií]nima)/iu.test(text) && !minimumRows.length) warnings.push('A tabela de produção mínima das Centrais não pôde ser lida com segurança. Confira a tabela no regulamento e complete as metas.');
  if (/24h59/.test(normalized)) warnings.push('O regulamento informa o horário “24h59min”. Confirme esse horário com a organização; o texto original foi preservado.');
  if (/dia da(?:s)? mulher(?:es)?/.test(normalized) && /craques do consignado/.test(normalized)) warnings.push('O documento menciona Dia da Mulher no conteúdo e “Craques do Consignado” nos cabeçalhos. Confirme o título da ação.');
  if (/camisa\s*10\s*pj:[\s\S]{0,160}?pessoa\s+f[ií]sica/iu.test(text)) warnings.push('Há uma descrição de “Camisa 10 PJ” associada a Pessoa Física no regulamento. Confirme a categoria com a organização.');
  for (const [field, values] of Object.entries({ eligibility, goals, rewards, importantRules })) for (const value of values) pageReference(pages, field, value.replace(/^(?:Centrais|Singulares|PAs|Vendedores|Protegeu, Já Ganhou!|Premiação extra de cadência PA|Sorteio de vendedores):\s*/u, ''), sourcePages);
  const fields = { products: unique(products), goals: unique(goals), eligibility: unique(eligibility), rewards: unique(rewards), importantRules: unique(importantRules) };
  for (const [field, values] of Object.entries(fields)) {
    if (values.length > 60) { fields[field] = values.slice(0, 60); warnings.push('O resumo foi limitado a 60 itens por seção. Confira no regulamento as informações que não aparecem na prévia.'); }
  }
  if (sourcePages.length > 60) warnings.push('As referências foram limitadas a 60 trechos. Confira o regulamento para os demais itens.');
  const reviewWarnings = unique(warnings);
  if (reviewWarnings.length > 30) reviewWarnings.splice(29, reviewWarnings.length, 'Há outros avisos de extração. Confira todas as seções no regulamento antes de salvar.');
  return { title, year, summary, ...fields, startDate, endDate, periodLabel, sourcePages: sourcePages.slice(0, 60), needsReview: true, warnings: reviewWarnings };
}

export default extractCnvSummary;
