# 01 — Requisitos rastreáveis da Ora 5G

**Inventário inicial: 172 requisitos**. São hipóteses de implementação a validar, não funcionalidades já existentes.

Legenda: **P0** essencial à fundação/piloto conforme dependências; **P1** funcionalidades importantes para rollout/integração; **P2** expansão. Um requisito P1 pode ser antecipado se houver bloqueio operacional real.

Cada ID deve se tornar issue(s) de GitHub, ligar PR/arquivos alterados, testes executados, evidência, aceite e versão de implantação. O backlog JSON inclui esses campos vazios para preencher — **não** declarar progresso inexistente.

## Matriz de rastreabilidade inicial

### ORG — Organização, lojas e usuários (etapa-base 1)

| ID | Prio. | Requisito | Critério objetivo de aceitação |
|---|---|---|---|
| ORA-ORG-001 | P0 | Cadastrar empresa, organização, 14 lojas e loja piloto | Usuários autorizados selecionam unidade; IDs e dados fiscais coerentes. |
| ORA-ORG-002 | P0 | Associar usuários a uma ou múltiplas lojas com função e vigência | Bloqueio testado para loja sem vínculo. |
| ORA-ORG-003 | P0 | Gerir perfis diretoria, regional, gerente, vendedor, financeiro, fiscal, marketing e atendimento | Matriz de autorização versionada e auditada. |
| ORA-ORG-004 | P0 | Isolar dados por loja na API e PostgreSQL/RLS | Testes de acesso cruzado e negação por ID arbitrário. |
| ORA-ORG-005 | P0 | Histórico de alterações de papéis, políticas e configurações | Auditoria identifica ator, horário, alvo e motivo. |
| ORA-ORG-006 | P0 | Login, recuperação de conta e revogação de sessão | Acessos revogados deixam de funcionar; mensagens neutras. |
| ORA-ORG-007 | P1 | Autenticação reforçada para perfis privilegiados | MFA e política de sessão validados com segurança. |
| ORA-ORG-008 | P1 | Configurar horários, endereços, caixas e dados fiscais por loja | Mudanças versionadas com regras de vigência. |
| ORA-ORG-009 | P1 | Gerir unidades regionais, grupos e metas agregadas | Relatórios respeitam hierarquia de acesso. |
| ORA-ORG-010 | P2 | Preparar multi-CNPJ/UF para expansão física nacional | Vínculos fiscais e locais operam sem dados globais hard-coded. |

### CAT — Catálogo e precificação (etapa-base 2)

| ID | Prio. | Requisito | Critério objetivo de aceitação |
|---|---|---|---|
| ORA-CAT-001 | P0 | Cadastrar categorias, marcas, produtos, variantes e SKUs | SKU interno identificado e único no escopo definido. |
| ORA-CAT-002 | P0 | Importar produtos e preços da Rein somente por CSV/XLSX | Prévia, validação, relatório de erro, confirmação e rollback lógico. |
| ORA-CAT-003 | P0 | Não consumir API Rein em nenhuma operação diária | Nenhum módulo de runtime depende de rede/credencial Rein. |
| ORA-CAT-004 | P0 | Cadastrar preços vigentes por loja/canal conforme regra | Preço final tem origem explicável e histórico. |
| ORA-CAT-005 | P0 | Diferenciar smartphone, acessório, chip e serviço comercial | Tipos exigem campos apropriados sem tabelas isoladas de venda. |
| ORA-CAT-006 | P0 | Pesquisar por nome, SKU e, quando aplicável, IMEI/ICCID | Busca rápida funciona no celular sem leitor. |
| ORA-CAT-007 | P1 | Programar vigência de promoções e campanhas comerciais | Preço aplicado respeita período e autorização. |
| ORA-CAT-008 | P1 | Custo de produto/lote/entrada e margem gerencial | Custo histórico de venda não muda retroativamente. |
| ORA-CAT-009 | P1 | Canais externos usam mapeamento de SKU e IDs próprios | Identificadores externos não substituem PK interna. |
| ORA-CAT-010 | P2 | Permitir importação assistida em lote de fotos/atributos | Erros não criam duplicatas nem sobrescritas silenciosas. |

### INV — Estoque, serial/IMEI e suprimentos (etapa-base 3)

