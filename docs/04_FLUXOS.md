# 04 — Jornadas, estados, exceções e trilhas de auditoria

Todos os fluxos são **especificações para validação**, não indicação de operação já implementada. Medidas e aprovações fiscais devem ser homologadas por especialistas.

## F01 — Login e seleção de loja
1. Usuário se autentica com sessão segura.
2. Backend consulta memberships vigentes; se uma loja, a seleciona; se múltiplas, oferece escolha autorizada.
3. Carrega menu e permissões conforme função e escopo; backend/RLS reconfirmam toda operação.
4. Em troca de loja, limpar estado sensível de PDV/caixa e exigir sessão de caixa apropriada.
5. Registro de acesso, alteração de loja e ações sensíveis em auditoria.
**Exceções:** conta bloqueada, sessão expirada, loja inativa, acesso negado, usuário com mais de um papel.

## F02 — Abertura de caixa
1. Vendedor/caixa autorizado abre sessão para loja/gaveta/terminal.
2. Informa saldo inicial físico e registra conferência.
3. Servidor impede abertura concorrente incompatível.
4. Ao operar: registrar suprimento, sangria, pagamentos, devoluções e ajustes conforme permissão.
5. Fechamento exige conferência de dinheiro e confronto com valores calculados, justificativa da diferença e eventual aprovação do gerente.
**Prova de aceite:** relatório caixa previsto vs contado vs recebimentos PicPay/cartão por status; ausência de dupla abertura.

## F03 — Venda presencial básica de smartphone com IMEI
1. Consultar/vincular cliente quando necessário.
2. Pesquisar produto por nome/SKU, selecionar IMEI **disponível na loja**.
3. Criar carrinho e reservar IMEI com expiração/lock; validar preço server-side.
4. Solicitar desconto dentro/fora de alçada; aprovar no próprio celular do gerente sem elevar privilégio do vendedor.
5. Selecionar um ou vários meios de pagamento.
6. Confirmar dinheiro manualmente conforme política; para pagamentos eletrônicos observar confirmação real ou comprovante e status pendente.
7. Concluir transação de acordo com contrato operacional; consumir reserva/baixar estoque, emitir recibo, criar evento de performance e fluxo fiscal associado. Aplicar compensação quando etapa externa falhar.
8. Cliente e vendedor veem recibos/status. Manager confere diário.
**Exceções:** IMEI simultaneamente selecionado por outro vendedor, desconto recusado, Pix não confirmado, timeout PicPay, troco, cartão recusado, serviço fiscal indisponível, cancelamento pós-pagamento.

## F04 — Venda combinada: smartphone + acessório + chip + ativação + recarga
1. Mesmo carrinho inclui 5 itens/ações de natureza comercial distintas e possivelmente documentos fiscais distintos.
2. Controle de estoque recebe smartphone/IMEI, acessório/quantidade e chip/ICCID.
3. Pagamentos mistos (exemplo: dinheiro + Pix PicPay + cartão) serão discriminados em N registros; total e comprovantes corretos.
4. Ativação da linha é enviada à Nogle **somente quando fluxo de contrato/regra permitir**, usando idempotência e identificação do cliente/chip.
5. Recarga usa operação telecom própria e confirmação externa.
6. Eventos de performance `PHONE_SALE`, `ACCESSORY_SALE`, `SIM_SALE`, `ACTIVATION_CONFIRMED`, `RECHARGE_CONFIRMED` devem ser gerados **uma vez**, a partir do status elegível de cada origem.
7. Financeiro diferencia valor de face da recarga, repasse à operadora e receita/comissão da Ora; descontos, impostos e taxas segundo política homologada.
8. Gestor vê quantidade, bruto, líquido, margem, metas e pendências por vendedor.
**Exceções:** venda física paga e ativação falhou: não marcar ativação como concluída, oferecer status, retorno de suporte e reprocessamento seguro sem ativar duas vezes; regras de devolução do chip/recarga dependem do contrato.

## F05 — Nota fiscal desde o celular + aprovação interna
1. No detalhe da venda, botão **Solicitar / Emitir nota** (rótulo final segundo política da loja).
2. Dados necessários pré-preenchidos de produto, cliente e loja; campos faltantes solicitados com clareza.
3. Backend calcula perfis fiscais por item/serviço/UF/CNPJ segundo matriz validada.
4. Se uma **política interna legítima** pedir revisão de gerente, criar fila com prazo, razão e trilha; **não bloquear indevidamente emissão legalmente obrigatória**. A arquitetura deve ter exceção/fluxo compulsório conforme revisão fiscal.
5. Adapter do provedor fiscal cria, consulta e recebe autorização/rejeição. Exibir status real, protocolo/documento e reprocessamento/contingência.
6. Cancelamento/devolução gera eventos relacionados, nunca apaga documento anterior.
**Exceções:** CPF inválido, cliente ausente, provedor indisponível, rejeição SEFAZ/municipal/serviço competente, NFCom para telecom quando aplicável, múltiplos documentos em venda mista, timeout pós-autorização (consultar antes de reenviar).

