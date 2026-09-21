# UX de gestão e decisão — 21/09/2026

Auditoria por código do portal após a PR 20 e contrato das melhorias seguintes. A identidade continua sendo a definida em `IDENTIDADE_VISUAL.md`: tokens locais, Sicoob Sans e marca oficial. Esta auditoria não substitui a validação visual e de navegador da PR.

## Dez requisitos e lacunas encontradas

| Requisito | Evidência e lacuna na base da revisão | Direção de implementação / verificação |
| --- | --- | --- |
| 1. Início orientado à decisão | `dashboard.tsx` mostrava quatro indicadores, rede, listas e só depois `buildDecisionInsights`. A concentração do GAP considerava o valor da meta inteira, mesmo no início do período. | Apresentar resultado → prioridades → unidades. O novo `ManagementPriorities` usa meta proporcional até o corte, mostra até três fatos e recolhe critérios/listas. |
| 2. Central → cooperativa → PA | Os filtros hierárquicos e expansão de PAs já existiam; a navegação não mantinha uma pilha explícita de contextos para voltar à busca/período/carteira anteriores. | Preservar contexto ao entrar/voltar; limpar seleções dependentes; colocar ações junto às unidades. Validar voltar após mudança de nível, não apenas os valores iniciais dos filtros. |
| 3. Hierarquia dos números | Os indicadores já seguiam Meta, Realizado, GAP/crescimento e Projeção. Ordenações existiam; o comando GAP usava prioritariamente `projectionGap`, ambíguo para quem espera GAP realizado. | Manter a ordem e separar medida realizada de estimativa na ordenação. Produção, contribuição e atingimento são medidas distintas; nomear explicitamente a base de cada percentual. |
| 4. Integridade analítica | `analyze` preserva negativos, ausência e metas mensais; cortes mistos bloqueiam ritmo comparável. A recomendação anterior usava GAP total e podia ser interpretada como atraso precoce. | Prioridades usam `expected`, sem simulação. Não classificar contribuição entre posições diferentes. Conferir metas zero/divergentes e dados incompletos; não tratar projeção como conquista. |
| 5. Exportações filtradas/selecionadas | O CSV saía de `displayed`; faltavam uma escolha explícita da população e uma planilha XLSX correspondente. | Exportações devem identificar seleção, carteira, período, cortes, campos e totais. Reconciliar arquivo com as mesmas chaves da lista e verificar negativos/ausentes e neutralização de fórmulas. |
| 6. Entrada única de comunicação | Comunicação individual e compartilhamento de listas usavam entradas/modalidades diferentes. O usuário precisava entender o caminho técnico para chegar ao formato desejado. | Uma entrada a partir do escopo atual, seguida por população e formato; manter atalhos de unidade. Seleção/ordenação devem atravessar preview, texto, HTML e PNG. |
| 7. E-mail objetivo | A PR 20 já eliminou abertura e foco genéricos. Modelos próprios e campos editáveis precisam continuar preservados ao alternar formato e filtros. | Assunto, introdução e chamada para ação editáveis; nenhuma causa comercial inferida sem dado. Outlook recebe texto/link de composição e painel por cópia ou arquivo conforme suporte real. |
| 8. PNG para celular | As exportações já compartilhavam dados e evitavam quebra de moeda. Partes longas podiam diminuir a leitura no telefone. | Partes de até 12 unidades com carteira, escopo, período, posição e numeração. Nenhuma linha omitida. Valores completos, sem fracionar centavos. |
| 9. Consistência e acessibilidade | Tokens, nomes e ícones locais já estavam disponíveis. Avisos extensos e múltiplas instruções competiam com os dados em alguns fluxos. | Títulos curtos, ação concreta, cor acompanhada de texto, `aria-label` específico, foco visível e detalhes nativos acionáveis por teclado. Sem rolagem vertical interna nas listas. |
| 10. Ponta a ponta | A suíte de domínio cobre fórmulas/escopo e a suíte de navegador cobre fluxos anteriores. Os novos atalhos e seleções mudam a população que chega às saídas. | Validar os seis fluxos abaixo e imagens em computador/celular. A aprovação depende dos resultados da PR, não da existência dos testes. |

## Painel Prioridades da carteira

`buildManagementPriorities(analyses)` recebe a população já filtrada produzida por `analyze`; não busca dados nem persiste estado. Fontes, indicadores, níveis ou períodos misturados são recusados para evitar dupla contagem.

1. **Conferir registros:** ausência, incompletude, meta zero/negativa, divergência anual, cortes internos diferentes e realizado negativo. Negativo continua negativo; o painel não inventa estorno, erro ou outra causa.
2. **Ritmo a recuperar:** realizado abaixo da meta proporcional até o corte, calculada pelo motor existente com a meta de cada mês e dias úteis sem feriados. No período fechado, o rótulo passa a **Metas com prazo encerrado**. O GAP da meta inteira não gera sozinho um alerta de atraso.
3. **Próximas da meta:** realizado de 90% a menos de 100%, com dias úteis restantes. O limiar é uma regra de apresentação explícita, não uma previsão de conversão.
4. **Maior contribuição:** participação na produção positiva completa, na mesma posição. Negativos não entram no denominador positivo nem são apagados dos indicadores. Este fato fica recolhido quando as três prioridades anteriores existem.

O painel mostra no máximo três cartões inicialmente. Unidades e critérios ficam em expansão com rolagem natural da página. Posições diferentes permitem constatações por unidade, sem totalizar o atraso nem comparar contribuição. Períodos ainda sem posição não geram alerta de atraso ou pedido de corrigir dados ausentes.

O componente expõe `onViewUnits({ kind, keys, status, sortBy })`. As chaves representam todas as unidades do fato, incluindo PA zero e códigos repetidos em cooperativas diferentes. O integrador deve aplicar essas chaves ao contexto atual e invalidar a seleção ao mudar ano, fonte, carteira ou filtros. Usar apenas o filtro genérico de situação não reproduz o mesmo grupo de unidades.

## Estrutura inicial sugerida

Manter a arquitetura existente: contexto e filtros compactos, quatro indicadores, prioridades, tabela de unidades. Evolução, composição da rede, premissas e comparação anual permanecem disponíveis em expansão. Ações de unidade abrem detalhe, nível inferior ou comunicação sem exigir nova seleção manual da hierarquia.

## Validação prevista da PR

- Visão geral → prioridade → unidades exatas → comunicação do mesmo escopo.
- Central → cooperativa → PA → voltar preservando período, carteira e busca.
- Lista filtrada/selecionada → CSV e XLSX → números, identidade e totais conciliados.
- Comunicação → assunto/introdução/ação próprios → Outlook com conteúdo preservado.
- Lista extensa → PNG em partes → todas as unidades, valores e metadados presentes.
- Troca de ano/conta/fonte → seleções e rascunhos incompatíveis invalidados; negativos, zero, ausência e cortes diferentes permanecem distintos.

Testes de domínio dedicados em `tests/management-priorities.test.mjs` verificam alertas proporcionais, sazonalidade mensal, independência de simulação, proximidade, dados problemáticos, comparabilidade, PA zero e listas extensas. A integração de navegador e as capturas são responsabilidade da validação completa da PR.
