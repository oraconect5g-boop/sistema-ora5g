# 02 — Arquitetura e contratos internos

## Escolha-base proposta (ADR pendente)
**Monólito modular** com web responsiva/PWA em **Next.js + React + TypeScript + Tailwind**, serviços transacionais server-side e banco **PostgreSQL/Supabase**. Repositório privado único, testes automatizados e pipelines de promoção entre ambientes. Evitar microsserviços prematuros, mas impor limites de contexto.

```text
Vendedor mobile/PWA ─┐
Gerente/diretoria ────┼──> UI Next.js / API autorizada ──> serviços de domínio ──> PostgreSQL
Site e-commerce ─────┘               │                         │                 ├─> Auth/RLS
                                     │                         │                 ├─> Audit/Outbox
                                     │                         │                 └─> arquivos/storage
                                     │                         ├─> estoque/IMEI
                                     │                         ├─> venda/caixa/financeiro
                                     │                         ├─> CRM/performance
                                     │                         └─> telecom/fiscal
                                     └──> workers/integration hub ──> Nogle | Fiscal | Adquirentes
                                                                └─> WhatsApp | Meta | Marketplaces
Rein CSV/XLSX ──> importador com validação/staging/preview ──> catálogo / preços iniciais
```

## Bounded contexts / módulos
| Contexto | Dono lógico | Responsabilidades | Não deve controlar diretamente |
|---|---|---|---|
| Identity/Organization | IAM | Auth, usuário, perfil, organizações, lojas, filiais, equipes | Preços, descontos |
| Product Catalog | Catálogo | Produto, variante, SKU, atributo, tabela de preço, regime comercial | Baixa de estoque |
| Inventory | Estoque | Ledger de movimentos, serial/IMEI, ICCID físico, reserva, transferências | Quitação de pagamento |
| CRM | Clientes | Cliente 360, contatos, leads, funil, consentimentos, histórico | Informações brutas de cartão |
| Commerce | Vendas | Carrinho, venda, itens tipados, promoções, atribuição, lifecycle | Estado real na adquirente |
| Payments/Cash | Pagamentos e caixa | Intent/attempt, registro, confirmação, caixa, POS, liquidação | Emissão fiscal |
| Finance | Financeiro | Contas, obrigações, conciliação, repasses, taxas, demonstração gerencial | Rescrever a venda original |
| Performance | Metas | Events idempotentes, regras de bonificação, cálculo, ajustes | Alterar pagamento bruto |
| Tax/Fiscal | Fiscal | Solicitação, autorização interna, provedor, documento e estado fiscal | Decidir obrigação legal só por UI |
| Telecom | Ora Connect | Chip, ICCID, linha, plano, ativação/recarga, sincronização Nogle | Inventar sucesso externo |
| Engagement | Atendimento | WhatsApp, tickets, roteamento, histórico, mensagens, IA supervisionada | Alterar caixa sem permissão |
| Digital Channels | Marketplaces/site | Pedidos, anúncios, preço/canal, reserva, entrega, devoluções | Criar IMEI duplicado |
| Marketing | Atribuição | UTMs, campanhas, leads, métricas e conversão | Presumir atribuição perfeita |
| Analytics | BI | Read models, filtros por loja, gráficos, análises | Reescrever fatos financeiros |
| Integration Hub | Integrações | Adapters, credenciais seguras, filas, retries, idempotência e replay | Expor chave no navegador |

## Limites de consistência
- **Transação PostgreSQL local** para gravar dados relacionados criticamente, como venda + reserva/baixa de estoque ou movimento de caixa quando dentro do mesmo domínio e do banco.
- **Serviços externos** (Nogle, PicPay, fiscal, marketplaces) NÃO participam da transação ACID. Usar state machine, outbox/eventos, retry com backoff, dedupe e reconciliação.
- Evitar 2 confirmações da mesma venda, do mesmo IMEI, da mesma ativação/recarga e da mesma comissão. Usar constraints, concorrência controlada, lock otimista/pessimista quando apropriado, unique indexes e idempotency keys.
- Reverter efeitos financeiros/estoque via **registros compensatórios**, sem apagar fatos históricos. Retenção e correções LGPD seguem política específica.
- Erros de integração devem resultar em status claros `pendente`, `falhou`, `precisa_revisao` ou equivalente; nunca simular confirmação.

## Estados sugeridos (confirmar com regra do negócio)
```text
sale: draft -> pending_approval -> pending_payment -> paid -> fulfillment_pending -> completed
                                   |-> payment_failed              |-> cancelled/refunded/returned
payment: created -> awaiting_confirmation -> confirmed -> settlement_pending -> settled
                                        |-> failed/refunded/chargeback
telecom_activation: requested -> queued -> processing -> confirmed
                                           |-> failed -> review/retry
fiscal_request: requested -> policy_review? -> queued -> provider_processing -> authorized
                                                 |-> rejected/corrected/cancelled/contingency
stock_reservation: active -> consumed | released | expired
cash_session: opening -> open -> closing -> closed -> reviewed
```
Esses são **exemplos de estados**, não enums finais. Estados dependem de fluxos legais/comerciais ainda não validados; evitar enum fechado sem ADR.

## Segurança por design
- Auth central, sessões seguras, MFA para perfis privilegiados quando possível, gestão de dispositivos e logout.
- RBAC servidor + RLS banco por organização/loja, atendendo usuários com acesso a mais de uma unidade sem escalar privilégio.
- Não confiar em `store_id`, `role`, desconto aprovado ou preço enviados pelo cliente; verificar servidor.
- Dados sensíveis: minimização de CPF/telefone, finalidade e consentimento apropriados, controle de retenção, segredo, acesso auditado, mascaramento em logs. Cartões: **nunca armazenar PAN/CVV**; delegar ao provedor homologado.
- Criptografia em trânsito, segredos por ambiente, políticas de acesso ao Storage; backup e restauração REALMENTE testados, inclusive anexos e evidências.
- Ações privilegiadas devem exigir permissão + auditoria `quem/quando/onde/antes/depois/motivo`, e aprovação gerencial onde necessário.

## Infraestrutura e operação
- Ambientes `local`/`test`/`staging`/`production`, isolamento de projetos, migrations revisadas e CI.
- Workers ou jobs para integrações. Nenhum segredo de terceiros no client. Cuidados com SSR/Edge e deployment.
- Monitoramento de erro, latência de PDV, fila pendente, eventos duplicados, estoque negativo, conciliação vencida, documentos fiscais e backups.
- Configurações por loja/UF/CNPJ para fiscal e canais, sem codificar CNPJ ou valores fixos em componentes.
- Offline: inicialmente **contingência operacional documentada**; sincronização offline com venda/estoque/financeiro exigiria desenho e homologação próprios.

## ADRs a abrir antes de migrations
- ADR-001 arquitetura monólito modular, ambientes e limites.
- ADR-002 organização/tenant/loja/CNPJ e perfis.
- ADR-003 livro de estoque serial e saldos deriváveis.
- ADR-004 transações, pagamento, liquidação e caixa.
- ADR-005 produção, metas, comissões e ajustes.
- ADR-006 integração externa, outbox e idempotência.
- ADR-007 fiscal e aprovação gerencial por obrigação.
- ADR-008 UX mobile-first e contingência.
- ADR-009 e-commerce e anti-overselling entre canais.
- ADR-010 LGPD, logs, retenção e backups.
