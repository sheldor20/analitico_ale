import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCnvSummary } from '../lib/cnv-summary.mjs';

const objective = '2.1 Objetivo\nAmpliar a proteção das famílias e dos cooperados.\n2.2 Vigência\n';
const validRules = 'Importante\nPara critério de apuração das premiações internas serão consideradas as propostas vendidas, implantadas, com a 1° parcela paga e que estejam ativas na data da apuração.\nPara as vendas com periodicidade de pagamento diferente de mensal, serão considerados os valores referentes ao prêmio de um mês (apropriação mensal), mesmo que o segurado opte por pagamento trimestral, semestral ou anual.\n*Os seguros VG Cotado e AP Prazo Curto terão um teto limitador de R$ 15 mil.';
const products = '2.3 Produtos Válidos na Ação\nSicoob Seguro Vida Individual ou Mulher\nSicoob Seguro Vida Digital\nVG Cotado*\nAP Prazo Curto*\n';
const participation = '3. COOPERATIVAS PARTICIPANTES\nParticipam todas as singulares que concorrem na CNV.\n4. PREMIAÇÕES\n';
const centralRanking = '4.1.1 Premiação pelo Ranking dos Grupos\nCentrais\nAs Centrais em primeiro lugar em seus grupos e que atingirem a meta mínima terão direito à premiação abaixo:\n01 vaga na viagem CNV 2026\n';

test('CNV Empresa: preserves source products, strict production thresholds, dates and review of unreadable tables', () => {
  const result = extractCnvSummary([
    { number: 2, text: `Seguro de Vida – Empresa Protegida\n${objective}De 06/07/2026 a 19/07/2026\n${products}` },
    { number: 3, text: `${participation}${centralRanking}` },
    { number: 4, text: 'Elegibilidade\nP R O D U Ç Ã O\nM Í N I M A\nSingulares\nAs singulares em primeiro lugar terão direito à premiação abaixo:\n01 vaga na viagem CNV 2026\nPontos de Atendimento (PAs).\nOs PAs em primeiro lugar terão direito à premiação abaixo:\n01 iPhone 17\nG R\nP O\nI M\nE N\nT R A' },
    { number: 5, text: '4.1.2 Protegeu, Já Ganhou!\nPontos de Atendimento (PAs).\nPRODUÇÃO PREMIAÇÃO\nACIMA DE R$ 3.000,00 BOOMBOX\nACIMA DE R$ 6.000,00 TV\nACIMA DE R$ 9.000,00 TV + BOOMBOX\n' },
    { number: 6, text: `${validRules}\nPRÊMIOS VALOR DE REFERÊNCIA\nIPHONE R$ 10.000,00\nExemplo: prêmio mensal R$ 20.000,00.` },
  ], 'arquivo.pdf');
  assert.equal(result.title, 'Seguro de Vida - Empresa Protegida');
  assert.equal(result.summary, 'Ampliar a proteção das famílias e dos cooperados.');
  assert.equal(result.startDate, '2026-07-06');
  assert.equal(result.endDate, '2026-07-19');
  assert.equal(result.year, 2026);
  assert.equal(result.periodLabel, '06/07/2026 a 19/07/2026');
  assert.ok(result.products.includes('Sicoob Seguro Vida Digital'));
  assert.ok(result.goals.some(value => /acima de R\$ 9\.000,00/.test(value)));
  assert.ok(result.goals.every(value => !/10\.000|20\.000|igual ou superior/.test(value)));
  assert.ok(result.importantRules.some(value => /teto limitador de R\$ 15 mil/.test(value)));
  assert.ok(result.importantRules.some(value => /1° parcela paga/.test(value)));
  assert.ok(result.warnings.some(value => /tabela de produção mínima/.test(value)));
  assert.ok(!result.rewards.join(' ').includes('G R P O'));
  assert.equal(result.needsReview, true);
  assert.ok(result.sourcePages.some(source => source.field === 'products' && source.page === 2));
  assert.ok(result.sourcePages.some(source => source.field === 'importantRules' && source.page === 6));
});

