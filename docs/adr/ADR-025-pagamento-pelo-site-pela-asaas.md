# ADR-025 — O pagamento pelo site pela Asaas: o Pix pelo link de pagamento, confirmado pela reconsulta

- **Data:** 24/11/2026 · **Situação:** aceita (lotes PAY-014a e PAY-014b; o PAY-014b no adendo do fim) · **Requisitos:** ORA-PAY-014, ORA-ONLINE-002 e a parte do provedor do ORA-PAY-008
- **Decisão do proprietário (24/11):** "pagamento pelo site é simples, vai ser usado o gateway de pagamento da Asaas" (a pendência E1).
- **Contrato:** só a documentação oficial da Asaas (`docs.asaas.com`), lida em 24/11: autenticação (`access_token`, `User-Agent`), sandbox (`https://api-sandbox.asaas.com/v3`) e produção (`https://api.asaas.com/v3`), links de pagamento (`/v3/paymentLinks`), cobranças (`/v3/payments`), webhooks (`/v3/webhooks`, o cabeçalho `asaas-access-token`, o evento com `id` único e a entrega "pelo menos uma vez") e os limites da API. O que a documentação não diz não é suposto: está anotado abaixo.

## Contexto

O pedido do site (ADR-023) reserva para retirar e pagar na loja. O adaptador do link de pagamento (ADR-020, lote ADAPT-a; regra do PAY-b) esperava a escolha do provedor: a interface, o formato comum do aviso e as regras (o aviso nunca confirma; só a reconsulta confirma; criar com resultado desconhecido nunca cria outra às cegas).

## Decisões

1. **O link de pagamento da Asaas, um por pedido** (`POST /v3/paymentLinks`): `billingType` `PIX` (a regra inicial; cartão e boleto ficam para depois, com o boleto fora enquanto a reserva for de 24 horas), `chargeType` `DETACHED`, `value` em reais, **`limit` 1** (uma venda só: o mesmo pedido não se paga duas vezes pelo link), `endDate` no dia do vencimento da reserva, `externalReference` com o identificador do NOSSO pagamento e `callback.successUrl` para a página do pedido. **A página da Asaas pede os dados de quem paga**: o nosso site não guarda CPF (a cobrança direta, `POST /v3/payments`, pediria o cliente com `cpfCnpj`).
2. **Só o worker fala com a Asaas.** A chave (`ASAAS_API_KEY`) e o ambiente (`ASAAS_AMBIENTE`: `sandbox` ou `producao`) ficam só no worker (REV-052: o site não guarda segredo). O visitante pede para pagar (`public.loja_pagamento_pedir`, com o código e o WhatsApp do pedido, como na consulta); o banco anota o pagamento a criar; o worker dos pagamentos cria o link e o grava. O worker roda a cada minuto e, dentro do minuto, confere a fila a cada poucos segundos.
3. **O aviso da Asaas** (`POST /api/pagamentos/asaas`): o site só repassa ao banco o cabeçalho `asaas-access-token` e os campos que o worker usa (o id do evento, o evento, o id do pagamento, o id do link, o valor e a situação informada). O banco confere o token pela impressão digital (`privado.segredo_confere('asaas_aviso', ...)`) e guarda o aviso uma vez só, pelo id do evento. **O id do evento pode trazer "&"** (o exemplo oficial é `evt_05b708f961d739ea7eba7e4db318f621&368604920`; a documentação não dá o formato): vale qualquer caractere visível sem espaço, até 200. Com a regra estreita de antes, todo aviso real seria recusado e, depois de 15 falhas seguidas, a Asaas pararia a fila. A resposta é 200 só depois de guardar (como a documentação pede); o token que não confere é 401; o aviso fora da forma, 400; o banco fora do ar, 503 (a Asaas manda de novo). **O token é gerado pelo worker** ao registrar o webhook pela API (`POST /v3/webhooks`, com o `authToken`); fica só a impressão digital do nosso lado: ninguém vê o token, e ele nunca passa pelo chat nem pelo log.
4. **O aviso nunca confirma** (PAY-b): o worker pergunta à Asaas pelo pagamento do aviso (`GET /v3/payments/{id}`) e o banco confere de novo: o pagamento é do NOSSO link (o campo `paymentLink`; a documentação não diz se a cobrança herda o `externalReference` do link, então ele não é usado para isso), o valor é o do pedido, e a passagem da situação. `RECEIVED` e `CONFIRMED` contam como pago; `PENDING`, `OVERDUE` e `AWAITING_RISK_ANALYSIS`, pendente; `REFUNDED`, estornado; o resto, desconhecida (espera e pergunta de novo, ou vira divergência). O pagamento depois do pedido cancelado, ou o estorno sem pagamento, vira divergência para a conciliação, sem mudar nada sozinho.
5. **Criar com resultado desconhecido** (tempo esgotado ou queda): antes de criar de novo, o worker procura o link pelo `externalReference` (`GET /v3/paymentLinks?externalReference=`); a documentação diz que um tempo esgotado não quer dizer que nada foi criado.
6. **O pedido pago fica guardado mais tempo:** ao confirmar, o pedido, as reservas do site e as reservas de estoque dele vencem em 7 dias a partir do pagamento (o padrão reversível; muda com um `update` em `privado.pagamento_pelo_site`). O pedido pago não se cancela pelo sistema enquanto o dinheiro não voltar (OR048): o estorno é pela Asaas, e o aviso dele volta pelo mesmo caminho.
7. **O link do pedido que não foi pago** (cancelado ou vencido) é desativado (`PUT /v3/paymentLinks/{id}` com `active` falso).
8. **Desligado até:** a chave e o ambiente gravados pelo comando da lista única (nunca no chat), o worker agendado com o sim do proprietário e o webhook registrado. O site só oferece "Pagar agora" quando o banco diz que o pagamento pelo site está ligado. A tela do carrinho pergunta ao banco (`public.loja_pagamento_disponivel`) para dizer, antes do pedido, se dá para pagar com Pix depois de reservar.
9. **No balcão (PAY-014b):** a venda que atende o pedido pago registra o "pago pelo site" sem cobrar de novo. Enquanto o PAY-014b não entra, o pagamento pelo site segue desligado.
10. **Na tela do pedido, o Pix só anda com o React:** os botões ficam desligados até a página hidratar. Sem isso, o toque antes da hidratação (um celular lento) seguia como envio comum do navegador, a página recarregava, e o pedido aberto (que veio da ação do "Meu pedido" ou da de reservar) se perdia. Enquanto o link é preparado, a tela pergunta de novo a cada 4 segundos, até 1 minuto; a volta da página da Asaas (`/loja/pedido?codigo=`) traz só o código, e o WhatsApp a pessoa digita.

