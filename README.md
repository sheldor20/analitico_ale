# Analítico Comercial

Aplicação Node.js / Next.js para acompanhar metas, resultados e ações das centrais Sicoob Bahia (`1002`) e Nordeste (`2007`). Preparada para Vercel e Supabase.

## Cadastro fixo anual e atualização da produção

Em **Cadastro e metas**, inclua, edite ou exclua Centrais, Cooperativas e PAs. A hierarquia é validada, inclusive PA 0 e 97. A exclusão informa os cadastros e valores vinculados e pede confirmação dentro do aplicativo. Mudanças recalculam os indicadores de todos os períodos.

- **Base fixa:** em Importações, escolha “Cadastrar base fixa · unidades e metas”. O arquivo cadastra novas unidades e metas sem carregar produção nem substituir metas já cadastradas. Uma base só com meta anual recebe distribuição mensal em centavos, identificada na conferência.
- **Atualização:** escolha “Atualizar produção”. Os valores mensais informados substituem os meses correspondentes, sem somar o mesmo acumulado novamente. Meses vazios, fontes não enviadas, unidades ausentes e metas cadastradas são preservados. Cortes anteriores ao já salvo são rejeitados. Uma correção manual de realizado prevalece em reenvio do mesmo corte; um corte posterior com valor informado atualiza a correção.
- **Metas e realizado manuais:** abra “Metas e realizado” da unidade. Informe a meta anual e distribua nos 12 meses, ou edite os meses individualmente. O realizado aceita ajustes negativos. Campo vazio significa informação ausente. A produção de um mês posterior ao corte exige atualizar a data.
- **Centrais:** a edição de metas/realizado consolidados é rateada entre as cooperativas, proporcionalmente às metas mensais existentes, ou igualmente sem pesos. O formulário informa a regra antes de salvar. Meses não alterados preservam o histórico individual. Uma central sem cooperativa pode receber plano próprio; ao cadastrar sua primeira cooperativa, os valores são transferidos para ela.
- **PAs:** suas metas e realizados consolidam na fonte Cadência PA; permanecem separados da fonte Cooperativas para evitar a soma de dados sobrepostos. Metas personalizadas do PA prevalecem sobre a referência P1–P5.
- **Persistência:** com login, cada alteração aceita e atualização por arquivo é salva automaticamente em `commercial_workspaces`, por usuário/ano. A revisão impede sobrescrita concorrente. **Salvar análise** cria uma versão histórica imutável e guarda o plano de ação; **Retomar cadastro atual** volta à base editável. Sem login, o cadastro permanece apenas na sessão.
- **Análises:** todas as cooperativas/PAs cadastrados aparecem na mesma página, com busca, ordenação, filtro de situação e exportação da seleção. Unidades sem produção aparecem como informação pendente, sem fabricar zero. A comunicação funciona para cooperativas e PAs, distingue cortes e dados incompletos e mostra metas efetivamente utilizadas.

A identidade Sicoob e as diretrizes para futuras melhorias estão em [docs/IDENTIDADE_VISUAL.md](docs/IDENTIDADE_VISUAL.md) e `AGENTS.md`.

## Funcionalidades

- Importação em dois campos XLSX independentes: base de cooperativas/centrais e cadência dos PAs, por cabeçalho, com leitura de todas as abas compatíveis.
- Venda Nova e Arrecadação separadas. Cadência PA usa metas fixas por grupo (P1–P5) e nunca é somada ao consolidado das cooperativas.
- Filtros por central, cooperativa, grupo PA, carteira, período e mês. Agrupamento por central/cooperativa e detalhamento mensal.
- Meta, realizado, atingimento ponderado, projeção sazonal, gap projetado, esforço diário e média mensal equivalente.
- Períodos mensal, trimestral, semestral, anual e acumulado até o mês selecionado. Visão diária com meta estimada e esforço necessário.
- Cenário de aumento de ritmo: altera somente a produção futura projetada, sem modificar metas ou realizados.
- Plano de ação priorizado por gap projetado, com responsável, prazo, situação e observações.
- Conferência por fonte/linha e reconciliação cooperativa × PAs, mantendo diferenças visíveis.
- Comunicação do cenário parcial pronta para revisar, copiar, baixar em texto e abrir no aplicativo de e-mail.
- Exportação CSV da seleção, incluindo grupo e metas fixas dos PAs, com proteção contra interpretação de textos como fórmulas.
- Login Supabase, histórico privado de importações e ações persistidas. Reimportar o mesmo conjunto não duplica resultados.
- Fichas por central, cooperativa e PA, com navegação pela hierarquia, contatos, modalidade de capital do prestamista, tabelas/taxas e observações de arrecadação e venda nova.
- Agenda mensal por unidade para visitas, treinamentos, reuniões e ligações, com horário/fuso, edição, conclusão e cancelamento.
- Alertas de metas mensais atingidas pelo realizado, separados por unidade e carteira, com leitura persistida e mensagem de reconhecimento para o WhatsApp do responsável cadastrado.
- Parciais individuais e listas de cooperativas/PAs com meta, realizado, atingimento e crescimento/GAP; projeção opcional e imagem PNG para WhatsApp, com download quando a cópia estiver bloqueada.