test('CNV Pais: reads explicit central minima and preserves cadence and distinct PA prize groups', () => {
  const result = extractCnvSummary([
    { number: 2, text: `Seguro de Vida – Dia dos Pais\n${objective}De 03/08/2026 a 09/08/2026\n${products}` },
    { number: 3, text: `${participation}${centralRanking}` },
    { number: 4, text: 'Elegibilidade\nGRUPO CENTRAL PRODUÇÃO MÍNIMA\nC1 SICOOB CENTRAL BA 80.000,00\nC1 SICOOB CENTRAL NE 80.000,00\nC2 SICOOB NOVA CENTRAL 100.000,00\nC3 SICOOB CENTRAL UNICOOB 250.000,00\nC4 SICOOB CENTRAL SC/RS 350.000,00\nSingulares\nAs singulares em primeiro, segundo e terceiro lugares terão direito à premiação abaixo:\n1º lugar: iPhone 17\n2º lugar: TV 55\n3º lugar: Boombox\nPontos de Atendimento (PAs).\nOs PAs em primeiro, segundo e terceiro lugares terão direito à premiação abaixo:\n1º lugar: viagem CNV\n2º lugar: PlayStation 5\n3º lugar: Boombox' },
    { number: 5, text: 'Premiação Extra Cadência PA\nOs PAs em primeiro lugar e que cumprirem a cadência no trimestre (julho, agosto e setembro) ganham Boombox.\nO QUE É BOM...SE REPETE!\n4.1.2 Protegeu, Já Ganhou!\nACIMA DE R$ 12.000,00 BOOMBOX + CERVEJEIRA + TV 50\nAtenção: Os prêmios não são cumulativos. A faixa superior substitui a faixa anterior.' },
    { number: 6, text: validRules },
  ]);
  assert.equal(result.startDate, '2026-08-03');
  assert.equal(result.endDate, '2026-08-09');
  assert.equal(result.goals.filter(value => /C1: produção mínima/.test(value)).length, 1);
  assert.ok(result.goals.includes('C1: produção mínima de R$ 80.000,00.'));
  assert.ok(result.goals.includes('C4: produção mínima de R$ 350.000,00.'));
  assert.ok(result.rewards.find(value => value.startsWith('PAs:')).includes('PlayStation 5'));
  assert.ok(result.rewards.find(value => value.startsWith('Singulares:')).includes('iPhone 17'));
  assert.ok(result.rewards.some(value => /cadência PA:.*julho, agosto e setembro/.test(value)));
  assert.ok(result.importantRules.some(value => /não são cumulativos/.test(value)));
});

test('CNV Mulher: body wins over unrelated cover and inconsistencies are surfaced without repairing the regulation', () => {
  const result = extractCnvSummary([
    { number: 1, text: 'CNV 26 CRAQUES DO CONSIGNADO 1' },
    { number: 2, text: `DEFINIÇÕES\nA ação celebra o Dia das Mulheres, no período 02/03/2026 a 08/03/2026.\nOBJETIVO, VIGÊNCIA E PRODUTOS\nObjetivo\nAmpliar a proteção das famílias.\nVigência\nDe 02/03/2026 a 08/03/2026\n${products}${participation}` },
    { number: 3, text: 'Premiação pelo Ranking dos Grupos\nCentrais\nAs Centrais em primeiro lugar terão direito à premiação abaixo:\n5 camisas\nSingulares\nAs singulares em primeiro, segundo e terceiro lugares terão direito à premiação abaixo:\n10, 5 e 2 camisas\nPontos de Atendimento (PAs)\nAs PAs em primeiro e segundo lugares terão direito à premiação abaixo:\n1º lugar: viagem\n2º lugar: TV 55\nVendedores\nCamisa 10 PJ: o melhor vendedor em produtos PJ ganha camisa e 100 mil pontos coopera.\nPremiação por Sorteio\nEstarão elegíveis ao sorteio diário os vendedores que apresentarem uma produção igual ou superior a R$ 250,00 no dia. Premiação válida para os dias 02, 03, 04, 05 e 06/03.' },
    { number: 4, text: 'RECONHECIMENTO\nCamisa 10 PJ: participante com maior volume de produção nos produtos voltados ao público Pessoa Física.\n' + validRules },
    { number: 5, text: 'Para apuração dos valores de venda dos produtos da ação serão considerados somente propostas incluídas em sistema entre 0h de 02/03 até às 24h59min de 08/03 nos PAs das cooperativas singulares. O resultado interno da campanha será divulgado até o dia 31/05/2026.' },
  ]);
  assert.equal(result.title, 'Seguro de Vida - Dia da Mulher');
  assert.equal(result.summary, 'Ampliar a proteção das famílias.');
  assert.equal(result.startDate, '2026-03-02');
  assert.equal(result.endDate, '2026-03-08');
  assert.ok(result.goals.some(value => /igual ou superior a R\$ 250,00 no dia/.test(value)));
  assert.ok(result.goals.every(value => !/80\.000|100\.000|C1: produção mínima/.test(value)));
  assert.ok(result.warnings.some(value => /24h59min/.test(value)));
  assert.ok(result.warnings.some(value => /Craques do Consignado/.test(value)));
  assert.ok(result.warnings.some(value => /Pessoa Física/.test(value)));
  assert.ok(result.importantRules.some(value => /24h59min/.test(value)));
  assert.ok(result.importantRules.some(value => /31\/05\/2026/.test(value)));
});