## O que a documentação não diz (e o que se fez com isso)

- Se a cobrança gerada pelo link herda o `externalReference`: não se usa; a ligação é o `paymentLink`.
- O que acontece com o link depois do `endDate`: o worker desativa o link do pedido vencido de qualquer jeito.
- Se o pagamento de um link pode ser confirmado no sandbox: o ensaio no sandbox, com a chave de teste, é o que vai dizer.

## Consequências

1. O cliente pode pagar o pedido do site com Pix, e a loja vê "pago pelo site" antes de ele chegar.
2. Nenhum dado de pagamento do cliente (CPF, cartão) passa pelo nosso site.
3. Se a Asaas não avisar (a fila de avisos parada depois de 15 falhas seguidas), o pedido segue aguardando: o painel da Asaas mostra o pagamento, e o aviso pode ser reenviado por lá.
4. **Reverter:** a reversão da migration tira as tabelas e as funções novas e volta a função de cancelar o pedido e a visão do pedido às versões do ONLINE-d; o worker e o site sem a migration não oferecem o pagamento.

## Adendo do lote PAY-014b (24/11/2026): o pedido pago no balcão

O item 9 acima, feito. Padrões reversíveis (nenhum pede decisão nova do proprietário: aplicam a regra "a oferta vale", do ONLINE-d, e o "a compra online é que tem link de pagamento", de 18/11):

