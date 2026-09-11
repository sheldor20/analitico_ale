# Portal comercial — UX/UI v2 e acesso obrigatório

## Objetivo e escopo
Revisão das telas Visão geral, Cadência dos PAs, Plano de ação, Conferência da base, Importações e Cadastro e metas, além da entrada, saída e recuperação de sessão. A implementação parte das PRs funcionais já publicadas e integra a proteção anteriormente proposta na PR #7. Mantém a marca Sicoob, os cálculos comerciais, os cadastros anuais, os comparativos, a comunicação e os períodos existentes.

Esta é uma avaliação técnica e heurística acompanhada de testes funcionais e visuais. Não substitui pesquisa observacional com usuários nem uma certificação integral de acessibilidade ou segurança.

## Diagnóstico e decisões

| Prioridade | Problema observado | Tratamento |
| --- | --- | --- |
| Crítica | O portal publicado ainda permitia abrir a estrutura sem login. A proteção estava em uma branch não publicada. | Proxy com negação por padrão, segunda guarda no servidor e autorização de sessão ativa no banco. Página de login própria, sem cadastro público. |
| Alta | Busca/situação mudavam a tabela, mas os cartões somavam unidades fora dela. | Uma seleção compartilhada passa a alimentar cartões, lista, esforço, insights e comunicação parcial. Os totais não somam centrais e suas cooperativas. |
| Alta | A projeção tinha maior destaque visual que o realizado. | Realizado primeiro, seguido de meta, GAP e projeção identificada como estimativa. Simulação continua com aviso explícito. |
| Alta | Saída/retorno por outras abas ou pelo histórico do navegador podiam deixar conteúdo na interface. | Limpeza imediata da tela, encerramento da sessão no servidor, remoção dos cookies locais mesmo em falha de rede, aviso entre abas e revalidação no retorno. |
| Média | Controles de período/ano, explicações e indicadores competiam pelo espaço. | Barra anual compacta, filtros recolhíveis que preservam valores e gerenciamento de anos sob demanda. |
| Média | Menus misturavam a rotina de acompanhamento com manutenção da base. | Navegação agrupada em Acompanhamento e Gestão da base; localização atual explícita e foco no título após navegar. |
| Média | Comandos principais perdiam o texto no celular. | Rótulos de ações preservados, áreas de toque consistentes e navegação inferior com rolagem. |
| Média | Ausência de resultados/estimativa podia parecer resultado zero ou cobrança diária válida. | Travessão sem inventar resultados, estado vazio explícito e esforço indisponível identificado. |
| Média | Avisos de conferência apareciam sem distinção. | Filtro entre dados/importação e critérios de cálculo; regras completas continuam acessíveis sob demanda. |
| Média | Contatos aumentavam a extensão do editor de unidade. | Responsáveis e contatos em seção recolhível dentro da unidade, mantendo edição, múltiplos e-mails e comunicação. |
| Média | Texto de cadastro fixo dizia que só recebia metas, contrariando o fluxo existente. | Texto alinhado ao comportamento: inclui realizados disponíveis; atualizações posteriores preservam as metas cadastradas. |

## Sistema visual implementado

Referência de marca: `docs/IDENTIDADE_VISUAL.md`, logos oficiais e Sicoob Sans local, sem novos serviços de fonte.

Padrões utilizados: tabelas orientadas à tarefa, controles junto à listagem, divulgação progressiva e hierarquia de dados do Carbon Design System; navegação por teclado e foco perceptível das recomendações WCAG. São referências de desenho, não importação da biblioteca Carbon nem alegação de certificação WCAG.

- Tokens centrais em `app/design-system.css`: escala de espaçamento 4/8/12/16/20/24/32, raios, altura dos controles, cores semânticas e anel de foco.
- Componentes reutilizáveis em `components/ui/`: `MetricCard`, `FilterPanel` e `PortalNavigation`.
- Números tabulares, tipografia responsiva, valores monetários em reais, estados com texto além da cor.
- CSS do workspace isolado de exportações/preview das mensagens. Login usa os mesmos tokens.
- Listas de cooperativas e PAs preservam todas as unidades filtradas, com rolagem e cabeçalho fixo. Sem paginação nova.
- Respeito a movimento reduzido e cores forçadas. Link de pular navegação disponível ao teclado.

## Fluxos preservados e simplificados

**Acompanhamento:** escolher período/carteira/unidade → ler resultado da seleção → buscar/filtrar/ordenar unidades → detalhar PA, definir ação ou comunicar. Os campos de período continuam explícitos: mês, trimestre, semestre, ano ou acumulado. Comparativos só usam meses fechados comuns; ausência não vira zero.

**Plano de ação:** responsáveis, prazos, situação da tarefa e ações existentes mantidos. Prioridades não são confundidas com projeções. Busca e situação refletem os indicadores.

**Importação:** objetivo do envio → arquivos → ano e cortes → confirmação. Mantém metas, produção, atualização anual e validações existentes. Nenhuma alteração nos dados é feita por fechar/reabrir filtros.

**Cadastro:** unidade → metas/produção → responsáveis e contatos sob demanda. Salvar continua recalculando consolidados por meio do mecanismo existente. Nenhuma exclusão ou redistribuição automática nova foi introduzida.

**Login/logout:** credenciais de conta autorizada → verificação no servidor → carteira. Ao sair, a tela privada é retirada e o navegador retorna ao login. Em indisponibilidade do provedor, o acesso local é removido; revogação remota não pode ser garantida sem comunicação com o serviço.

## Banco e autenticação

A migração de sessões exige simultaneamente proprietário correto (políticas existentes), sessão ativa e pertencente à conta, e-mail confirmado, conta não anônima/não bloqueada e permissão comercial em `app_metadata`. `user_metadata` editável pelo usuário não autoriza acesso.

Proteção restritiva aplicada às seis tabelas comerciais: imports, actions, workspaces, entity_contacts, communication_drafts e message_templates. O cadastro administrativo privado permanece sem acesso pelo cliente. Não há mudança de metas, produção, destinatários ou aprovação em massa de usuários.

As respostas privadas não são armazenadas em cache. Apenas arquivos públicos expressamente permitidos ficam cacheáveis; extensões como `.xlsx` ou `.png` não concedem acesso. O logout é POST e valida origem. A imagem de WhatsApp continua local, sem upload público.

## Verificação

As suítes cobrem cálculos, filtros, PA zero, isolamento por usuário, sessão revogada, metadados falsificados, SQL, corpo/origem de login, cookies falsos, rotas anônimas, arquivos XLSX malformados, regressões de períodos, comunicação, desktop e celular. Novos casos cobrem cartões versus seleção, estado vazio, filtros recolhidos, logout, falha do provedor e retorno ao portal.

Dados de navegador são sintéticos; testes não enviam e-mail ou WhatsApp real. Capturas e resultados ficam como artefatos das execuções GitHub Actions vinculadas à PR. A confirmação de publicação deve ser feita no domínio de produção após o merge, não inferida do preview.

## Limites operacionais

Não existe garantia de risco zero. Limitação de tentativas em memória não substitui WAF/distribuição, MFA ou proteção de senhas comprometidas. Deployments antigos e aliases devem ter proteção própria no provedor; mudar a branch de produção não corrige automaticamente builds anteriores. Consultar também `docs/SECURITY_AUDIT_2026-09-10.md`, cujo relato histórico descreve a auditoria da PR #7 antes desta integração.

## Referências

- https://carbondesignsystem.com/components/data-table/usage/
- https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
- https://supabase.com/docs/guides/auth/server-side/nextjs
- https://supabase.com/docs/guides/database/postgres/row-level-security
