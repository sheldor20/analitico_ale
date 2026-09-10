# Períodos de acompanhamento

O filtro de análise e o filtro de comunicação compartilham o mesmo seletor:

| Período | Abrangência |
| --- | --- |
| Mensal | Um dos 12 meses do ano selecionado |
| 1º trimestre | Janeiro a março |
| 2º trimestre | Abril a junho |
| 3º trimestre | Julho a setembro |
| 4º trimestre | Outubro a dezembro |
| 1º semestre | Janeiro a junho |
| 2º semestre | Julho a dezembro |
| Anual | Janeiro a dezembro |
| Acumulado | Janeiro ao mês atual, pelo calendário de America/Sao_Paulo |

A opção diária não é mais oferecida no seletor. O esforço necessário por dia útil continua disponível como indicador. Rascunhos antigos de esforço diário permanecem legíveis; nenhuma informação histórica é excluída.

## Seleção e consistência

Mensal mostra o campo Mês de referência. Trimestral mostra quatro trimestres com seus intervalos. Semestral mostra os dois semestres com seus intervalos. Anual e Acumulado não exigem seleção de mês. Cada intervalo utiliza o ano do cadastro aberto.

No Acumulado, trocar previamente o mês mensal, importar uma base com corte antigo ou abrir outro ano não muda o mês final: sempre se usa o mês atual de Brasília, dentro do ano selecionado. Assim, em setembro, um cadastro de 2025 usa janeiro a setembro de 2025; para janeiro a dezembro, escolha Anual. O mês atual é reavaliado a cada minuto e ao retornar para a janela/aba.

A data de corte continua sendo a posição real da fonte. O filtro não inventa realizado para meses sem informação, não muda datas de importação e não transforma um período parcial em fechado. Comparativos continuam limitados aos mesmos meses fechados nos dois anos, explicitamente identificados no dashboard.

Trimestres e semestres são convertidos para o mês final correspondente apenas como referência técnica do motor existente. Metas manuais, metas históricas, distribuição mensal e isolamento entre cadência PA e consolidado da cooperativa não mudam.

O nome explícito do período aparece nos indicadores, no detalhe da unidade, no comparativo, nos textos e painéis de e-mail/WhatsApp, na variável {{periodo}} dos modelos e na exportação CSV. A comunicação recebe a seleção da tela, mas permite alterá-la localmente sem modificar o filtro original. Rascunhos salvos permanecem congelados no cenário em que foram gravados.

## Supabase

Esta entrega não exige DDL nem migração: o banco já armazena os 12 meses, o ano e os identificadores de período compatíveis. `supabase/verification/periods_read_only.sql` verifica a integridade anual, períodos dos rascunhos e proteções de acesso em transação somente leitura. Não altera metas, produção, unidades, contatos, modelos ou rascunhos existentes.

## Validação

Testes de todas as fronteiras trimestrais/semestrais, 12 meses, fevereiro bissexto, troca de mês/ano no fuso de Brasília, acumulado independente do mês anterior, compatibilidade com rascunhos diários antigos, consistência de metas e períodos entre Central/Cooperativa/PA e comunicações. Testes Chromium cobrem seletores, CSV, mensagens, rascunhos, navegação e tela móvel, usando somente dados sintéticos e sem envio externo.
