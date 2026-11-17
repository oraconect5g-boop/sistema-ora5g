# Roteiro de aceite: lote TRF-a (vários produtos na mesma transferência)

- **Quem faz:** o proprietário, no celular, em `https://ora5g.com.br`, com a conta de dono.
- **Quanto tempo leva:** uns dez minutos.
- **O que o lote entrega:** o item 5 da onda 1 do plano de 16/11, que é a transferência de vários produtos na mesma operação. Os requisitos ligados são o ORA-INV-007 e a issue #60, e o estado não muda.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que mudou

1. **A remessa:** a loja pede de uma vez vários produtos, até 30, entre as mesmas duas lojas.
2. **Cada produto segue o caminho de sempre:** a origem separa (o que é separado fica reservado), envia (sai do estoque) e o destino recebe e confere. Se faltar alguma coisa, fica a divergência, com a explicação.
3. **A origem pode enviar de uma vez** todos os produtos da remessa que já separou. Os que ainda não foram separados continuam esperando.
4. **A lista mostra o número da remessa** em cada transferência, para saber o que veio junto.

Os passos usam as lojas de teste e os produtos fictícios do banco de desenvolvimento. O estoque delas muda de verdade, mas é só de teste.

## Os passos

### 1. Entrar

Entre com a sua conta de dono, na loja **Santa Cândida (teste)**.

### 2. Abrir a remessa

Toque em **Mais**, depois em **"Transferências"** e em **"Pedir vários produtos de uma vez (nova remessa)"**.

**Tem de acontecer:** abre "Nova remessa", com os passos 1, 2 e 3.

### 3. As lojas

- No passo 1, escolha **De: Santa Cândida (teste)** e **Para: Loja de teste 2**.
- Toque em **"Usar estas lojas"**.

**Tem de acontecer:** o passo 3 mostra "Santa Cândida (teste) → Loja de teste 2".

### 4. Os produtos

- No passo 2, busque **cabo** e toque em **"Adicionar"**.
- Busque **capa** e toque em **"Adicionar"**.

**Tem de acontecer:** os dois produtos aparecem no passo 3, cada um com a quantidade 1 e a lixeira para tirar.

### 5. Pedir

No passo 3:

- escreva o motivo **"Teste da remessa"**;
- toque em **"Pedir a remessa (2 produtos)"**.

**Tem de acontecer:**

- volta para "Transferências", com o aviso "Remessa pedida";
- aparecem duas transferências, cada uma começando com **"Remessa Nº"** e o mesmo número.

### 6. Separar

Em cada uma das duas transferências, toque em **"Separar"**.

**Tem de acontecer:**

- as duas ficam "Separada na origem";
- aparece a faixa **"Remessa Nº …: 2 produtos separados, prontos para sair"**.

### 7. Enviar de uma vez

Toque em **"Enviar os separados da remessa"**.

**Tem de acontecer:** as duas transferências ficam "Em trânsito".

### 8. Receber na outra loja

- No topo, troque para a loja **Loja de teste 2**.
- Abra **"Transferências"** e, em cada uma das duas, confira a quantidade e toque em **"Receber e conferir"**.

**Tem de acontecer:** as duas ficam "Recebida".

### 9. Responder

Responda **"aceito"** ou **"não aceito"**.

## O que este roteiro não cobre

- **As 11 lojas novas:** elas só recebem e mandam remessas depois de ter estoque, que chega com a planilha da Rein.
- **Aparelhos e chips:** pedem o IMEI ou o ICCID na separação, como no pedido de um produto só.