| ID | Prio. | Requisito | Critério objetivo de aceitação |
|---|---|---|---|
| ORA-INV-001 | P0 | Manter disponibilidade por loja e localização física | Reserva/venda nunca usa saldo de outra loja sem transferência. |
| ORA-INV-002 | P0 | Identificar aparelho por IMEI/serial e impedir venda duplicada | Concorrência e unique indexes bloqueiam duplicidade. |
| ORA-INV-003 | P0 | Registrar cada entrada/saída em livro auditável de estoque | Saldo reconciliável com movimentos e motivos. |
| ORA-INV-004 | P0 | Receber estoque inicial validado por contagem real | Divergências e aprovadores ficam registrados. |
| ORA-INV-005 | P0 | Reservar estoque durante checkout e liberar em expiração/cancelamento | Concorrência entre caixas e canais não vende duas vezes. |
| ORA-INV-006 | P0 | Bloquear venda de IMEI indisponível/transferido/reservado | Mensagem operacional clara e sem mutações parciais. |
| ORA-INV-007 | P1 | Transferência entre lojas com trânsito/recebimento | Origem e destino confirmam quantidades e divergências. |
| ORA-INV-008 | P1 | Inventário cíclico e ajuste com aprovação | Trilha permite reconstruir antes/depois e justificativa. |
| ORA-INV-009 | P1 | Compras e recebimento de fornecedores | Pedido, nota/entrega, custo e entrada identificáveis. |
| ORA-INV-010 | P1 | Histórico de reparo/devolução e condição de unidade | Produto retornado não reaparece automaticamente como novo. |
| ORA-INV-011 | P1 | Controle de ICCID de chip físico quando exigido | ICCID não é atribuído a duas ativações incompatíveis. |
| ORA-INV-012 | P2 | Transferência para CD e alocação futura a canais nacionais | Apropriação de localização e logística auditável. |

### CRM — Clientes, CRM, oportunidades e contratos (etapa-base 4)

| ID | Prio. | Requisito | Critério objetivo de aceitação |
|---|---|---|---|
| ORA-CRM-001 | P0 | Cadastro de cliente com dados mínimos e finalidade | Dados obrigatórios dependem da operação; LGPD documentada. |
| ORA-CRM-002 | P0 | Relacionar cliente às compras/IMEIs/chips/linhas e atendimentos | Perfil 360 apresenta histórico autorizado por loja/função. |
| ORA-CRM-003 | P0 | Pesquisar cliente por identificadores protegidos | Resultados evitam expor CPF desnecessariamente. |
| ORA-CRM-004 | P0 | Registrar lead, origem, atendente, vendedor responsável e etapa | Funil mostra histórico e próximo passo. |
| ORA-CRM-005 | P1 | Atividades, lembretes, follow-up e motivos de perda | Histórico com autor e vencimento. |
| ORA-CRM-006 | P1 | Detecção e mesclagem controlada de cadastros duplicados | Não perde compras/documentos; operação auditável. |
| ORA-CRM-007 | P1 | Registros de consentimento/preferência de comunicação | Retirada afeta automações e respeita obrigações. |
| ORA-CRM-008 | P1 | Contratos/anexos de venda, garantia, financiamento e telecom | Acesso, assinatura, guarda e retenção adequados. |
| ORA-CRM-009 | P1 | Histórico omnichannel de compras físicas/online | Pedido externo e venda vinculados sem sobrescrever origem. |
| ORA-CRM-010 | P2 | Segmentação comercial e valor de vida do cliente | Segmentos minimizam dados e são explicáveis. |

### POS — PDV mobile e vendas (etapa-base 5)

