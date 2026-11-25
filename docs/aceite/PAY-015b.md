# Roteiro de aceite: lote PAY-015b (o cartão pela Asaas no caixa)

- **Quem faz:** o proprietário, com a sua conta (ou um vendedor), numa loja com caixa aberto.
- **Quando:** depois da publicação e **depois que a conta de teste da Asaas estiver pronta** (os mesmos passos do roteiro [PAY-015a](PAY-015a.md), "Antes de começar"; o cartão não precisa da chave Pix, só da chave de API).
- **O que o lote entrega** (as suas respostas de 25/11, a decisão D-062: "pagamento oficial da loja será a asaas", com o cartão de crédito, o QR Code gerado direto do sistema e o pagamento misto): no **Vender**, depois do carrinho, o cartão **Cartão pela Asaas**:
  - **Gerar QR Code do cartão** com o valor (o sistema sugere o que falta pagar, já descontando o Pix e o cartão que esperam; dá para pôr só uma parte e o resto em outra forma: o pagamento misto).
  - O QR Code do **link de pagamento** aparece **na tela**, com o botão **Abrir o pagamento no cartão** e a hora em que ele vence (30 minutos). O cliente aponta a câmera do celular e paga no cartão, **na página da Asaas**: o número do cartão nunca passa pelo sistema.
  - Em poucos segundos o link vira **Pago**, sozinho, com a **bandeira e os 4 últimos dígitos** do cartão (por exemplo, "VISA final 8829"): o servidor confere na própria Asaas.
  - O **pago entra sozinho na venda**: o total mostra "Pago no cartão pela Asaas" e as formas de pagamento cobram só o resto. Na conclusão, a venda ganha a linha "Cartão pela Asaas" com o código da cobrança.
  - **Cancelar este link** enquanto ele não foi pago. Se o cliente pagar no mesmo instante, o pago vale.
  - **A segurança:** a venda não conclui enquanto um link espera; a venda com cartão pago não se cancela pelo caixa (o estorno é pelo painel da Asaas); o link aceita um pagamento só, com o valor certo, e é desativado quando é cancelado ou vence.
- **Resposta:** "aceito" ou "não aceito".

## Os passos

1. Abra **Vender**, comece uma venda e ponha um acessório no carrinho.
2. No cartão **Cartão pela Asaas**, deixe o valor sugerido e toque em **Gerar QR Code do cartão**: em alguns segundos aparecem o QR Code e o botão de abrir.
3. Toque em **Cancelar este link**: ele fica **Cancelado**.
4. Gere outro link com só uma parte do valor e confira que a venda **não conclui** enquanto ele espera.
5. **O pagamento no teste:** na Asaas de teste, o cartão é de mentira. Abra o link (pelo QR Code ou pelo botão) e pague com um número de cartão fictício válido, qualquer validade futura e o código `123` (a documentação da Asaas: os números de teste aprovam; dois números próprios simulam a recusa). O link vira **Pago**, com a bandeira e o final, o total desconta e a venda conclui com o resto em dinheiro.
6. Responda **"aceito"** ou **"não aceito"**. Depois do aceite, trocar para a conta real é gravar a chave de produção e o ambiente "producao" (o primeiro cartão real, de valor pequeno, só com o seu sim).

## O que você não vê (feito pelo Claude Code)

- O link é o **link de pagamento** da Asaas só no cartão (`POST /v3/paymentLinks` com `billingType` CREDIT_CARD, avulso, `limit` 1: ele fecha depois de uma venda), lido na documentação oficial em 25/11. A Asaas não tem uma consulta das cobranças de um link: o servidor lê as cobranças de cartão desde o dia do link (`GET /v3/payments` com `billingType` e `dateCreated[ge]`) e acha a do link pelo `paymentLink`, a cada poucos segundos, sem depender do aviso.
- O formato do dia na consulta (AAAA-MM-DD) é o das datas da Asaas; a documentação não o escreve: o ensaio no sandbox confirma.
- O banco confere tudo de novo: quem pede (só a vendedora da venda, na loja do turno), o valor (até o que falta, contando o Pix), o link, o valor pago e a passagem da situação. O que não fecha vira divergência, sem mudar nada sozinho.
- O parcelamento no cartão pela Asaas fica para depois do ensaio (o link avulso cobra à vista); o cartão parcelado continua nas maquininhas.
- Migration `20261125204032_cartao_da_asaas_no_caixa`; a reversão tira a tabela e as funções novas e volta a conclusão, o cancelamento, o pedido do Pix e a lista dos meios ao texto do PAY-015a.
