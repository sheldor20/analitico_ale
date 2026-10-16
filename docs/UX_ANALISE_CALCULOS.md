# Auditoria de leitura e cálculos da Gestão Comercial

Referência: PDF `GESTAÃO E FLUXO(1).pdf`, seis páginas A4, posição apresentada em 15/10/2026; código analisado em 16/10/2026. O PDF é rasterizado: não contém texto extraível nem os registros de origem. Os números abaixo são conferências da referência, nunca constantes da interface.

## Conferência dos números apresentados

| Indicador | Regra do motor atual | Conferência do PDF |
| --- | --- | --- |
| Meta do período | Soma das metas das unidades selecionadas, no mesmo recorte | R$ 577.560,00 |
| Realizado | Soma dos realizados informados no mesmo recorte | R$ 515.331,67 |
| Atingimento consolidado | Soma do realizado / soma das metas; não é média simples dos percentuais | 89,225651...%, apresentado como 89,2% |
| GAP consolidado | `max(0, soma das metas - soma do realizado)` | R$ 62.228,33 |
| Projeção do período | Soma das estimativas das unidades no horizonte selecionado | R$ 549.383,08 |
| Atingimento projetado | Soma das projeções / soma das metas do mesmo horizonte | 95,121386...%, apresentado como 95,1% |
| GAP projetado consolidado | `max(0, soma das metas - soma das projeções)` | R$ 28.176,92 |
| Déficits das unidades | Soma de `max(0, meta da unidade - realizado da unidade)` | R$ 70.936,13 |
| Superações das unidades | Soma de `max(0, realizado da unidade - meta da unidade)` | R$ 8.707,80 |

O GAP consolidado e os déficits individuais são medidas diferentes e ambas estão corretas. Nesta referência, `70.936,13 - 8.707,80 = 62.228,33`: a superação de CREDCOOP (R$ 2.995,30) e INOVA (R$ 5.712,50) reduz o saldo consolidado, mas não entrega a meta das demais unidades. Quando o realizado total supera a meta total, o GAP consolidado é zero; isso não implica que todas as unidades atingiram a própria meta.

Ajuda curta indicada para a interface: **GAP consolidado: falta para a meta da seleção, com compensação das superações. Déficits das unidades: falta para cada unidade atingir sua própria meta, sem compensação entre elas.**

A concentração de R$ 50.278,43 sobre R$ 70.936,13 corresponde a 70,878450...%, corretamente arredondada para 70,9%. O denominador é o déficit individual, não o GAP consolidado. O acesso deve abrir as unidades responsáveis, no mesmo contexto.

### Origem e limite da validação da projeção

`lib/analytics.mjs`, função `analyze`, calcula:

1. A referência proporcional até o corte (`expected`) soma a meta de cada mês multiplicada pela fração de dias de segunda a sexta já transcorridos nesse mês.
2. O ritmo (`pace`) é `realizado / referência proporcional`, quando os dados são completos e a referência é positiva.
3. A meta futura é `max(0, meta do período - referência proporcional)`.
4. A projeção é `realizado + meta futura × max(0, ritmo) × (1 + aceleração / 100)`.
5. No período encerrado, a projeção coincide com o realizado. Uma divergência entre meta anual oficial e distribuição mensal bloqueia a projeção anual.

O realizado negativo é preservado; somente a produção futura é limitada a zero. A simulação afeta a parcela futura, sem reescrever o realizado. `lib/production-projection.mjs` descreve essa mesma premissa, sem criar outro cálculo.

A razão entre R$ 549.383,08 e R$ 577.560,00 foi validada. O valor absoluto da projeção não pode ser recalculado de maneira independente apenas com o PDF: faltam as metas mensais, os realizados mensais e os cortes por unidade. Não é correto inferir outro método a partir desses totais ou substituir o motor validado por uma extrapolação simples do consolidado.

Esta projeção é uma estimativa determinística pelo ritmo observado. O repositório não contém um modelo estatístico calibrado de probabilidade. A interface deve usar **projeção**, **estimativa** ou **ritmo**, sem apresentar uma chance de fechamento inventada.

### Esforço: divergência de rótulo encontrada

Para o corte do PDF, 15/10/2026, o motor conta 11 dias de segunda a sexta de 16 a 31/10, de um total de 22 dias no mês. Restam 0,5 mês equivalente. Feriados nacionais, locais e bancários não são descontados; a interface deve explicitar essa limitação perto da ajuda do esforço.

| Base de esforço | Por dia restante | Por mês equivalente restante |
| --- | --- | --- |
| GAP consolidado de R$ 62.228,33 | R$ 5.657,12 | R$ 124.456,66 |
| Déficits individuais de R$ 70.936,13 | R$ 6.448,74 | R$ 141.872,26 |