| ID | Prio. | Requisito | Critério objetivo de aceitação |
|---|---|---|---|
| ORA-POS-001 | P0 | Efetuar venda completa em celular sem notebook | E2E em smartphone real da loja piloto. |
| ORA-POS-002 | P0 | Busca rápida por nome/SKU/IMEI e carrinho responsivo | Usabilidade e velocidade validadas com vendedor. |
| ORA-POS-003 | P0 | Itens mistos em venda: aparelho, acessório, chip, ativação, recarga | Itens mantêm natureza e regras próprias sem dupla contabilização. |
| ORA-POS-004 | P0 | Selecionar IMEI físico disponível antes de concluir | Reserva e baixa atomizadas no banco. |
| ORA-POS-005 | P0 | Calcular preço/desconto e totais server-side | Cliente não consegue alterar preço enviado. |
| ORA-POS-006 | P0 | Solicitar aprovação do gerente para desconto acima do limite | Aprovador, limite, motivo, prazo e decisão auditáveis. |
| ORA-POS-007 | P0 | Suportar múltiplos pagamentos na mesma venda | Soma, troco, confirmação e estorno consistentes. |
| ORA-POS-008 | P0 | Vincular venda a vendedor, loja, cliente quando aplicável e canal | Atribuição preservada em todas as consultas. |
| ORA-POS-009 | P0 | Consultar status e comprovantes sem concluir pagamento pendente | Vendedor vê pendência e ação de reprocessamento segura. |
| ORA-POS-010 | P0 | Cancelar e devolver sem apagar origem | Reversão reflexa em estoque, pagamentos, fiscal e comissões. |
| ORA-POS-011 | P0 | Gerar solicitação fiscal a partir da venda em poucos toques | Vendedor não precisa escolher documento fiscal incorreto. |
| ORA-POS-012 | P1 | Troca com diferença de preço e meios de pagamento | Histórico e estoque correto na devolução/saída. |
| ORA-POS-013 | P1 | Venda parcelada/PayJoy/boleto por fluxo homologado | Etapas reais, aprovação e termos exigidos. |
| ORA-POS-014 | P1 | Aplicar campanhas, combos e regras por loja | Persistência da regra aplicada para auditoria. |
| ORA-POS-015 | P1 | Atalhos para supervisor e estados offline/sem rede | Sem venda presumida como concluída sem confirmação. |
| ORA-POS-016 | P2 | Entrada por leitor USB/Bluetooth ou câmera | Sem mudança na regra central de busca/checkout. |

### PAY — Pagamentos, PicPay e caixa (etapa-base 5)

| ID | Prio. | Requisito | Critério objetivo de aceitação |
|---|---|---|---|
| ORA-PAY-001 | P0 | Registrar dinheiro, Pix direto, Pix PicPay POS e cartões | Provider, terminal, método e comprovante quando disponível. |
| ORA-PAY-002 | P0 | Suportar financiamento, boleto, parcelamento e pagamentos online | Estados e elegibilidade definidos por integração específica. |
| ORA-PAY-003 | P0 | Diferenciar autorizado, pago, liquidado, estornado e conciliado | Relatórios não misturam venda com dinheiro recebido. |
| ORA-PAY-004 | P0 | Abrir caixa com saldo inicial e responsável | Uma sessão ativa segundo regra por gaveta/terminal. |
| ORA-PAY-005 | P0 | Registrar sangria, suprimento, reforço, devolução e saída autorizada | Cada movimento tem motivo, autor e impacto no saldo. |
| ORA-PAY-006 | P0 | Fechar caixa com valor contado e diferença | Gerente confere e aprova divergência. |
| ORA-PAY-007 | P0 | Conciliação manual PicPay POS usando referência/comprovante | Sem API não se presume liquidação automática. |
| ORA-PAY-008 | P0 | Evitar confirmação duplicada via webhook/retry | Constraints de evento externo e idempotency key. |
| ORA-PAY-009 | P1 | Importar extratos de adquirente/banco por arquivo validado | Linhas conciliadas, discrepâncias e taxas reportadas. |
| ORA-PAY-010 | P1 | Reconciliar taxas, parcelas e datas de repasse | Venda bruta vs líquido recebido visíveis. |
| ORA-PAY-011 | P1 | Gerir chargebacks, estornos, antecipação e ajustes | Efeito financeiro e comissão não duplicado. |
| ORA-PAY-012 | P1 | Permitir múltiplas maquininhas/provedores por loja | Terminal tem identificação e escopo correto. |
| ORA-PAY-013 | P2 | Integração automática com PicPay POS se API contratual confirmada | Contrato, autenticação, eventos e homologação aprovados. |
| ORA-PAY-014 | P2 | Pix/checkout web e links por provedores validados | Confirmação no backend antes de fulfill/baixa definitiva. |

### FIN — Financeiro e controladoria (etapa-base 6)

