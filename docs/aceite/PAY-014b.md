# Roteiro de aceite: lote PAY-014b (o pedido pago pelo site no balcão)

- **Quem faz:** o proprietário (ou o gerente de uma loja de teste, com ele junto).
- **Quando:** depois que o pagamento pelo site for ligado: a chave de teste da Asaas gravada no servidor (pelo comando da lista única, nunca na conversa) e o seu "sim" para ligar o worker dos pagamentos. Uns 10 minutos, com o dinheiro de mentira do sandbox da Asaas, na Santa Cândida (teste).
- **O que o lote entrega:** a última peça antes de ligar o Pix do site (o item 9 do ADR-025). Quando o cliente já pagou o pedido pelo site, a venda do balcão registra o "pago pelo site" **sem cobrar de novo**. Os itens ORA-PAY-014 (o Pix e o link pelo provedor) e ORA-ONLINE-002 (o pedido do site) **seguem parciais**: falta a chave, o ensaio no sandbox e o seu aceite.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## Como funciona

1. O cliente reserva o pedido no site e paga com Pix (PAY-014a). Em **Reservas do site**, o pedido aparece como **"Pago pelo site"**.
2. Quando ele chega, a loja toca em **"Atender"**. A venda abre no caixa com os itens do pedido **pelo preço que o cliente pagou**, mesmo que o preço da loja tenha mudado depois. Cada item pago tem o selo **"pago pelo site"**.
3. Na parte do pagamento aparece a linha fixa **"Já pago pelo site (Pix)"**, com o valor. Sem nada a mais, a tela diz **"Nada a cobrar"**, e é só tocar em **"Concluir venda"**, sem escolher forma de pagamento.
4. Se o cliente levar mais alguma coisa no balcão, a venda cobra só o que entrou a mais, pelas formas de sempre (dinheiro, Pix, cartão).
5. No comprovante da venda, o pagamento aparece como **"Link de pagamento"**, com o código do pagamento na Asaas.

## O que fica travado (de propósito)

- O item pago pelo site **não sai da venda** e **não leva desconto** (o cliente já pagou o preço anunciado).
- A venda aberta do pedido pago **não se cancela pelo caixa**. Se o cliente desistir, o estorno é feito no **painel da Asaas**; quando o aviso do estorno chega, a venda pode ser cancelada.
- A venda concluída que for cancelada depois fica com o estorno do link **a confirmar**, como um Pix ou um cartão: a loja estorna no painel da Asaas e registra o comprovante.

## Os passos (no sandbox, na Santa Cândida (teste))

1. No celular, em `ora5g.com.br/loja`, reserve um produto da Santa Cândida (teste) e pague com o Pix de mentira do sandbox.
2. Entre com a conta da loja de teste, abra **Reservas do site** e confira o selo **"Pago pelo site"** no pedido.
3. Toque em **"Atender"**. Confira, no caixa: o aviso verde "Venda do pedido pago pelo site aberta...", o selo "pago pelo site" no item, a linha **"Já pago pelo site (Pix)"** e o **"Nada a cobrar"**.
4. Toque em **"Concluir venda"**. Confira, no comprovante, o pagamento **"Link de pagamento"** com o valor pago.
5. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/pedido-pago-no-balcao.test.ts`, com a Asaas de mentira): os itens com o preço pago mesmo com o preço da loja maior; a reserva de estoque da venda dura o pedido pago; concluir sem outra forma põe a linha do link (uma só, ligada ao pagamento); o caixa recebe o link como o cartão (o dinheiro da gaveta não muda); o item a mais se paga à parte; o desconto abaixo do pago, o item pago saindo e a venda aberta cancelada são recusados; com o estorno, o item sai e a venda se cancela; concluída, o cancelamento deixa o estorno do link a confirmar; a PayJoy não financia de novo o celular pago; o link digitado pela tela segue recusado; o pedido não pago segue como antes.
- **No banco do site, numa prova desfeita no fim** (nada gravado): com uma capa de R$ 25,00 posta na Santa Cândida (teste) e um pedido pago, o Vendedor (teste) atendeu o pedido pelo preço pago, a tela do caixa mostrou o pago, e a venda concluiu sem outra forma, com a linha do link e o recebimento no caixa.
- **A reversão** volta as cinco funções de antes (provado no teste das migrations, que aplica e desfaz).
