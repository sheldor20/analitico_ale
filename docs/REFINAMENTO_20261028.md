# Refinamento da Gestão Comercial — 28/10/2026

Implementação decorrente do diagnóstico completo do sistema. Mantém a identidade Sicoob, fontes e logotipos locais, cadastros anuais, metas oficiais e registros históricos.

## Correspondência com o diagnóstico

| Item | Entrega e comportamento |
| --- | --- |
| F01 — Precisão monetária | Cálculos e exportação compartilham arredondamento decimal simétrico e soma em centavos, com limite explícito de precisão. Percentuais usam a razão entre os valores monetários. |
| F02 — Cortes diferentes | Resumos e exportações usam a mesma regra de comparabilidade. Cortes parciais diferentes suspendem atingimento, GAP e projeção consolidados; valores conhecidos continuam disponíveis. |
| F03 — Filtros ocultos | Trocas entre Central, Cooperativas e PAs removem filtros incompatíveis. Central → Cooperativa → PA permanece a hierarquia dos controles. |
| F04 — Listagem de PAs | O menu Cadência abre a mesma análise de PAs, com até 50 registros por página e rolagem natural. |
| F05 — Plano operacional | Ações atuais são persistidas por conta, ano e unidade, independentemente de salvar uma análise histórica. Conflitos entre sessões impedem sobrescritas. Campos ficam bloqueados durante carga ou falha de leitura, com opção de tentar novamente. Ações históricas existentes permanecem disponíveis. |
| F06 — Regressão e CI | Cenários de navegador atualizados para a navegação vigente e ampliados com persistência, conflito, restauração, calendário e URL. A suíte é dividida em três grupos no GitHub Actions. Exigir os resultados antes de publicar ainda depende das configurações administrativas do repositório/hospedagem. |
| F07 — Importação e recuperação | Colagem apresenta cada alteração efetiva, valor anterior, novo valor e diferença; permite baixar CSV completo. Atualizações bem-sucedidas arquivam a versão anterior. Restaurar produção cria nova revisão, preserva metas e unidades atuais. O histórico automático começa nesta versão; não reconstrói versões que nunca foram armazenadas. |
| F08 — Conferência | Avisos informativos de origem ficam agrupados e separados das pendências e da metodologia. Detalhes originais são mantidos; o contador do menu considera pendências acionáveis. |
| F09 — Prioridade de ação | Ordenação específica começa por dados sem avaliação, compromissos vencidos e maior GAP. |
| F10 — Legibilidade | Textos auxiliares e rótulos reforçados, mantendo a fonte Sicoob Sans. Valores extensos e negativos permanecem completos nos painéis para celular e nas imagens. |
| F11 — Conta ativa | Identificação por e-mail no menu, no cabeçalho e no contexto de importação, junto ao ano de destino. |
| F12 — Níveis da análise | A aba Central abre centrais; Cooperativas abre cooperativas. O fluxo de PAs foi unificado sem somar populações sobrepostas. |
| F13 — Navegação | Área, período, ano e hierarquia podem ser recuperados por URL, recarga e voltar/avançar. Apenas parâmetros permitidos são serializados; contatos, mensagens e observações ficam fora da URL. A hierarquia é validada contra o cadastro da conta. |
| F14 — Diálogos | Ciclo comum de foco, Escape e bloqueio de rolagem aplicado aos diálogos de análise, comunicação e compartilhamento de cenários. Os módulos CNV e importação de contatos mantêm seus ciclos próprios e continuam cobertos pela regressão. |
| F15 — Sem avaliação | Resumos distinguem zero conhecido de ausência de avaliação, incluindo conflitos e dados incompletos. |
| F16 — Manutenção | Regras extraídas para módulos de dinheiro, navegação, calendário, prioridade, apresentação de avisos, diferenças de produção, ações e versões. A decomposição adicional do controlador principal permanece um trabalho gradual; esta entrega não reescreve o sistema inteiro. |
| F17 — Anos futuros | Novos anos não recebem automaticamente as metas por grupo de 2026. Metas de origem/manual são preservadas. CNV aceita ano de 2020 a 2100 e permite consultar ações por ano. |
| F18 — Senhas comprometidas | Permanece pendência administrativa do Supabase Auth: a conexão disponível não oferece alteração dessa configuração. Nenhuma regra de autenticação foi enfraquecida. |
| F19 — Calendário e acumulado | Cadastro explícito de datas sem expediente por ano, com validação no cliente e banco. Sem datas cadastradas, a base é segunda a sexta sem descontar feriados. O acumulado mantém a opção automática de mês atual e permite fixar um mês limite. |

## Banco e preservação

A migração `20261028192351_operational_actions_and_workspace_versions.sql` cria as tabelas de ações operacionais e versões, ambas com RLS por proprietário e exigência de sessão aprovada. Ações exigem unidade presente no cadastro anual. O histórico aceita leitura pelo proprietário; inclusão e alteração direta pelo cliente não são permitidas.

As atualizações de cadastro continuam sujeitas à revisão esperada. O arquivamento ocorre na mesma transação e não registra uma atualização rejeitada por conflito. A migração não atualiza datasets, metas, produção, contatos nem revisões atuais. Quando existirem ações antigas vinculadas a unidades ainda cadastradas, elas são copiadas para o acompanhamento atual, sem remover os originais.

O calendário é opcional. Ao mudar dias úteis, alteram-se ritmo, esforço e projeções; as metas e a produção realizada permanecem iguais. Restaurar produção mantém o cadastro atual e recupera os valores da revisão escolhida; unidades cadastradas depois daquela revisão ficam sem produção informada, sem serem excluídas.

## Validação

- `npm test`: regras de negócio, cálculos, importação, exportação e contratos do banco em PostgreSQL embarcado.
- `npm run check`: verificação TypeScript.
- `npm run build`: compilação de produção.
- Playwright: fluxos de computador e celular com dados sintéticos, incluindo canais de comunicação e limites de conta/ano/unidade.
- `node scripts/audit-source.mjs`: verificação de arquivos públicos e padrões de credenciais no código versionado.
- Banco real: comparação de integridade dos datasets antes/depois da migração e revisão dos consultores de segurança/performance.

As alterações administrativas pendentes são habilitar proteção contra senhas comprometidas no Supabase Auth e tornar a validação obrigatória para publicação. A conexão GitHub instalada não dispõe de administração da proteção de branches.
