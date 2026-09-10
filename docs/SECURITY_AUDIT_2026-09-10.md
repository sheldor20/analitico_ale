# Auditoria de segurança — Analítico Comercial

Data: 10/09/2026. Repositório: sheldor20/analitico_ale. PR: #7.

## Conclusão e alcance

Esta PR implementa autenticação obrigatória e endurecimento de acesso, sessão e importação. Não é uma certificação de ausência de vulnerabilidades. Resultados de testes são limitados ao código, cenários e versões executados. Ausência de falhas detectadas não prova ausência de vazamento histórico.

A aplicação foi inspecionada publicamente; o repositório, o esquema, as políticas, as permissões e o resumo administrativo do Supabase foram lidos pela conexão autorizada. Não foram extraídas carteiras comerciais, senhas ou tokens reais. As tentativas de ataque usam dados sintéticos no CI, em loopback. A produção recebe somente uma pequena sequência de requisições HEAD, sem credenciais, sem seguir redirecionamentos e sem ler documentos.

**Estado de entrega:** correções na branch/PR, não implantadas por este relatório. Não houve merge nem aplicação desta migração no banco de produção. O domínio público ainda precisa receber a versão revisada após validação e aprovação.

## Constatações e tratamento

| Constatação | Evidência / risco | Tratamento na PR |
| --- | --- | --- |
| Acesso inicial opcional | `/` respondia 200 sem login; importação e cadastro eram acessíveis no navegador | `/login` dedicado, Proxy default-deny e guarda independente no servidor antes de montar o painel |
| Health público | `/api/health` respondia 200 sem sessão | API exige usuário verificado e aprovação, com 401 genérico para acesso não autenticado |
| Falta de CSP no domínio | HEAD de produção sem Content-Security-Policy | CSP com nonce por requisição, sem scripts inline/eval em produção, restrição de conexão e frame |
| Controle de sessão incompleto | RLS existente separava owner_id, mas não exigia sessão ativa nem aprovação comercial | Política RESTRICTIVE adicional nas cinco tabelas de negócio; conferência de auth.sessions, e-mail confirmado, bloqueio e app_metadata administrativo |
| Persistência do login antigo | Cliente anterior usava armazenamento local e login opcional | Adaptador oficial SSR por cookies; remoção da chave legada, validação antes de exibir dados e limpeza por desmontagem/logout/troca de usuário |
| ZIP declarava seu próprio tamanho | Validação de metadados não bastava para limitar expansão efetiva | Limite de arquivo antes da leitura e descompactação em streaming com contagem real antes do parser XLSX |
| Superfície RPC de trigger | commercial_touch_action tinha execução anônima herdada, embora fosse trigger | Revogação de execução direta; não foi demonstrado vazamento por essa função |
| Senhas comprometidas | Advisor Supabase: auth_leaked_password_protection desativada | Pendência de configuração do serviço; não é ativada por uma PR de frontend |

### Controles já existentes preservados

Todas as tabelas públicas inspecionadas tinham RLS. Importações, ações, bases fixas, responsáveis e rascunhos já tinham regras por proprietário. As relações entre ação/importação e responsável/base fixa já incluíam owner_id, impedindo referências cruzadas. A allowlist administrativa não tinha leitura pública. Não havia buckets de Storage no projeto inspecionado. Esses controles foram preservados, não substituídos por um simples filtro de interface.

A geração de mensagens já escapava HTML e validava destinatários/cabeçalhos; os testes correspondentes continuam na suíte. Isso não autoriza interpretar HTML persistido arbitrário como seguro em futuras telas.

## Matriz de acesso da versão proposta

| Recurso | Sem login | Com sessão válida e aprovação |
| --- | --- | --- |
| `/` e demais páginas de negócio | Redirecionamento para `/login` | Acesso conforme permissões |
| APIs de negócio, `/api/health`, `/api/auth/session` | 401 sem dados comerciais | Acesso conforme usuário |
| Caminhos desconhecidos e extensões `.json`, `.xlsx`, `.png` | Não são exceções de autenticação | Rotas inexistentes continuam inexistentes |
| `/login` | Formulário público, sem dados comerciais | Redireciona ao painel |
| `POST /api/auth/login` | Público por necessidade; origem, tamanho e tentativas verificados | Mesmo controle |
| Logos, fonte, favicon e bundles estáticos explicitamente permitidos | Públicos, necessários ao formulário | Públicos |
| `/robots.txt` | Público com disallow; não constitui segurança | Público |
| Supabase REST | RLS + sessão ativa + aprovação + proprietário | Mesmos controles, sem depender de esconder URL/chave pública |

Não existe relatório comercial colocado em `public/`. Exportações locais criadas após autenticação não se tornam links públicos hospedados pelo sistema. Um arquivo já baixado, copiado ou enviado para Outlook/WhatsApp não pode ser revogado pelo login do sistema; destinatários devem ser conferidos pelo usuário.

## Testes e evidências

Comandos reprodutíveis: `npm ci`, `npm test`, `npm run check`, `npm run build`, `node scripts/audit-source.mjs`, `npm audit --omit=dev --audit-level=moderate`. O workflow de navegador usa somente provedor Auth sintético em 127.0.0.1, nunca credenciais de produção.

