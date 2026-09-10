# Comunicação personalizada da carteira

## Onde acessar

No acompanhamento, escolha os filtros e o nível (Centrais, Cooperativas ou Cadência dos PAs), depois clique em **Gerar e-mail / WhatsApp**. O ícone de envelope de cada linha abre diretamente aquela unidade. Em **Cadastro e metas**, selecione a Central, cooperativa ou PA e use o mesmo botão.

A janela trabalha com **uma unidade por mensagem**. A seleção não mistura carteiras e não herda destinatários de outras unidades. O período e o mês podem ser ajustados na janela, sem modificar a base.

## Conteúdo e responsáveis

Os responsáveis são recuperados pelo usuário conectado, ano e identificador completo da unidade. Selecione quais receberão o e-mail. E-mails adicionais são opcionais; endereços repetidos são removidos. Cada responsável continua com seu limite de 10 endereços; a comunicação admite até 100 destinatários únicos.

Personalize assunto, abertura e assinatura. Para Central e cooperativa, é possível incluir Venda Nova e Arrecadação em seções separadas. PA utiliza somente a fonte de cadência de Venda Nova. O painel contém os indicadores do período, o cenário anual identificado separadamente, a evolução mensal e a próxima ação recomendada. Centrais também mostram o saldo individual das cooperativas, sem compensar a necessidade de uma unidade pela superação de outra.

Valores vêm de `analysisRows`, `aggregate` e `analyze`, sem alterar metas ou realizado. Dados incompletos, cortes divergentes, projeções e a indisponibilidade de realizado diário permanecem explícitos. Abertura e assinatura são aplicadas aos dois canais; os números não são editados livremente para evitar divergências.

## Outlook e painel visual

**Abrir Outlook** gera um link para Microsoft 365 ou Outlook.com, conforme a opção escolhida, com destinatários, assunto e texto preenchidos. Esse link não incorpora o HTML do painel.

Para enviar a versão visual, use **Copiar painel**, abra o Outlook e cole o painel no corpo, substituindo o texto. A cópia formatada depende de permissão de área de transferência e do suporte do navegador. Também estão disponíveis a exportação HTML e **Baixar e-mail (.eml)**, que contém alternativas texto e HTML em UTF-8. A abertura do arquivo como rascunho depende do cliente de e-mail.

Links extensos não cortam a mensagem: a interface avisa quando é necessário copiar o conteúdo completo e colar no aplicativo. Nenhum envio ou entrega é confirmado pelo sistema.

## WhatsApp

Selecione o responsável, confira número e saudação, revise a aba de WhatsApp e clique em **Abrir WhatsApp**. O texto é adaptado ao canal mantendo os mesmos indicadores, observações e ações. Números brasileiros com DDD recebem o prefixo 55; números internacionais podem ser informados com + e código do país. Sem número, o aplicativo permite escolher a conversa. A confirmação de envio permanece no WhatsApp.

## Rascunhos e privacidade

**Salvar rascunho** guarda uma versão privada e imutável dos textos, destinatários e cenário. O histórico se limita ao usuário, ano e unidade. Abrir links não grava status de enviado. A visualização de painel é gerada novamente com escape de HTML; HTML salvo não é injetado como marcação confiável da aplicação.

Migração: `supabase/migrations/20260910134016_portfolio_communication_drafts.sql`, aplicada diretamente no projeto Supabase `psgfazlrhuctpfsbluvb`. O arquivo foi criado pela CLI e alinhado à versão registrada pela aplicação remota. A tabela `commercial_communication_drafts` possui RLS, leitura/inserção/exclusão somente pelo proprietário, sem acesso anônimo e sem UPDATE para o cliente. A consulta de verificação confirmou inserção, leitura, isolamento e exclusão em transação revertida, sem manter dados de teste.

## Validação

A suíte Node cobre escopo, PA 0, períodos, nulos, cortes diferentes, indicadores, destinatários, HTML e cabeçalhos MIME. Os testes PostgreSQL embarcados verificam restrições, isolamento e imutabilidade. O workflow de navegador usa Chromium, dados sintéticos e endpoints Supabase interceptados: não usa contas reais nem envia mensagens. O pipeline original de testes, TypeScript e build foi preservado.
