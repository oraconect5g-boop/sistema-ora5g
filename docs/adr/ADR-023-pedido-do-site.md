# ADR-023: O pedido do site com carrinho, reservado de uma vez para retirar e pagar na loja

**Situação:** proposta (18/11/2026), reversível; aplicada no lote ONLINE-d. **Por:** Claude Code. **Revisor:** Codex. **Aceite:** proprietário.

**Pedida por:**

- os aceites A03 (o carrinho e o checkout) e A06 (o estoque compartilhado) do adendo do Codex de 16/11 (PR #100);
- a orientação da auditoria do Codex de 17/11 (PR #104), "Loja online": o carrinho, o pedido persistente e a reserva que aguenta concorrência;
- ORA-ONLINE-002 (não iniciado até aqui) e ORA-ONLINE-006 (parcial).

Amplia a [ADR-009](ADR-009-loja-online.md) (reserve no site e pague na loja), sem o pagamento online.

## Contexto

1. Até aqui o visitante reservava **uma unidade** por vez (ONLINE-b): até 2 reservas ativas por WhatsApp, 20 por loja por hora, 24 horas, e a loja abria a venda no PDV com a unidade reservada.
2. O pedido mais recente é a compra completa: carrinho, pedido persistente, pagamento verificado, retirada ou entrega e pós-venda. O pagamento online depende do provedor (E1; ORA-PAY-014, bloqueado). A entrega depende do frete (P10).
3. O #87 mostrou o risco de dois escritores da mesma tabela com regras diferentes.

## Decisões

1. **O carrinho fica no aparelho do visitante.** É um cookie sem dado pessoal: o produto, a variação e a loja. Leva até 3 unidades de uma loja só. Nada vai ao banco até "Reservar o pedido".
2. **O pedido reserva tudo de uma vez ou nada**, numa transação só. Cada unidade vira uma reserva do site ligada ao pedido, pela mesma regra da reserva avulsa. Se faltar uma unidade, nada fica preso (OR001).
3. **Um escritor só.** A regra de reservar uma unidade passa para `privado.reservar_unidade_do_site`:
   - o aparelho com IMEI escolhido pelo banco, sem esperar trava;
   - o acessório pelo saldo;
   - a reserva de estoque de origem "online".

   A reserva avulsa e o pedido usam a mesma função. As travas seguem na mesma ordem: o WhatsApp, depois a loja (#102).
4. **Os limites:**
   - o WhatsApp tem até 2 compromissos ativos: cada pedido conta um, e cada reserva avulsa também;
   - a loja aceita até 20 unidades reservadas por hora, e cada unidade do pedido conta.
5. **Os estados do pedido:** reservado, depois atendido ou cancelado.
   - **Atendido:** no balcão, **numa venda só, com todas as unidades**.
   - **Vencido:** o reservado que passou de 24 horas aparece assim. A rotina que já existe libera o estoque (ADR-011).
6. **A oferta anunciada vale.** Ao atender, o banco devolve o total anunciado no pedido e o de hoje. O total de hoje usa o preço do balcão de agora e, sem ele, o anunciado. Se o de hoje for maior, o PDV diz o desconto a dar na venda, como na reserva avulsa.
7. **A reserva de um pedido não se atende nem se cancela sozinha.** A loja atende ou cancela o pedido inteiro, e o banco recusa a unidade solta.
8. **O visitante acompanha o pedido** pelo código e pelo WhatsApp, sem conta. Sem o par certo, a consulta não diz nada e não dá erro de servidor.
9. **O pagamento é na loja, ao retirar.** A tela diz isso. O pagamento online entra quando o provedor for escolhido (E1), sem mudar o pedido.

## O que fica de fora

1. O pagamento online e a confirmação pelo provedor (E1).
2. A entrega, o frete e o rastreio (P10, ORA-ONLINE-004).
3. A devolução e o arrependimento do pedido online (ORA-ONLINE-005, D-026).
4. A conta do comprador: o pedido é acompanhado pelo código e pelo WhatsApp.
5. A recuperação do carrinho (ORA-WHATS-008): o carrinho não guarda contato.

## Consequências

1. O cliente junta até 3 itens e reserva de uma vez; a loja atende num balcão só.
2. As reservas do pedido contam nos painéis das reservas do site (uma por unidade), com a origem e a campanha do link (ADR-013).
3. **Reverter:** primeiro volte a plataforma para a versão anterior ao lote ONLINE-d. Depois aplique as reversões, da mais nova para a mais antiga (`supabase/reversao/20261118034536_comentario_do_contato_do_pedido.sql`, que só tira o comentário, e `supabase/reversao/20261118031404_pedido_do_site.sql`): a segunda devolve as três funções da reserva como estavam e tira o pedido. As reservas que eram de um pedido ficam como reservas avulsas.

## Adendo de 24/11/2026 — A compra que nasceu no site, nas telas (lote CRM-009a; ORA-CRM-009)

Sem migration. Testes: `packages/banco/src/venda-do-site-no-historico.test.ts`, `apps/plataforma/src/lib/loja/vendas-do-site.test.ts`, `apps/plataforma/src/app/clientes/clientes.test.ts` e `apps/plataforma/src/app/vendas/comprovante-rodadas.test.ts`.

1. **A venda atendida continua sendo do balcão.** O canal da venda não vira "online": o cliente retirou e pagou na loja, e a venda conta para a loja e para quem atendeu. A origem (o pedido, o código, a data e por onde o visitante chegou) fica no pedido e nas reservas, que apontam para a venda. Nada é copiado para a venda, e nada é sobrescrito.
2. **As telas leem a ligação pela venda:** as reservas atendidas e o pedido com o `venda_id` dela. A tela da venda mostra o selo e a frase; a ficha do cliente, o pedido do site de cada compra.
3. **Com as regras de leitura de quem abre a tela,** como os outros blocos da ficha. Quem vende na loja do pedido e o dono leem. O administrador vê a venda e não lê as reservas do site: a anotação não aparece para ele. Abrir essa leitura a quem só vê vendas seria mudar acesso, e não foi feito.
4. **Falha é falha:** a leitura que não funciona é dita na tela, nunca tratada como "não veio do site". Num banco sem as tabelas, o bloco some.
5. **Fica de fora:** as compras dos marketplaces no histórico do cliente (o pedido de cada canal chega por arquivo, sem a identidade do comprador, e não vira venda: depende do contrato de cada canal e da decisão do proprietário sobre a baixa do estoque pelo pedido do canal) e os pedidos do site que não viraram venda (o site guarda só o WhatsApp do visitante, à parte; juntá-lo ao cadastro do cliente é uma decisão de privacidade, D-048).

## Adendo de 24/11/2026 (2) — Um caminho só para comprar (lote ONLINE-e; ORA-ONLINE-001 e ORA-ONLINE-002)

Pedido do proprietário de 24/11 ("Sim, simplificar"), depois de ver as telas da loja com produtos de mentira.

1. **O carrinho é o único caminho oferecido.** Na página do produto, cada loja com estoque tem só o "Pôr no carrinho" (o botão principal). O carrinho reserva tudo de uma vez (até 3 unidades de uma loja), como antes.
2. **A reserva de um item continua no ar** (`/loja/[produto]/reservar` e `public.loja_reservar`), sem link na loja: um link antigo que exista ainda funciona. Tirá-la é outra decisão, com a conferência de quem a usa.
3. **O topo mostra quantos itens o carrinho tem,** lidos do cookie do carrinho com a mesma leitura estrita (`lerCarrinho`): sem ir ao banco e sem dado pessoal. Cookie estranho conta como vazio. A ação do carrinho grava o cookie, e o Next monta o layout de novo: o número acompanha o pôr e o tirar.
4. **Sem foto, um espaço baixo,** para o preço e as lojas aparecerem logo. O topo fica numa linha só a partir de 320 px: o número fica sobre o canto da palavra, e abaixo de 360 px o selo "Loja online" some.

