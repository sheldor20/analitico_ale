# Verificação das melhorias de cenários — 10/09/2026

## Banco aplicado

Migração `20260910185201_scenario_message_defaults.sql` aplicada no Supabase com sucesso. O arquivo foi inicialmente gerado pelo Supabase CLI; o número da versão foi alinhado à execução remota.

A nova tabela guarda somente preferências privadas de texto. Históricos continuam em `commercial_workspaces`, com unicidade por proprietário/ano e revisão otimista. Não houve alteração de metas, produção, cadastros, contatos ou rascunhos existentes pela migração.

Verificação real em transação com rollback: proprietário consegue inserir, ler e desativar seu padrão; outro usuário não consegue ler, inserir em nome alheio, atualizar ou excluir o padrão; leitura anônima é negada. RLS habilitado, quatro políticas e zero registros temporários persistidos após o teste.

A revisão dos advisors não apontou problemas na nova tabela. Avisos preexistentes de configuração de autenticação e de índices sem uso não foram alterados por esta PR funcional. Esta entrega não substitui a revisão de segurança independente.

## Cobertura de regressão

- Ordenação crescente/decrescente, dados desconhecidos, zero, ajustes negativos, desempate estável e preservação da entrada.
- Contagem de cooperativas/PAs por ano, central, cooperativa, grupo e situação; PA 0 e 97; meta atingida distinta de projeção.
- Comparação de períodos idênticos e fechados, ano bissexto, ausência de unidades, alterações de nome/hierarquia, ausência de realizado e produção anterior zero.
- Importação de XLSX histórico real gerado com ExcelJS: metas explícitas, mensais sazonais, meta anual rateada em centavos, metas ausentes e proteção após alteração do grupo de PA.
- PostgreSQL isolado: RLS, escopo de padrão, limites, duplicidade, revisão concorrente, desativação e isolamento dos cadastros anuais.
- Chromium: filtros e ordenação, relação de PAs, resumo responsivo, comparativo entre anos salvos, atualização da lista de anos, edição de ambos os canais, reabertura/desativação de padrão e rascunho com texto revisado.
- Regressões existentes de contato, destinatários, Outlook, e-mail/EML, dashboard e PNG do WhatsApp.

Comandos de validação: `npm test`, `npm run check`, `npm run build` e `npx playwright test --config tests/browser/playwright.config.mjs`. Os workflows permanentes de CI e navegador registram a validação do commit final da PR. O workflow temporário utilizado na montagem foi removido, sem conceder novas permissões de escrita à CI permanente.

## Limites explícitos

A comparação não fabrica produção diária a partir de totais mensais. Meses parciais ficam fora de ambos os anos comparados. Uma unidade ausente de um cadastro não é presumida como encerrada ou com produção zero. PAs e cooperativas são fontes separadas e nunca são somados. Texto padrão sem `{{cenario}}` permanece estático e possui aviso na interface. Nenhuma mensagem é enviada automaticamente.
