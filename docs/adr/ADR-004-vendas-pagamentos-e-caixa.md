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

## Adendo de 09/11/2026 — Devolução parcial e troca (ORA-POS-010 e ORA-POS-012)

Migration `20261109134507_devolucao_e_troca` (aplicada no `ora5g-dev`, md5 conferido). Testes: `packages/banco/src/devolucao.test.ts` (6 cenários) e as regras da tela.

1. **Quem devolve:** a gerência (`venda.cancelar`), na loja da venda, com motivo. Só venda concluída.
2. **Valor devolvido** de cada item = preço × quantidade menos a parte do desconto, acumulada (devolver aos poucos não deixa sobra de centavo). O reembolso soma exatamente esse valor.
3. **Reembolso** só nos meios que a venda usou e até o que cada um pagou (menos o já devolvido): dinheiro sai do caixa de quem devolve; cartão e Pix ficam como estorno a fazer na maquininha ou no banco; ou o valor vira **vale-troca** (crédito na rede, sem dinheiro).
4. **Troca:** o vale-troca é um meio de pagamento novo (`vale_troca`), informado pelo número do vale no campo do comprovante; paga a nova venda até o saldo, com a diferença em qualquer outro meio; não dá troco; o cancelamento da nova venda devolve o saldo ao vale.
5. **Estoque:** aparelho, chip e acessório voltam pelo livro (`devolucao`), com a condição informada (novo, seminovo, avariado).
6. **Proteções:** venda financiada (PayJoy/Aiva) não tem devolução parcial (OR016, use o cancelamento total); venda com devolução não é cancelada inteira (OR017, devolvem-se os itens que restam); serviço com operação da Ora Connect viva não se devolve (OR013); vale inexistente ou sem saldo é recusado (OR018); a mesma chave devolve o mesmo resultado (OR004 com outro conteúdo).
7. **Fiscal (ADR-006):** venda com nota emitida abre um pedido de **nota de devolução** na fila; nota ainda não emitida recebe o aviso de emitir só o que ficou.
8. **Pendente (D-026):** a política comercial de troca e devolução (prazo, estado aceito, quem decide). O sistema registra e controla; não decide quem tem direito.

## Adendo de 09/11/2026 (2) — Estorno a confirmar e retorno físico conferido (revisão do Codex 371cef0, #46–#53)