O valor de R$ 6.448,74/dia aparece abaixo do GAP consolidado na página 1, mas pertence à segunda linha. Sua origem é `summarize.requiredDaily`, que soma `requiredDaily` de cada unidade, calculado a partir do GAP individual. O número é coerente; a associação visual com o GAP consolidado é ambígua. A recomendação é preservar o cálculo existente e identificar **Esforço das unidades com déficit**. Se houver uma apresentação do esforço consolidado, deve usar o GAP consolidado e um prazo comum validado, e ficar indisponível quando houver cortes ou horizontes incompatíveis.

Na página 5, R$ 141.872,26/mês equivalente é coerente com os déficits individuais e 0,5 mês restante. Não é produção mensal recorrente nem previsão do próximo mês. Com prazos diferentes, a soma de esforços individuais continua descrevendo necessidades individuais, mas não deve ser rotulada como GAP consolidado dividido por um único prazo.

Em períodos encerrados com GAP positivo não existe prazo futuro nesse recorte: `requiredDaily` e `requiredMonthly` ficam indisponíveis, em vez de dividir por zero. Se a meta já foi atingida, o esforço é zero.

## Atingimento, ritmo e projeção

| Dimensão | Pergunta respondida | Regra preservada |
| --- | --- | --- |
| Atingimento realizado | Quanto da meta inteira do período foi produzido? | Realizado / meta do período; faixas abaixo de 70%, de 70% a menos de 100%, e pelo menos 100% |
| Ritmo até o corte | A produção acompanha a referência proporcional até hoje? | Realizado comparado a `expected`, com a meta de cada mês e dias de segunda a sexta |
| Projeção do período | Quanto será produzido se o ritmo observado continuar? | Motor compartilhado de `analyze`, com horizonte explícito |
| Simulação | O que ocorreria ao alterar a produção futura estimada? | Aceleração sobre o futuro; realizado preservado e saída identificada como simulação |

Assim, uma unidade em 94,9% da meta inteira pode estar em rota na metade do último mês do recorte. A cor do atingimento realizado não é alterada pela projeção. `lib/management-priorities.mjs` já usa a referência proporcional para detectar atraso; um simples percentual abaixo de 100% não deve gerar alerta de ritmo.

## Hierarquia e prevenção de dupla contagem

- `lib/scenarios.mjs`, `scopedAnalyses`, escolhe uma única fonte e carteira antes de agregar. A base das cooperativas e a cadência dos PAs são fontes distintas.
- `aggregate` mantém `source` e `metric` nas chaves. Os totais diretos de central são fallback: deixam de ser somados quando há linhas de cooperativas da mesma central/carteira.
- `networkSummary` calcula cooperativas e PAs em grupos separados. A produção dos PAs não é adicionada novamente ao total da cooperativa.
- As metas da cadência são definidas por grupo P1 a P5, respeitando metas específicas cadastradas. Não se deve substituir essa meta pela meta oficial da cooperativa nem assumir igualdade entre os dois totais.
- A identidade de um PA inclui central, cooperativa e código do PA. PA 00 é uma identidade válida. Códigos repetidos em cooperativas diferentes não são o mesmo registro.
- `reconcile` compara a soma de PAs com a linha da cooperativa nos meses conhecidos e registra a diferença, incluindo o aviso de cortes distintos. Essa conferência não corrige valores automaticamente e não comprova que as duas fontes tenham cobertura idêntica.
- Venda Nova e Arrecadação devem preservar seus próprios valores, metas e cortes. `buildCurrentViewModels` gera um modelo por carteira, sem somar as duas.

## Ausência de dados e linhas sem indicadores

O motor distingue estas situações e a interface deve manter um rótulo visível:

| Situação | Comportamento atual relevante |
| --- | --- |
| Zero informado | `actual = 0`; participa da soma; é resultado conhecido, não ausência |
| Realizado ausente | `null`; não vira zero; não libera projeção nem atingimento conclusivo |
| Um mês anterior sem informação | O realizado conhecido pode permanecer visível, porém `complete = false`; a avaliação fica indisponível |
| Meta ausente | Sem base de meta/percentual; exige cadastro ou conferência |
| Meta zero | Valor zero preservado; divisão percentual e conquista de meta não são inventadas |
| Período futuro | Após o corte; os placeholders de meses futuros não são tratados como produção zero |
| Cortes incompatíveis | Agregação parcial sem base comparável de ritmo fica incompleta |
| Falha de carregamento | Deve ter mensagem de erro e opção de tentar novamente; nunca usar um estado vazio como sucesso |

`analysisRows` inclui todas as unidades cadastradas, mesmo sem produção, criando linhas analíticas com valores `null` sem persistir saldos inventados.

