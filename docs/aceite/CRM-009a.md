# Roteiro de aceite: lote CRM-009a (a compra que nasceu no site, no histórico do cliente)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, com a sua conta de dono em `ora5g.com.br`, pelo celular ou pelo computador.
- **Quanto tempo leva:** uns 3 minutos.
- **O que o lote entrega:** uma parte do "histórico de compras da loja e do site no mesmo lugar" (item ORA-CRM-009, que segue **parcial**).
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que mudou

1. **Antes:** quando o cliente reservava pelo site e retirava na loja, a venda feita no balcão não dizia que tinha começado no site. A ligação entre o pedido e a venda estava guardada no banco, mas nenhuma tela a mostrava.
2. **Agora a tela da venda diz de onde ela veio.** A venda que atendeu um pedido do site ganha o selo "veio do site" e uma frase com o código do pedido, a data em que foi feito e, quando há registro, por onde o visitante chegou (Instagram, Google…).
3. **A ficha do cliente também.** Na lista de compras, a venda aparece com "pedido do site" e o código, ao lado da data e do valor.
4. **A venda continua sendo do balcão.** O cliente retirou e pagou na loja: a venda conta para a loja e para o vendedor, como sempre. A origem fica guardada no pedido, sem ser trocada.
5. **Quem vê:** quem vende na loja do pedido (o vendedor e o gerente) e o dono. O administrador vê a venda, mas não a anotação: ele não lê as reservas do site, e essa regra não mudou neste lote.

## O que fica de fora (por isso o ORA-CRM-009 segue parcial)

- **As compras feitas nos marketplaces** (Mercado Livre, Shopee, TikTok Shop) não entram no histórico do cliente: o pedido deles chega por arquivo, sem a identidade do comprador, e não vira venda no sistema. Depende do contrato de cada canal e da sua decisão sobre a baixa do estoque pelo pedido do canal.
- **Os pedidos do site que não viraram venda** (cancelados ou vencidos) não aparecem na ficha: o site guarda só o WhatsApp do visitante, à parte, e juntar isso ao cadastro do cliente é uma decisão de privacidade (LGPD) que não tomei por você.

## Os passos

1. Entre na **Santa Cândida (teste)** e abra **Operação → Vendas**.
2. Toque numa venda. O comprovante abre como antes. Hoje nenhuma venda de teste veio do site, então o selo "veio do site" **não** aparece. É o esperado.
3. Responda **"aceito"** ou **"não aceito"**.

Para ver o selo e a frase no site, é preciso um pedido feito na loja online e atendido no balcão da loja de teste. Hoje nenhum produto está marcado para o site. Isso grava, e eu só faço com o seu sim.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/venda-do-site-no-historico.test.ts`), sem mudança nenhuma no banco:
  - o pedido com duas unidades atendido no balcão: a venda é do canal da loja, o pedido e as duas reservas apontam para ela, e a origem fica onde estava, antes e depois de concluir a venda;
  - a reserva avulsa, com o código que o visitante recebeu; a venda comum, sem ligação nenhuma;
  - quem lê: a vendedora da loja e o dono leem; o gerente de outra loja não; o administrador vê a venda e não lê a reserva.
- **Na tela** (`apps/plataforma/src/lib/loja/vendas-do-site.test.ts`, `apps/plataforma/src/app/clientes/clientes.test.ts` e `apps/plataforma/src/app/vendas/comprovante-rodadas.test.ts`): a ficha e a venda com o pedido e com a reserva; a falha de leitura dita como falha; e o comprovante abrindo no mesmo número de idas ao banco de antes.
- **A prova de leitura no site** (`apps/plataforma/e2e/venda-do-site-real.spec.ts`): só abre telas. Roda depois da publicação, e o resultado fica no registro das publicações, a branch `registro/publicacoes` do repositório.
- **Migration:** nenhuma.
