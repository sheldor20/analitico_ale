# Identidade visual — Gestão Comercial Sicoob

Preferência permanente solicitada por Kim em 09/09/2026: aplicar a identidade visual do Sicoob em toda a aplicação e preservá-la nas próximas melhorias.

## Fonte de referência

- [Página oficial da marca Sicoob](https://www.sicoob.com.br/marca/), consultada em 09/09/2026.
- O arquivo `Apresentacao_Institucional_Layout 2026_COM IMAGENS (1) - Copia 5(1).pptx` não estava disponível nesta sessão e não foi utilizado como referência.

## Elementos oficiais preservados

| Elemento | Aplicação |
| --- | --- |
| Turquesa `#00AE9D` | Ações principais, seleção, produção e destaques |
| Verde escuro `#003641` | Navegação, títulos, texto sobre turquesa e indicadores de destaque |
| Branco `#FFFFFF` | Superfícies e espaço de leitura |
| Verde médio `#7DB61C` | Apoio em indicadores positivos |
| Verde claro `#C9D200` | Apoio em destaques de atenção |
| Roxo `#49479D` | Apoio em mensagens e estados secundários |

Os tons de apoio da interface (bordas, textos secundários, fundos e barras de meta) são adaptações para leitura de dados, definidos nos tokens de `app/globals.css`. Não aplicar turquesa com texto branco pequeno: as ações principais usam texto verde escuro para manter contraste.

Os logos em `public/brand/sicoob-logo.svg` e `public/brand/sicoob-logo-light.svg` são cópias dos arquivos oficiais, sem redesenho, alteração de cor, distorção ou efeitos. Seus valores de cor internos devem permanecer iguais ao original. Usar a versão escura sobre superfícies claras e a versão clara sobre a navegação verde escuro. Manter o conjunto completo e espaço ao redor. Não substituir a marca por texto digitado ou por ícones genéricos.

Origens dos arquivos:

- `https://www.sicoob.com.br/marca/images/logo-horizontal/logo-h-cor-dark.svg`
- `https://www.sicoob.com.br/marca/images/logo-horizontal/logo-h-cor-light.svg`
- `https://www.sicoob.com.br/documents/20128/190187180/SicoobSansVariable.woff2`

A fonte Sicoob Sans foi obtida do arquivo público utilizado pela página oficial da marca e está em `public/brand/sicoob-sans.woff2`. A página oficial informa que Sicoob Sans substituiu Asap gradualmente em 2024. A fonte é servida localmente, com Arial/Tahoma como alternativas de sistema. Não adicionar dependências de fontes externas no carregamento ou build.

## Comportamento visual

- Priorizar filtros legíveis, números com alinhamento consistente, ações claras e informação em português do Brasil.
- Exibir todas as unidades filtradas na mesma tabela. Expandir a tabela na página, sem rolagem vertical interna; manter rolagem horizontal somente quando necessária e contador; não cortar a lista por paginação no acompanhamento de cooperativas/PAs.
- Preservar o gráfico mensal com SVG diretamente filho de `.monthly-chart`. Seu seletor de dimensionamento é `.monthly-chart > svg`; ícones de expansão têm 16 × 16 px e regras próprias. Nunca aplicar `width: 100%` ou altura mínima a todos os SVGs descendentes.
- Evitar textos claros sobre branco; usar `--ink` e `--muted`. Cor complementa o rótulo de situação, sem ser o único sinal.
- No celular, manter os campos com texto de 16 px, navegação inferior com rolagem horizontal, margem segura e marca completa no cabeçalho.
- Exportações e novos módulos devem reutilizar os mesmos tokens, nomes, logo e padrão de leitura.