A revisão de hierarquia, textos e navegação está registrada em [Revisão de UX/UI](docs/UX_PORTAL.md). Os indicadores vêm antes dos detalhes opcionais, a barra do cadastro concentra as ações anuais e o plano de ação separa prioridade comercial de andamento da tarefa.

### Fichas, agenda e reconhecimento

Em **Cadastro e metas**, selecione uma central e abra as cooperativas ou PAs pelos vínculos da ficha. As abas **Ficha**, **Contatos**, **Agenda** e **Metas** separam cada tarefa. Informações de taxas são cadastrais: não modificam cálculos de metas ou produção. Para não perder relacionamentos, o sistema impede remover ou trocar o código de unidades com fichas ou compromissos salvos; remova esses vínculos antes de alterar a identidade.

Em **Gestão da base → Agenda**, o calendário mensal reúne compromissos das centrais, cooperativas e PAs do ano selecionado. O dia atual é destacado conforme o calendário de Brasília; **Hoje** volta ao mês atual. Em **Cadastro e metas**, **Agenda das unidades** começa recolhida e carrega o calendário ao abrir. Filtre por central (incluindo suas unidades), tipo de atividade e situação; a visualização inicial mostra os agendados. Selecione um dia ou consulte o mês inteiro. Cada compromisso aparece uma vez na lista, com sua unidade e horário/fuso, e ocupa no calendário os dias do intervalo. **Abrir agenda da unidade** leva à data de início para editar ou concluir; alterações salvas atualizam o consolidado. **Atualizar agenda** busca os dados novamente. A leitura usa paginação interna para incluir todos os compromissos, sem limitar a lista à primeira página do Supabase. Usa a tabela existente `commercial_entity_appointments`, protegida por proprietário, sessão ativa e ano; não requer nova migração SQL.

Em **Metas atingidas**, o mês inicial acompanha a última produção observada na base. O usuário pode consultar outro mês, filtrar o nível da unidade e marcar alertas como lidos. Resultados são recalculados após cada atualização; metas ausentes, metas zero e produção incompleta não geram conquistas. A preparação do WhatsApp abre uma mensagem para revisão. O envio acontece no WhatsApp, e o registro de comunicação é uma confirmação manual do usuário.

Na própria tela **Metas atingidas**, os filtros **Central**, **Cooperativa** e **Tipo de unidade** definem quais cooperativas ou PAs aparecem na lista. As cooperativas disponíveis acompanham a central escolhida; cooperativas de mesmo código em centrais diferentes permanecem separadas. O resumo conta as metas da seleção e a opção **Somente não lidas** reduz a lista. **Limpar filtros** mantém o mês de referência.

Na própria tela **Metas atingidas**, cada cartão oferece **Copiar painel como imagem** e **Preparar Outlook**, sem depender de WhatsApp cadastrado. O botão acima dos resultados copia as unidades do filtro atual. Imagens incluem somente os resultados e a identificação das unidades, sem os contatos ou o status interno de leitura; seleções extensas pedem um filtro menor ou a cópia individual, sem omitir resultados silenciosamente.

Os painéis de comunicação apresentam **Meta, Realizado e Crescimento sobre a meta/GAP** lado a lado quando houver espaço, tanto no e-mail quanto na imagem. Valores financeiros permanecem completos e indivisíveis, incluindo centavos e negativos; a fonte e as colunas se adaptam à largura. O realizado continua em destaque e a projeção permanece opcional, abaixo dos três indicadores principais. Em telas muito estreitas, o e-mail adapta a disposição para preservar a leitura.