Migration `20261109190240_integridade_vendas_lote2`, aplicada no `ora5g-dev` com md5 conferida. Regressões permanentes em `packages/banco/src/integridade-lote2.test.ts` e `concorrencia.test.ts` (#53, duas conexões reais). Este adendo substitui o item 7 do resumo e o item 3 do adendo anterior, só no que diz respeito ao cartão, ao Pix e ao estoque.

1. **Comprovante da entrada (#46):** entrada de PayJoy/Aiva paga por Pix ou cartão exige o código do comprovante, no mesmo campo da linha. Vale-troca não paga entrada.
2. **Troco (#48):** só sai de linha paga em dinheiro, no banco e em `packages/dominio/src/pagamento.ts`, com os mesmos vetores de teste. Financiamento acima do preço é recusado (OR009); crédito da financeira nunca vira dinheiro na mão do cliente.
3. **Dinheiro no cancelamento (#47, #49):** volta o recebido líquido, ou seja, todo o dinheiro da venda (linhas e entradas) menos o troco, distribuído em ordem. Sai do caixa de quem cancela, com o saldo conferido sob a trava do caixa; faltando dinheiro, nada muda (23514).
4. **Cartão, Pix e financeira (#50):** o cancelamento e a devolução parcial criam um **estorno a confirmar** (`estornos_externos`). O pagamento fica `estorno_pendente`, sem data de estorno. A gerência confirma com o código do comprovante (maquininha, banco ou protocolo da financeira) em `confirmar_estorno_externo`. Só então o pagamento fica `estornado`, com data. O registro guarda quem confirmou e quando, e nada se apaga. Dinheiro e vale-troca se resolvem na hora.
5. **Estoque no cancelamento (#51):** nada volta sozinho. Cada aparelho, chip e acessório fica em **retorno a conferir** (`venda_retornos`). A gerência confere em `conferir_retorno`: se o item voltou, informa o IMEI/ICCID (precisa ser o do item vendido) e a condição, e o item volta ao estoque pelo livro; se não voltou, explica e o item fica fora do estoque. Chip com ativação viva na Ora Connect impede o cancelamento (OR013): chip usado não volta como virgem. A devolução parcial também passou a exigir o IMEI/ICCID conferido.
6. **Ordem das travas (#53):** `decidir_aprovacao` trava a venda antes da aprovação, a mesma ordem das demais funções.
7. **Valor ilegível (#52):** fundo de troco e desconto vazios ou ilegíveis voltam com erro, sem chamar o banco. Zero se digita (0,00).
8. **Fica para o #60:** item devolvido como avariado volta à loja com a condição registrada. A passagem para o local DEFEITOS, fora do estoque vendável, vem com as transferências.

## Adendo de 18/11/2026 — As formas de pagamento como o proprietário descreveu (lote PDV-c; D-050)

Migration `20261118155834_pagamentos_por_linha` (aplicada no `ora5g-dev`, com o md5 conferido; com reversão). Testes: `packages/banco/src/vendas.test.ts` (o bloco PDV-c), `packages/dominio/src/pagamento.test.ts`, `apps/plataforma/src/lib/vendas/*.test.ts`, `apps/plataforma/src/app/vender/vender.test.ts` e os E2E da demonstração.

1. **A tela:** nenhuma forma aparece até a pessoa tocar em "Adicionar forma de pagamento" e escolher; cada forma mostra só os seus campos; até 8 formas por venda.
2. **PayJoy e Aiva:** o lançamento é o recebimento via a financeira, com o valor financiado e as parcelas (obrigatórias, de 1 a 48). O que elas financiam não passa do valor líquido dos celulares da venda (OR009): o chip, os acessórios e os serviços entram na mesma venda e são pagos à parte. O item 2 do adendo de 09/11 (2) (o financiamento acima do preço é recusado) fica mais estrito: acima do celular.
3. **A entrada:** um lançamento à parte, na mesma venda, em dinheiro, Pix ou cartão, marcado como a entrada (`venda_pagamentos.entrada_do_financiamento`); só existe numa venda com a PayJoy ou a Aiva. O dinheiro dela entra no caixa como qualquer dinheiro, e o Pix e o cartão pedem o comprovante, como sempre. A forma antiga (a entrada dentro do pagamento da financeira, DEC-U38) continua aceita pelo banco.
4. **As parcelas** ficam gravadas em todos os meios que parcelam (`venda_pagamentos.parcelas`): a PayJoy e a Aiva, de 1 a 48; o cartão, de 1 a 24 (sem informar, 1, à vista); nos outros meios, nula. Os máximos são um padrão reversível (D-050).
5. **O link de pagamento** continua recusado no PDV (no banco e na tela). A Ora Connect da loja também não oferece mais o LINK, e a ação do servidor o recusa; o banco ainda o aceita, para a compra online, o único lugar do link. Isso substitui, só na loja, a escolha entre o SALDO e o LINK do REV-025.
6. **O comprovante:** "Recebimento via PayJoy: R$ X em 12x", "Entrada do financiamento (Dinheiro): R$ Y" e "Cartão na maquininha PicPay: R$ Z em 3x" (`nomeDoPagamento` e `textoDasParcelas`, no domínio, usados pela tela real e pela demonstração).
7. **O chip contado à parte:** o chip é um item próprio da venda e não entra no financiamento; os relatórios já o separam do celular, no grupo da Ora Connect. Uma meta só de chips ainda não existe (a oferecer ao proprietário).