1. **O preço é o que o cliente pagou.** Ao atender o pedido pago, cada item da venda fica com o preço da reserva do site (`venda_itens.loja_reserva_id`; a linha de preço do item fica nula). Se o preço do balcão subiu ou desceu depois do pagamento, a venda sai pelo preço pago: não há desconto a dar nem diferença a devolver.
2. **O banco põe a linha "pago pelo site" sozinho, na conclusão:** o meio `link_pagamento`, com o valor pago, o id do pagamento na Asaas como comprovante e a ligação ao pagamento do site (`venda_pagamentos.loja_pagamento_id`, uma venda só por pagamento). A tela não declara esse pagamento, e o link digitado pela tela segue recusado. Sem nada a mais no balcão, a venda conclui sem outra forma; o item a mais se paga pelas formas de sempre.
3. **No caixa, o pago pelo site entra como recebimento do meio dele, como o cartão:** o fechamento conta só o dinheiro, e o repasse da Asaas fica para a conciliação (a parte do provedor do ORA-PAY-008).
4. **O pedido pago sai inteiro:** o item pago não sai da venda (OR048); o desconto que deixe o total abaixo do pago é recusado na conclusão; a venda aberta do pedido pago não se cancela enquanto o dinheiro não voltar (OR048, como o pedido). A reserva de estoque da venda dura o que dura o pedido pago (7 dias depois do pagamento), não os 30 minutos do carrinho.
5. **Desistência e estorno:** o estorno é pelo painel da Asaas. Com a venda aberta, o aviso do estorno solta o item pago (ele sai da venda e a venda se cancela; o que ficou com o preço pago não conclui). Com a venda concluída, o cancelamento põe a linha do link como estorno externo a confirmar com o comprovante, como o Pix e o cartão (a regra do estorno externo passou a aceitar o link). A devolução parcial de um item pago pelo link segue sem reembolso pelo link (o reembolso sai em dinheiro, Pix ou cartão, ou o estorno é pelo painel da Asaas).
6. **A PayJoy e a Aiva não financiam de novo o celular já pago pelo site.**
7. **Corrida conhecida:** se o cliente pagar pelo link no instante em que a loja atende o pedido sem pagamento, a venda abre pelo caminho de sempre (o preço do dia) e o pago entra na conclusão como linha do link; se o preço mudou, a conclusão pede o desconto ou recusa o excesso. O pagamento depois do pedido atendido continua virando divergência para a conciliação (PAY-014a).

## Adendo do lote PAY-015a (25/11/2026): o Pix pela Asaas no caixa

A decisão do proprietário de 25/11 (a D-062): "pagamento oficial da loja será a asaas", com o QR Code gerado direto do sistema e o pagamento misto. A documentação oficial lida em 25/11: as chaves Pix da conta (`GET /v3/pix/addressKeys`), o QR Code estático (`POST /v3/pix/qrCodes/static`), a cobrança que a Asaas cria ao receber, com o `pixQrCodeId` (`GET /v3/payments?pixQrCodeId=`), a exclusão do QR (`DELETE /v3/pix/qrCodes/static/{id}`) e o teste do pagamento de QR no sandbox (uma segunda conta de teste paga).

1. **O QR estático com valor**, um pagamento só (`allowsMultiplePayments` falso), com a validade (30 minutos; muda com um `update`) e o NOSSO identificador (`externalReference`). Ele não pede o cliente: a cobrança dinâmica (`POST /v3/payments`) exige o cliente com CPF/CNPJ, e o caixa não precisa mandar dado do cliente para a Asaas.
2. **A confirmação sem depender do aviso:** o worker pergunta à Asaas pelas cobranças do QR a cada poucos segundos enquanto ele espera (e, a cada minuto, pelo pago de venda ainda aberta, por causa do estorno). Pago: RECEIVED ou CONFIRMED; uma cobrança só. O banco confere de novo o QR, o valor e a passagem; o que não fecha vira divergência.
3. **A chave Pix ativa** é conferida a cada execução do worker: sem ela (ou sem o worker por 5 minutos), o Pix no caixa fica desligado e a tela diz isso.
4. **A criação sem resposta clara** pede outro QR: o que ficou sem resposta ninguém viu (o copia e cola não chegou à tela) e vence sozinho.
5. **Cancelar e vencer:** o QR que o worker ainda não pediu sai na hora; o que está na Asaas o worker confere antes de excluir (o pago no meio tempo vale); o vencido (2 minutos de folga depois da validade) sai da Asaas.
6. **A venda:** a conclusão põe a linha "Pix pela Asaas" de cada QR pago (o meio `pix_asaas`, que a tela não declara, como o pago pelo site); o QR esperando segura a conclusão (OR059); o pago que passa do total é recusado (volta pela Asaas); a venda aberta com Pix pago não se cancela (OR048); concluída, o cancelamento põe o Pix como estorno externo a confirmar.
7. **Reverter:** a reversão tira as tabelas e as funções novas e volta a conclusão e o cancelamento ao texto do PAY-014b; ela se recusa quando já há venda paga com o meio `pix_asaas`.

## Adendo do lote PAY-015b (25/11/2026): o cartão pela Asaas no caixa

