# Ora 5G — Guia inicial de design para desenvolvimento

## Objetivo
Este material é um **conceito visual demonstrativo** da futura plataforma Ora 5G. Não é um sistema funcional, não está conectado a APIs e os nomes, valores e indicadores exibidos nas telas são **fictícios**. A identidade visual (cores e tipografia 'ora5G') é provisória, aguardando marca/logotipo oficiais.

## Referências
- Vídeo: ora5g_previa_telas.mp4
- Protótipo navegável: prototipo.html (abra no navegador; use botões Anterior/Próxima ou setas do teclado).
- Telas estáticas: tela_01.png até tela_10.png.

## Mapa de telas
1. **Login e acesso** — e-mail, senha, recuperação, permissão por perfil, autenticação forte.
2. **Diretoria** — indicadores agregados da rede e resultados por loja.
3. **Gestor de loja** — caixa, metas, solicitações de desconto, notas fiscais e cancelamentos.
4. **Vendedor mobile** — atalhos de operação e produção individual.
5. **PDV mobile** — carrinho, busca, IMEI, valores e pagamento Pix PicPay/cartão/dinheiro.
6. **Estoque e IMEI** — saldo por loja, serial, reserva, transferências e inventários.
7. **CRM / WhatsApp** — fila compartilhada, origem do lead e sugestões de IA supervisionada.
8. **Ora Connect** — chips, ativações, recargas, vínculo ao vendedor, status da Nogle.
9. **Canais online e campanhas** — Mercado Livre, Shopee, TikTok Shop, e-commerce e Meta Ads.
10. **Financeiro e fiscal** — pagamentos, conciliação, caixa e solicitação/status de notas.

## Design tokens propostos (para validar)
- Background principal: #F5F8FB
- Azul-escuro da navegação: #0E192B
- Texto principal: #122237
- Cor de ação: #0EAE9F
- Destaque cyan: #13D9C7
- Azul informativo: #348BF4
- Bordas: #E4EAF0
- Sucesso: #16AB79
- Aviso: #ED9B37
- Cartões: border-radius 14–15px
- Botões: border-radius 10–12px
- Alvos touch no mobile: pelo menos 44×44 CSS px.
- Tipografia de produção sugerida: Inter, com fallback sans-serif.

## Padrões de interação
- Menu da diretoria: Visão geral, Lojas, PDV e vendas, Estoque/IMEI, CRM e clientes, Ora Connect, Canais online, Financeiro, Fiscal e notas, Configurações.
- Mobile do vendedor: atalhos 'Nova venda', 'Estoque', 'Chips', 'Recarga' e 'Nota fiscal'.
- Confirmar status real de pagamento antes de concluir como quitado.
- Não liberar IMEI vendido duas vezes; manter movimentações auditáveis.
- Solicitação fiscal pelo vendedor e aprovação gerencial **quando a política interna exigir**, sem confundir aprovação interna com autorização fiscal oficial.
- Perfis: diretoria, gestor regional, gerente de loja, vendedor, financeiro, fiscal, atendimento e marketing.
- Acesso mobile-first; o mesmo front-end deve funcionar em desktops e celulares. Não exigir scanner de código de barras.
- Estados obrigatórios em cada tela: carregando, vazio, sem permissão, erro de rede, conflito, sucesso, confirmação e reversão.

## Implementação sugerida para Claude Code e Codex
- Next.js App Router, React, TypeScript, Tailwind CSS e biblioteca de componentes acessível.
- Converter cada tela em componentes reutilizáveis, com design tokens em arquivo único.
- Extrair AppShell, Sidebar, Header, KPI Card, DataTable, Badge, ApprovalQueue, Search, MobileBottomNav, POSCart, PaymentMethodPicker e ConversationView.
- Criar primeiro componentes e mock data tipados; conectar APIs **apenas após** validar contratos e permissões.
- Nunca copiar dados fictícios do protótipo para o banco real.
- Toda ação privilegiada deve ser validada no servidor e auditada.
- Validar UX presencialmente com um vendedor e um gestor da primeira loja piloto.
- Não presumir endpoints de Nogle, PicPay, marketplaces ou Meta Ads: confirmar documentação, escopos e autorização antes de integrar.

## Critérios de aceitação de UI
- Vendedor conclui fluxo principal no celular sem desktop.
- Todas as telas têm hierarquia clara e botões com rótulos compreensíveis.
- Ações críticas exibem estado de carregamento e feedback confiável.
- Layout suporta dispositivos móveis usuais e desktops.
- Navegação por teclado, labels e contrastes acessíveis.
- Toda tela que mostra dinheiro usa valores formatados em BRL.
- Tela de gerente sinaliza aprovação pendente sem bloquear emissão legalmente obrigatória.