| ID | Prio. | Requisito | Critério objetivo de aceitação |
|---|---|---|---|
| ORA-FIN-001 | P0 | Resumo diário de vendas x recebimentos x produção comercial | Categorias e status reconciliáveis. |
| ORA-FIN-002 | P0 | DRE/margem gerencial com custo, taxa e desconto | Números não são apresentados como contabilidade formal auditada. |
| ORA-FIN-003 | P0 | Contas a receber ligadas a venda, vencimento e meio | Aging e status dependem de confirmação. |
| ORA-FIN-004 | P0 | Contas a pagar ligadas a fornecedor/origem | Vencimentos e responsabilidades autorizadas. |
| ORA-FIN-005 | P0 | Rastrear recebíveis e repasses por loja/adquirente | Diferenças e pendências visíveis ao financeiro. |
| ORA-FIN-006 | P1 | Conciliação bancária e contas multiempresa | Imports/matches reproduzíveis com aprovação. |
| ORA-FIN-007 | P1 | Gestão de inadimplência e cobranças autorizadas | Ações e consentimentos com auditoria. |
| ORA-FIN-008 | P1 | Relatório financeiro consolidado por loja/região/rede | RBAC respeita visão global vs local. |
| ORA-FIN-009 | P1 | Exportações CSV/XLSX/PDF de relatórios autorizados | Filtros e dados sensíveis protegidos. |
| ORA-FIN-010 | P2 | Previsão de fluxo de caixa e simulações | Premissas explicadas e separadas de fatos. |

### PERF — Vendedor, metas, comissões e bonificações (etapa-base 6)

| ID | Prio. | Requisito | Critério objetivo de aceitação |
|---|---|---|---|
| ORA-PERF-001 | P0 | Contar individualmente aparelhos, acessórios, chips, ativações e recargas | Painel por vendedor/loja/período sem duplicidade. |
| ORA-PERF-002 | P0 | Registrar performance_event único por origem/ação confirmada | Retries de API não criam duas bonificações. |
| ORA-PERF-003 | P0 | Distinguir quantidade, valor bruto, margem, receita elegível e comissão | Extrato explica cálculo de cada evento. |
| ORA-PERF-004 | P0 | Definir meta por vendedor, loja, categoria e período | Alteração não reescreve resultado histórico. |
| ORA-PERF-005 | P0 | Painel do gestor mostra metas e resultados da equipe | Filtragem loja e perfil aplicada no servidor. |
| ORA-PERF-006 | P1 | Regras de bonificação por categoria/campanha/margem/escala | Edição versionada e período de vigência. |
| ORA-PERF-007 | P1 | Ajustar comissão por cancelamento/devolução conforme regra | Comprovante de origem e reversão sem apagar histórico. |
| ORA-PERF-008 | P1 | Apurar e aprovar fechamento de bonificação | Totais detalhados, contestação e trilha de aprovação. |
| ORA-PERF-009 | P1 | Metas coletivas/regional e rankings configuráveis | Desempate transparente e autorização adequada. |
| ORA-PERF-010 | P2 | IA recomenda campanhas/metas com aprovação humana | Sem alterar remuneração automaticamente. |

### FISC — Fiscal, nota e conformidade (etapa-base 7)

| ID | Prio. | Requisito | Critério objetivo de aceitação |
|---|---|---|---|
| ORA-FISC-001 | P0 | Solicitar nota diretamente da venda no celular | Fluxo intuitivo e prefill de dados necessários. |
| ORA-FISC-002 | P0 | Fluxo interno de aprovação de solicitações pelo gestor conforme política | Auditoria sem impedir obrigação legal de emissão. |
| ORA-FISC-003 | P0 | Identificar perfil fiscal por produto/serviço/UF/CNPJ | Regras homologadas com contador/especialista. |
| ORA-FISC-004 | P0 | Integrar provedor fiscal homologado para documento correto | Estados emitido/autorizado/rejeitado/contingência claros. |
| ORA-FISC-005 | P0 | Guardar chave, protocolo, referência e evidências legais com segurança | Controle de acesso e retenção definidos. |
| ORA-FISC-006 | P0 | Tratar falha fiscal, reprocesso, contingência e cancelamento | Nenhum documento duplicado nem venda marcada indevidamente. |
| ORA-FISC-007 | P1 | Mapear cenários NF-e/NFC-e/NFS-e/NFCom conforme natureza | Matriz validada por contador com decisões por UF e operação. |
| ORA-FISC-008 | P1 | Conciliação fiscal de vendas, tributos e documentos | Pendências e divergências alertadas. |
| ORA-FISC-009 | P1 | Devolução, troca, cancelamento e correção fiscal | Fluxos e prazos homologados com fiscal. |
| ORA-FISC-010 | P2 | Multi-UF/multi-CNPJ e reforma tributária preparada | Alterações versionadas e conformes à norma vigente. |

