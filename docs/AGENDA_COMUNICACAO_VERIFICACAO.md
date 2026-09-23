# Agenda e comunicação — verificação de compatibilidade

Verificação de leitura em **23/09/2026**, projeto Supabase `psgfazlrhuctpfsbluvb`. Foram inspecionados metadados e executados SELECTs com dados sintéticos; nenhuma linha comercial ou pessoal foi lida ou alterada.

## Agenda sem antecedência mínima

O banco e `validateAppointment` já permitem registrar compromissos passados, no instante atual e futuros. Não há regra de antecedência mínima nem comparação do início com `now()`/`current_timestamp`. Não é necessária migração SQL para disponibilizar esse cadastro na agenda consolidada.

Regras temporais observadas em `commercial_entity_appointments`:

```sql
CHECK (isfinite(starts_at) AND isfinite(ends_at)
  AND ends_at > starts_at
  AND ends_at <= starts_at + interval '7 days')
CHECK (extract(year FROM starts_at AT TIME ZONE timezone) = workspace_year)
```

O compromisso precisa começar no ano do cadastro conforme o fuso escolhido. O fim deve ser posterior ao início, com duração máxima de sete dias. Um minuto é aceito; o banco não estabelece duração mínima além de ser positiva. A agenda da ficha também usa apenas o início do ano como limite inferior do campo, sem exigir data futura.

Um SELECT sintético avaliou as mesmas expressões para início imediato, início há 30 dias e início em um minuto, todos com um minuto de duração: **três casos aceitos**. A regressão em `tests/relationship.test.mjs` confere esses cenários nos quatro fusos, além de um compromisso de 2020; datas invertidas e ano incompatível continuam rejeitados.

## Permissões e vínculo

- RLS habilitada; política `own_rows` para `authenticated`, com `(select auth.uid()) = owner_id` em `USING` e `WITH CHECK`.
- Política restritiva `commercial_active_session` exige `commercial_security.session_allowed()` na leitura e escrita.
- `authenticated` tem SELECT/INSERT/UPDATE/DELETE; não há grants de tabela para `anon` ou `PUBLIC`.
- A chave estrangeira vincula `owner_id, workspace_year` ao cadastro anual. O trigger `commercial_entity_relationship_touch` exige que a unidade exista na hierarquia salva e impede trocar sua identidade/proprietário. Seu uso do relógio serve apenas para atualizar `updated_at`.
- A listagem consolidada existente pagina por `id`, filtra proprietário/ano e confere novamente o usuário antes de publicar o resultado. Salvar usa `saveEntityAppointment` com proprietário esperado e os mesmos vínculos.
- Índices existentes: chave primária `id` e `(owner_id, workspace_year, entity_id, starts_at)`. Este escopo não requer índice adicional.

O Security Advisor retornou somente o aviso preexistente `auth_leaked_password_protection`, sem novos avisos de RLS. Autenticação, credenciais e grants não foram alterados.

## Cabeçalho compacto nos rascunhos

O novo campo opcional `header: { centralName, metricLabel }` no dashboard WhatsApp v2 é compatível com o SQL existente. `commercial_whatsapp_dashboard_valid(jsonb)` não restringe chaves adicionais no objeto raiz; `commercial_dashboard_card_metadata_valid(jsonb)` verifica somente os metadados dos cards. Permanecem o limite total de 180.000 bytes e a correspondência de ano, entidade e período da apresentação com o rascunho.

SELECTs sobre modelos sintéticos confirmaram:

| Modelo v2 | Validador do dashboard | Metadados dos cards | Ano/entidade/período |
| --- | --- | --- | --- |
| Legado sem `header` | Aceito | Aceito | Compatível |
| `header` com central e Venda nova | Aceito | Aceito | Compatível |
| `header` com central e Venda nova · Arrecadação | Aceito | Aceito | Compatível |

O banco não valida semanticamente o novo campo. O aplicativo mantém a validação de tipos e tamanhos e a leitura dos rascunhos antigos sem `header`. Não é necessária coluna, migração ou alteração de permissão para essa apresentação.

## Consultas usadas

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.commercial_entity_appointments'::regclass;

select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'commercial_entity_appointments';

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'commercial_entity_appointments'
  and grantee in ('anon', 'authenticated', 'PUBLIC');

select pg_get_triggerdef(oid), pg_get_functiondef(tgfoid)
from pg_trigger
where tgrelid = 'public.commercial_entity_appointments'::regclass
  and not tgisinternal;

select proname, pg_get_functiondef(oid)
from pg_proc
where oid in (
  'public.commercial_whatsapp_dashboard_valid(jsonb)'::regprocedure,
  'public.commercial_dashboard_card_metadata_valid(jsonb)'::regprocedure
);
```

## Documentação atual

[Changelog Supabase](https://supabase.com/changelog.md) e [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) consultados em 23/09. A atualização de 21/09 renomeou Replication para Pipelines sem mudar a API. A retirada de `logs.all` em 23/09 não afeta a agenda, que usa a Data API existente. Nenhuma mudança encontrada exige alterar este contrato.