A mesma decisão (a D-062), na parte do cartão de crédito. A documentação oficial lida em 25/11: o link de pagamento (`POST /v3/paymentLinks`, com `billingType` CREDIT_CARD, `chargeType` DETACHED e `limit`, o máximo de vendas do link), a alteração do link (`PUT /v3/paymentLinks/{id}` com `active` falso), a lista das cobranças (`GET /v3/payments`, com os filtros `billingType` e `dateCreated[ge]`; cada cobrança traz o `paymentLink` e, do cartão, só `creditCardNumber`, os 4 últimos dígitos, e `creditCardBrand`) e o teste de cartão no sandbox (números fictícios aprovam; dois números próprios simulam a recusa). A lista das cobranças não tem filtro pelo link, e não há rota das cobranças de um link.

1. **O link só no cartão, à vista**, uma venda só (`limit` 1), sem aviso ao cliente e com o NOSSO identificador. O cliente digita o cartão na página da Asaas: o número do cartão nunca passa pelo sistema. O parcelamento (`INSTALLMENT`) fica para depois do ensaio: o pago chega em parcelas, e a forma do total precisa ser vista no sandbox.
2. **A confirmação sem depender do aviso:** a cada rodada, uma leitura das cobranças de cartão desde o dia do link mais antigo que espera (até 5 páginas de 100; passou disso, a leitura falha e nada muda) e a cobrança de cada link achada pelo `paymentLink`. Pago: RECEIVED ou CONFIRMED; uma cobrança só. O banco confere de novo o link, o valor e a passagem.
3. **O cartão ligado** enquanto a Asaas responde (a mesma conferência da chave Pix, uma vez por execução); sem resposta por 5 minutos, desligado.
4. **A criação sem resposta clara** procura o link pelo nosso identificador antes de criar de novo.
5. **Cancelar e vencer:** como o QR do Pix; o link que está na Asaas é desativado depois da conferência (o pago no meio tempo vale).
6. **A venda:** a linha "Cartão pela Asaas" de cada link pago, depois das do Pix (o meio `cartao_asaas`, que a tela não declara); o QR e o link não passam do que falta, somando o que a venda tem pedido ou pago nos dois.
7. **Reverter:** a reversão tira a tabela e as funções novas e volta as funções da venda e do Pix ao texto do PAY-015a; ela se recusa quando já há venda paga com o meio `cartao_asaas`.

## Adendo do lote PAY-015c (25/11/2026): a assinatura no cartão pela Asaas

A decisão do proprietário (a D-062): "espaço para cadastrar os cartões, caso a pessoa queira adicionar recorrência", com o cartão guardado na Asaas. A documentação oficial lida em 25/11: o link recorrente (`POST /v3/paymentLinks` com `chargeType` RECURRENT e `subscriptionCycle`: preenchido, ele cria a assinatura), a cobrança com o `subscription`, a assinatura (`GET /v3/subscriptions/{id}`: `status` ACTIVE, INACTIVE ou EXPIRED, `nextDueDate`, `value`, `cycle`, `paymentLink` e `deleted`), as cobranças dela (`GET /v3/subscriptions/{id}/payments`) e a remoção (`DELETE /v3/subscriptions/{id}`: para as cobranças futuras e apaga as pendentes).

1. **O cartão fica na Asaas:** o cliente cadastra o cartão na página da Asaas, pelo QR Code do link recorrente (vale 3 dias); o sistema nunca vê o número, só a bandeira e os 4 últimos dígitos de cada cobrança. A tokenização direta (o cartão digitado no sistema) fica de fora: ela exigiria o número do cartão no servidor.
2. **O achado da assinatura:** pela primeira cobrança do link (o `subscription`), na mesma leitura das cobranças de cartão do caixa; o banco confere que a assinatura veio deste link, com o valor e o ciclo pedidos.
3. **O acompanhamento:** a assinatura e as cobranças a cada 30 minutos; ativa, pausada (INACTIVE) e encerrada (EXPIRED) vêm da Asaas; a removida no painel da Asaas fica cancelada aqui, com o motivo.
4. **O cancelamento:** quem criou, ou quem cancela vendas na loja dela, com o motivo; o worker remove a assinatura na Asaas (ou desativa o link, se ninguém cadastrou o cartão). A assinatura achada depois do cancelamento também é removida.
5. **A recarga automática** da linha quando a cobrança é paga não entra: é a D-063 (o crédito na carteira da Nogle ou a loja pagando o Pix da Nogle).
