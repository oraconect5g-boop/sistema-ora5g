# Roteiro de aceite: lote J1-b (a venda de ponta a ponta no celular, na loja de teste)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, com a sua conta de dono em `ora5g.com.br`, de preferência pelo celular.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** o teste automático que faltava (itens ORA-POS-002 e ORA-QUAL-010): uma venda de verdade, do começo ao fim, num celular, com a conta de teste do vendedor. O seu sim de 19/11: "Sim, seguir", para o teste que grava vendas de teste na loja Santa Cândida (teste).
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que aconteceu.

## O que o teste faz

Com a conta de teste do vendedor, na loja **Santa Cândida (teste)**, num celular simulado de 360 px, no site no ar:

1. **Abre o caixa**, se estiver fechado, com o fundo de troco R$ 0,00.
2. **Cancela uma venda que tenha ficado aberta** numa vez que o teste falhou, com o motivo "teste automático: a venda anterior ficou incompleta". O item volta ao estoque.
3. **Confere quantas capas de proteção (ACE-0001) estão livres** na lista do Estoque.
4. **Abre uma venda nova**, procura a capa pelo código (SKU), põe no carrinho, **tira** e põe de novo.
5. **Paga em dinheiro** (R$ 79,00, o valor que o sistema preenche) e **conclui**.
6. **Confere o comprovante** ("Venda concluída", "Estoque baixado e pagamento registrado no seu caixa") e **o estoque**, que tem uma capa a menos.

Leva cerca de 18 segundos. Rodou quatro vezes em 19/11:

- na primeira, o teste olhou o caixa antes de a tela terminar de chegar e parou sem concluir; a venda ficou aberta e foi cancelada pela vez seguinte, como previsto;
- na segunda, a venda foi concluída, mas a conta do estoque comparou com a medida feita antes desse cancelamento;
- corrigidos os dois pontos do teste (não do sistema), passou duas vezes seguidas.

## O que fica gravado (só na loja de teste)

- **Uma venda concluída por vez:** a capa de proteção, R$ 79,00, paga em dinheiro, no nome do Vendedor (teste). Em 19/11 ficaram 3 vendas concluídas (R$ 237,00) e 1 venda cancelada (a da primeira tentativa).
- **O estoque da capa na loja de teste:** de 22 para 19.
- **O caixa do Vendedor (teste) fica aberto**, para a vez seguinte, com o dinheiro dessas vendas.
- **Nenhum pedido de nota fiscal**, nenhuma loja de verdade e nenhum cliente.

Quando a capa acabar na loja de teste, o teste para com o aviso "a loja de teste precisa de pelo menos uma Capa de proteção (ACE-0001) livre".

## Os passos (com a sua conta)

1. Entre como dono em **ora5g.com.br** e escolha a loja **Santa Cândida (teste)**.
2. Abra **Vendas**: devem aparecer as vendas do **Vendedor (teste)**, cada uma de R$ 79,00, em dinheiro.
3. Abra uma delas: o comprovante deve mostrar a capa de proteção e "concluída".
4. Se quiser, faça você mesmo uma venda pelo celular, como no roteiro `docs/aceite/PDV-c.md`.
5. Responda **"aceito"** ou **"não aceito"**.

## Como rodar de novo (no servidor)

```bash
cd apps/plataforma && ORA_E2E_URL=https://ora5g.com.br ORA_E2E_CONTAS=$HOME/homologacao/contas-de-teste.txt npx playwright test e2e/venda-real.spec.ts --project=celular-360
```

## O que fica de fora

- **Fechar o caixa e a conferência pelo gerente:** o teste deixa o caixa aberto, para não criar uma pendência para o gerente a cada vez.
- **Aparelho com IMEI, desconto com aprovação e pagamento misto:** ficam para um próximo teste, se você quiser.
- **No CI:** o teste precisa do arquivo das contas de teste, que só existe no servidor; no CI, ele fica pulado.