### CONNECT — Ora Connect, chips, ativações e recargas (etapa-base 10)

| ID | Prio. | Requisito | Critério objetivo de aceitação |
|---|---|---|---|
| ORA-CONNECT-001 | P0 | Cadastrar e vender chip físico ligado ao estoque e vendedor | Unidade/ICCID e venda reconciliáveis. |
| ORA-CONNECT-002 | P0 | Separar evento de venda de chip do evento de ativação | Quantidades, status, valor e comissão independentes. |
| ORA-CONNECT-003 | P0 | Separar recarga como operação telecom com status próprio | Total pago e valor repassado/receita reconhecida não confundidos. |
| ORA-CONNECT-004 | P0 | Registrar Nogle como integração externa por adapter | Sem endpoint presumido; contrato deve vir dos docs autenticados. |
| ORA-CONNECT-005 | P0 | Refletir ativação somente após resposta verificada da Nogle | Falhas ficam pendentes/revisão sem gerar sucesso falso. |
| ORA-CONNECT-006 | P0 | Atribuir performance de ativação/recarga ao vendedor de origem | Evento idempotente e elegibilidade transparente. |
| ORA-CONNECT-007 | P1 | Consulta/atualização de linha e plano conforme API disponível | Permissão e rate limit respeitados. |
| ORA-CONNECT-008 | P1 | Portabilidade, contrato e venda de plano conforme contrato | Jornada e documentos homologados. |
| ORA-CONNECT-009 | P1 | Reconciliar repasses/bonificações Nogle e operação local | Divergências rastreáveis e reversão segura. |
| ORA-CONNECT-010 | P1 | Recuperar falha de rede com reconsulta sem reativação duplicada | Idempotência/reconciliação externa aprovadas. |
| ORA-CONNECT-011 | P2 | eSIM, contratação digital e entrega de chip nacional | Implementar somente se Nogle suportar e acordo permitir. |

### ONLINE — E-commerce e vendas online (etapa-base 11)

| ID | Prio. | Requisito | Critério objetivo de aceitação |
|---|---|---|---|
| ORA-ONLINE-001 | P1 | Site de aparelhos, acessórios e planos Ora Connect | Catálogo e estoque centralizados; não criar outro sistema de venda. |
| ORA-ONLINE-002 | P1 | Carrinho/checkout online e pedido com status | Pagamento confirmado antes de liberar fulfillment. |
| ORA-ONLINE-003 | P1 | Atribuir origem online, campanhas e vendedor quando aplicável | Sem atribuição indevida ou dupla comissão. |
| ORA-ONLINE-004 | P1 | Frete, CEP, retirada em loja e entrega com rastreio | Reserva e prazos consistentes. |
| ORA-ONLINE-005 | P1 | Devolução, arrependimento e reembolso de venda online | Prazo/regra legal homologado e efeitos auditados. |
| ORA-ONLINE-006 | P1 | Reserva de IMEI por pedido/canal anti-overselling | Pedido online concorrente com loja não vende unidade duplicada. |
| ORA-ONLINE-007 | P2 | Contratação online de planos/chips/eSIM se habilitado | Validação de identidade/contrato, antifraude e cobertura. |
| ORA-ONLINE-008 | P2 | Expansão interestadual com parâmetros fiscais e logísticos | Multi-UF testado antes da abertura nacional. |

### MKTPL — Marketplaces e channel manager (etapa-base 11)

| ID | Prio. | Requisito | Critério objetivo de aceitação |
|---|---|---|---|
| ORA-MKTPL-001 | P1 | Preparar adaptadores separados Mercado Livre/Shopee/TikTok Shop | Contratos e permissões confirmados antes do deploy. |
| ORA-MKTPL-002 | P1 | Sincronizar SKU/preço/estoque/anúncio conforme recursos | Evitam overselling e divergência detectável. |
| ORA-MKTPL-003 | P1 | Importar pedido marketplace com ID externo e dedupe | Reenvio de webhook não duplica pedido/reserva. |
| ORA-MKTPL-004 | P1 | Tratar entrega/frete/etiquetas/rastreio por canal | Estados de fulfillment corretos e não inventados. |
| ORA-MKTPL-005 | P1 | Conciliação de tarifas, comissões e repasses por marketplace | Lucratividade por pedido/canal explicável. |
| ORA-MKTPL-006 | P1 | Cancelamentos, devoluções e reembolsos por canal | Estoque/financeiro/fiscal/commission reversos. |
| ORA-MKTPL-007 | P2 | Sincronização near-real-time por webhooks/adapters | Rate limits/retries monitorados. |
| ORA-MKTPL-008 | P2 | Métricas por anúncio/canal/produto e margem | Valores reconciliados sem confundir receita bruta com líquida. |

