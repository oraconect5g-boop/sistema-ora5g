# 03 — Modelo conceitual de dados (para desenho físico posterior)

**AVISO:** nomes de tabelas/campos abaixo são **propostas**, não schema migrado nem contrato externo verificado. Antes de criar banco: validar com cenários reais, políticas fiscais, regras do financeiro, multi-CNPJ e seleção do piloto. Não materializar tabelas apenas por esta lista.

## Entidades e relações principais

```text
organization 1--N company 1--N store
store N--N user (membership + role + validity)
customer 1--N lead / opportunity / interaction / sale / telecom_line
store 1--N stock_location / cash_session / stock_movement / sale
product 1--N variant 1--N serial_unit [IMEI opcional]
variant N--N price_list (effective period, channel, store)
store + variant 1--N inventory_movement -> balance (materialized/derived)
sale 1--N sale_item; sale 1--N payment; sale 1--N fiscal_document
sale 1--N attribution; sale 1--N performance_event
payment 1--N attempt/settlement/reconciliation_event
telecom_operation N--1 sale_item (quando originada de venda); 1--N external_event
commission_result N--1 performance_event; N--1 versioned_commission_rule
integration_event 1--N attempt; all -> audit records
```

## Núcleo de organização e IAM
| Entidade proposta | Atributos/constrangimentos importantes |
|---|---|
| `organizations` | id interno, nome, status |
| `companies` | id, organização, dados fiscais validados, CNPJ protegido, status |
| `stores` | id, empresa, código, UF, endereço, timezone, status, configuração fiscal |
| `users` | id auth, nome, status; não duplicar identidade no banco |
| `store_memberships` | user, store, role, vigência; unique por vínculo ativo conforme política |
| `roles`, `permissions`, `role_permissions` | conjunto versionado de permissões; escopo `own/store/region/org` |
| `approval_policies`, `approval_requests`, `approval_actions` | tipo, versão, motivo, solicitante, aprovador independente, prazos, trilha |

## Clientes e CRM
| Entidade | Dados e regras |
|---|---|
| `customers` | id próprio, nome, CPF opcional/conforme finalidade, telefone, e-mail, origem, status; dedupe com cuidado e LGPD |
| `customer_identifiers` | tipo/documento hash ou dados protegidos, proveniência, unicidade conforme regra |
| `customer_addresses` | endereço/CEP/UF, validade; logística nacional futura |
| `consents`, `contact_preferences` | canal, base/finalidade, data, fonte, retirada, política |
| `leads`, `opportunities` | fonte, campanha, responsável, loja, etapa, valor previsto, motivo de perda |
| `interactions`, `tasks`, `service_tickets` | histórico, autoria, atribuição, SLA, anexos protegidos |

## Catálogo e preço
| Entidade | Dados e regras |
|---|---|
| `products`, `product_variants` | SKU interno único por organização, marca, modelo, categoria, especificações |
| `product_kinds` | physical_phone, accessory, sim, esim, activation, recharge, plan, service, warranty etc. (tipos configurados) |
| `price_lists`, `price_entries` | produto, canal/loja, moeda, início/fim vigência, preço, prioridade, autor |
| `product_cost_entries` | custos históricos por lote/entrada conforme política; não sobrescrever custo histórico |
| `product_external_mappings` | Rein import source key, marketplace SKU/ID externo; chave interna própria |
| `import_batches`, `import_rows`, `import_errors` | origem CSV/XLSX, hash, pré-visualização, validação, confirmação, auditoria, dedupe |

## Estoque e IMEI/ICCID
| Entidade | Dados e regras |
|---|---|
| `stock_locations` | lojas, depósito/estoque reservado, trânsito, assistência |
| `serial_units` | id único, variant, IMEI/IMEI2 quando aplicável, serial, condição, localização, status; unicidade real |
| `sim_cards` | ICCID (se aplicável) único sob política, lote, loja, ativação e estado |
| `stock_movements` | id, tipo, origem, destino, variant/serial, qtd, motivo, referência, autor, timestamp, reversão |
| `stock_reservations` | id, canal/sale/order, store, serial/variant, qtd, expiração, estado, chave idempotente |
| `stock_balances` | snapshot/cache consistente por location+variant; invariantes com movimentos |
| `stock_counts`, `stock_count_lines` | inventário, conferências, divergências, aprovações e ajuste auditado |
| `stock_transfers`, `transfer_lines` | origem, trânsito, recepção, divergência, confirmação e responsabilidade |
| `purchase_orders`, `goods_receipts`, `suppliers` | compras, custos e entradas auditáveis |

## Vendas e pagamentos
| Entidade | Dados e regras |
|---|---|
| `commercial_transactions` / `sales` | org, store, channel, seller, customer, moeda, totais, desconto, status, idempotency_key |
| `sale_items` | kind, variant/service, qty, gross/net, tax profile reference, cost snapshot, commission attribution, serial/ICCID when needed |
| `sale_attributions` | vendas compartilhadas, vendedor originador/fechador, regras explícitas para evitar duplicidade |
| `discount_requests`, `discount_approvals` | valor, limite, policy version, gerente, motivo, auditoria |
| `payments` | 1:N por venda; method, amount, status, provider, terminal, receipt, fee, currency |
| `payment_attempts` | id externo, NSU/TID quando disponível, state, idempotency_key, comprovante seguro, raw redigido |
| `payment_settlements` | bruto, fee, líquido, previsão/efetivação, adquirente, data, conciliação |
| `cash_sessions`, `cash_movements`, `cash_closures` | abertura, recebimento, sangria, suprimento, estorno, fechamento, diferença, conferência |
| `receivables`, `payables`, `finance_entries` | origem, vencimento, competência, liquidação, custo, taxa, reversão, lançamentos gerenciais |
| `reconciliations`, `reconciliation_items` | comparação Ora vs extrato POS/banco/provedor, exceções e aprovação |
| `returns`, `exchanges`, `refunds` | referência ao original, motivos, direitos, estoque, fiscal, financeiro e comissão |