Em **Cadência dos PAs → Compartilhar PAs**, prepare uma lista consolidada com **PA, meta, realizado, atingimento e crescimento/GAP**. O período, a central e a cooperativa seguem a seleção da tela. Por padrão, entram todos os PAs dessa hierarquia, inclusive os que têm dados pendentes; escolha a lista filtrada se quiser aplicar também grupo, busca e situação. O mesmo comando está na lista **PAs desta cooperativa**, na Visão geral. A comunicação contém apenas a fonte Cadência PA, sem somar resultados da cooperativa.

Em **Visão geral → Resultado por cooperativa → Compartilhar cooperativas**, prepare a parcial da central com todas as cooperativas selecionadas. O relatório usa **Venda Nova ou Arrecadação**, conforme a carteira e o período da tela, e permite aplicar a busca e a situação da lista. No agrupamento por centrais, o comando de cada central abre suas cooperativas. A fonte é a base de cooperativas; a produção dos PAs não é somada ao resultado.

Os relatórios usam cabeçalho comum para unidade, carteira, período e data. As linhas mostram apenas identificação e resultados, com indicação de dados pendentes. Cooperativas ou centrais distintas formam grupos identificados; datas divergentes continuam explícitas. Assim, central, cooperativa e atualização não se repetem em cada PA. Os painéis individuais também concentram o contexto e removem aberturas e recomendações genéricas repetidas. A opção **Incluir cenário anual** começa marcada e permite encurtar o envio; a projeção permanece desmarcada inicialmente.

O painel completo pode ser copiado para o Outlook ou baixado em `.eml`. Para WhatsApp, copie o texto ou a imagem PNG; listas com mais de 20 unidades geram partes numeradas e compactas, cada uma com o contexto necessário, sem omitir unidades. Se o navegador bloquear a cópia da imagem, use o PNG baixado. Links extensos de WhatsApp exigem colar o texto depois de abrir o aplicativo. Destinatários são informados para cada envio; o sistema prepara o conteúdo e o usuário revisa e envia. A exportação é local, sem novo armazenamento, sem link público dos dados e sem necessidade de migração SQL. A verificação do banco está em [COMMUNICATION_SQL_VERIFICATION.md](docs/COMMUNICATION_SQL_VERIFICATION.md).

**Preparar Outlook** carrega os e-mails da unidade e permite ajustar a lista para aquele envio. Copie o painel formatado, abra o link do Outlook e cole no corpo do e-mail; assunto e destinatários são preenchidos pelo link. Contas Microsoft 365 e Outlook.com são aceitas. Se a cópia for bloqueada, há download da imagem PNG ou do e-mail completo em `.eml`. Copiar, baixar ou abrir o Outlook não registra comunicação como enviada; essa confirmação continua manual. Essa melhoria usa as tabelas existentes de contatos e alertas, sem nova migração SQL.

Novas informações são isoladas por conta, ano e unidade. A agenda não envia convites e não sincroniza calendários externos.

## Executar

Requer Node.js 22 ou superior.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

O login é obrigatório. Sem configuração Supabase válida, o acesso aos dados permanece bloqueado. Nenhum dado comercial de exemplo é embutido no aplicativo.

## Vercel

Conecte o repositório `sheldor20/analitico_ale` ao projeto existente `analitico-ale`. Framework: Next.js. Diretório raiz: repositório. Runtime: Node.js 22 ou 24. A branch de produção é `main`; pull requests geram previews quando a integração está habilitada.

Variáveis de ambiente, em Preview e Production:

```text
NEXT_PUBLIC_SUPABASE_URL=https://psgfazlrhuctpfsbluvb.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<chave publicável do projeto>
```

O alias `NEXT_PUBLIC_SUPABASE_ANON_KEY` também é aceito para projetos legados. Não use `service_role`, senha de banco ou secret key no navegador, no repositório ou em variáveis `NEXT_PUBLIC_*`. Após mudar as variáveis, faça novo deploy.

`/api/health` responde `{"status":"ok","service":"analitico-comercial"}` e não retorna configurações ou dados de usuários.

## Supabase

Aplicar, em ordem, as migrations de `supabase/migrations` no projeto `psgfazlrhuctpfsbluvb`. A primeira cria somente tabelas, políticas, índices e função com prefixo `commercial_`. A segunda versiona o snapshot de duas fontes e a política de metas dos PAs. A migração `20260909123553_fixed_commercial_workspaces.sql` cria a base anual editável com validação, revisão e políticas de acesso; aplicada no projeto em 09/09/2026 e conferida por consulta e advisors de segurança sem alertas.

