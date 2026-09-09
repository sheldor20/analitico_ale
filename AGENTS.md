# Instruções do projeto

- Preserve a identidade visual Sicoob solicitada por Kim em 09/09/2026. Consulte `docs/IDENTIDADE_VISUAL.md` antes de alterar a interface ou criar módulos/exportações.
- Reutilize os tokens de `app/globals.css`, a fonte local Sicoob Sans e os logos oficiais em `public/brand/`; não redesenhe o logotipo nem adicione dependências externas de fonte.
- Interface em português do Brasil, valores em reais e rótulos claros. Contraste e legibilidade têm prioridade em tabelas, filtros e botões.
- O acompanhamento de cooperativas e PAs deve mostrar todas as unidades filtradas na mesma tela, com rolagem e cabeçalhos fixos.
- O dimensionamento do gráfico mensal deve atingir apenas `.monthly-chart > svg`. Ícones de expansão têm dimensões próprias; mantenha a correção que impede setas gigantes.
- Cadastros e metas anuais são persistentes. Atualizações de produção devem preservar metas, unidades e períodos existentes; recalcular consolidados a partir dos dados atuais, sem dupla contagem.
- Valide mudanças com `npm test`, `npm run check` e `npm run build` antes da entrega. Migrações do Supabase devem manter isolamento por usuário e compatibilidade com dados existentes.
