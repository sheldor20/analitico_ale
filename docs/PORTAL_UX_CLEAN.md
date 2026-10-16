# Portal — revisão de UX e padronização visual

## Base da análise

Prioridades inferidas dos pedidos no projeto: acompanhar Venda Nova e Arrecadação, consultar resultados por cooperativa/PA, comparar metas e projeções, compartilhar cenários e atualizar produção. Não há telemetria de uso disponível nesta revisão; essa ordem não representa frequência medida.

Problemas encontrados no código: título da página repetido no cabeçalho; descrições genéricas repetidas; todos os filtros abertos antes dos indicadores; comparação completa de períodos aberta em paralelo aos resultados do período; agenda agrupada com administração; estilos globais distribuídos em três arquivos com importação tanto no layout quanto no dashboard.

## Organização implementada

- Acompanhamento: visão geral, cadência dos PAs e plano de ação.
- Relacionamento: agenda e metas atingidas.
- Administração: conferência, importações e cadastro/metas.
- Título único, comunicação e exportação no cabeçalho da página.
- Recorte sempre visível e filtros recolhidos inicialmente, com indicação de filtros ativos e botão para limpar. Os campos preservam valores ao recolher.
- Indicadores e unidades abertos; períodos complementares e critérios de cálculo sob demanda. O atalho existente continua expandindo os períodos.
- Superfícies claras, espaçamento consistente, bordas discretas e controles uniformes. Cores semânticas de atingimento preservadas.
- Um único CSS global: `app/globals.css`, importado pelo layout. CSS Modules permanecem responsáveis por elementos específicos, inclusive exportações; não misturar seus estilos com o portal.

Não há alteração de cálculo, autenticação, persistência, API ou banco. Nenhuma migração SQL é necessária.

## Referências

- Carbon, tabelas: https://v10.carbondesignsystem.com/components/data-table/usage/
- Carbon, divulgação progressiva: https://www.carbondesignsystem.com/building-blocks/core/patterns/disclosures
- Nielsen Norman Group, leitura rápida de dashboards: https://www.nngroup.com/articles/dashboards-preattentive/

Aplicação: priorizar informação acionável, agrupar controles e disponibilizar conteúdo complementar quando solicitado. Manter identidade Sicoob, fonte local e logos oficiais.

## Verificação e limites

Executar `npm test`, `npm run check` e `npm run build`. A validação visual autenticada em produção depende de acesso à sessão. A tentativa de inspeção de componentes isolados com Chromium local não foi concluída: o navegador não estava instalado e o download retornou arquivo inválido. Não considerar a compilação como validação visual completa.
