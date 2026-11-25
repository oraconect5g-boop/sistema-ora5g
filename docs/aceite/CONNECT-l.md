# Roteiro de aceite: lote CONNECT-l (o Pix da Nogle na loja)

- **Quem faz:** o proprietário, com a sua conta (ou um vendedor da loja), numa loja com a Ora Connect liberada.
- **Quando:** depois da publicação. Uma operação de verdade cobra de verdade: faça com um cliente de verdade (ou um chip seu) e o seu sim.
- **O que o lote entrega** (as suas respostas de 25/11, a decisão D-062: na Ora Connect, "registrar o pagamento" — dinheiro, maquininha ou Pix — "para finalizar a operação", e o Pix da Nogle, "não com o crédito da Nogle"): na tela **Ora Connect**, a ativação e a recarga têm o **Pagamento à Nogle**:
  - **Pix da Nogle** (o padrão): a Nogle devolve o pagamento da operação e a tela mostra o **QR Code** e o botão **Abrir o pagamento da Nogle**.
    - **Com o serviço pago no caixa** (o cliente pagou em dinheiro, na maquininha ou no Pix): quem paga o Pix da Nogle é **a loja**, com o dinheiro recebido. A tela avisa para não mostrar o QR ao cliente (ele já pagou).
    - **Sem o serviço pago no caixa** ("Nenhum: o cliente paga o Pix da Nogle direto"): o cliente aponta a câmera para o QR Code e paga na hora, direto à Nogle.
  - **Crédito da carteira da Ora na Nogle**: continua como antes, só com o serviço pago no caixa e com crédito na carteira (que estava com R$ 0,00 em 25/11).
  - Para o dono e os gerentes, no alto da tela: **Pix da Nogle para a loja pagar**, a lista das operações em que o cliente já pagou no caixa e a loja ainda precisa pagar a Nogle, de todas as lojas que você gere, com o botão de abrir cada pagamento. Você paga de onde estiver.
  - A operação segue sozinha quando a Nogle confirmar (o servidor consulta a Nogle, como antes). O mesmo serviço pago no caixa vale uma operação só.
- **Resposta:** "aceito" ou "não aceito".

## Os passos

1. Venda a recarga (ou a ativação) do plano no **Vender**, com o pagamento do cliente (dinheiro, maquininha ou Pix).
2. Abra **Ora Connect** → **Recarga**. Em **Pagamento à Nogle**, deixe **Pix da Nogle** marcado e escolha, em **Serviço pago no caixa**, a venda do passo 1.
3. Registre. Em instantes, a operação mostra o **QR Code** e **Abrir o pagamento da Nogle**, com o aviso "a loja paga".
4. No seu celular, abra **Ora Connect**: em **Pix da Nogle para a loja pagar**, a operação aparece com o botão de abrir o pagamento. Pague.
5. Confira que a operação passa para **Confirmada** quando a Nogle confirmar.
6. (Opcional) Uma recarga com **Nenhum** no serviço pago: o QR é para o cliente pagar na hora.
7. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (feito pelo Claude Code)

- A Nogle documenta duas formas de pagamento para a ativação, a recarga e a compra: `LINK` (o link de pagamento que ela devolve, `link_pagamento`) e `SALDO` (a carteira). A resposta da coleção oficial traz o `link_pagamento`; o sistema guardava esse link desde o início, só não deixava a loja usar.
- O QR Code é desenhado no servidor a partir do link (sem imagem de fora e sem script no celular), preto no branco, para a câmera ler. A tela só mostra links `https` (até 500 caracteres).
- O banco deixou de recusar o Pix da Nogle com o serviço pago no caixa (a trava antiga, do achado #57 do Codex, existia porque o link cobraria o cliente de novo: agora quem paga é a loja, e a tela diz isso). O mesmo serviço pago continua valendo uma operação só.
- Migration `20261125195945_pix_da_nogle_na_loja`; a reversão volta a regra anterior (as operações já registradas ficam como estão).
