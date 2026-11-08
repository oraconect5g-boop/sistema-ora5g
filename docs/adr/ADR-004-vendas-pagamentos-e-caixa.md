# ADR-004 — Vendas, pagamentos e caixa

**Data:** 08/11/2026 · **Autor:** Claude Code · **Revisor:** Codex · **Aceite:** proprietário
**Status:** **proposto**. Aplicado só no banco de **desenvolvimento** (`ora5g-dev`, dados fictícios), pela prioridade do proprietário de 08/11 (vendas, pagamentos/caixa e Ora Connect reais). Nada vai para produção antes do aceite. Pode mudar por migration nova.
**Requisitos:** ORA-POS-001 a 016, ORA-PAY-001 a 014, ORA-FIN-001 a 004 (parte operacional). Depende de ADR-002 (acesso) e ADR-003 (catálogo e estoque).

## Resumo para o proprietário (o que você aceita)

1. **A venda existe no banco desde o primeiro item**, com loja, vendedor e situação: rascunho → (aguardando aprovação) → concluída, ou cancelada. Clicar em "finalizar" não basta: o banco só conclui se estoque, preço, desconto e pagamento conferirem, tudo de uma vez.
2. **Preço e custo do momento** ficam gravados em cada item. Se o preço mudar no meio da venda, a conclusão para e pede para conferir. O custo só aparece para quem tem `custo.ver`.
3. **Desconto:** o limite sem aprovação vem da categoria (teto e margem mínima). **Enquanto a política P14 não for definida, todo desconto pede aprovação.** Quem aprova: gerente ou dono da loja (`desconto.aprovar`), **nunca quem pediu**. A aprovação vale 30 minutos e cai se o item mudar.
4. **Pagamento misto** com os 8 meios já combinados (dinheiro, Pix direto, Pix e cartão na PicPay, cartão na PagSeguro, link, PayJoy, Aiva). Troco só sai do dinheiro. Maquininha e Pix pedem o **código do comprovante** (confirmação manual registrada com quem conferiu). **Link de pagamento fica bloqueado** até o provedor ser escolhido e integrado (a confirmação tem de vir do provedor, nunca da tela).
5. **Financiamento PayJoy/Aiva:** grava o preço do aparelho, a entrada (com o meio em que foi paga) e o **restante a receber da financeira**. Juros da financeira não entram. E-mail do cliente obrigatório na PayJoy. Prazo e taxa do repasse ficam vazios até a P8.
6. **Caixa por pessoa e loja:** abre com o fundo de troco; suprimento e sangria com motivo; fecha com a contagem do dinheiro, e o sistema mostra a diferença. Outra pessoa com `caixa.conferir` confere. O registro do caixa só aceita lançamentos novos (correção = novo lançamento).
7. **Cancelamento:** antes de concluir, libera o estoque reservado. Depois de concluída, só a gerência (`venda.cancelar`, nova: dono e gerente) cancela, com motivo: o aparelho volta ao estoque por devolução, o dinheiro sai do caixa como estorno, cartão e Pix ficam registrados para estorno na maquininha/banco e o valor a receber da financeira é cancelado. Nada é apagado.

## Decisões técnicas

- **Tabelas:** `caixas`, `caixa_movimentos` (só inserção), `vendas`, `venda_itens`, `venda_itens_custos` (custo separado, lido só com `custo.ver`), `aprovacoes_desconto`, `venda_pagamentos`, `contas_a_receber`.
- **Escrita só por funções do banco** (ADR-002 §2.5): `abrir_caixa`, `movimentar_caixa`, `fechar_caixa`, `conferir_caixa`, `criar_venda`, `adicionar_item`, `remover_item`, `aplicar_desconto`, `pedir_aprovacao`, `decidir_aprovacao`, `concluir_venda`, `cancelar_venda`. Todas conferem papel, loja da sessão e turno.
- **Idempotência:** criar venda, adicionar item, abrir caixa, movimentar caixa e concluir venda recebem uma chave; repetir com o mesmo conteúdo devolve o mesmo resultado; com outro conteúdo, `OR004`. Repetições simultâneas esperam a primeira.
- **Ordem das travas** (amplia a do ADR-003): chave → venda → caixa → item serializado (em ordem de id) → reserva → saldo.
- **Reserva:** cada aparelho, chip ou acessório entra na venda já reservado (30 minutos). A conclusão consome a reserva e lança a saída "venda" no livro; reserva vencida obriga a adicionar de novo.
- **Pagamento** confere no banco a mesma regra de `packages/dominio/src/pagamento.ts` (soma, troco só do dinheiro, entrada ≤ financiado, e-mail na PayJoy).
- **Auditoria:** caixas, vendas, aprovações, pagamentos e valores a receber entram na auditoria automática (ORA-ORG-005).
- **Códigos de erro novos:** `OR007` preço mudou, `OR008` sem caixa aberto, `OR009` pagamento não confere, `OR010` desconto sem aprovação válida.

## Fora desta etapa

Devolução parcial de um item (a total é o cancelamento), pedido de nota fiscal (fila 12), operações da Ora Connect ligadas à venda (fila 11), conciliação com extrato de maquininha e banco, comissão por evento, cliente do CRM (por enquanto nome e e-mail na venda).

## Perguntas para o proprietário

| # | Pergunta | Até a resposta |
|---|---|---|
| P14 | Teto de desconto e margem mínima por categoria | Todo desconto pede aprovação |
| P8 | Prazo e taxa do repasse PayJoy/Aiva | Valor a receber sem vencimento |
| D-017 | Quem pode conferir caixa e fazer sangria? | Conferir: gerente e dono; sangria: o próprio operador, com motivo |
| D-011 | Pix direto: quem confere que o dinheiro entrou? | Vendedor registra o comprovante; conciliação depois pelo extrato |
| A3 | Provedor do link de pagamento | Link bloqueado |