## F06 — Conferência estoque e transferência entre lojas
1. Gerente inicia transferência: lote/IMEI da loja A para B.
2. Estoque A tem reserva e movimento de saída para trânsito; B ainda não deve vender unidade não recebida.
3. Gerente B confere IMEI/quantidade, registra divergências e aceita recebimento.
4. Reconciliar trânsito, custos e histórico; aprovação para ajustes.
**Exceções:** extravio, duplicidade de IMEI, divergência, cancelamento da transferência em trânsito.

## F07 — Contatos de Meta Ads/WhatsApp até venda
1. Lead chega de anúncio/orgânico; guardar origem/UTM e consentimento legalmente adequado.
2. WhatsApp recebe conversa autorizada (API oficial), cria/vincula contato, atribui vendedor/loja segundo regra.
3. IA pode sugerir resposta, classificar intenção e recomendar produtos **sob guardrails**, com handoff humano.
4. Vendedor gera oportunidade, consulta disponibilidade e conclui venda presencial ou online.
5. Atribuir conversão dentro das limitações do canal; não duplicar clientes/conversões; permitir análise custo→lead→venda→margem.
**Exceções:** sem consentimento/opt-out, janela e templates Meta, erro API, contato em duas lojas, atribuição incerta, respostas de IA indevidas.

## F08 — Marketplace → pedido → estoque → expedição → conciliação
1. Adapter recebe pedido com `provider + account + external_order_id` e deduplica notificação.
2. Mapeia SKU e loja/local de fulfillment, reserva quantidade/IMEI real.
3. Confirma status e pagamento somente com dados oficiais; emite documentos aplicáveis, cria separação e envio.
4. Concilia taxas, frete, subsídios, repasse e devolução.
5. Atualiza estoque físico e disponibilidade de canais; pedido externo preserva ID próprio.
**Exceções:** webhook repetido, cancelamento antes/depois de expedição, estoque esgotado em outra loja, parcial, reembolso/chargeback.

## F09 — Meta, bonificação e fechamento do vendedor
1. Evento comercial elegível entra em `performance_events` de forma idempotente.
2. O motor lê regra de metas/comissão **versionada, vigente no momento definido pela política**.
3. Calcula quantidade, pontos, margem e valor; consulta estornos/cancelamentos, inadimplência quando aplicável.
4. Vendedor vê extrato e gestor consolida por loja, região, categoria e período.
5. Financeiro confere e aprova pagamento de bônus quando previsto.
**Exceções:** troca de loja no mês, venda compartilhada, estorno posterior, ativação não confirmada, mudança de regra retroativa, disputas.

## F10 — Cadastro, contratação e recarga digital Ora Connect
1. Landing page/WhatsApp recebe interessado em plano; coleta apenas dados necessários, informa privacidade e cobertura verificável.
2. CRM cria lead; cliente seleciona plano e método de pagamento segundo oferta homologada.
3. Confirmações, documentos e autorização de contratação seguem Nogle e normas; integrações só após contrato API verificado.
4. Em caso de sucesso, registrar linha/contrato/status externo e eventos de performance; em falha, manter pedido rastreável, pendente ou reembolsável conforme regra.
5. Pós-venda e suporte via CRM/WhatsApp.
**Exceções:** cobertura não confirmada, duplicidade de linha, falha Nogle, portabilidade, consentimento, expedição de SIM, recarga para número errado.

## F11 — Recuperação e contingência
- Cai internet na loja: interromper confirmação eletrônica não verificada; aplicar SOP de contingência, nunca afirmar pagamento confirmado ou NF autorizada sem prova.
- Recebe webhook duplicado: dedup por provider/event ID; ack e registro de já processado.
- Envia requisição, timeout, provedor conclui sem resposta: consultar estado remoto antes de repetir operação sensível.
- Banco falha entre etapas locais: transação e outbox preservam invariantes; processo de recuperação repetível.
- Gerente nega desconto: venda volta a estado editável ou encerrada sem efeitos de estoque definitivos.
- Devolução após bônus pago: gerar evento de ajuste e relatório de pendências, sem apagar evento original.
