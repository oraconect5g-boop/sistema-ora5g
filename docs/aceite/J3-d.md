# Roteiro de aceite: lote J3-d (o estoque de ponta a ponta, com três pessoas, na loja de teste)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, com a sua conta de dono em `ora5g.com.br`, de preferência pelo celular.
- **Quanto tempo leva:** uns 10 minutos.
- **O que o lote entrega:** o teste automático do estoque no site no ar (itens ORA-INV-003, ORA-INV-004, ORA-INV-008 e ORA-INV-009): a entrada de mercadoria e o estorno dela, a conferência dos aparelhos do dia e a contagem (inventário) com o pedido de ajuste aprovado por outra pessoa. Os seus sins de 21/11: "Entrada de mercadoria", "Conferência dos aparelhos", "Contagem de estoque" e "Pedido de ajuste", só nas lojas de teste.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que aconteceu.

## O que o teste faz

Com três contas de teste da loja **Santa Cândida (teste)**, o **Vendedor (teste)**, o **Gerente (teste)** e o **Dono (teste)**, num celular simulado de 360 px, no site no ar:

1. **O fornecedor de teste.** Não havia nenhum fornecedor cadastrado no sistema. Na primeira vez, o gerente cadastrou o **"Fornecedor (teste)"**, sem CNPJ, com o motivo; nas seguintes, ele já existe.
2. **A entrada.** O gerente registra a compra fictícia de **3 capas de proteção** e de **um Galaxy A15** com um IMEI de teste (válido e novo a cada vez), com o documento "NF-TESTE-…". As capas entram na contagem da loja.
3. **O estorno.** O gerente estorna a entrada, com o motivo: as 3 capas e o aparelho saem do estoque pelo livro. O vendedor tenta conferir o IMEI do aparelho estornado, e o sistema responde que ele não está nesta loja.
4. **A conferência do dia.** O vendedor confere os **aparelhos pelo IMEI** (digitado, como se lesse o aparelho na mão) e os **chips pela lista**, até não sobrar nenhum: **9 de 9** conferidos hoje (4 aparelhos e 5 chips).
5. **A contagem e o pedido de ajuste.** O vendedor abre um **inventário da capa** e conta **uma a mais** do que o sistema tem (a capa "achada no fundo da gaveta"). A contagem é às cegas: o sistema só mostra o próprio número depois do envio. Ele envia para aprovação, com o motivo.
6. **Quem aprova.** O **gerente abre o inventário, mas não tem como decidir**: hoje ele pode pedir ajuste, não aprovar. O **Dono (teste) aprova**, e o estoque da capa sobe uma (assim a prova repõe a capa que as provas de venda gastam).

Leva cerca de 40 segundos. Rodou duas vezes em 21/11 (às 09:52 e às 09:54) e passou nas duas (antes, duas tentativas pararam no começo por dois erros do próprio teste, sem gravar nada).

## O que fica gravado (só na loja de teste)

- **O "Fornecedor (teste)"**, sem CNPJ, ativo. Ele vale para a rede inteira (os fornecedores não são por loja) e pode ser desativado quando o senhor quiser.
- **Por vez:** uma entrada de compra (3 capas e 1 aparelho com IMEI de teste), **estornada** com o motivo; a conferência do dia dos aparelhos e chips da loja de teste; e um inventário da capa, **aprovado**, com o ajuste de +1.
- **Em 21/11:** as entradas **nº 1 e 2** e os inventários **nº 1 e 2** (os primeiros do sistema). O estoque da capa na loja de teste foi de **13 para 15**.
- **Nenhuma compra de verdade**, nenhuma nota de fornecedor e nenhum custo: a entrada não informa custo, para não mudar o custo da capa nem do aparelho.

## Os passos (com a sua conta)

1. Entre como dono em **ora5g.com.br** e escolha a loja **Santa Cândida (teste)**.
2. Abra **Estoque e conferência** (no menu, em Estoque e catálogo) e toque em **Conferência do dia**: deve mostrar os aparelhos e chips conferidos hoje.
3. No Estoque, toque em **Entrada de mercadoria**: no histórico "Entradas desta loja", as entradas nº 1 e 2 aparecem **estornadas**, com o motivo.
4. Toque em **Inventário** (no Estoque): os inventários nº 1 e 2 aparecem **aprovados**; abra um: "Sistema: 13 · Contado: 14 · diferença +1 · ajuste aplicado 1".
5. Se quiser, faça você mesmo uma contagem de um acessório e aprove a de outra pessoa (quem conta não aprova a própria).
6. Responda **"aceito"** ou **"não aceito"**.

## Uma decisão sua

**Quem aprova o ajuste de estoque.** Hoje só o papel de **dono** aprova (a permissão "ajustar o estoque"); o **gerente** e o **vendedor** podem contar e pedir o ajuste, mas não aprovar. Se o senhor quiser que o gerente também aprove os ajustes da loja dele, é uma mudança de permissão, que só faço com o seu sim.

## Como rodar de novo (no servidor)

```bash
cd apps/plataforma && ORA_E2E_URL=https://ora5g.com.br ORA_E2E_CONTAS=$HOME/homologacao/contas-de-teste.txt npx playwright test e2e/estoque-real.spec.ts --project=celular-360 --workers=1
```

## O que fica de fora

- **A entrada ligada a um pedido de compra** (o pedido ao fornecedor e o recebimento dele): fica para uma próxima prova, se o senhor quiser.
- **A contagem com falta** (contar menos do que o sistema) e a **recusa** do inventário: os testes do banco cobrem; a prova conta a mais, para repor a capa.
- **A contagem de aparelhos pelo IMEI no inventário:** a prova conta só a capa (acessório, por quantidade).
- **No CI:** o teste precisa do arquivo das contas de teste, que só existe no servidor; no CI, ele fica pulado (só a conta do IMEI de teste roda no CI).