Cobertura adicionada: páginas/APIs sem sessão; cookies adulterados; cabeçalhos de falsa identidade e tentativa de bypass; RSC; extensões usadas como exceção; CSRF, origem ausente e X-Forwarded-Host falso; credenciais malformadas e corpo acima do limite; repetição controlada de senhas fictícias; replay após revogação; concorrência local de 60 requisições em lotes de cinco; isolamento entre usuários; tentativa de autoaprovação via user_metadata; sessão inexistente, incompatível ou expirada; e-mail não confirmado; conta anônima/bloqueada; ZIP com tamanho mentiroso, criptografia, caminhos maliciosos e estrutura inconsistente.

O teste de 60 requisições verifica manutenção do bloqueio sob concorrência limitada, não capacidade máxima, resistência a DDoS ou um ensaio de carga de produção. O limiter de login em memória é **suplementar e por processo**, não distribuído; acesso direto ao Supabase Auth requer os controles do provedor.

Evidências iniciais: no run 34490431177, a auditoria de dependências de runtime retornou zero vulnerabilidades conhecidas e o scanner simples de 86 arquivos não encontrou os padrões de segredos verificados. Esses resultados não abrangem todo o histórico Git, todos os tipos de segredo, infraestrutura ou vulnerabilidades ainda desconhecidas. No run 34490431132, os testes PostgreSQL e de ZIP passaram; um teste de leitura do cabeçalho CSP precisou corrigir o tratamento de espaços. O navegador detectou também uma incompatibilidade de origem atrás do Proxy, corrigida sem aceitar cabeçalhos forwarded como autorização. A validação final deve ser conferida nos checks do HEAD da PR, não em um commit anterior.

Snapshot público anterior à implantação: 10/09/2026 14:39:21 UTC. `/` e `/api/health`: 200. `/login`, `/api/auth/session`, `/robots.txt`, `/.env`, `/.git/config`, `/export.xlsx`, `/dashboard` e `/registry`: 404. HSTS e X-Frame-Options: DENY presentes. CSP ausente. Não foi comprovada exposição de arquivos de ambiente pelos caminhos sondados.

## Pendências que não devem ser apresentadas como resolvidas

As ações disponíveis não permitiram administrar configurações de Auth nem obter o projeto/equipe da Vercel. Portanto não foram ativados ou certificados: proteção de senhas comprometidas, CAPTCHA/MFA, bloqueio de cadastro no provedor, limites distribuídos/WAF, proteção de previews e deployments antigos, restrições de rede, retenção/auditoria de logs e restauração de backups. O código bloqueia contas sem aprovação mesmo que alguém consiga criar uma conta diretamente no provedor, mas não elimina abuso do endpoint Auth.

Revisar permissões administrativas, exigir MFA para operadores privilegiados, ativar a verificação de senhas comprometidas quando disponível no plano e proteger TODOS os aliases/previews/deployments antigos. Uma PR não altera retroativamente deployments anteriores. A configuração de hospedagem e a validação pós-deploy são necessárias antes de afirmar que o domínio publicado exige login em todas as rotas de negócio.

## Implantação e operação

1. Revisar os checks do commit final e a migração `supabase/migrations/20260910143358_mandatory_sessions.sql`. Ela foi nomeada pelo Supabase CLI. Não editar migrações antigas nem incluir credenciais em SQL/Git.
2. No projeto correto, confirmar pelo canal administrativo seguro que o operador tem e-mail confirmado e `raw_app_meta_data.commercial_admin=true` ou `commercial_access=true`. O administrador existente inspecionado preenchia a condição. Não aprovar usuários em massa e não usar user_metadata como autorização.
3. Aplicar a migração versionada antes de publicar o aplicativo. A função consultará sessões reais de auth.sessions; as políticas por owner_id permanecem ativas. Sem a RPC instalada, o aplicativo falha fechado e não libera o painel.
4. Publicar a PR aprovada na Vercel com URL e chave **pública** Supabase corretas. Nunca configurar service_role ou sb_secret em NEXT_PUBLIC. A troca de adaptador exige novo login para sessões legadas.
5. Verificar no domínio e em cada alias/deployment permitido: sessão anônima redirecionada, APIs 401, login válido, importação e base fixa, responsáveis e rascunhos, exportação, logout e revogação. Não utilizar força bruta real para essa confirmação.

Revogação: encerrar as sessões pelo canal administrativo e remover ambas as permissões de acesso comercial quando aplicáveis. Um operador com commercial_admin=true continua aprovado mesmo sem commercial_access; remover só uma permissão não revoga a outra. As permissões não concedem leitura cruzada entre proprietários.

Os cookies do adaptador oficial são acessíveis ao JavaScript por necessidade das chamadas Supabase no navegador; não são cookies HttpOnly de uma arquitetura BFF. SameSite, Secure em produção, CSP e ausência de scripts de terceiros reduzem o risco, mas uma futura migração integral para APIs server-side seria necessária para isolar todos os tokens do JavaScript.

Rollback de código deve manter a migração restritiva. Não remover RLS para contornar falha de configuração: confirmar RPC, sessão e aprovação. Uma reversão do app anterior reabriria a interface pública e precisa ser tratada como regressão de segurança.
