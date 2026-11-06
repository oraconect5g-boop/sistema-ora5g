# 09 — Estratégia de testes, rastreabilidade e definição de pronto

## Pirâmide de qualidade
- **Unit:** regras de preços, descontos, taxas, elegibilidade comissão, estados, arredondamento BRL, cálculos fiscais APENAS após homologação, helpers de SKU/IMEI/ICCID.
- **Integration:** PostgreSQL real de teste com transações, constraints, RLS, concorrência, ledgers, idempotência, APIs internas e outbox.
- **Contract:** fornecedores externos com esquemas oficiais versionados; mocks e fixtures redigidas; sandbox autorizada quando disponível.
- **E2E:** navegação móvel e desktop, múltiplas lojas/usuários, caixa, venda, nota, estoque, CRM e telecom sem dependência de prod real.
- **Security:** autorização negativa, IDOR, injection, CSRF/XSS conforme arquitetura, vazamento de segredos, controles de arquivos, prompt injection de IA.
- **Perf/confiabilidade:** carga realista, checkout em rede limitada, tempo de busca, integração timeout, concorrência em IMEI, backup/DR e estabilidade de filas.
- **UAT:** vendedor e gestor da loja piloto, financeiro/contador e responsáveis pelas integrações e suporte.

## Casos ponta a ponta (registrar evidência por ID)
| ID | Cenário | Esperado |
|---|---|---|
| E2E-001 | Usuário vendedor login via celular, seleciona loja autorizada | Só enxerga dados/ações da própria loja |
| E2E-002 | Vendedor de A chama endpoint com store_id B | Negado em API e RLS |
| E2E-003 | Gerente da loja A tenta aprovar desconto da B | Negado e auditado |
| E2E-004 | Cliente, smartphone IMEI X, caixa abre, venda em dinheiro | IMEI reservado/baixado uma vez, caixa correto, performance/venda associadas |
| E2E-005 | Dois caixas vendem IMEI X simultaneamente | No máximo uma venda/consumo válido |
| E2E-006 | Venda de acessório + smartphone + chip + ativação + recarga | Todos os fatos por natureza sem duplicar receita/comissão |
| E2E-007 | Pagamento R$ dividido dinheiro + Pix POS + cartão | N registros, soma correta e estado de cada pagamento |
| E2E-008 | PicPay POS informado mas liquidação não conferida | Relatório indica pendente/não reconciliado |
| E2E-009 | Pix/maquininha não confirmou e app fecha | Venda não é falsamente marcada quitada; recuperação segura |
| E2E-010 | Duplo webhook de pagamento | Único efeito financeiro, estoque e performance |
| E2E-011 | Abertura/sangria/suprimento/fechamento caixa | Fechamento reproduzível, diferença e gerente auditados |
| E2E-012 | Desconto excede alçada e gerente aprova no celular | Aprovador e policy version guardados; preço final correto |
| E2E-013 | Desconto excede alçada e gerente rejeita | Venda não conclui com preço rejeitado |
| E2E-014 | Nota solicitada na venda via celular | Pré-preenchimento e status fiscal real; política de aprovação conforme legalidade |
| E2E-015 | Fiscal timeout após autorização externa | Consulta idempotente, sem duplicação de nota |
| E2E-016 | Venda mista exige diferentes documentos fiscais | Matriz de documentos homologada, associação íntegra à operação |
| E2E-017 | Nogle confirma ativação de chip depois da venda | Evento de produção apenas após confirmação real |
| E2E-018 | Nogle falha/timeout em ativação ou recarga | Estado pendente/revisão; retry não duplica ativação/comissão |
| E2E-019 | Recarga de valor R$X com repasse e comissão distintos | Gerencial mostra valor de face vs receita apropriável e recebimento |
| E2E-020 | Cancelar aparelho e devolver ao estoque | Reversão auditada, IMEI elegível só conforme condição e inspeção |
| E2E-021 | Estornar venda após bonificação calculada | Ajuste conforme regra, sem apagar evento original |
| E2E-022 | Transferir IMEI A→B, venda tenta em trânsito | Bloqueada até recebimento e conferência |
| E2E-023 | CSV Rein com duplicados/campos inválidos | Preview, erros, sem inclusão indevida; runtime não chama API Rein |
| E2E-024 | Lead Meta Ads→WhatsApp→vendedor→venda | Atribuição possível, consentimento e histórico sem duplicar conversões |
| E2E-025 | Cliente desautoriza marketing WhatsApp | Automação respeita opt-out/templates e mantém registros legais mínimos |
| E2E-026 | Pedido Mercado Livre/Shopee/TikTok (fixture) usa mesmo estoque do PDV | Reserva atômica anti-overselling e dedupe por ID externo |
| E2E-027 | Pedido marketplace cancelado após envio | Fluxo de devolução, estoque/financeiro/fiscal e comissão coerentes |
| E2E-028 | Usuário de perfil Atendimento solicita aprovação via chatbot IA | IA não eleva privilégio nem executa operação crítica |
| E2E-029 | Falta internet no PDV mobile | Estados seguros, contingência, nenhuma confirmação falsa |
| E2E-030 | Restaurar banco + anexos e reprocessar fila | Recovery com evidência, dados e idempotência preservados |
| E2E-031 | Fechamento diário vendedor/loja por todas categorias | Quantidade, bruto, recebimento, lucro gerencial e bônus reconciliados |
| E2E-032 | Duas lojas e três vendedores com meta e cashback/reversal simulado | Resultados por escopo sem vazamento e sem bonificação duplicada |

## Critérios de pronto (Definition of Done)
- ID de requisito, issue e responsável definidos; regra de negócio/UX aprovada.
- Contratos tipados, casos de erro e autorização server-side concluídos.
- Testes unitários de regra, integração de banco/RLS e E2E para fluxo crítico passam no CI.
- Segurança revisada; logs sem segredos; auditoria e métricas funcionam.
- Migrações versionadas/rollback e dados sensíveis revisados quando aplicável.
- UI acessível responsiva, com estados carregando/vazio/erro/sem permissão/conflito.
- Documentação de APIs e operações, suporte, incidentes e contingência revisada.
- Revisão cruzada Claude Code/Codex no PR; aprovação humana nos assuntos críticos.
- Evidência anexada ao ticket com ambiente/data/revisão/casos; deploy e monitoramento rastreados.

## Medidas e SLOs (pendentes de validação)
Coletar baseline de hardware, rede, jornada de vendas e volume das lojas. Definir metas específicas para busca/carrinho, disponibilidade, filas, RPO/RTO e conclusão fiscal **antes de declarar valores numéricos**. Não inventar latências ou percentuais de uptime.

## Evidência mínima por requisito
`requirement_id`, `issue_id`, `PR`, `module`, `files`, `migration`, `test_case_id`, `CI_run`, `staging_version`, `reviewer`, `human_approver` e `date_of_acceptance`, com anexos sanitizados. `backlog.json` contém campos para vincular essas informações no futuro.
