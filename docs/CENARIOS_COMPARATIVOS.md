# Cenários, rede e comparativos anuais

## Uso

Na Visão geral, selecione uma cooperativa ou clique em **Ver PAs** na respectiva linha. A lista apresenta todos os PAs vinculados ao cadastro daquele ano, com metas, realizado, atingimento, GAP, projeção, GAP projetado, esforço diário/mensal, corte e situação. A cadência é Venda Nova e permanece independente do consolidado da cooperativa.

**Organizar lista** oferece Maior GAP, Menor atingimento, Maior atingimento, Maior produção e Nome/código. O critério é compartilhado entre períodos e aplicado às tabelas e prioridades. Valores desconhecidos ficam por último; zero e ajustes negativos continuam distintos.

**Resumo da rede filtrada** apresenta cooperativas, PAs, cooperativas/PAs/centrais com meta atingida. Entrega exige realizado conhecido de pelo menos 100% de uma meta positiva e consistente, não apenas projeção. Cadastros sem informações permanecem no denominador e são sinalizados.

## Importar anos anteriores

Em Importar base, escolha **Base e produção de outro ano**. Informe o ano, a planilha de cooperativas e/ou a cadência PA, e confira a data de corte de cada fonte. No histórico, as metas de PA vêm da planilha; não são substituídas automaticamente pela política de 2026. A distribuição mensal explícita tem prioridade; na sua ausência, usa-se a meta mensal da fonte ou o rateio centesimal da anual. Sem metas informadas, o campo permanece desconhecido.

Cada ano é um cadastro independente em `commercial_workspaces`, com chave única por proprietário/ano, validação de documento e revisão otimista. Um upload não cria unidades retroativamente em outros anos. A atualização de produção não sobrescreve metas cadastradas.

**Comparar anos** permite selecionar outro ano salvo. A comparação utiliza exatamente os mesmos meses fechados em ambas as fontes. Um mês parcial não é comparado com um mês histórico completo. As fontes mensais não permitem reconstruir realizado diário histórico. Uma mudança de nome conserva a identidade por códigos; mudança de central/cooperativa é uma identidade hierárquica diferente.

Unidades que aparecem em apenas um cadastro são identificadas como **Somente no cadastro de ANO**, sem presumir abertura, encerramento ou produção zero. A opção **Somente unidades presentes nos dois anos** controla o efeito de mudanças de composição no nível selecionado. A variação percentual só existe com produção anterior positiva. Comparações agregadas por central podem refletir composição diferente de suas cooperativas; analise o nível cooperativa para isolar unidades comuns.

## Comunicação

O modal de e-mail/WhatsApp permite alterar o texto integral de cada canal e/ou usar um modelo com `{{cenario}}`, `{{unidade}}`, `{{ano}}` e `{{periodo}}`. O cenário é recalculado ao trocar a seleção. Edições temporárias são descartadas ao mudar de contexto; modelos habilitados são reaplicados com os novos valores.

A preferência **Usar como padrão para este nível e carteira** só persiste após **Salvar preferência de texto**. Desative e salve para voltar ao automático nas próximas comunicações. Cada usuário possui padrões separados para Central, Cooperativa, PA e carteira (VN, AR ou ambas; PA somente VN). Um padrão sem `{{cenario}}` contém texto estático e exibe aviso: números digitados não se atualizam sozinhos.

As prévias, cópias, links, HTML/EML e rascunhos usam o texto revisado. O PNG do WhatsApp continua com indicadores calculados e a legenda pode ser editada. Nenhum envio é automático.

## Banco e segurança

Migração gerada pelo Supabase CLI, tabela `commercial_message_templates`, RLS e quatro políticas de proprietário. Sem acesso anônimo; limites de tamanho, escopo único, validação PA/VN e gravação com revisão para evitar sobrescrita concorrente. Nenhum dado de negócio existente é alterado pela migração. Sem chaves administrativas no cliente, nenhuma mudança da PR de segurança independente.
