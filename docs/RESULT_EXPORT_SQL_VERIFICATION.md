# Exportações de resultados — verificação do Supabase

Verificação somente de leitura em 21/09/2026 no projeto `psgfazlrhuctpfsbluvb`.

CSV e Excel são gerados no navegador a partir das análises já carregadas e do recorte visível. A seleção usa a chave composta da análise e somente pode incluir unidades presentes nesse recorte. Não há persistência de arquivos, novos campos, chamadas de escrita, grants ou migração SQL necessários para esta mudança.

## Evidências verificadas

| Objeto | Situação ao consultar o projeto |
| --- | --- |
| `commercial_workspaces` | Colunas existentes `owner_id uuid`, `year integer`, `dataset jsonb`; RLS habilitada |
| `commercial_imports` | Mesmo vínculo de usuário/ano e `dataset jsonb`; RLS habilitada |
| Leitura das duas tabelas | Política para `authenticated`, com `(select auth.uid()) = owner_id` |
| Sessão ativa | Política `commercial_active_session`, `RESTRICTIVE`, `ALL`, com `commercial_security.session_allowed()` tanto em `USING` quanto em `WITH CHECK` |
| Permissões | `authenticated`: SELECT/INSERT em imports; SELECT/INSERT/UPDATE/DELETE em workspaces. Nenhum grant de tabela para `anon` ou `PUBLIC` nesses objetos |
| Atualização do workspace | `USING` e `WITH CHECK` exigem o mesmo proprietário |
| Função de sessão | Esquema privado, `SECURITY DEFINER`, `search_path` vazio; exige usuário e sessão compatíveis, prazo da sessão, e-mail confirmado, ausência de bloqueio e autorização em `raw_app_meta_data`; rejeita anônimos |
| Security Advisor | Somente o aviso já existente `auth_leaked_password_protection`; nenhum novo aviso de RLS |

Não foram consultados registros de clientes, contatos, dados financeiros ou informações pessoais. A verificação da função leu somente sua definição, sem executar consultas de registros de usuários.

## Consultas de metadados reproduzíveis

```sql
select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('commercial_workspaces', 'commercial_imports');

select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('commercial_workspaces', 'commercial_imports')
  and column_name in ('owner_id', 'year', 'dataset');

select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('commercial_workspaces', 'commercial_imports');

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('commercial_workspaces', 'commercial_imports')
  and grantee in ('anon', 'authenticated', 'PUBLIC');

select p.prosecdef, p.proconfig, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'commercial_security' and p.proname = 'session_allowed';
```

## Referências consultadas

- [Changelog do Supabase](https://supabase.com/changelog.md): índice atual, incluindo Health Check Advisors de 18/09/2026. As mudanças de Management API de logs, extensões e instalações próprias não alteram esta exportação local. A aplicação usa Node 22 conforme a exigência atual do cliente.
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): isolamento por proprietário, roles e políticas restritivas.

Os testes da exportação verificam CSV escapado, ausência de fórmulas introduzidas por nomes, números reais no XLSX, preservação de zeros/negativos/ausências, seleção por chave composta e totais por soma/razão. Os controles assíncronos descartam downloads preparados para outro usuário, ano ou recorte.