test('unknown templates keep explicit sections and never infer a missing period or numeric goal from prize values', () => {
  const result = extractCnvSummary([{ number: 1, text: 'Campanha Proteção Familiar\nObjetivo\nAmpliar o acesso à proteção familiar na rede de cooperativas.\nVigência\nA confirmar\nProdutos Válidos na Ação\n• Seguro Regional Novo\nCOOPERATIVAS PARTICIPANTES\nCooperativas regionais inscritas na campanha.\nPREMIAÇÕES\nVoucher de R$ 500,00 por classificação.' }], 'regulamento.pdf');
  assert.equal(result.title, 'Campanha Proteção Familiar');
  assert.deepEqual(result.products, ['Seguro Regional Novo']);
  assert.equal(result.startDate, null);
  assert.equal(result.endDate, null);
  assert.equal(result.periodLabel, '');
  assert.deepEqual(result.goals, []);
  assert.ok(result.rewards.some(value => /Voucher de R\$ 500,00/.test(value)));
  assert.ok(result.warnings.some(value => /Metas numéricas não identificadas/.test(value)));
});

test('invalid and reversed dates stay unconfirmed rather than rolling over or choosing an announcement date', () => {
  for (const period of ['31/02/2026 a 08/03/2026', '19/07/2026 a 06/07/2026']) {
    const result = extractCnvSummary([{ number: 1, text: `Campanha Seguro Regional\nObjetivo\nProteger famílias e cooperados da rede de cooperativas.\nVigência\n${period}\nO resultado será divulgado em 30/09/2026.` }]);
    assert.equal(result.startDate, null);
    assert.equal(result.endDate, null);
    assert.equal(result.periodLabel, '');
    assert.ok(result.warnings.some(value => /datas/.test(value)));
  }
});

test('single-line text from PDF readers still extracts numbered headings, source products and the first regulatory date range', () => {
  const result = extractCnvSummary([{ number: 7, text: 'Seguro de Vida – Dia dos Pais 2.1 Objetivo Proteger famílias e fortalecer a cultura de seguros. 2.2 Vigência De 03/08/2026 a 09/08/2026 2.3 Produtos Válidos na Ação Sicoob Seguro Vida Digital Seguro Renda Protegida 3. COOPERATIVAS PARTICIPANTES Todas as singulares concorrentes da CNV. 4. PREMIAÇÕES Resultado em 30/10/2026.' }]);
  assert.equal(result.summary, 'Proteger famílias e fortalecer a cultura de seguros.');
  assert.deepEqual(result.products, ['Sicoob Seguro Vida Digital', 'Seguro Renda Protegida']);
  assert.equal(result.startDate, '2026-08-03');
  assert.equal(result.endDate, '2026-08-09');
  assert.ok(result.sourcePages.every(source => source.page === 7));
});

test('empty/scanned documents remain editable with no invented values and source filenames never supply evidence', () => {
  const blank = extractCnvSummary([{ number: 1, text: '' }], 'Regulamento CNV - Ação especial.pdf');
  assert.equal(blank.title, 'Ação especial');
  assert.equal(blank.summary, '');
  assert.equal(blank.startDate, null);
  assert.equal(blank.endDate, null);
  assert.deepEqual(blank.products, []);
  assert.deepEqual(blank.goals, []);
  assert.deepEqual(blank.sourcePages, []);
  assert.equal(blank.needsReview, true);
  assert.ok(blank.warnings.some(value => /PDF sem texto selecionável/.test(value)));
  assert.throws(() => extractCnvSummary(null), /páginas extraídas/);
  const result = extractCnvSummary([{ number: 1, text: 'Documento informativo com orientações gerais de uma campanha regional. Nenhuma vigência, produto ou meta aparece neste texto.' }], 'Empresa Protegida 06_07_2026 a 19_07_2026.pdf');
  assert.equal(result.startDate, null);
  assert.equal(result.endDate, null);
  assert.deepEqual(result.products, []);
  assert.deepEqual(result.goals, []);
  assert.equal(result.needsReview, true);
});


test('explicit validity heading takes precedence over an earlier event date range', () => {
  const result = extractCnvSummary([{ number: 1, text: 'Campanha de Seguro Regional\nTreinamento de 01/02/2026 a 03/02/2026.\nObjetivo\nAmpliar a proteção para os cooperados.\nVigência\nDe 02/03/2026 a 08/03/2026\nProdutos Válidos na Ação\nSeguro Regional\nCOOPERATIVAS PARTICIPANTES\nCooperativas inscritas.' }]);
  assert.equal(result.startDate, '2026-03-02');
  assert.equal(result.endDate, '2026-03-08');
});


test('repetitive input keeps review metadata and section arrays bounded and warns when source is truncated', () => {
  const rows = Array.from({length:180}, (_,index) => `ACIMA DE R$ ${index + 1}.000,00 PRÊMIO`).join('\n');
  const result = extractCnvSummary([{ number: 1, text: `Campanha Seguro Regional\nObjetivo\nAmpliar o acesso à proteção de famílias e cooperados.\nVigência\n02/03/2026 a 08/03/2026\n4.1.2 Protegeu, Já Ganhou!\n${rows}\nImportante\nConfira as condições.` }]);
  for (const field of ['products','goals','eligibility','rewards','importantRules']) assert.ok(result[field].length <= 60);
  assert.ok(result.sourcePages.length <= 60);
  assert.ok(result.warnings.length <= 30);
  assert.ok(result.warnings.some(value => /limitad/.test(value)));
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 90_000);
});
