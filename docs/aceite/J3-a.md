# Roteiro de aceite: lote J3-a (o caixa de ponta a ponta, com duas pessoas, na loja de teste)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, com a sua conta de dono em `ora5g.com.br`, de preferência pelo celular.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** o teste automático do caixa inteiro, no site no ar (itens ORA-PAY-004, ORA-PAY-005 e ORA-PAY-006): abrir com o troco, lançar suprimento e sangria, pedir uma saída de dinheiro que outra pessoa autoriza, fechar contando a gaveta e a conferência pelo gerente. O seu sim de 21/11: "Abrir e fechar o caixa", só nas lojas de teste.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que aconteceu.

## O que o teste faz

Com duas contas de teste da loja **Santa Cândida (teste)**, o **Vendedor (teste)** e o **Gerente (teste)**, num celular simulado de 360 px, no site no ar:

1. **Fecha o caixa que ficou aberto** de uma vez anterior (de uma venda de teste), contando o dinheiro que a tela diz que está na gaveta, e o gerente confere. Se não há caixa aberto, pula este passo.
2. O vendedor **abre o caixa com R$ 50,00 de troco**.
3. **Lança R$ 10,00 de suprimento e R$ 20,00 de sangria**, cada um com o motivo. A gaveta fica com R$ 40,00.
4. **Pede uma saída de R$ 5,00** ("saída para o motoboy"). O gerente **autoriza** no Caixa dele, e a gaveta do vendedor fica com R$ 35,00.
5. O vendedor **fecha o caixa contando R$ 35,00**: sem diferença.
6. O gerente **confere** o caixa fechado, na lista "Caixas fechados para conferir".

O gerente só confere os caixas que o teste fechou (cada um leva na observação "teste automático do caixa" e a hora de Brasília). Leva cerca de 20 segundos. Rodou três vezes em 21/11 (às 09:15, 09:16 e 09:25) e passou nas três.

## O que fica gravado (só na loja de teste)

- **Por vez:** um caixa do Vendedor (teste) aberto com R$ 50,00, com um suprimento de R$ 10,00, uma sangria de R$ 20,00 e uma saída autorizada de R$ 5,00, fechado com R$ 35,00, sem diferença, e conferido pelo Gerente (teste).
- **Em 21/11:** três caixas assim; e dois caixas que tinham ficado abertos, fechados sem diferença e conferidos: o das vendas de teste de 19/11 (R$ 237,00 em dinheiro) e o das vendas com desconto do J3-b (R$ 60,00 em dinheiro).
- **No fim, o caixa do vendedor fica fechado.** A venda de teste abre outro quando precisar.
- **Nenhuma loja de verdade, nenhum cliente e nenhum dinheiro de verdade.**

## Os passos (com a sua conta)

1. Entre como dono em **ora5g.com.br** e escolha a loja **Santa Cândida (teste)**.
2. Abra **Financeiro** (no menu) e escolha o período que inclui 21/11: no cartão **Fechamentos**, os caixas fechados e os "Conferidos pela gerência"; no cartão **Movimentação dos caixas**, o fundo, o suprimento, a sangria e a saída autorizada.
3. Abra **Caixa** (no menu, em Operação): a lista "Caixas fechados para conferir" não deve ter nenhum caixa do teste (todos já foram conferidos).
4. Se quiser, faça você mesmo: abra um caixa, lance uma sangria e feche contando o dinheiro. Para a conferência, precisa de outra pessoa (quem fecha não confere o próprio caixa).
5. Responda **"aceito"** ou **"não aceito"**.

## Como rodar de novo (no servidor)

```bash
cd apps/plataforma && ORA_E2E_URL=https://ora5g.com.br ORA_E2E_CONTAS=$HOME/homologacao/contas-de-teste.txt npx playwright test e2e/caixa-real.spec.ts --project=celular-360 --workers=1
```

## O que fica de fora

- **Fechar com diferença** (faltando ou sobrando dinheiro) e a explicação que o sistema pede nesse caso: os testes do banco cobrem; o teste no site fecha sempre sem diferença, para não deixar um alerta de "Caixas com diferença" no Início a cada vez.
- **Negar uma saída:** o teste só autoriza.
- **No CI:** o teste precisa do arquivo das contas de teste, que só existe no servidor; no CI, ele fica pulado.
