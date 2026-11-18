# Roteiro de aceite: lote CD-a (o depósito não vende)

- **Quem faz:** o proprietário.
- **Onde:** no sistema real, em **ora5g.com.br**, com a sua conta de dono.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** a decisão D-043 ainda estava em aberto: o centro de distribuição (um local do tipo **Depósito**) vende direto ao cliente ou só abastece as lojas? Enquanto você não decide, vale o padrão que a D-043 propôs: **o depósito não vende**. Ele guarda o estoque e manda para as lojas pelo pedido de transferência, como o DEFEITOS.
- **Resposta:** "aceito" (o depósito não vende) ou "o depósito vende". Se ele vender, a regra sai num lote próprio, e os painéis do estoque passam a contar o depósito entre os locais que vendem.

## O que mudou

1. **O banco recusa a venda no depósito.** Recusa também a reserva de venda, da loja e do site. A mensagem é: "O depósito não vende: ele guarda o estoque e abastece as lojas. Para vender, troque para uma loja (Trocar de loja)."
2. **O pedido de transferência continua igual.** O depósito separa, envia e recebe como uma loja. O pedido reserva no depósito, como nas lojas desde 18/11.
3. **A tela Lojas diz por que um local não vende.** Os selos são:
   - "não vende: falta o CNPJ";
   - "não vende: depósito";
   - "não vende: local de exceção" (o DEFEITOS).
4. **Em Trocar de loja,** o depósito aparece com "depósito (centro de distribuição) · não vende".

## Os passos (no sistema real)

1. Entre em **ora5g.com.br** com a sua conta.
2. Abra **Gestão → Lojas**. Confira os selos:
   - o **DEFEITOS** mostra "não vende: local de exceção";
   - as lojas ainda sem CNPJ mostram "não vende: falta o CNPJ".
3. Hoje não há depósito cadastrado no sistema. **Só se a Ora tiver um centro de distribuição de verdade:**
   - cadastre-o em **Gestão → Lojas**, com o tipo **Depósito**;
   - confira o selo "não vende: depósito";
   - em **Trocar de loja**, escolha o depósito: aparece "não vende";
   - tente vender lá em **Vender**: o sistema mostra a mensagem do item 1 de "O que mudou".
4. Responda **"aceito"** ou **"o depósito vende"**.

## O que fica de fora

- **O estoque por canal** (separar parte do estoque para o site e para os marketplaces). Depende da loja online e dos marketplaces de verdade (ORA-INV-012).

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/transferencias.test.ts`, o bloco do centro de distribuição):
  - o depósito recusa a venda (OR043), mesmo direto nas tabelas;
  - o depósito recusa a reserva de venda da loja e do site;
  - o pedido de transferência que sai do depósito reserva, separa, envia e chega na loja, sem divergência no livro do estoque.
- **Nas telas** (em `apps/plataforma/src/`: `lib/vendas/regras.test.ts`, `lib/lojas/regras.test.ts` e `lib/loja/*.test.ts`):
  - a mensagem própria da recusa;
  - o selo de cada local que não vende.