### WHATS — WhatsApp, atendimento e automação (etapa-base 11)

| ID | Prio. | Requisito | Critério objetivo de aceitação |
|---|---|---|---|
| ORA-WHATS-001 | P1 | WhatsApp Business Platform oficial conectado ao CRM | Conta/números/escopos homologados; templates válidos. |
| ORA-WHATS-002 | P1 | Caixa de entrada multiatendente com atribuição à loja/vendedor | Mensagens e transferência auditadas. |
| ORA-WHATS-003 | P1 | Leads orgânicos e pagos identificados por origem consentida | Campanha e UTM preservados quando disponíveis. |
| ORA-WHATS-004 | P1 | Histórico 360 de conversas/negócios por cliente | Política de retenção/consentimento aplicada. |
| ORA-WHATS-005 | P1 | Respostas rápidas, etiquetas, SLA e repasse para humano | Handoff sempre acessível. |
| ORA-WHATS-006 | P1 | Templates e mensagens proativas em conformidade Meta | Sem spam nem envio sem permissão/consentimento apropriado. |
| ORA-WHATS-007 | P2 | IA supervisionada para qualificação e sugestão de respostas | Ações sensíveis exigem revisão e logs. |
| ORA-WHATS-008 | P2 | Recuperação de carrinho e pós-venda sob consentimento | Taxa de resposta/conversão mensurada. |

### META — Meta Ads e atribuição (etapa-base 11)

| ID | Prio. | Requisito | Critério objetivo de aceitação |
|---|---|---|---|
| ORA-META-001 | P1 | Importar insights autorizados de Meta Ads por conta/campanha | OAuth/scopes revisados; dados de custo e período auditáveis. |
| ORA-META-002 | P1 | Capturar UTM e origem de leads de site/WhatsApp | Jornada vincula campanha, oportunidade e venda quando possível. |
| ORA-META-003 | P1 | Mostrar gasto, CTR, CPC, CPL, CPA e ROAS quando calculáveis | Fórmulas, período e limitações explicitadas. |
| ORA-META-004 | P1 | Funil por vendedor/loja/campanha e atribuição | Dupla contagem/dedup de conversões minimizada. |
| ORA-META-005 | P2 | Conversions API/eventos com consentimento e dedupe | Sem rastrear dados sem base legal/autorização. |
| ORA-META-006 | P2 | Analisar margem e CAC por campanha | Distingue métrica estimada de valor liquidado. |

### AI — Inteligência artificial e análise (etapa-base 12)

| ID | Prio. | Requisito | Critério objetivo de aceitação |
|---|---|---|---|
| ORA-AI-001 | P1 | Painéis básicos e alertas desde o MVP | KPIs operacionais calculados de fatos transacionais. |
| ORA-AI-002 | P2 | IA auxilia atendimento e qualificação de leads | Base de conhecimento versionada, revisão e handoff. |
| ORA-AI-003 | P2 | IA sugere produtos, respostas e roteamento de cliente | Sem enviar informações sensíveis não autorizadas. |
| ORA-AI-004 | P2 | IA resume campanhas, metas e falhas operacionais | Valores e fonte verificáveis; sem inventar dados. |
| ORA-AI-005 | P2 | Autorização humana obrigatória para operações financeiras/fiscais | Auditoria de proposta/aprovador/execução. |
| ORA-AI-006 | P2 | Controle de custo por chamada de modelo e retenção | Orçamento configurável, logs redigidos e alertas. |
| ORA-AI-007 | P2 | Avaliação de qualidade e red-team de agentes | Testes de prompt injection e permissões aprovados. |

### REPORT — Gestão, BI e relatórios (etapa-base 7)