- `commercial_imports`: snapshots imutáveis com JSON normalizado, ano, origens/linhas, cortes e fingerprint SHA-256. Índice único por usuário/fingerprint evita duplicações.
- `commercial_imports.source_count`, `has_cooperative_base` e `has_pa_cadence`: colunas calculadas pelo banco para conferir quais fontes integram cada snapshot.
- `commercial_actions`: acompanhamento por importação e chave da entidade, incluindo fonte e métrica. A chave estrangeira composta impede vincular ações à análise de outra pessoa.
- `commercial_entity_profiles`: fichas anuais com modalidade de capital, tabelas de taxas com unidade/período/vigência e observações das carteiras.
- `commercial_entity_appointments`: compromissos por unidade, com datas, fuso, tipo e situação.
- `commercial_goal_alert_states`: leitura e confirmação manual de comunicação de cada meta mensal; o resultado é calculado a partir da base atual.
- RLS obrigatória: cada usuário autenticado acessa apenas seus próprios registros. Anônimos não recebem privilégios. Não há chave administrativa no aplicativo.

Disponibilize contas autorizadas pelo painel Authentication do Supabase. O aplicativo usa login com e-mail e senha; não oferece cadastro público. Cada conta possui seu próprio histórico. O compartilhamento entre contas não faz parte desta versão.

As migrações aplicadas constam no histórico do Supabase. Os snapshots originais continuam imutáveis; a base operacional anual é editável e isolada por proprietário.

## Importar as bases

1. No campo **Cooperativas e centrais**, selecione `base atualizada.xlsx`. No campo **Cadência comercial PA**, selecione `CADENCIA COMERCIAL PA.xlsx`. É possível analisar uma única fonte, mas o conjunto completo usa as duas (até 10 MB por arquivo).
2. Informe o ano das metas e a data de corte de cada fonte enviada. As planilhas não contêm uma data comercial inequívoca; por isso nenhum corte é inferido da data do arquivo ou do relógio do servidor.
3. Para mês fechado, informe o último dia do mês. Para parcial, informe a posição efetiva do resultado acumulado no mês. Meses anteriores são tratados como fechados conforme essa confirmação. O corte deve pertencer ao ano informado.
4. Clique em **Analisar planilhas**. Revise **Conferência da base** e depois **Salvar análise** para guardar o conjunto e as ações.

Novas importações atualizam o cadastro anual aberto. Se enviar somente uma fonte, a outra permanece no cadastro. As metas fixas e meses não informados são preservados; versões históricas salvas continuam disponíveis.

### Layout reconhecido

| Fonte        | Identificação                                                   | Metas                               | Realizado                                        |
| ------------ | --------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------ |
| Cooperativas | Nº CENTRAL, Nº COOP, SIGLA COOPERATIVA, META (métrica), G. COOP | META_JAN…META_DEZ, META_ANUAL       | REAL_JAN…REAL_DEZ                                |
| Cadência PA  | Nº CENTRAL, Nº COOP, NOME COOP, Nº PA, NOME DO PA, GRUPO P1–P5  | Meta fixa do grupo; MÊS/ANO são campos opcionais de conferência | REAL JAN…REAL MAR, ABR…DEZ, conforme disponíveis |

Cabeçalhos são normalizados por espaços, pontuação e acentos. Colunas mensais da cadência também aceitam o prefixo `REAL`. PAs 0 e 97 são incluídos. Ajustes negativos são preservados; nomes ausentes recebem identificação pelo código do PA. Células vazias, texto inválido ou fórmulas sem valor calculado não viram zero.

Os totais auxiliares `META_PER`, `REAL_PER`, trimestrais e percentuais prontos não são usados no cálculo. A base fornecida comparava, em suas colunas de período, metas e realizados com meses diferentes. Na cadência, os valores de `MÊS` e `ANO` são preservados para auditoria, mas não substituem a regra fixa do grupo. Valores originais do arquivo continuam intactos.

### Metas fixas da cadência PA

| Grupo | Meta mensal | Meta trimestral | Meta semestral | Meta anual |
| ----- | -----------: | ---------------: | --------------: | ----------: |
| P1    | R$ 450       | R$ 1.350         | R$ 2.700        | R$ 5.400   |
| P2    | R$ 600       | R$ 1.800         | R$ 3.600        | R$ 7.200   |
| P3    | R$ 750       | R$ 2.250         | R$ 4.500        | R$ 9.000   |
| P4    | R$ 850       | R$ 2.550         | R$ 5.100        | R$ 10.200  |
| P5    | R$ 1.000     | R$ 3.000         | R$ 6.000        | R$ 12.000  |

