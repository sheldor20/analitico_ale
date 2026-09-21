# Verificação SQL das comunicações

Verificado em **21/09/2026**, no projeto Supabase `psgfazlrhuctpfsbluvb`.
Escopo: comunicação da central com suas cooperativas, apresentações compactas individuais e de PAs, alertas e exportações locais.

**Não é necessária migração para esse escopo.** Foram consultados somente catálogos, definições de funções e advisors. O teste de compatibilidade abaixo usa dados sintéticos; nenhuma linha de cliente, contato ou usuário foi consultada ou alterada.

## Compatibilidade

| Recurso | Estrutura existente | Condição para reutilização |
| --- | --- | --- |
| Dados comerciais e hierarquia | `commercial_workspaces.dataset` | Reutilizar o ano e o proprietário do cadastro carregado. |
| Responsáveis da unidade | `commercial_entity_contacts` | Manter a seleção por proprietário, ano e entidade exata. |
| Leitura e comunicação dos alertas | `commercial_goal_alert_states` | Preservar o estado por proprietário, ano, entidade, mês e carteira. |
| Rascunhos individuais | `commercial_communication_drafts` | Manter `report.version = 1`, `presentation_version = 2` e correspondência de ano, entidade e período. |
| Lista de cooperativas no painel | Blocos `table` do modelo de apresentação v2 | Exatamente 4 colunas, até 12 linhas por bloco; listas maiores devem usar blocos adicionais. |
| Painel compacto | Blocos `cards` do modelo v2 | De 1 a 8 cards por bloco; `support` e `accent` continuam opcionais. |
| Opção de cenário anual | Presença ou ausência dos blocos anuais no snapshot | Não exige coluna nova. Preservar o comportamento padrão dos relatórios existentes. |
| Consolidado de PAs e comunicação consolidada local | HTML, texto e PNG gerados no navegador | Não gravar esses novos relatórios no histórico individual. |

O modelo salvo aceita até 80 blocos e 180.000 bytes no validador SQL. O validador do aplicativo possui também seus próprios limites; a geração deve respeitar ambos.

A constraint `commercial_communication_report_check` exige `report.source = 'cadence'` para `entity_kind = 'pa'` e `report.source = 'base'` para central/cooperativa. Portanto, um consolidado de PAs com origem `cadence` e entidade central/cooperativa **não deve ser passado ao `savePortfolioDraft` individual**. Sua exportação local não exige alteração dessa regra.

Para `showAnnual`, os rascunhos já preservam o resultado nos blocos do painel e nos textos gerados. Não é preciso salvar outra preferência no banco. O SQL também aceita uma propriedade adicional `showAnnual`, mas ela não é necessária nem validada semanticamente pelo banco; qualquer uso deve ser validado no aplicativo.

## Segurança confirmada em produção

As quatro tabelas acima mantêm RLS habilitado e a combinação de:

- Política de propriedade com `(select auth.uid()) = owner_id`.
- Política **RESTRICTIVE** `commercial_active_session`, usando `commercial_security.session_allowed()` tanto em `USING` quanto em `WITH CHECK`.
- Nenhuma permissão de tabela concedida a `anon` ou `PUBLIC`.

`authenticated` possui leitura, inclusão, alteração e exclusão em cadastros, contatos e estados de alertas, sempre sujeito às políticas. Rascunhos permitem apenas leitura, inclusão e exclusão: o conteúdo salvo permanece imutável.

`session_allowed()` confere a sessão vinculada ao usuário, sua validade, e-mail confirmado, ausência de bloqueio e aprovação em metadados administrativos. Não usa metadados editáveis pelo usuário para conceder acesso. A função privilegiada continua no schema `commercial_security`, com `search_path` vazio.

O Security Advisor retornou apenas o aviso preexistente `auth_leaked_password_protection`. Nenhuma configuração de autenticação foi alterada nesta entrega. Referência: [proteção contra senhas comprometidas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Consultas somente de leitura

Os seguintes SELECTs reproduzem a inspeção dos metadados, sem retornar registros comerciais ou pessoais:

```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'commercial_workspaces', 'commercial_entity_contacts',
    'commercial_communication_drafts', 'commercial_goal_alert_states'
  );

select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'commercial_workspaces', 'commercial_entity_contacts',
    'commercial_communication_drafts', 'commercial_goal_alert_states'
  );

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'commercial_workspaces', 'commercial_entity_contacts',
    'commercial_communication_drafts', 'commercial_goal_alert_states'
  )
  and grantee in ('anon', 'authenticated', 'PUBLIC');

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.commercial_communication_drafts'::regclass
  and contype = 'c'
  and (conname ilike '%report%' or conname ilike '%presentation%'
       or conname ilike '%metadata%');

select n.nspname, p.proname, p.prosecdef, p.proconfig,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'public' and p.proname in (
    'commercial_whatsapp_dashboard_valid',
    'commercial_dashboard_card_metadata_valid'
  ))
  or (n.nspname = 'commercial_security' and p.proname = 'session_allowed');
```

Foi executado também um SELECT que chamou os dois validadores imutáveis sobre um modelo sintético v2: três cards, uma tabela com quatro colunas, sem blocos anuais e sem dados de clientes. Resultados:

| Verificação sintética | Resultado |
| --- | --- |
| Três cards e 12 unidades em uma tabela | Aceito |
| `support` textual e `accent` booleano | Aceito |
| 13 linhas em um único bloco de tabela | Rejeitado, conforme limite existente |
| Propriedade adicional `showAnnual: false` | Aceito pelo validador SQL |

Não foram executados DDL, DML, alterações de grants, credenciais ou autenticação.

## Referências consultadas

- [Changelog Supabase](https://supabase.com/changelog): atualização de Health Check Advisors em 18/09; nenhuma alteração necessária aos contratos de dados usados nesta entrega.
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [Segurança da Data API](https://supabase.com/docs/guides/api/securing-your-api).