| ID | Prio. | Requisito | Critério objetivo de aceitação |
|---|---|---|---|
| ORA-REPORT-001 | P0 | Dashboard diretoria consolidado das 14 lojas | Filtro por período, loja, vendedor, natureza e status. |
| ORA-REPORT-002 | P0 | Dashboard gerente de loja: caixa, metas, aprovação de desconto/NF | Só dados autorizados; alertas com link ao fato original. |
| ORA-REPORT-003 | P0 | Dashboard vendedor mobile: produção do dia, metas e atalhos | Dados apenas do escopo autorizado. |
| ORA-REPORT-004 | P0 | Relatório de chips vendidos, ativações e recargas separadamente | Produção não implica faturamento tributável idêntico. |
| ORA-REPORT-005 | P0 | Relatório por método de pagamento e terminal PicPay | Distinção pagamento/pêndencia/liquidação/reconciliação. |
| ORA-REPORT-006 | P1 | Relatórios de margem, vendedor e ranking configurável | Comissão/estorno reconciliáveis. |
| ORA-REPORT-007 | P1 | Alertas de estoque mínimo/IMEI/caixa divergente/fiscal pendente | Notificação contextual e auditada. |
| ORA-REPORT-008 | P2 | Dashboard expansão nacional por marketplace, ads e canais | Receitas/fees/margens por canal. |

### QUAL — Segurança, qualidade, operação e compliance (etapa-base 1)

| ID | Prio. | Requisito | Critério objetivo de aceitação |
|---|---|---|---|
| ORA-QUAL-001 | P0 | CI, lint, typecheck, testes e code review obrigatórios | PR sem CI verde não libera merge. |
| ORA-QUAL-002 | P0 | RLS e autorização negada por padrão, testadas por loja | Testes positivos e negativos com dois vendedores/lojas. |
| ORA-QUAL-003 | P0 | Auditoria imutável de operações e aprovações críticas | Prova quem fez o quê e quando. |
| ORA-QUAL-004 | P0 | Segredos em ambientes seguros sem exposição no Git/cliente | Secret scanning e testes de configuração. |
| ORA-QUAL-005 | P0 | Backups e ensaio de restauração de banco e anexos | RPO/RTO definidos com responsável e evidência. |
| ORA-QUAL-006 | P0 | Observabilidade de erros, latência, filas e conciliação | Alertas e dashboards com dono e severidade. |
| ORA-QUAL-007 | P0 | Migrations versionadas, não destrutivas, testadas | Revisão humana e rollback/roll-forward preparados. |
| ORA-QUAL-008 | P0 | Plano de contingência para internet, pagamentos e fiscal | Equipe piloto sabe como operar com segurança. |
| ORA-QUAL-009 | P0 | Piloto com testes de usuário, caixa e fechamento diário | Critérios de go/no-go assinados. |
| ORA-QUAL-010 | P1 | Performance mobile e testes em dispositivos/internet reais | SLOs aprovados e comparados com resultado. |
| ORA-QUAL-011 | P1 | LGPD: bases legais, retenção, direitos do titular e minimização | Encarregado/jurídico revisa e aprova políticas. |
| ORA-QUAL-012 | P1 | Testes de carga, concorrência e disaster recovery | Sem venda/IMEI duplo, serviço retorna ao estado previsto. |
| ORA-QUAL-013 | P1 | Processo de resposta a incidentes e suporte às lojas | Playbook, contatos e rastreio de incidentes. |
| ORA-QUAL-014 | P2 | Análise de segurança periódica e monitoramento de dependências | Atualizações e vulnerabilidades triadas. |

## Checklist anti-omissão por requisito

Todo requisito entregue deverá ter, antes do fechamento:

- [ ] Referência a decisão/fluxo de negócio e responsável humano.
- [ ] ID, issue, prioridade e dependências explícitas.
- [ ] Contrato de entrada/saída, autorização de acesso e estados.
- [ ] Implementação server-side; UI e acessibilidade onde aplicável.
- [ ] Validação de erros, concorrência, reversão e idempotência onde relevante.
- [ ] Unit/integration/E2E tests adequados, cobertura de permissões e de impactos de loja.
- [ ] Logs/auditoria, segurança/LGPD, observabilidade e suporte.
- [ ] Referência de arquivos, migrations e contratos modificados.
- [ ] Evidência de homologação em staging/piloto e aceite humano para operações críticas.
- [ ] Registro de versão/release/rollback e monitoramento após implantação.

## Extensões e decisões pendentes

Consultar `docs/10_DECISOES_PENDENTES.md`; os nomes e tabelas acima são propostas e não autorizam migrations antes da definição dos processos reais.
