# Verificação da migração de sessões

A migração foi criada pelo Supabase CLI 2.117.0 e aplicada pela conexão Supabase. O nome do arquivo foi alinhado à versão registrada pelo serviço: `20260911010054_portal_mandatory_sessions.sql`. O conteúdo permaneceu idêntico.

Verificação do catálogo após a aplicação: RLS habilitada e política `commercial_active_session` RESTRICTIVE nas seis tabelas comerciais. O papel `anon` não possui SELECT nessas tabelas nem EXECUTE na RPC. `authenticated` possui acesso à RPC; o predicado privado fixa `search_path` vazio.

Uma transação com duas identidades sintéticas, sessões e um cadastro sintético validou oito condições: sessão autorizada A; leitura apenas do cadastro de A; sessão autorizada B; invisibilidade do cadastro para B; bloqueio de metadados editáveis falsificados; ocultação do cadastro da conta sem aprovação; bloqueio da sessão revogada; ocultação do cadastro após revogação. Todos os resultados foram verdadeiros. A transação terminou em ROLLBACK. Nenhuma senha, token ou dado de cliente foi usado nos testes.

Os testes permanentes de banco também cobrem e-mail não confirmado, conta anônima/bloqueada, sessão expirada, sessão de outra conta, escrita indevida e privilégios anônimos. Resultados completos da aplicação e do navegador ficam nas execuções vinculadas à PR #12. A conclusão sobre produção exige verificação HTTP após o merge.

## Regressões da revisão integrada

O denominador do indicador de unidades em rota e as linhas usadas pelo gráfico mensal acompanham a seleção filtrada, assim como os cartões. O teste de navegador verifica uma unidade em rota em uma seleção de uma unidade (1/1 e 100%). A navegação também verifica as seis telas nas larguras de 1440, 390 e 320 pixels.

A importação inicial de realizados foi preservada: `combineImports` mantém `__importActuals` e `__importCutoff` antes da preparação visual; `mergeProduction` usa esse snapshot no cadastro fixo e remove os campos transitórios. `tests/initial-import.test.mjs` verifica o realizado inicial e a preservação de metas nas atualizações posteriores, com data controlada, sem relaxar validações de corte.
