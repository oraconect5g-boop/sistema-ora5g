# 10 — Decisões em aberto: não inferir silenciosamente

**Objetivo:** o agente deve tratar estes tópicos como pendências a resolver na Etapa 0 com responsáveis humanos. Não é necessário interromper todo o planejamento: criar abstrações e mocks sem executar alterações irreversíveis.

| ID | Decisão crítica | Por que bloqueia/impacta | Proposta provisória / quem valida |
|---|---|---|---|
| D-001 | A Ora será a fonte de verdade do **estoque operacional** desde quando? | Evitar divergência com Rein/sistemas legados e online | Tratar como objetivo, definir data de corte e inventário; proprietário/estoque |
| D-002 | Existe 1 CNPJ ou vários? Qual estrutura de filiais/UF? | Fiscal, bancos, relatórios, tenant | Modelar empresa→loja extensível; contador/proprietário |
| D-003 | Quais lojas têm PC/tablet/celular, caixa, Pix, maquininha, leitor, internet? | UI, contingência e POS | Inventário da loja piloto e amostra das demais; gerente/infra |
| D-004 | Jornada real de venda: cliente/CPF obrigatório quando e por quê? | LGPD, fiscal, PayJoy, telecom | CPF conforme necessidade legal/comercial, não obrigatório global; jurídico/contador |
| D-005 | Regras atuais de desconto, teto por gerente, orçamento diário/mensal | Aprovação/limites | Policy versionada; comercial/diretoria |
| D-006 | O gerente deve aprovar **toda nota** ou só exceções? | Emissão legal obrigatória e prazo fiscal | Fluxo condicionado ao parecer fiscal; contador/diretoria |
| D-007 | Como é emitida a nota hoje? Qual provedor, certificado, UF e modelos? | Fiscal real | Inventariar antes de implementar; fiscal/contador |
| D-008 | Nogle: OpenAPI/Swagger, auth, scopes, sandbox, webhook, produto contratado | Conectar Ora Connect corretamente | Consultar docs.nogle.tech com credencial guardada; dono da conta/técnico |
| D-009 | Nogle: qual papel jurídico da Ora nos chips/recargas/ativação? | Receita líquida vs repasse e documento fiscal | Validar com Nogle/contador |
| D-010 | PicPay: como obter NSU/comprovante/extratos, API POS realmente existe? | Conciliação automatizada | Começar com manual/arquivo auditado; financeiro/PicPay |
| D-011 | Recebimento Pix direto por qual banco, conta e CNPJ? | Regras de conciliação | Adapter genérico e confirmação comprovada; financeiro |
| D-012 | PayJoy: fluxo real, repasse, quem financia, integração web autorizada? | Financeiro, crédito, LGPD | Registrar manualmente assistido até homologação; comercial/PayJoy |
| D-013 | Vendas no boleto próprio vs parceiro de crédito, regras de inadimplência | Responsabilidade financeira | Não assumir análise de crédito por IA; jurídico/financeiro |
| D-014 | Quais metas e bonificações vigentes por função/categoria/período? | Performance e pagamento | Motor versionado; diretoria/RH/financeiro. **Parcial em 13/11/2026:** o proprietário decidiu as metas: **mensais, com o ritmo esperado do dia**; contam o **valor vendido líquido**, os **aparelhos**, os **acessórios (R$)** e o **Ora Connect confirmado**; têm meta **a loja e cada vendedor**; **o dono define todas e o gerente, as da própria loja**, com toda mudança registrada (motivo e histórico). Implementado no lote G4b (`/metas`). Seguem abertas: **bonificação e comissão** (junto com P8) e o ranking com o nome dos colegas (P3) |
| D-015 | Quem recebe a comissão em venda compartilhada e reatribuição de lead? | Evitar duplicidade | Configurar regra; comercial |
| D-016 | Ativação/recarga pode ocorrer antes/depois de venda quitada? | Estado, reembolso, risco | Mapear casos reais com Nogle e gestores |
| D-017 | Qual saldo de caixa e quem pode suprir/sangrar/fechar? | Permissões e auditoria | Documentar SOP real; financeiro/gerentes |
| D-018 | Quais formatos de export de produtos/preços Rein? | Importador | Receber amostras sintéticas/anonimizadas, não credenciais; operações |
| D-019 | Quais dados antigos além de produtos/preços devem migrar? | Escopo da migração; Rein explicitamente limitada a esses dados | Outros dados somente se nova decisão explícita do usuário |
| D-020 | Identidade visual oficial, logo, cores, tipografia e telas favoritas | Design system final | **Parcial em 10/11/2026:** o proprietário escolheu o estilo dos prints de referência que enviou (navegação escura, cartões arredondados, pílulas) com a cor de destaque **azul** (`#2B59E8`) e a fonte Plus Jakarta Sans, já aplicados. Seguem abertos: logo oficial, nome e identidade completa (proprietário/marketing) |
| D-021 | Quais WhatsApps/números estão habilitados à API oficial e quais consentimentos? | Integração e LGPD | Revisar com fornecedor Meta e jurídico |
| D-022 | Quais contas Meta Ads e política de atribuição? | Relatórios e ROAS | Tokens/escopos secretos em ambiente; marketing |
| D-023 | Quais marketplaces abertos e quais permissões API? | Priorização digital | Verificar marketplace e ordem de entrada; comercial |
| D-024 | Canal online: loja própria sob ora5g.com.br ou subdomínio dedicado? | Infra, SEO, CMS, checkout | Não instalar WordPress sem ADR; proprietário/marketing |
| D-025 | Como distribuir estoque para online e nacional (CD, loja de origem, retirada)? | Reserva, frete, impostos | Definir OMS e prioridade de fulfillment; operações |
| D-026 | Política de troca, devolução, garantia, aparelhos usados e assistência | Estoque e obrigações legais | Jurídico/comercial/estoque |
| D-027 | Infra produção (Supabase, VPS, hospedar app, backups, domínio) e orçamento | Disponibilidade, custos e LGPD | Dimensionar após carga e RPO/RTO, sem pagamento antecipado |
| D-028 | Quantos caixas/vendedores simultâneos por loja, SKUs, volume de IMEIs/dia? | Performance e concorrência | Medir nas lojas; operações |
| D-029 | Precisamos de operação offline transacional ou apenas procedimento de contingência? | Complexidade de estoque/POS/fiscal | V1 sem offline financeiro transacional por padrão; pilotar contingência |
| D-030 | Limites de autonomia IA, ferramentas, base de conhecimento e orçamento | Privacidade e segurança | IA supervisionada por padrão; proprietário/jurídico |
| D-031 | Quem aprova migrations/deploy e responde a incidentes? | Governança | Criar matriz RACI e rota de escalonamento; proprietário/engenharia |
| D-032 | Condições objetivas para retirar legado e expandir ondas | Risco operacional | Definir go/no-go assinado; gerente/financeiro/fiscal |
| D-033 | Relatório de Pesquisa Aprofundada representa fonte atual para preços/leis? | Dados publicados podem mudar | Verificar documentos oficiais antes de implementar; especialista |
| D-034 | Quando implantar telecom, WhatsApp e e-commerce diante do piloto? | Dependências e escopo | Ajustar roadmap com receita/risco, sem adiar fundação |

## Primeiras 8 decisões a buscar na Etapa 0
D-001, D-002, D-003, D-005, D-006, D-007, D-008, D-010 são as mais estruturantes. A confirmação de cada uma deverá ser registrada em ADR/decisão de negócio com responsável/data. As demais seguem abertas até suas fases, mas o schema deve evitar acoplamentos que as tornem difíceis.
