# Visão geral e comunicação — compatibilidade SQL

Verificado em **08/10/2026**, projeto Supabase `psgfazlrhuctpfsbluvb`.

**Nenhuma migração é necessária** para a projeção opcional, as cores de atingimento e os períodos mensal/trimestral/semestral/anual por central, cooperativa ou PA. A apresentação individual reutiliza o dashboard v2; os consolidados permanecem exportações locais. Foram consultados somente catálogos, definições e advisors, além de SELECTs com modelos sintéticos. Nenhum registro pessoal ou comercial foi lido ou alterado.

## Contrato existente confirmado

| Recurso | Evidência |
| --- | --- |
| Projeção opcional | O quarto card já cabe no limite de 1 a 8 cards por bloco. Desativar a projeção apenas retira sua apresentação. |
| Cores de atingimento | O campo opcional `attainment: number \| null` é aceito nos cards. Os limites `<70%`, `70% a <100%` e `>=100%` pertencem ao aplicativo, não ao banco. |
| Períodos e hierarquia | Constraints permitem `month`, `quarter`, `semester`, `annual` e entidades `central`, `cooperative`, `pa`. Ano, entidade e período do dashboard devem corresponder ao rascunho. |
| Origem | Rascunhos individuais de PA exigem `source='cadence'`; central/cooperativa exigem `source='base'`. |
| Compatibilidade | Modelos antigos sem `attainment` continuam aceitos. Não é preciso regravar o histórico. |
| Limites mantidos | Até 80 blocos e 180.000 bytes; tabelas persistidas com exatamente 4 colunas e até 12 linhas por bloco. A projeção dos consolidados locais não altera esse contrato. |

O SQL não valida semanticamente a nova propriedade `attainment`; o aplicativo deve rejeitar tipos inválidos e números não finitos e manter `null` como ausência de avaliação. Essa informação de apresentação não participa da autorização nem altera metas ou produção.

## Evidência sintética executada

A consulta reproduzível está em [overview_communication_read_only.sql](../supabase/verification/overview_communication_read_only.sql). Combina 3 níveis × 4 períodos × projeção ligada/desligada × 8 variantes: negativo, 69,99%, 70%, 99,99%, 100%, 150%, desconhecido e legado sem metadado.

| Verificação | Resultado live |
| --- | --- |
| Modelos compatíveis | 192 de 192 |
| Legados sem `attainment` | 24 aceitos |
| Projeção desligada / ligada | 96 / 96 aceitos |
| Nove cards no bloco | Rejeitado |
| `accent` com tipo diferente de booleano | Rejeitado |
| Tabela persistida com cinco colunas | Rejeitada |

Os SELECTs exercitam `commercial_whatsapp_dashboard_valid`, `commercial_dashboard_card_metadata_valid` e as correspondências de identidade observadas nas constraints; não simulam uma inclusão autenticada nem substituem os testes de filtros e cálculo do aplicativo.

## Isolamento preservado

`commercial_workspaces`, `commercial_communication_drafts`, `commercial_entity_contacts` e `commercial_goal_alert_states` mantêm RLS e políticas de propriedade com `auth.uid() = owner_id`, combinadas à política restritiva de sessão ativa em leitura/escrita. A função de sessão permanece no esquema privado `commercial_security`, com `search_path` vazio, e confere sessão vinculada, expiração, e-mail confirmado, bloqueios e permissão administrativa em `raw_app_meta_data`.

Não há grants de tabela para `anon` ou `PUBLIC` nesses objetos. Rascunhos permitem SELECT/INSERT/DELETE a `authenticated`, sem UPDATE; os outros três objetos permitem CRUD sujeito às políticas. Nenhum grant, credencial ou configuração de autenticação foi alterado.

O Security Advisor apontou somente o aviso preexistente [proteção contra senhas comprometidas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), sem novos avisos de RLS.

## Referências atuais

- [Changelog](https://supabase.com/changelog.md), consultado em 08/10; entradas recentes incluem tokens pessoais com escopo e mudanças em adaptadores que não são usados por esta apresentação.
- [PostgreSQL 15.19 / 17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes): revisado quanto a extensões/operadores; o contrato desta entrega usa validação JSONB e não introduz esses recursos. Isto não constitui auditoria geral de atualização do banco.
- [JSON e dados não estruturados](https://supabase.com/docs/guides/database/json).
- [Segurança da Data API](https://supabase.com/docs/guides/api/securing-your-api).