## Telecom / Ora Connect
| Entidade | Dados e regras |
|---|---|
| `telecom_lines` | id local, provider_line_id opcional, número/MSISDN protegido, status, cliente, plano |
| `telecom_plans` | id local, mapeamento Nogle, tarifação e vigência conforme contrato |
| `activations` | requested/processing/confirmed/failed, ICCID, linha, vendedor, loja, id externo, retries, timestamps |
| `recharges` | número/linha, montante pago, valor repassado, comissão, status Nogle, recibo, reconciliado |
| `portabilities`, `telecom_contracts` | processo, autorização, responsável, documentos e status conforme Nogle e normas |
| `telecom_operations` | comando local, payload mínimo, provider idempotency, request/response sanitizados, state |
| `telecom_partner_settlements` | comissão/repasse, extrato, divergência, período, documento fiscal aplicável |

## Performance, metas e bonificações
| Entidade | Dados e regras |
|---|---|
| `performance_events` | event_type, source_id, vendedor, loja, cliente ref opcional, qty, gross, eligible_base, data, source+type unique |
| `targets`, `target_rules` | escopo vendedor/equipe/loja, produto/categoria, período, unidade, regra/limite, versão |
| `commission_rules`, `commission_rule_versions` | vigência, elegibilidade, prioridade, fórmula/limites versionados |
| `commission_calculations`, `commission_adjustments`, `commission_payouts` | base, valor, regra, status, estorno, autorização de pagamento |

## Fiscal, canais, marketing e atendimento
| Entidade | Dados e regras |
|---|---|
| `fiscal_profiles`, `fiscal_requests`, `fiscal_documents`, `fiscal_events` | natureza, UF/CNPJ, provedor, status, chave, protocolo, xml/arquivo seguro, cancelamento, correção |
| `sales_channels`, `external_listings`, `external_orders`, `order_items`, `fulfillment_orders`, `shipments`, `marketplace_settlements` | canal e ID externo nunca são PK; estoque reservado, taxas e logística |
| `campaigns`, `ad_accounts`, `attribution_touchpoints`, `utms`, `conversion_events` | origem, gasto, conversão atribuída, limites de atribuição, consentimento |
| `conversations`, `messages`, `conversation_assignments`, `message_templates` | WhatsApp, owner/loja, status, canal, consentimento, SLA, handoff, custo |
| `ai_sessions`, `ai_suggestions`, `ai_actions`, `ai_approvals` | base usada, versão de prompt, limites, revisão humana, auditoria |
| `integration_connections`, `integration_events`, `outbox_events`, `inbox_dedupe`, `integration_attempts`, `webhook_deliveries` | provider, scope, ext ID, payload mínimo redigido, estado, retries, dedupe, correlação |
| `audit_logs`, `data_access_logs`, `attachments`, `notification_events` | rastreabilidade, retenção, autorização, integridade |

## Integridade e transações
1. Uma unidade IMEI não pode estar em duas lojas ou em duas vendas concluídas. Definir unique index e transação/lock para reservar/consumir.
2. Estoque não pode ficar abaixo do permitido, salvo regra expressa de backorder; bloqueio no servidor e banco quando viável.
3. `sales` 1:N `payments`; soma de pagamentos confirmados por espécie/caso deve reconciliar com total devido sem exceder/duplicar, considerando pagamentos pendentes, troco e estornos.
4. `performance_events` protegido contra duplicidade por `(source_type, source_id, event_type, attribution_scope)` ou chave equivalente.
5. Documentos fiscais e transações Nogle devem suportar falhas externas sem perder correlação com venda local.
6. Trilha original imutável; ajustes e cancelamentos geram eventos compensatórios.
7. Status e valores não devem ser atualizados por requisições que não provem autorização e versão/concorrência.
8. IDs internos distintos de IDs externos; usar `external_mappings` e garantir unicidade por provider/tenant.
9. Retenção de dados e expurgo/anomização compatíveis com obrigações legais; tratamento LGPD requer decisão formal.

## Índices e escala a projetar (revisar após volume real)
- `store_id` + `created_at` para vendas, estoque, eventos e auditoria.
- `seller_id` + `performed_at` + `event_type` para performance/metas.
- `sku`/variante, IMEI/serial e ICCID com regras de busca e unicidade.
- IDs externos compostos `(provider, account_id, external_id)`; keys de idempotência com unique indexes.
- Sessões de caixa por `(store_id, register_id, opening_date/status)`, vedando simultaneidade não permitida.
- Índices de filas pendentes e expiração de reservas.

## Política de migrations
- Toda mudança em migration versionada no Git e testada em staging com dados representativos anonimizados.
- Preferir expandir→migrar dados→mudar código→contrair, com rollout gradual quando necessário.
- Sem `DROP` destrutivo nem renomeações abruptas em produção sem revisão, backup verificável e procedimento de recuperação.
- Criar testes automatizados de constraints, autorização RLS, isolamento multiloja, consistência de pagamento e concorrência.
