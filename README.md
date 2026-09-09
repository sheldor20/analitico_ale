# Analítico Comercial

Aplicação Node.js / Next.js para acompanhar metas, resultados e ações das centrais Sicoob Bahia (`1002`) e Nordeste (`2007`). Preparada para Vercel e Supabase.

## Funcionalidades

- Importação XLSX da base de cooperativas e da cadência dos PAs, por cabeçalho, com leitura de todas as abas compatíveis.
- Venda Nova e Arrecadação separadas. Cadência PA usa metas próprias e nunca é somada ao consolidado das cooperativas.
- Filtros por central, cooperativa, grupo PA, carteira, período e mês. Agrupamento por central/cooperativa e detalhamento mensal.
- Meta, realizado, atingimento ponderado, projeção sazonal, gap projetado, esforço diário e média mensal equivalente.
- Períodos mensal, trimestral, semestral, anual e acumulado até o mês selecionado. Visão diária com meta estimada e esforço necessário.
- Cenário de aumento de ritmo: altera somente a produção futura projetada, sem modificar metas ou realizados.
- Plano de ação priorizado por gap projetado, com responsável, prazo, situação e observações.
- Conferência por fonte/linha e reconciliação cooperativa × PAs, mantendo diferenças visíveis.
- Exportação CSV da seleção, com proteção contra interpretação de textos como fórmulas.
- Login Supabase, histórico privado de importações e ações persistidas. Reimportar o mesmo conjunto não duplica resultados.

## Executar

Requer Node.js 22 ou superior.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Sem configuração Supabase, o usuário pode importar e analisar dados na memória da sessão. A interface informa que salvar e autenticar ainda não estão configurados. Nenhum dado comercial de exemplo é embutido no aplicativo.

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

Aplicar `supabase/migrations/202609090001_commercial_analytics.sql` no projeto `psgfazlrhuctpfsbluvb`. A migração é aditiva: cria somente as tabelas, políticas, índices e função com prefixo `commercial_`; não altera tabelas de outros fluxos.

- `commercial_imports`: snapshots imutáveis com JSON normalizado, ano, origens/linhas, cortes e fingerprint SHA-256. Índice único por usuário/fingerprint evita duplicações.
- `commercial_actions`: acompanhamento por importação e chave da entidade, incluindo fonte e métrica. A chave estrangeira composta impede vincular ações à análise de outra pessoa.
- RLS obrigatória: cada usuário autenticado acessa apenas seus próprios registros. Anônimos não recebem privilégios. Não há chave administrativa no aplicativo.

Disponibilize contas autorizadas pelo painel Authentication do Supabase. O aplicativo usa login com e-mail e senha; não oferece cadastro público. Cada conta possui seu próprio histórico. O compartilhamento entre contas não faz parte desta versão.

**A migração versionada e validada localmente não equivale à aplicação no projeto remoto.** A aplicação remota exige a conexão autorizada com o projeto. Verifique a conclusão no histórico de migrations antes de usar a persistência em produção.

## Importar as bases

1. Selecione `base atualizada.xlsx`, `CADENCIA COMERCIAL PA.xlsx` ou ambos (até 10 MB por arquivo).
2. Informe o ano das metas e a data de corte de cada fonte enviada. As planilhas não contêm uma data comercial inequívoca; por isso nenhum corte é inferido da data do arquivo ou do relógio do servidor.
3. Para mês fechado, informe o último dia do mês. Para parcial, informe a posição efetiva do resultado acumulado no mês. Meses anteriores são tratados como fechados conforme essa confirmação. O corte deve pertencer ao ano informado.
4. Clique em **Analisar planilhas**. Revise **Conferência da base** e depois **Salvar análise** para guardar o conjunto e as ações.

Uma nova importação abre um novo conjunto de fontes. Caso envie apenas um dos arquivos, somente essa fonte integrará a nova análise. Para comparar cooperativas e PAs, importe os dois juntos. Versões já salvas continuam no histórico.

### Layout reconhecido

| Fonte        | Identificação                                                   | Metas                               | Realizado                                        |
| ------------ | --------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------ |
| Cooperativas | Nº CENTRAL, Nº COOP, SIGLA COOPERATIVA, META (métrica), G. COOP | META_JAN…META_DEZ, META_ANUAL       | REAL_JAN…REAL_DEZ                                |
| Cadência PA  | Nº CENTRAL, Nº COOP, NOME COOP, Nº PA, NOME DO PA, GRUPO        | MÊS = meta mensal; ANO = meta anual | REAL JAN…REAL MAR, ABR…DEZ, conforme disponíveis |

Cabeçalhos são normalizados por espaços, pontuação e acentos. Colunas mensais da cadência também aceitam o prefixo `REAL`. PAs 0 e 97 são incluídos. Ajustes negativos são preservados; nomes ausentes recebem identificação pelo código do PA. Células vazias, texto inválido ou fórmulas sem valor calculado não viram zero.

Os totais auxiliares `META_PER`, `REAL_PER`, trimestrais e percentuais prontos não são usados no cálculo. A base fornecida comparava, em suas colunas de período, metas e realizados com meses diferentes. Valores originais do arquivo continuam intactos.

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

A leitura XLSX acontece no navegador. Apenas o conjunto normalizado é enviado ao Supabase quando o usuário solicita salvar. Os arquivos originais não são publicados, enviados ao GitHub ou embutidos no deploy. O arquivo permanece sob controle do usuário; o snapshot guarda nomes de arquivos, abas e linhas para rastreabilidade.

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
