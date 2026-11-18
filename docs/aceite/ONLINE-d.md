# Roteiro de aceite: lote ONLINE-d (o carrinho e o pedido do site)

- **Quem faz:** o proprietário, no celular, em `https://ora5g.com.br`. A parte 1 não pede senha. A parte 2 pede a entrada como dono.
- **Quanto tempo leva:** uns 2 minutos na parte 1 e uns 10 na parte 2.
- **O que o lote entrega:**
  - parte do ORA-ONLINE-002: o carrinho e o pedido do site, sem o pagamento online;
  - parte do ORA-ONLINE-006: o pedido usa a mesma reserva de estoque do PDV.

  Decisão: [ADR-023](../adr/ADR-023-pedido-do-site.md).
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que mudou

1. Na página de um produto, cada loja com estoque tem o botão **"Pôr no carrinho"**, ao lado de "Reservar".
2. O carrinho leva até 3 unidades de uma loja só, a de retirada.
3. Com o nome e o WhatsApp, **"Reservar o pedido por 24 horas"** segura tudo de uma vez. Se faltar um item, nada fica reservado.
4. O cliente recebe um código de 6 letras e números. Com ele e o WhatsApp, acompanha o pedido em **"Meu pedido"**.
5. A loja vê o pedido em **Reservas do site**. Ela atende tudo numa venda só, no PDV, ou cancela o pedido inteiro.
6. **A oferta anunciada vale.** Se o preço subiu depois do pedido, o PDV diz o desconto a dar na venda.
7. O pagamento continua na loja, na retirada. O pagamento pelo site espera a escolha do provedor (E1).

## Antes de começar

- Hoje nenhum produto está marcado para o site, então a loja online mostra "Em breve".
- Só as duas lojas de teste aparecem no site: **Santa Cândida (teste)** e **Loja de teste 2**. As 11 lojas de verdade entram quando o CNPJ de cada filial estiver no cadastro.
- A parte 2 marca dois produtos de teste para o site e, no fim, desmarca.
- Confira a versão no ar: abra <https://ora5g.com.br/entrar>. No fim da página aparece `ora5G · v0.1.0 · commit · build`. Vale o commit que o Claude Code informar ao pedir o aceite.

## Parte 1: sem senha

### 1. Abrir o carrinho vazio

Abra <https://ora5g.com.br/loja/carrinho>.

**Tem de acontecer:**

- aparece "O carrinho está vazio", com o link para a loja;
- no topo da loja aparecem os links "Carrinho" e "Meu pedido".

### 2. Consultar um pedido que não existe

Abra <https://ora5g.com.br/loja/pedido>. Digite o código `AAAAAA` e o WhatsApp `(41) 99999-0000`. Toque em "Ver o pedido".

**Tem de acontecer:** aparece "Nenhum pedido com este código e este WhatsApp. Confira os dois."

## Parte 2: um pedido de teste, do site ao balcão

### 3. Marcar dois produtos de teste para o site

Entre como dono. Abra **Cadastro de produtos** (menu Estoque e catálogo).

1. Na **Capa de proteção**, abra "Editar produto".
2. Marque "mostrar na loja online".
3. No motivo, escreva "teste do roteiro ONLINE-d" e toque em "Salvar produto".

Faça o mesmo no **Cabo USB-C 1 m**.

### 4. Pôr os dois no carrinho

Abra <https://ora5g.com.br/loja> e toque na **Capa de proteção**. Na **Santa Cândida (teste)**, toque em "Pôr no carrinho". Volte à loja, abra o **Cabo USB-C 1 m** e, na mesma loja, toque em "Pôr no carrinho".

**Tem de acontecer:**

- o carrinho mostra os dois itens: R$ 79,00 e R$ 49,90;
- embaixo, "Total na loja" R$ 128,90;
- em cima, "Retirada em Santa Cândida (teste)".

### 5. Reservar o pedido

Preencha o nome "Teste do roteiro" e o WhatsApp `(41) 99999-0001`. Marque a concordância e toque em "Reservar o pedido por 24 horas".

**Tem de acontecer:**

- aparece "Pedido reservado" com o código grande;
- aparecem os dois itens, o total, "Retire em Santa Cândida (teste)" e até quando vale;
- o aviso diz que o pagamento é na loja, na retirada.

Anote o código. O carrinho fica vazio.

### 6. Acompanhar o pedido

Abra "Meu pedido". Digite o código e o WhatsApp `(41) 99999-0001`.

**Tem de acontecer:** aparece o mesmo pedido, com "Pedido: Reservado".

### 7. Ver o pedido na loja

Escolha a loja **Santa Cândida (teste)** e abra **Reservas do site** (menu Operação).

**Tem de acontecer:** aparece o cartão "Pedido" com o código, e nele:

- "2 unidades";
- o nome "Teste do roteiro";
- o WhatsApp com parte escondida;
- os dois itens;
- os botões "Atender o pedido no PDV" e "Cancelar o pedido".

As duas unidades não aparecem soltas na lista das reservas.

### 8. Cancelar o pedido

Toque em "Cancelar o pedido", escreva o motivo "teste do roteiro" e toque em "Cancelar".

**Tem de acontecer:** aparece "Pedido cancelado: as unidades voltaram para o estoque da loja.". Em "Meu pedido", o mesmo código e o mesmo WhatsApp mostram "Pedido: Cancelado".

### 9. Desmarcar os produtos de teste

Em **Cadastro de produtos**, abra "Editar produto" na Capa de proteção e no Cabo USB-C 1 m. Desmarque "mostrar na loja online", escreva o motivo e salve.

**Tem de acontecer:** a loja online volta a mostrar "Em breve".

### 10. Responder

Responda **"aceito"** ou **"não aceito"**.

## O que você não vê no celular (provado pelo Claude Code)

- **Tudo ou nada:** se um item acabar no meio do pedido, nenhum fica reservado. O mesmo envio, repetido, devolve o mesmo pedido.
- **Os limites:** um WhatsApp tem no máximo 2 pedidos ou reservas ativos. A loja aceita até 20 unidades reservadas por hora.
- **A venda no balcão:** atender o pedido abre uma venda só, com todas as unidades. Repetir o toque devolve a mesma venda.
- **A outra loja:** não vê o pedido e não consegue mexer nele.
- **A loja sem CNPJ:** não recebe pedido; o banco recusa e nada fica reservado.

As provas estão em `packages/banco/src/loja-online-pedido.test.ts` e nos testes das telas. Rodam em cada CI.
