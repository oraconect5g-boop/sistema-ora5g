# Matriz atual dos 179 requisitos

Checkpoint de `89927dc2a82f07cfd5a04fcee503d307ac1037f6`. Estados declarados pelo projeto, não homologação independente. A matriz histórica preserva notas/evidências extensas; esta tabela atualiza todos os IDs e seus aceites, sem excluir nenhum. Ver [atualização](ATUALIZACAO_2026-11-16.md) e [aceites adicionais](ADENDO_LOJA_CANAIS_E_PUBLICACAO.md).

62 testados em desenvolvimento; 70 parciais; 42 não iniciados; 3 bloqueados; 2 restrições respeitadas; 0 homologados.

Para cada ID o executor deve preencher separadamente configuração, testes, publicação no domínio e jornada homologada. O CI aprovado é do conjunto e não comprova API externa em cada linha.

| ID | Prioridade | Requisito | Aceite original | Estado declarado |
|---|---|---|---|---|
| ORA-ORG-001 | P0 | Cadastrar empresa, organização, 11 lojas comerciais, o local DEFEITOS e a loja piloto (meta de 14 lojas) | Usuários autorizados selecionam unidade; IDs e dados fiscais coerentes. | parcial |
| ORA-ORG-002 | P0 | Associar usuários a uma ou múltiplas lojas com função e vigência | Bloqueio testado para loja sem vínculo. | parcial |
| ORA-ORG-003 | P0 | Gerir perfis diretoria, regional, gerente, vendedor, financeiro, fiscal, marketing e atendimento | Matriz de autorização versionada e auditada. | parcial |
| ORA-ORG-004 | P0 | Isolar dados por loja na API e PostgreSQL/RLS | Testes de acesso cruzado e negação por ID arbitrário. | parcial |
| ORA-ORG-005 | P0 | Histórico de alterações de papéis, políticas e configurações | Auditoria identifica ator, horário, alvo e motivo. | testado |
| ORA-ORG-006 | P0 | Login, recuperação de conta e revogação de sessão | Acessos revogados deixam de funcionar; mensagens neutras. | parcial |
| ORA-ORG-007 | P1 | Autenticação reforçada para perfis privilegiados | MFA e política de sessão validados com segurança. | parcial |
| ORA-ORG-008 | P1 | Configurar horários, endereços, caixas e dados fiscais por loja | Mudanças versionadas com regras de vigência. | testado |
| ORA-ORG-009 | P1 | Gerir unidades regionais, grupos e metas agregadas | Relatórios respeitam hierarquia de acesso. | testado |
| ORA-ORG-010 | P2 | Preparar multi-CNPJ/UF para expansão física nacional | Vínculos fiscais e locais operam sem dados globais hard-coded. | parcial |
| ORA-CAT-001 | P0 | Cadastrar categorias, marcas, produtos, variantes e SKUs | SKU interno identificado e único no escopo definido. | testado |
| ORA-CAT-002 | P0 | Importar produtos e preços da Rein somente por CSV/XLSX | Prévia, validação, relatório de erro, confirmação e rollback lógico. | parcial |
| ORA-CAT-003 | P0 | Não consumir API Rein em nenhuma operação diária | Nenhum módulo de runtime depende de rede/credencial Rein. | respeitado |
| ORA-CAT-004 | P0 | Cadastrar preços vigentes por loja/canal conforme regra | Preço final tem origem explicável e histórico. | testado |
| ORA-CAT-005 | P0 | Diferenciar smartphone, acessório, chip e serviço comercial | Tipos exigem campos apropriados sem tabelas isoladas de venda. | testado |
| ORA-CAT-006 | P0 | Pesquisar por nome, SKU e, quando aplicável, IMEI/ICCID | Busca rápida funciona no celular sem leitor. | testado |
| ORA-CAT-007 | P1 | Programar vigência de promoções e campanhas comerciais | Preço aplicado respeita período e autorização. | testado |
| ORA-CAT-008 | P1 | Custo de produto/lote/entrada e margem gerencial | Custo histórico de venda não muda retroativamente. | testado |
| ORA-CAT-009 | P1 | Canais externos usam mapeamento de SKU e IDs próprios | Identificadores externos não substituem PK interna. | testado |
| ORA-CAT-010 | P2 | Permitir importação assistida em lote de fotos/atributos | Erros não criam duplicatas nem sobrescritas silenciosas. | testado |
| ORA-CAT-011 | P0 | Exigir foto principal por produto e imagem própria para variantes visualmente diferentes | Todos os produtos do catálogo piloto têm foto correspondente; busca, estoque e PDV exibem foto com nome/SKU e ampliação no celular; ausência de imagem é pendência, não foto genérica aceita. | parcial |
| ORA-INV-001 | P0 | Manter disponibilidade por loja e localização física | Reserva/venda nunca usa saldo de outra loja sem transferência. | parcial |
| ORA-INV-002 | P0 | Identificar aparelho por IMEI/serial e impedir venda duplicada | Concorrência e unique indexes bloqueiam duplicidade. | testado |
| ORA-INV-003 | P0 | Registrar cada entrada/saída em livro auditável de estoque | Saldo reconciliável com movimentos e motivos. | testado |
| ORA-INV-004 | P0 | Receber estoque inicial validado por contagem real | Divergências e aprovadores ficam registrados. | parcial |
| ORA-INV-005 | P0 | Reservar estoque durante checkout e liberar em expiração/cancelamento | Concorrência entre caixas e canais não vende duas vezes. | parcial |
| ORA-INV-006 | P0 | Bloquear venda de IMEI indisponível/transferido/reservado | Mensagem operacional clara e sem mutações parciais. | testado |
| ORA-INV-007 | P1 | Transferência entre lojas com trânsito/recebimento | Origem e destino confirmam quantidades e divergências. | testado |
| ORA-INV-008 | P1 | Inventário cíclico e ajuste com aprovação | Trilha permite reconstruir antes/depois e justificativa. | testado |
| ORA-INV-009 | P1 | Compras e recebimento de fornecedores | Pedido, nota/entrega, custo e entrada identificáveis. | testado |
| ORA-INV-010 | P1 | Histórico de reparo/devolução e condição de unidade | Produto retornado não reaparece automaticamente como novo. | testado |
| ORA-INV-011 | P1 | Controle de ICCID de chip físico quando exigido | ICCID não é atribuído a duas ativações incompatíveis. | parcial |
| ORA-INV-012 | P2 | Transferência para CD e alocação futura a canais nacionais | Apropriação de localização e logística auditável. | parcial |
| ORA-CRM-001 | P0 | Cadastro de cliente com dados mínimos e finalidade | Dados obrigatórios dependem da operação; LGPD documentada. | testado |
| ORA-CRM-002 | P0 | Relacionar cliente às compras/IMEIs/chips/linhas e atendimentos | Perfil 360 apresenta histórico autorizado por loja/função. | parcial |
| ORA-CRM-003 | P0 | Pesquisar cliente por identificadores protegidos | Resultados evitam expor CPF desnecessariamente. | testado |
| ORA-CRM-004 | P0 | Registrar lead, origem, atendente, vendedor responsável e etapa | Funil mostra histórico e próximo passo. | testado |
| ORA-CRM-005 | P1 | Atividades, lembretes, follow-up e motivos de perda | Histórico com autor e vencimento. | testado |
| ORA-CRM-006 | P1 | Detecção e mesclagem controlada de cadastros duplicados | Não perde compras/documentos; operação auditável. | testado |
| ORA-CRM-007 | P1 | Registros de consentimento/preferência de comunicação | Retirada afeta automações e respeita obrigações. | parcial |
| ORA-CRM-008 | P1 | Contratos/anexos de venda, garantia, financiamento e telecom | Acesso, assinatura, guarda e retenção adequados. | parcial |
| ORA-CRM-009 | P1 | Histórico omnichannel de compras físicas/online | Pedido externo e venda vinculados sem sobrescrever origem. | parcial |
| ORA-CRM-010 | P2 | Segmentação comercial e valor de vida do cliente | Segmentos minimizam dados e são explicáveis. | testado |
| ORA-POS-001 | P0 | Efetuar venda completa em celular sem notebook | E2E em smartphone real da loja piloto. | parcial |
| ORA-POS-002 | P0 | Busca rápida por nome/SKU/IMEI e carrinho responsivo | Usabilidade e velocidade validadas com vendedor. | parcial |
| ORA-POS-003 | P0 | Itens mistos em venda: aparelho, acessório, chip, ativação, recarga | Itens mantêm natureza e regras próprias sem dupla contabilização. | parcial |
| ORA-POS-004 | P0 | Selecionar IMEI físico disponível antes de concluir | Reserva e baixa atomizadas no banco. | testado |
| ORA-POS-005 | P0 | Calcular preço/desconto e totais server-side | Cliente não consegue alterar preço enviado. | testado |
| ORA-POS-006 | P0 | Solicitar aprovação do gerente para desconto acima do limite | Aprovador, limite, motivo, prazo e decisão auditáveis. | testado |
| ORA-POS-007 | P0 | Suportar múltiplos pagamentos na mesma venda | Soma, troco, confirmação e estorno consistentes. | testado |
| ORA-POS-008 | P0 | Vincular venda a vendedor, loja, cliente quando aplicável e canal | Atribuição preservada em todas as consultas. | testado |
| ORA-POS-009 | P0 | Consultar status e comprovantes sem concluir pagamento pendente | Vendedor vê pendência e ação de reprocessamento segura. | parcial |
| ORA-POS-010 | P0 | Cancelar e devolver sem apagar origem | Reversão reflexa em estoque, pagamentos, fiscal e comissões. | parcial |
| ORA-POS-011 | P0 | Gerar solicitação fiscal a partir da venda em poucos toques | Vendedor não precisa escolher documento fiscal incorreto. | testado |
| ORA-POS-012 | P1 | Troca com diferença de preço e meios de pagamento | Histórico e estoque correto na devolução/saída. | testado |
| ORA-POS-013 | P1 | Venda parcelada/PayJoy/boleto por fluxo homologado | Etapas reais, aprovação e termos exigidos. | parcial |
| ORA-POS-014 | P1 | Aplicar campanhas, combos e regras por loja | Persistência da regra aplicada para auditoria. | parcial |
| ORA-POS-015 | P1 | Atalhos para supervisor e estados offline/sem rede | Sem venda presumida como concluída sem confirmação. | parcial |
| ORA-POS-016 | P2 | Entrada por leitor USB/Bluetooth ou câmera | Sem mudança na regra central de busca/checkout. | parcial |
| ORA-PAY-001 | P0 | Registrar dinheiro, Pix direto, Pix PicPay POS e cartões | Provider, terminal, método e comprovante quando disponível. | parcial |
| ORA-PAY-002 | P0 | Suportar financiamento, boleto, parcelamento e pagamentos online | Estados e elegibilidade definidos por integração específica. | parcial |
| ORA-PAY-003 | P0 | Diferenciar autorizado, pago, liquidado, estornado e conciliado | Relatórios não misturam venda com dinheiro recebido. | parcial |
| ORA-PAY-004 | P0 | Abrir caixa com saldo inicial e responsável | Uma sessão ativa segundo regra por gaveta/terminal. | testado |
| ORA-PAY-005 | P0 | Registrar sangria, suprimento, reforço, devolução e saída autorizada | Cada movimento tem motivo, autor e impacto no saldo. | testado |
| ORA-PAY-006 | P0 | Fechar caixa com valor contado e diferença | Gerente confere e aprova divergência. | testado |
| ORA-PAY-007 | P0 | Conciliação manual PicPay POS usando referência/comprovante | Sem API não se presume liquidação automática. | parcial |
| ORA-PAY-008 | P0 | Evitar confirmação duplicada via webhook/retry | Constraints de evento externo e idempotency key. | parcial |
| ORA-PAY-009 | P1 | Importar extratos de adquirente/banco por arquivo validado | Linhas conciliadas, discrepâncias e taxas reportadas. | nao_iniciado |
| ORA-PAY-010 | P1 | Reconciliar taxas, parcelas e datas de repasse | Venda bruta vs líquido recebido visíveis. | nao_iniciado |
| ORA-PAY-011 | P1 | Gerir chargebacks, estornos, antecipação e ajustes | Efeito financeiro e comissão não duplicado. | parcial |
| ORA-PAY-012 | P1 | Permitir múltiplas maquininhas/provedores por loja | Terminal tem identificação e escopo correto. | testado |
| ORA-PAY-013 | P2 | Integração automática com PicPay POS se API contratual confirmada | Contrato, autenticação, eventos e homologação aprovados. | nao_iniciado |
| ORA-PAY-014 | P2 | Pix/checkout web e links por provedores validados | Confirmação no backend antes de fulfill/baixa definitiva. | nao_iniciado |
| ORA-FIN-001 | P0 | Resumo diário de vendas x recebimentos x produção comercial | Categorias e status reconciliáveis. | parcial |
| ORA-FIN-002 | P0 | DRE/margem gerencial com custo, taxa e desconto | Números não são apresentados como contabilidade formal auditada. | parcial |
| ORA-FIN-003 | P0 | Contas a receber ligadas a venda, vencimento e meio | Aging e status dependem de confirmação. | parcial |
| ORA-FIN-004 | P0 | Contas a pagar ligadas a fornecedor/origem | Vencimentos e responsabilidades autorizadas. | testado |
| ORA-FIN-005 | P0 | Rastrear recebíveis e repasses por loja/adquirente | Diferenças e pendências visíveis ao financeiro. | testado |
| ORA-FIN-006 | P1 | Conciliação bancária e contas multiempresa | Imports/matches reproduzíveis com aprovação. | nao_iniciado |
| ORA-FIN-007 | P1 | Gestão de inadimplência e cobranças autorizadas | Ações e consentimentos com auditoria. | nao_iniciado |
| ORA-FIN-008 | P1 | Relatório financeiro consolidado por loja/região/rede | RBAC respeita visão global vs local. | testado |
| ORA-FIN-009 | P1 | Exportações CSV/XLSX/PDF de relatórios autorizados | Filtros e dados sensíveis protegidos. | testado |
| ORA-FIN-010 | P2 | Previsão de fluxo de caixa e simulações | Premissas explicadas e separadas de fatos. | testado |
| ORA-PERF-001 | P0 | Contar individualmente aparelhos, acessórios, chips, ativações e recargas | Painel por vendedor/loja/período sem duplicidade. | parcial |
| ORA-PERF-002 | P0 | Registrar performance_event único por origem/ação confirmada | Retries de API não criam duas bonificações. | testado |
| ORA-PERF-003 | P0 | Distinguir quantidade, valor bruto, margem, receita elegível e comissão | Extrato explica cálculo de cada evento. | testado |
| ORA-PERF-004 | P0 | Definir meta por vendedor, loja, categoria e período | Alteração não reescreve resultado histórico. | parcial |
| ORA-PERF-005 | P0 | Painel do gestor mostra metas e resultados da equipe | Filtragem loja e perfil aplicada no servidor. | parcial |
| ORA-PERF-006 | P1 | Regras de bonificação por categoria/campanha/margem/escala | Edição versionada e período de vigência. | testado |
| ORA-PERF-007 | P1 | Ajustar comissão por cancelamento/devolução conforme regra | Comprovante de origem e reversão sem apagar histórico. | testado |
| ORA-PERF-008 | P1 | Apurar e aprovar fechamento de bonificação | Totais detalhados, contestação e trilha de aprovação. | testado |
| ORA-PERF-009 | P1 | Metas coletivas/regional e rankings configuráveis | Desempate transparente e autorização adequada. | parcial |
| ORA-PERF-010 | P2 | IA recomenda campanhas/metas com aprovação humana | Sem alterar remuneração automaticamente. | nao_iniciado |
| ORA-FISC-001 | P0 | Solicitar nota diretamente da venda no celular | Fluxo intuitivo e prefill de dados necessários. | testado |
| ORA-FISC-002 | P0 | Fluxo interno de aprovação de solicitações pelo gestor conforme política | Auditoria sem impedir obrigação legal de emissão. | testado |
| ORA-FISC-003 | P0 | Identificar perfil fiscal por produto/serviço/UF/CNPJ | Regras homologadas com contador/especialista. | bloqueado |
| ORA-FISC-004 | P0 | Integrar provedor fiscal homologado para documento correto | Estados emitido/autorizado/rejeitado/contingência claros. | bloqueado |
| ORA-FISC-005 | P0 | Guardar chave, protocolo, referência e evidências legais com segurança | Controle de acesso e retenção definidos. | parcial |
| ORA-FISC-006 | P0 | Tratar falha fiscal, reprocesso, contingência e cancelamento | Nenhum documento duplicado nem venda marcada indevidamente. | parcial |
| ORA-FISC-007 | P1 | Mapear cenários NF-e/NFC-e/NFS-e/NFCom conforme natureza | Matriz validada por contador com decisões por UF e operação. | nao_iniciado |
| ORA-FISC-008 | P1 | Conciliação fiscal de vendas, tributos e documentos | Pendências e divergências alertadas. | parcial |
| ORA-FISC-009 | P1 | Devolução, troca, cancelamento e correção fiscal | Fluxos e prazos homologados com fiscal. | parcial |
| ORA-FISC-010 | P2 | Multi-UF/multi-CNPJ e reforma tributária preparada | Alterações versionadas e conformes à norma vigente. | nao_iniciado |
| ORA-CONNECT-001 | P0 | Cadastrar e vender chip físico ligado ao estoque e vendedor | Unidade/ICCID e venda reconciliáveis. | testado |
| ORA-CONNECT-002 | P0 | Separar evento de venda de chip do evento de ativação | Quantidades, status, valor e comissão independentes. | testado |
| ORA-CONNECT-003 | P0 | Separar recarga como operação telecom com status próprio | Total pago e valor repassado/receita reconhecida não confundidos. | parcial |
| ORA-CONNECT-004 | P0 | Registrar Nogle como integração externa por adapter | Sem endpoint presumido; contrato deve vir dos docs autenticados. | testado |
| ORA-CONNECT-005 | P0 | Refletir ativação somente após resposta verificada da Nogle | Falhas ficam pendentes/revisão sem gerar sucesso falso. | testado |
| ORA-CONNECT-006 | P0 | Atribuir performance de ativação/recarga ao vendedor de origem | Evento idempotente e elegibilidade transparente. | testado |
| ORA-CONNECT-007 | P1 | Consulta/atualização de linha e plano conforme API disponível | Permissão e rate limit respeitados. | parcial |
| ORA-CONNECT-008 | P1 | Portabilidade, contrato e venda de plano conforme contrato | Jornada e documentos homologados. | parcial |
| ORA-CONNECT-009 | P1 | Reconciliar repasses/bonificações Nogle e operação local | Divergências rastreáveis e reversão segura. | nao_iniciado |
| ORA-CONNECT-010 | P1 | Recuperar falha de rede com reconsulta sem reativação duplicada | Idempotência/reconciliação externa aprovadas. | testado |
| ORA-CONNECT-011 | P2 | eSIM, contratação digital e entrega de chip nacional | Implementar somente se Nogle suportar e acordo permitir. | parcial |
| ORA-ONLINE-001 | P1 | Site de aparelhos, acessórios e planos Ora Connect | Catálogo e estoque centralizados; não criar outro sistema de venda. | parcial |
| ORA-ONLINE-002 | P1 | Carrinho/checkout online e pedido com status | Pagamento confirmado antes de liberar fulfillment. | nao_iniciado |
| ORA-ONLINE-003 | P1 | Atribuir origem online, campanhas e vendedor quando aplicável | Sem atribuição indevida ou dupla comissão. | nao_iniciado |
| ORA-ONLINE-004 | P1 | Frete, CEP, retirada em loja e entrega com rastreio | Reserva e prazos consistentes. | parcial |
| ORA-ONLINE-005 | P1 | Devolução, arrependimento e reembolso de venda online | Prazo/regra legal homologado e efeitos auditados. | nao_iniciado |
| ORA-ONLINE-006 | P1 | Reserva de IMEI por pedido/canal anti-overselling | Pedido online concorrente com loja não vende unidade duplicada. | parcial |
| ORA-ONLINE-007 | P2 | Contratação online de planos/chips/eSIM se habilitado | Validação de identidade/contrato, antifraude e cobertura. | nao_iniciado |
| ORA-ONLINE-008 | P2 | Expansão interestadual com parâmetros fiscais e logísticos | Multi-UF testado antes da abertura nacional. | nao_iniciado |
| ORA-MKTPL-001 | P1 | Preparar adaptadores separados Mercado Livre/Shopee/TikTok Shop | Contratos e permissões confirmados antes do deploy. | nao_iniciado |
| ORA-MKTPL-002 | P1 | Sincronizar SKU/preço/estoque/anúncio conforme recursos | Evitam overselling e divergência detectável. | nao_iniciado |
| ORA-MKTPL-003 | P1 | Importar pedido marketplace com ID externo e dedupe | Reenvio de webhook não duplica pedido/reserva. | nao_iniciado |
| ORA-MKTPL-004 | P1 | Tratar entrega/frete/etiquetas/rastreio por canal | Estados de fulfillment corretos e não inventados. | nao_iniciado |
| ORA-MKTPL-005 | P1 | Conciliação de tarifas, comissões e repasses por marketplace | Lucratividade por pedido/canal explicável. | nao_iniciado |
| ORA-MKTPL-006 | P1 | Cancelamentos, devoluções e reembolsos por canal | Estoque/financeiro/fiscal/commission reversos. | nao_iniciado |
| ORA-MKTPL-007 | P2 | Sincronização near-real-time por webhooks/adapters | Rate limits/retries monitorados. | nao_iniciado |
| ORA-MKTPL-008 | P2 | Métricas por anúncio/canal/produto e margem | Valores reconciliados sem confundir receita bruta com líquida. | nao_iniciado |
| ORA-WHATS-001 | P1 | WhatsApp Business Platform oficial conectado ao CRM | Conta/números/escopos homologados; templates válidos. | bloqueado |
| ORA-WHATS-002 | P1 | Caixa de entrada multiatendente com atribuição à loja/vendedor | Mensagens e transferência auditadas. | nao_iniciado |
| ORA-WHATS-003 | P1 | Leads orgânicos e pagos identificados por origem consentida | Campanha e UTM preservados quando disponíveis. | nao_iniciado |
| ORA-WHATS-004 | P1 | Histórico 360 de conversas/negócios por cliente | Política de retenção/consentimento aplicada. | nao_iniciado |
| ORA-WHATS-005 | P1 | Respostas rápidas, etiquetas, SLA e repasse para humano | Handoff sempre acessível. | nao_iniciado |
| ORA-WHATS-006 | P1 | Templates e mensagens proativas em conformidade Meta | Sem spam nem envio sem permissão/consentimento apropriado. | parcial |
| ORA-WHATS-007 | P2 | IA supervisionada para qualificação e sugestão de respostas | Ações sensíveis exigem revisão e logs. | nao_iniciado |
| ORA-WHATS-008 | P2 | Recuperação de carrinho e pós-venda sob consentimento | Taxa de resposta/conversão mensurada. | nao_iniciado |
| ORA-META-001 | P1 | Importar insights autorizados de Meta Ads por conta/campanha | OAuth/scopes revisados; dados de custo e período auditáveis. | nao_iniciado |
| ORA-META-002 | P1 | Capturar UTM e origem de leads de site/WhatsApp | Jornada vincula campanha, oportunidade e venda quando possível. | nao_iniciado |
| ORA-META-003 | P1 | Mostrar gasto, CTR, CPC, CPL, CPA e ROAS quando calculáveis | Fórmulas, período e limitações explicitadas. | nao_iniciado |
| ORA-META-004 | P1 | Funil por vendedor/loja/campanha e atribuição | Dupla contagem/dedup de conversões minimizada. | nao_iniciado |
| ORA-META-005 | P2 | Conversions API/eventos com consentimento e dedupe | Sem rastrear dados sem base legal/autorização. | nao_iniciado |
| ORA-META-006 | P2 | Analisar margem e CAC por campanha | Distingue métrica estimada de valor liquidado. | nao_iniciado |
| ORA-AI-001 | P1 | Painéis básicos e alertas desde o MVP | KPIs operacionais calculados de fatos transacionais. | testado |
| ORA-AI-002 | P2 | IA auxilia atendimento e qualificação de leads | Base de conhecimento versionada, revisão e handoff. | nao_iniciado |
| ORA-AI-003 | P2 | IA sugere produtos, respostas e roteamento de cliente | Sem enviar informações sensíveis não autorizadas. | nao_iniciado |
| ORA-AI-004 | P2 | IA resume campanhas, metas e falhas operacionais | Valores e fonte verificáveis; sem inventar dados. | nao_iniciado |
| ORA-AI-005 | P2 | Autorização humana obrigatória para operações financeiras/fiscais | Auditoria de proposta/aprovador/execução. | respeitado |
| ORA-AI-006 | P2 | Controle de custo por chamada de modelo e retenção | Orçamento configurável, logs redigidos e alertas. | nao_iniciado |
| ORA-AI-007 | P2 | Avaliação de qualidade e red-team de agentes | Testes de prompt injection e permissões aprovados. | nao_iniciado |
| ORA-REPORT-001 | P0 | Dashboard diretoria consolidado de todas as lojas (11 hoje; meta de 14) | Filtro por período, loja, vendedor, natureza e status. | parcial |
| ORA-REPORT-002 | P0 | Dashboard gerente de loja: caixa, metas, aprovação de desconto/NF | Só dados autorizados; alertas com link ao fato original. | parcial |
| ORA-REPORT-003 | P0 | Dashboard vendedor mobile: produção do dia, metas e atalhos | Dados apenas do escopo autorizado. | parcial |
| ORA-REPORT-004 | P0 | Relatório de chips vendidos, ativações e recargas separadamente | Produção não implica faturamento tributável idêntico. | testado |
| ORA-REPORT-005 | P0 | Relatório por método de pagamento e terminal PicPay | Distinção pagamento/pêndencia/liquidação/reconciliação. | parcial |
| ORA-REPORT-006 | P1 | Relatórios de margem, vendedor e ranking configurável | Comissão/estorno reconciliáveis. | parcial |
| ORA-REPORT-007 | P1 | Alertas de estoque mínimo/IMEI/caixa divergente/fiscal pendente | Notificação contextual e auditada. | testado |
| ORA-REPORT-008 | P2 | Dashboard expansão nacional por marketplace, ads e canais | Receitas/fees/margens por canal. | nao_iniciado |
| ORA-QUAL-001 | P0 | CI, lint, typecheck, testes e code review obrigatórios | PR sem CI verde não libera merge. | parcial |
| ORA-QUAL-002 | P0 | RLS e autorização negada por padrão, testadas por loja | Testes positivos e negativos com dois vendedores/lojas. | parcial |
| ORA-QUAL-003 | P0 | Auditoria imutável de operações e aprovações críticas | Prova quem fez o quê e quando. | testado |
| ORA-QUAL-004 | P0 | Segredos em ambientes seguros sem exposição no Git/cliente | Secret scanning e testes de configuração. | parcial |
| ORA-QUAL-005 | P0 | Backups e ensaio de restauração de banco e anexos | RPO/RTO definidos com responsável e evidência. | parcial |
| ORA-QUAL-006 | P0 | Observabilidade de erros, latência, filas e conciliação | Alertas e dashboards com dono e severidade. | parcial |
| ORA-QUAL-007 | P0 | Migrations versionadas, não destrutivas, testadas | Revisão humana e rollback/roll-forward preparados. | testado |
| ORA-QUAL-008 | P0 | Plano de contingência para internet, pagamentos e fiscal | Equipe piloto sabe como operar com segurança. | parcial |
| ORA-QUAL-009 | P0 | Piloto com testes de usuário, caixa e fechamento diário | Critérios de go/no-go assinados. | nao_iniciado |
| ORA-QUAL-010 | P1 | Performance mobile e testes em dispositivos/internet reais | SLOs aprovados e comparados com resultado. | parcial |
| ORA-QUAL-011 | P1 | LGPD: bases legais, retenção, direitos do titular e minimização | Encarregado/jurídico revisa e aprova políticas. | parcial |
| ORA-QUAL-012 | P1 | Testes de carga, concorrência e disaster recovery | Sem venda/IMEI duplo, serviço retorna ao estado previsto. | parcial |
| ORA-QUAL-013 | P1 | Processo de resposta a incidentes e suporte às lojas | Playbook, contatos e rastreio de incidentes. | parcial |
| ORA-QUAL-014 | P2 | Análise de segurança periódica e monitoramento de dependências | Atualizações e vulnerabilidades triadas. | parcial |
| ORA-OS-001 | P1 | Abrir OS obrigatória para todo aparelho de cliente que entra (até limpeza), com cliente, IMEI, defeito, estado, fotos e acessórios deixados (custódia) | Nenhum aparelho de cliente fica na loja sem OS numerada; fotos e acessórios registrados; isolamento por loja; auditoria. | testado |
| ORA-OS-002 | P1 | Registrar saída para o técnico central e retorno à loja (custódia em trânsito) | A posição do aparelho (loja, em trânsito, técnico, de volta) é conhecida a qualquer momento; parado além do prazo vira alerta ao dono. | parcial |
| ORA-OS-003 | P1 | Orçamento do técnico dentro da OS (diagnóstico, peças, valor), com histórico | O orçamento sai do grupo de WhatsApp e fica na OS; técnico só vê e orça as próprias OS (T12 do teste de acesso). | testado |
| ORA-OS-004 | P1 | Aprovação ou recusa do orçamento pelo cliente, registrada | Nada é executado sem a resposta do cliente registrada (canal e momento); recusa encerra com devolução. | testado |
| ORA-OS-005 | P1 | Avisos ao cliente e ao técnico (comprovante, orçamento, aparelho pronto, entrega) | Botão que abre o WhatsApp com a mensagem pronta até a API oficial; depois, envio pela API oficial com consentimento; sem automação não oficial. | parcial |
| ORA-OS-006 | P1 | Entrega com cobrança pelo PDV e produção do vendedor; peças só saem do estoque ligadas a uma OS | Serviço cobrado na venda conta uma vez na produção; peça consumida sem OS aparece como divergência; relatórios de OS sem venda, por vendedor, tempo de conserto e peças × serviços. | testado |

## Pontos que impedem interpretar a tabela como conclusão

- ONLINE-002 não iniciado; ONLINE-001/004/006 parciais. Reserva não é checkout.
- Os oito MKTPL e seis META permanecem não iniciados. Mapeamento de SKU não equivale a integração.
- #101/#102 são defeitos novos reproduzidos. Aceites originais de fiscal/reservas continuam exigindo revisão.
- Lojas/usuários/estoque e credenciais não estão completos só porque existe código de cadastro.
- A01–A20 detalham IDs existentes e não alteram silenciosamente o denominador 179.
- E-mail sempre opcional, 11 lojas + DEFEITOS, bônus mensal, fotos, Nogle oficial e publicação real/demo seguem as decisões atuais, mesmo quando a redação histórica exigir reconciliação.
