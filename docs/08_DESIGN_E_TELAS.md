# 08 — Referência de front-end, experiência e telas

## Materiais já produzidos (todos no pacote)
- `referencias_visuais/prototipo.html` — protótipo HTML navegável por telas (conceito, não produto funcional).
- `referencias_visuais/tela_01.png` até `tela_10.png` — dez telas ilustrativas.
- `referencias_visuais/ora5g_visao_geral_telas.png` — mosaico.
- `referencias_visuais/ora5g_previa_telas.mp4` — vídeo animado curto de apresentação.
- `referencias_visuais/guia_design.md` — estilos e UX originais gerados.

**Atenção:** conteúdo mock e indicadores exibidos nas imagens são fictícios; a marca, cores e nomenclatura final exigem aprovação do proprietário. O vídeo é montagem de slides, não demonstração do sistema rodando. Runway não habilitou vídeo no plano gratuito na ocasião; a prévia foi gerada por outro método.

## Mapa das 10 telas/protótipos
| Nº | Tela | Componentes e ações sugeridas |
|---|---|---|
| 01 | **Login e acesso** | Logo Ora 5G, email/login, senha, recuperar senha, MFA/perfil/loja após login. |
| 02 | **Diretoria / rede** | KPIs de vendas, caixa, lojas, categorias, vendedores, estoque crítico; filtro loja/período. |
| 03 | **Gestor de loja** | Metas/vendedores, caixa, aprovações de desconto, solicitações fiscais, cancelamentos, alertas. |
| 04 | **Vendedor mobile** | Iniciar venda, estoque, chips, ativação, recarga, nota, metas pessoais, caixa, próximos clientes. |
| 05 | **PDV mobile** | Busca nome/SKU/IMEI, carrinho, botões grandes, pagamento misto, dinheiro/Pix/PicPay/cartão, status. |
| 06 | **Estoque/IMEI** | Busca produto e serial, saldo por loja, reservas, entradas, transferências, inventário. |
| 07 | **CRM / WhatsApp** | Inbox, contato 360, funil, etiqueta, loja/atendente, IA sugere/resposta humana. |
| 08 | **Ora Connect** | Chip/ICCID, ativação, recarga, linha, status Nogle e histórico. |
| 09 | **Canais online / Marketing** | Mercado Livre, Shopee, TikTok Shop, e-commerce e Meta Ads/atribuição. |
| 10 | **Financeiro / Fiscal** | Caixa, meios de pagamento, conciliação, nota fiscal, fila de aprovação e status. |

## Navegação proposta por perfil
**Diretoria:** Visão da Rede | Lojas | Vendas/PDV | Estoque | Clientes/CRM | Ora Connect | Canais Online | Marketing | Atendimento | Financeiro | Fiscal | Configurações.

**Gestor:** Painel da Loja | Equipe/Metas | Aprovações | Vendas | Caixa | Estoque | Clientes | Fiscal | Relatórios.

**Vendedor (barra inferior mobile):** Início | Nova venda | Estoque | Chips/Recargas | Clientes / Mais. Atalhos persistentes: *Solicitar nota*, *Minhas metas*, *Pendências*.

**Financeiro/Fiscal:** interfaces reduzidas a suas funções; sem necessidade de acesso integral ao CRM de outras lojas.

## Design system proposto (aguarda aprovação da marca)
| Token | Cor/valor provisório |
|---|---|
| Background | `#F5F8FB` |
| Navegação escura | `#0E192B` |
| Texto principal | `#122237` |
| Ação primária | `#0EAE9F` |
| Destaque | `#13D9C7` |
| Informação | `#348BF4` |
| Borda | `#E4EAF0` |
| Sucesso | `#16AB79` |
| Aviso | `#ED9B37` |
| Botões | raio ~10–12 px; área tocável >=44×44 CSS px |
| Cards | raio ~14–15 px |
| Fonte | Inter (sugestão) com sans-serif fallback |

## Componentes sugeridos
`AppShell`, `Sidebar`, `Topbar`, `StoreSwitcher`, `MobileBottomNav`, `AuthForm`, `RoleGuard` (apenas UX, não substitui servidor), `KpiCard`, `SalesBreakdown`, `ProductSearch`, `SerialPicker`, `Cart`, `POSPaymentSelector`, `CashSessionPanel`, `ApprovalQueue`, `InvoiceRequestButton`, `Customer360`, `ConversationInbox`, `LeadKanban`, `TelecomActionStatus`, `InventoryTable`, `ChannelOrderTable`, `ReconciliationTable`, `AuditTimeline`, `RetryNotice`, `LoadingState`, `EmptyState`, `NoPermissionState`, `ErrorNotice`, `ConfirmationDialog`.