O filtro **Grupo do PA** e os cartões P1–P5 selecionam os grupos. Essa tabela é a referência inicial; metas personalizadas em Cadastro e metas prevalecem em todos os indicadores, projeções, gaps, exportação e comunicação.

## Comunicação do cenário parcial

Nas visões **Cooperativas** ou **Cadência dos PAs**, ajuste Central, Cooperativa, Grupo, Período e Mês. **Gerar e-mail / WhatsApp** prepara o resultado de uma unidade por vez, com projeção opcional. **Compartilhar cooperativas** prepara a parcial da central com suas cooperativas; **Compartilhar PAs** prepara a lista dos PAs. Confira o período, os dados pendentes e os destinatários antes de enviar pelo aplicativo escolhido.

## Critérios dos indicadores

- **Atingimento:** soma do realizado / soma da meta do período. Nunca média simples de percentuais. Meta nula ou zero não gera percentual.
- **Meta do período:** soma das metas mensais correspondentes. No anual, usar `META_ANUAL` ou `ANO` da fonte. Se a meta anual divergir da distribuição mensal, preservar a meta oficial, mostrar alerta e suspender a projeção anual até conferência.
- **Acumulado:** janeiro até o mês selecionado, incluindo a parcial disponível do mês, limitada pelo corte da fonte. A meta integral desse intervalo fica separada da meta proporcional esperada até o corte.
- **Meta esperada até o corte:** meses fechados integrais + meta do mês parcial × dias úteis decorridos / dias úteis do mês.
- **Ritmo relativo:** realizado / meta esperada até o corte.
- **Projeção sazonal:** realizado + meta remanescente × máximo(0, ritmo relativo) × (1 + cenário). O realizado negativo é preservado; apenas a produção futura projetada tem piso zero.
- **Saldo:** máximo(meta − realizado, 0), somente com cobertura conhecida.
- **Esforço diário:** saldo / dias úteis restantes após o corte até o final do período.
- **Média mensal equivalente:** saldo / soma(dias úteis restantes de cada mês / dias úteis totais daquele mês).
- **Calendário:** segunda a sexta-feira; feriados não são descontados. A premissa aparece no painel.
- **Todas as unidades em 100%:** soma dos saldos individuais de cooperativas ou PAs, independentemente do agrupamento visual por central. Excedentes de uma unidade não cobrem o objetivo individual de outra.
- **Faltantes:** suspendem projeções e percentuais que exigem a série completa. Meses após o corte, inclusive zeros de preenchimento, ficam sem realizado disponível.
- **Diário:** os arquivos enviados não contêm transações datadas. O aplicativo apresenta meta diária rateada e esforço necessário, e declara o realizado diário indisponível. Não estima vendas diárias como se fossem observadas.

As projeções representam cenários de ritmo, sem garantia de resultado. Recomendações são ações comerciais orientadas por saldo e desempenho; não inventam quantidade de contatos, ticket médio, conversão ou apólices.

## Privacidade e operação

A leitura XLSX acontece no navegador após o login. O conjunto normalizado é enviado ao Supabase ao concluir uma importação ou salvar uma edição. Os arquivos originais não são publicados, enviados ao GitHub ou embutidos no deploy. O arquivo permanece sob controle do usuário; o snapshot guarda nomes de arquivos, abas e linhas para rastreabilidade.

Não são usados localStorage/IndexedDB para dados comerciais; sem salvar, a análise é perdida ao recarregar/fechar a página. A sessão de autenticação é gerenciada pelo cliente oficial Supabase. Ao sair, dados e ações abertos são removidos da interface.

Limites de leitura: 2 arquivos, 10 MB por arquivo, 64 MB declarados descompactados, 2.000 entradas ZIP, 50.000 linhas e 300 colunas por aba. A versão foi dimensionada e reconciliada com as duas fontes fornecidas; volumes muito maiores exigem processamento em worker/background.

## Validação

```bash
npm test
npm run check
npm run build
```

O CI executa testes de cálculos e importação, além da migração em PostgreSQL embarcado (PGlite) para verificar sintaxe, RLS entre usuários, deduplicação, imutabilidade dos snapshots e propriedade das ações. Os fixtures são sintéticos; as bases comerciais reais ficam fora do repositório.

Documentação técnica: [Next.js](https://nextjs.org/docs), [ExcelJS](https://github.com/exceljs/exceljs), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
