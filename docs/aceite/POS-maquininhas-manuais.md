# PDV: pagamento manual por maquininha

Em **Pagamentos → Maquininhas**, cadastre o terminal físico na loja e escolha PicPay, Mercado Pago ou PagBank (legado). Nenhum terminal, integração, credencial ou dado de produção é criado pela migração.

No PDV, adicione crédito, débito ou Pix na maquininha e selecione o terminal. No cartão, informe a bandeira. Digite o NSU ou código do comprovante. A venda só registra o pagamento que o terminal já aprovou: o PDV não inicia nem confirma transações junto aos provedores. O Pix direto e o cartão/Pix automáticos da Asaas conservam seus fluxos.

- Simp: crédito exclusivamente no Mercado Pago, no máximo 6x. Não há uma regra de juros cadastrada para a Simp. Se o terminal realmente cobrar um total diferente, registre o total mostrado.
- Outras bandeiras: créditos até 12x sem juros; de 13x a 18x informe o total maior que o principal mostrado pelo terminal. Acima de 18x é recusado. Débito: uma parcela, sem acréscimo.
- Numa venda mista, cada linha guarda a forma, a maquininha (ID), a modalidade, a bandeira, as parcelas e a referência aplicáveis. “É a entrada da PayJoy ou da Aiva” mantém a finalidade dessa linha, sem mudar as regras das financeiras.
- O valor da linha é o principal da venda. A diferença entre o total da maquininha e o principal fica em `venda_pagamentos.acrescimo_cliente_centavos`. Não compõe o total, nem o troco, nem o desconto, nem é substituto para a taxa comercial descontada da loja. Não há taxa estimada neste patch.
- Nenhuma linha histórica passa a ser classificada como Mercado Pago ou Simp. PagBank não é Mercado Pago.

**Implantação futura:** aplique a migração `20261126224000_cartao_manual_pdv.sql` antes da aplicação e confirme a lista de terminais ativos de cada loja. Para homologar em ambiente de testes, registre uma venda mista e confira a linha no comprovante, a referência, o total, o troco, os limites e os fluxos da Asaas. A reversão destrutiva do esquema é bloqueada se houver terminais Mercado Pago ou linhas com os novos detalhes; nesse caso, se necessário, reverta somente o código da tela, preservando o banco.

**Fora deste patch:** a importação de extratos, depósitos e conciliação de repasses Mercado Pago, avaliação do valor líquido/taxa comercial e tratamento de eventual devolução do acréscimo pela operadora não foram homologados. O relatório por terminal reconhece Mercado Pago e contabiliza o principal; confirmar o financeiro com extratos/contrato da adquirente antes do uso em produção.

**Revisão de 26/11 (PR #112, pedido ORA-ESTAVEL-26NOV):** a mesma venda fictícia (R$ 79,00: R$ 20,00 no Pix e R$ 59,00 no cartão em 15x, com R$ 9,00 de juros do cliente) foi comparada na PicPay e na Mercado Pago, antes e depois de conciliar. Os recebíveis já estavam certos nas duas; a previsão de caixa e o resultado do mês não viam a Mercado Pago (o pagamento não aparecia "a conciliar" e a tarifa conciliada não entrava nas taxas, deixando o resultado maior). A migration `20261126224500_mercado_pago_na_previsao_e_no_resultado.sql` põe o Pix e o cartão Mercado Pago na lista dos meios conciliáveis das duas funções. Prova: `packages/banco/src/mercado-pago-nos-relatorios.test.ts` (os juros do cliente em lugar nenhum; a tarifa uma vez só) e os testes de consistência das listas, que passaram a conferir todos os meios válidos. Continua fora: o depósito agrupado da Mercado Pago (o dinheiro cai no saldo da conta Mercado Pago, não direto no banco; não homologado).

