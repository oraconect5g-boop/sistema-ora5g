# Roteiro de aceite: lote ORG-a (as 11 lojas e o DEFEITOS no sistema)

- **Quem faz:** o proprietário, no celular, em `https://ora5g.com.br`, com a conta de dono.
- **Quanto tempo leva:** uns cinco minutos.
- **O que o lote entrega:** o item 2 da onda 1 do plano de 16/11. O requisito ligado é o ORA-ORG-001, que não muda de estado.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que mudou

1. **As suas 11 lojas e o DEFEITOS estão no sistema.** Os nomes são os da lista que você confirmou em 09/11, com os acentos do português:
   - **As lojas:** Santa Felicidade, Água Verde, Colônia, Almirante Tamandaré, Dubai, Colombo, Muffato Santa, Butiatuvinha, Ventania, Balneário e Santa Cândida.
   - **O DEFEITOS:** é o local que guarda o que tem problema. Ele nunca vende.
2. **Só entrou o que você confirmou:** o nome e o tipo. Nenhum CNPJ, endereço, cidade, telefone ou horário foi inventado. Cada loja mostra o que falta cadastrar.
3. **Loja sem CNPJ ainda não vende.**
   - **O que ela já pode:** ter estoque, mandar e receber transferências e entrar no inventário.
   - **Quando passa a vender:** quando você informar o CNPJ da filial na tela das lojas. Até lá:
     - o sistema recusa a venda, com a mensagem "Esta loja ainda não está liberada para vender";
     - o site não oferece a loja para retirada.
4. **As lojas de teste continuam:** a "Santa Cândida (teste)" e a "Loja de teste 2" seguem com o "(teste)" e são as que você usa nos roteiros.

## Antes de começar

- Confira a versão no ar: na tela de entrada, no fim da página, aparece `ora5G · v0.1.0 · commit · build`. O Claude Code informa o commit ao pedir o aceite.

## Os passos

### 1. Entrar

Abra <https://ora5g.com.br/entrar> e entre com a sua conta de dono, na loja **Santa Cândida (teste)**.

**Tem de acontecer:** abre o Início.

### 2. Abrir as lojas

Toque em **Mais** e depois em **"Lojas"**.

**Tem de acontecer:**

- aparecem as 11 lojas e o DEFEITOS, além das lojas de teste;
- cada uma das 11 lojas mostra o selo **"não vende: falta o CNPJ"** e "sem CNPJ" no subtítulo;
- o DEFEITOS aparece como "Local de exceção (não vende)".

### 3. Uma loja por dentro

Olhe o cartão de uma das lojas novas, por exemplo **Santa Felicidade**.

**Tem de acontecer:**

- aparece "Falta cadastrar: CNPJ (sem ele, a loja não vende), telefone, endereço, horário";
- nenhum desses dados vem preenchido.

### 4. Os nomes

Leia os nomes das 11 lojas.

**Tem de acontecer:** são as suas lojas. Se algum nome estiver errado ou incompleto (por exemplo, "Muffato Santa" ou "Balneário"), anote. Dá para corrigir no próprio cartão da loja, em "Editar nome, CNPJ e cidade", com um motivo.

### 5. A troca de loja

No topo, toque no nome da loja.

**Tem de acontecer:** as 11 lojas e o DEFEITOS aparecem na escolha de loja.

### 6. Responder

Responda **"aceito"** ou **"não aceito"**, mais as correções de nome, se houver.

## O que este roteiro não cobre

- **O CNPJ, o endereço e os horários de cada loja.** Só você tem esses dados. Quando informar o CNPJ, a loja passa a vender.
- **O estoque de cada loja.** Ele chega com a planilha da Rein (o item 3 da onda 1), quando ela estiver no servidor.
