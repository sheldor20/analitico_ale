# Revisão de UX/UI do portal — setembro de 2026

## Direção de design

O portal usa a identidade Sicoob e seus tokens locais de cor, tipografia, espaçamento, bordas e controles. A anatomia das páginas segue a ordem contexto → filtros → resultado → detalhe opcional. O número financeiro completo, o período e a posição da base têm prioridade sobre instruções repetidas.

As referências de organização são o [padrão de tabelas do Carbon Design System](https://carbondesignsystem.com/components/data-table/usage/) — título direto, filtros próximos aos dados e detalhes sob demanda — e o [padrão de notificações](https://carbondesignsystem.com/components/notification/usage/) para diferenciar confirmação rotineira de erro acionável. Os componentes existentes foram refatorados sem adicionar um framework visual ou substituir a marca.

## Diagnóstico e alterações

| Área | Problema observado | Alteração |
| --- | --- | --- |
| Visão geral e cadência | Aviso de carregamento, barra anual e reconhecimento empurravam os indicadores para baixo | Estado de cadastro discreto, ano em linha compacta, ações anuais recolhidas e reconhecimento após o resultado |
| Filtros e períodos | Textos repetidos e opção de acumulado extensa | Rótulo curto para acumulado, abrangência preservada e controle de expansão com contexto da seleção |
| Indicadores | Valores extensos podiam fragmentar os centavos | Valores completos em uma linha, fonte proporcional e organização responsiva |
| Plano de ação | Prioridade comercial e andamento da tarefa ocupavam o mesmo indicador | Prioridade e situação da tarefa separadas; todas as unidades filtradas acessíveis na página |
| Conferência | Contagem não acompanhava o tipo; controles sem efeito aparente | Contador da lista visível, dados/importação como início, filtros de central/cooperativa sobre toda a base |
| Importações | Título e regras de preservação repetidos | Instruções mais curtas; mantidos os avisos sobre substituição mensal, ano e datas de corte |
| Cadastro e metas | Calendário expandido afastava as fichas e metas | Calendário recolhido com carregamento ao abrir; navegação protege formulários ainda não salvos |
| Agenda | Programação restrita à área de cadastro | Acesso próprio em Gestão da base, mês aberto, dia atual em destaque e botão Hoje |
| Reconhecimento | Explicação repetida em título, resumo e exportação | Contadores e ações mantidos; instruções redundantes removidas |
| Rede e comparação anual | Explicações e rolagens internas prejudicavam a consulta | Resumos compactos, critérios recolhidos e tabelas com rolagem natural da página |
| Comunicação | Valores anuais quebravam no meio dos centavos | HTML com números indivisíveis e tamanho calculado; PNG desenha o valor inteiro; colunas adaptam-se à largura |

## Critérios preservados

- Valores exatos, centavos, negativos e dados ausentes continuam distintos.
- Metas, produção, cálculos, períodos, projeção opcional e escopo da seleção não mudam.
- PAs permanecem identificados como Venda Nova e não são somados novamente às cooperativas.
- Calendário usa a data atual de Brasília; horários dos compromissos respeitam o fuso cadastrado. Consultar outro mês não força retorno ao atual.
- Agenda e fichas continuam isoladas por conta e ano. Versões históricas não alteram a agenda atual.
- Exportações antigas continuam compatíveis com o modelo de apresentação v2.

## Verificação

Executar a suíte de domínio, TypeScript, build e cenários de navegador. A revisão visual cobre computador e celulares de 390 e 320 px, valores financeiros longos, dia atual, navegação agenda → unidade, calendário recolhido e contexto dos filtros. O Supabase foi conferido diretamente: as estruturas e políticas existentes atendem às alterações, sem migração adicional.