Na página 3 do PDF, COOPERE, COSTA DO DESCOBRIMENTO, CREDICONQUISTA e COOPEMAR apresentam nomes, bordas e ações, mas não os indicadores nem o texto do status. Não há erro de carregamento legível. O consolidado, a soma dos déficits e as recomendações nas páginas seguintes permanecem calculados, inclusive citando unidades dessas linhas. Isso é indício de perda de renderização/impressão, não evidência suficiente para preencher dados ausentes com zero.

O PDF não contém a árvore DOM nem os dados de origem; portanto, não é possível atribuir retroativamente a falha a uma regra CSS exata ou confirmar todos os valores das quatro unidades. A correção deve garantir renderização de todas as células e status na impressão e testar registros fora da área inicialmente visível. Se a base de uma unidade realmente estiver incompleta, o estado explícito deve aparecer no lugar de uma célula invisível.

## Comparação e períodos

`buildPeriodPerformance` reutiliza o motor e mantém a população de unidades selecionadas fixa ao longo dos 19 recortes: 12 meses, 4 trimestres, 2 semestres e ano. Não reaplica busca/situação mês a mês, o que mudaria a população comparada. Janeiro a dezembro devem continuar presentes, inclusive com os estados após o corte, sem realizado, incompleto, parcial e fechado.

`compareYears` compara os mesmos meses **fechados** nos dois anos, limitados pelo primeiro corte disponível entre as unidades de cada base. Não reconstrói um dia equivalente dentro de snapshots mensais. A diferença absoluta é atual menos anterior. A variação percentual somente é calculada quando o realizado anterior é positivo; ausência de base, zero e base negativa não recebem um percentual inventado. Unidades presentes em apenas um ano são identificadas, não convertidas em produção zero. A composição de uma central pode mudar, mesmo quando seu código continua igual; a comparação de cooperativas comuns é o recorte para controlar essa diferença.

## Revisão visual página a página

| Página | Problemas observados | Direção de correção |
| --- | --- | --- |
| 1 | Quatro KPIs enormes empilhados; contexto distante; rótulo de esforço ambíguo; link de acessibilidade aparece no rodapé | Faixa compacta, horizonte e corte próximos; esforço identificado; ocultar somente a impressão do skip link |
| 2 | Unidades em cartões altos; ações por ícone; Norte Sul começa na última faixa e continua na próxima página; legenda não acompanha a continuação | Tabela própria para impressão; cabeçalho repetido; impedir quebra do registro; esconder seleção e controles operacionais |
| 3 | Continuação do registro anterior; quatro unidades sem indicadores/status legíveis; grande altura por registro | Renderizar todas as células; preservar status textual; densidade uniforme e linhas completas |
| 4 | Prioridades depois da lista longa; muitos blocos recolhíveis de análises distintas; reconhecimento sem identificação suficiente; início de seção quebra | Prioridades logo após KPIs; abas próprias; reconhecimento secundário com unidade/carteira/período |
| 5 | Gráfico toma grande área; recomendações densas; início de esforço encoberto pelo link fixo; ações pouco evidentes | Imprimir somente o cenário ativo; reduzir decoração; transformar concentração do déficit em acesso à lista |
| 6 | Apenas cabeçalho de Critérios de cálculo, restante quase vazio | Evitar cabeçalhos órfãos; critérios curtos como notas próximas aos valores |

O link fixo “Ir para o conteúdo” aparece em todas as páginas 1 a 5 e sobrepõe conteúdo. Sua função na tela deve ser preservada com foco por teclado; em `@media print`, ele deve ficar oculto. A regra genérica `break-inside: avoid` aplicada a painéis grandes não garante integridade das linhas e pode deslocar conteúdo para outra página. A impressão deve permitir fragmentar seções grandes e impedir a quebra de registros específicos. Cabeçalhos de tabela devem usar `table-header-group`, sem posição fixa na impressão; wrappers sem altura máxima ou recorte.

## Evidência e verificações

As seis páginas foram renderizadas e inspecionadas visualmente em `/tmp/sicoob-pdf-audit/page-1.png` até `page-6.png`. Os cálculos numéricos desta nota foram conferidos com o próprio `businessDays` de `lib/analytics.mjs` e divisão dos totais apresentados, sem consultar ou modificar registros privados no Supabase.

Testes existentes em `tests/analytics.test.mjs`, `tests/management-priorities.test.mjs`, `tests/scenarios.test.mjs` e `tests/period-performance.test.mjs` já cobrem ponderação de percentuais, compensação versus déficits individuais, ausência versus zero, prazos encerrados, períodos futuros, cortes diferentes, metas divergentes, comparação de meses fechados e identidade de PA. As mudanças de navegação e apresentação devem continuar consumindo esses helpers compartilhados.

Nenhuma regra financeira, permissão ou registro foi alterado nesta auditoria. As inconsistências confirmadas são de interpretação do esforço e composição impressa. A reprodução integral da estimativa do PDF depende da base mensal correspondente, não anexada.