## Requisitos de interação
- **Mobile-first com adaptação desktop**: vendedor deve vender e solicitar nota usando celular; sem scanner/barcode no MVP.
- Entrada por teclado/toque/nome/SKU/IMEI; scanner/câmera apenas extensão futura.
- Performance percebida rápida: pesquisa, carrinho, escolha de pagamento, aprovação no telefone do gerente. **Metas de latência devem ser definidas e medidas no piloto**, não inventadas.
- Estados explícitos: carregando, vazio, sem autorização, erro de rede, conflito de estoque, pagamento pendente, sucesso real, estorno e reversão.
- Botões críticos têm confirmação e retorno confiável; não mostrar 'sucesso' baseado apenas no clique.
- Acessibilidade: labels, teclado, contraste, foco visível, leitores de tela, valores BRL e formatação brasileira de data/número.
- Não copiar literalmente interfaces, logos ou recursos protegidos de Condor, Shopify, Linx etc. Referências são funcionais e ergonômicas.

## Wireframes rápidos (sem detalhar componentes visuais finais)

### Login
```text
┌────────────────────────────────────┐
│             ORA 5G                 │
│       Gestão comercial integrada   │
│                                    │
│  E-mail / Usuário [____________]   │
│  Senha           [____________] 👁 │
│           [ ENTRAR NA PLATAFORMA ] │
│  Esqueci minha senha               │
└────────────────────────────────────┘
```

### Vendedor mobile
```text
┌────────────────────────────────────┐
│ ORA 5G    Minha loja    Perfil      │
│ Olá, vendedor                       │
│ Meta de hoje: ███░░  (por categoria)│
│ [ + NOVA VENDA                 ]   │
│ [ Chips ] [ Ativações ] [ Recargas ]│
│ [ Estoque ] [ Clientes ] [ Nota ]   │
│ Meus resultados: aparelho/acessório │
│ + chips + ativações + recargas      │
│ Pendências: pagamento, fiscal       │
│ ⌂ Início   🛒 Vender   📦 Estoque   │
└────────────────────────────────────┘
```

### PDV mobile
```text
┌────────────────────────────────────┐
│ ← NOVA VENDA      Loja A   Caixa 01 │
│ Cliente  [Buscar CPF/telefone]      │
│ Produto  [Nome / SKU / IMEI ...]    │
│ [+ Aparelho] [+ Chip] [+ Recarga]   │
│------------------------------------│
│ Celular IMEI ****1234       R$ ... │
│ Acessório x1                 R$ ... │
│ Ativação (pendente)          R$ ... │
│------------------------------------│
│ Desconto   [Solicitar aprovação]    │
│ Total                         R$ ...│
│ [ DINHEIRO ] [ PIX / PICPAY ]       │
│ [ CARTÃO ]   [ FINANCIAMENTO ]      │
│ [ + ADICIONAR OUTRO PAGAMENTO ]     │
│ [ CONFERIR E CONCLUIR ]            │
│ [ SOLICITAR NOTA ]                  │
└────────────────────────────────────┘
```

### Gerente
```text
┌────────────────────────────────────┐
│ Painel loja • Hoje                  │
│ Vendas │ Caixa │ Ativações │ Metas  │
│ [ Aprovações pendentes (N) ]        │
│  - Desconto  (Aprovar / Negar)      │
│  - Revisão de nota (conforme regra) │
│ Vendedores / produção por categoria │
│ Pendências: fiscal | POS | Estoque  │
└────────────────────────────────────┘
```

## Ordem recomendada de UI
1. Definir design tokens/componentes e auth/loja/perfil.
2. Implementar UI com **mocks tipados explicitamente identificados**, testando estados e acessibilidade.
3. Conectar somente contratos reais do backend aprovados; impedir mocks em produção.
4. Fazer teste prático em celulares das lojas e sessão com vendedor/gerente.
5. Atualizar protótipos por revisão e registrar divergências UX antes de ampliar módulos.
