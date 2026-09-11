# Login, indicadores e comunicação — ajustes solicitados

## Interface

- O login deixa de herdar padding/max-width de `main` do portal. Layout centralizado, marca oficial local, controles de 50 px. Sem rolagem desnecessária nas resoluções comuns; quando teclado/zoom/redução extrema de altura exigem, o documento pode rolar para não cortar o acesso.
- Resultado por cooperativa/PA cresce com a lista inteira, sem altura máxima nem rolagem vertical interna. Rolagem horizontal de tabelas largas é preservada no celular; nenhuma unidade é paginada ou descartada.
- Ordem dos cartões: meta, realizado destacado, GAP/crescimento sobre a meta, projeção. Percentuais e textos secundários de 15 px no portal, 16 px no HTML e 26 px na imagem de 1080 px.
- Crescimento é a superação da meta, não comparação com outro ano: `(realizado - meta) / meta`. Com meta zero, o valor absoluto é mostrado sem percentual. No empate, GAP zero/meta atingida. Dados ausentes continuam sem avaliação conclusiva.
- Cartões de e-mail/WhatsApp seguem a mesma hierarquia, com suporte e destaque opcionais nos snapshots. Modelos antigos continuam legíveis.

## Comunicação em três etapas

1. Destinatários: unidade, período, canal e responsáveis. Abertura/assinatura e edição avançada recolhidas.
2. Revisão: painel visual, texto ou imagem WhatsApp. A altura da prévia HTML acompanha o conteúdo; o dialog é o único contêiner vertical de rolagem.
3. Preparar envio: apenas ações do canal escolhido. Opções alternativas e rascunhos sob demanda. Nada é enviado automaticamente.

Campos permanecem ao trocar etapa; mudança de unidade limpa contatos e reinicia o processo. O fechamento devolve o foco ao botão de origem. Login obrigatório, separação por usuário e sessão ativa permanecem inalterados.

## Outlook: painel visual, sem falsa promessa de inserção por URL

O fluxo principal é **Copiar painel → Abrir Outlook e colar painel**. A cópia contém os formatos `text/html` e `text/plain`. O link é liberado apenas depois do sucesso da cópia e leva destinatários/assunto, com corpo vazio para não misturar texto com um segundo painel. A pessoa cola com Ctrl+V/⌘V no editor. Troca de cenário ou destinatários exige nova cópia.

Bloqueio da área de transferência mostra erro e não abre a janela. A alternativa `.eml` mantém HTML, texto, destinatários e assunto completos em MIME multipart/alternative. A versão do Outlook determina se abre como rascunho ou mensagem a encaminhar; revisar destinatários antes de enviar. O link antigo de texto permanece somente em Outras opções, rotulado **Abrir Outlook somente texto**.

Modelos personalizados sem `{{cenario}}` exibem aviso: não contêm painel. O usuário pode restaurar o painel automático sem reescrever outros campos ou preferências gravadas. Não há alteração silenciosa de modelos privados.

Referências técnicas consultadas em 10/09/2026:
- MDN Clipboard.write: https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write
- Microsoft Graph: criar rascunho HTML exige integração OAuth/permissões, não simples deep link: https://learn.microsoft.com/en-us/graph/api/user-post-messages

## Banco e validação

Nova restrição valida apenas metadados opcionais `support` (texto de até 400 caracteres) e `accent` (booleano). Snapshots sem esses campos e rascunhos legados sem painel permanecem válidos. Nenhuma meta, produção, contato ou credencial é alterada; não há relaxamento de RLS ou sessão.

Testes adicionados: ordem/GAP/crescimento/meta zero, metadados antigos e inválidos, login responsivo, lista completa sem scroll interno, wizard e prévia sem scroll interno, cópia HTML real, falha da área de transferência, invalidar cópia anterior, exportação MIME e restauração de painel. Os testes de fluxo existentes foram adaptados às etapas sem remover verificações de isolamento, períodos, exportação, rascunhos ou logout.

Resultados e versão da migração aplicada serão registrados na PR ao concluir as verificações. Testes de navegador usam dados sintéticos e não autenticam em caixas de Outlook nem enviam mensagens reais.


## Conclusão da revisão antes do merge

- Prévia HTML protege a medição quando o iframe ainda não tem raiz ou já foi desmontado. A altura final continua ajustada ao conteúdo, sem barra vertical interna.
- O modal captura o botão de origem antes de mover o foco para a primeira etapa; fechar restaura esse foco.
- Seleção vazia mostra travessão no cartão de GAP, como nos demais cartões. Divergência entre meta anual e distribuição mensal impede alegações de crescimento/atingimento.
- Outras cópias do aplicativo invalidam o estado de painel copiado, antes e depois da operação assíncrona. Cópia/recorte nativos ou saída da janela também invalidam a indicação, sem ler a área de transferência.
- O arquivo da migração foi alinhado ao registro já aplicado no Supabase: `20260911020542_portfolio_card_support.sql`. Apenas renomeado; nenhum SQL reaplicado. Verificação remota confirmou restrição validada, compatibilidade antiga/nova, rejeição de destaque inválido, seis políticas de sessão preservadas e nenhuma leitura anônima de rascunhos.
- Testes anteriores preservados, com regressões adicionais de metas divergentes e sobrescrita da área de transferência.
