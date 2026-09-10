# Navegação e comparativo visual

## Ordem das informações

Visão geral e Cadência dos PAs: filtros → posição da fonte → indicadores do período → resumo da rede → lista de unidades. PAs da cooperativa e comparativos ficam abaixo da lista. Evolução/simulação e insights são expansíveis. As tabelas mantêm todas as unidades da seleção; nenhum valor foi removido da base ou das exportações.

A tabela principal destaca meta, realizado, atingimento, GAP e situação. **Mais indicadores** revela projeção e esforço diário. O clique na unidade abre o detalhamento existente, inclusive histórico mensal. O título de cada tela coincide com o nome da navegação.

Plano de ação: indicadores → lista de prioridades com responsável, prazo, GAP e esforço. Busca, situação e ordenação são acessíveis na própria lista; alterar situação/ordenação retorna à primeira página. A recomendação completa fica no detalhe da ação. Não exibe comparativos ou resumo de rede não relacionados à tarefa.

Conferência: as pendências aparecem antes de **Fontes e regras de cálculo**. Importações e Cadastro e metas preservam seus fluxos. **Gerenciar anos** reúne abertura/criação de ano sem retirar o recarregamento da base salva.

## Painéis expansíveis

**PAs desta cooperativa** começa recolhido ao selecionar uma cooperativa no filtro. **Abrir PAs / Fechar PAs** controla a relação completa. O atalho **Ver PAs** na linha da cooperativa abre a seção correspondente. Botões usam `aria-expanded`, `aria-controls` e teclado. O recolhimento não altera metas, produção ou filtros.

Uma simulação ativa é identificada fora do painel recolhido, com botão **Limpar simulação**, para que projeções simuladas nunca sejam confundidas com o cenário original.

## Dashboard comparativo

**Comparar anos** carrega o outro ano somente quando aberto. A apresentação inclui produção e meta por ano, GAP, variação em reais/percentual, atingimento ponderado e evolução mensal. As linhas mensais têm estilos diferentes e tabela acessível com os valores exatos. Os gráficos compartilham a mesma escala entre anos e representam ajustes negativos; dados ausentes geram lacunas, não zero.

**Detalhar por unidade** preserva a tabela completa. Os mesmos meses fechados e filtros do motor `compareYears` alimentam os cartões, os gráficos e a tabela. **Somente unidades presentes nos dois anos** recalcula o conjunto inteiro. A composição da rede é informada; uma ausência no cadastro não prova abertura/fechamento de uma unidade. No nível central, a composição das cooperativas pode mudar mesmo quando a central é a mesma.

Percentual de evolução requer produção anterior positiva. Atingimento é a soma do realizado dividida pela soma das metas, não uma média dos percentuais. Totais incompletos não são apresentados como completos. Na comparação anual, divergência entre meta oficial e distribuição mensal suprime o percentual do dashboard e mostra aviso, preservando os valores oficiais.

## Banco e privacidade

Esta entrega é de apresentação e não precisa de nova tabela, função, migração ou ajuste de dados. O SQL `supabase/verification/scenario_ux_read_only.sql` foi executado diretamente no Supabase em 10/09/2026 e confirmou zero bases anuais inválidas, zero duplicidades por proprietário/ano, RLS ativo e ausência de permissão anônima de leitura nas quatro tabelas verificadas. Nenhum dado de carteira ou contato é publicado na documentação.

## Verificação

Os 148 testes Node da integração cobrem cálculos existentes, importação, cadastros, isolamento PostgreSQL e os agregados visuais. TypeScript e build são obrigatórios. Os 14 testes Chromium cobrem regressões de comunicação, desktop/celular, posição dos blocos, PAs por teclado, simulação, busca/ordenação das ações, comparação, filtros e carregamento sob demanda. Usam dados sintéticos e interceptação da API: não fazem envio real nem alteram produção.

Execução integrada aprovada: https://github.com/sheldor20/analitico_ale/actions/runs/34524898207 . O workflow temporário de integração foi removido; a CI permanente da PR revalida o commit final antes do merge.
