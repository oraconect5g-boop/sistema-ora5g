# Roteiro de aceite: lote J3-c (cancelar e devolver, com três pessoas, na loja de teste)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, com a sua conta de dono em `ora5g.com.br`, de preferência pelo celular.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** o teste automático do cancelamento com estorno e da devolução de um item, no site no ar (itens ORA-POS-010, ORA-PAY-003 e ORA-PAY-005). O seu sim de 21/11: "Cancelar e devolver", só nas lojas de teste, sem cliente de verdade e sem estorno de verdade.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que aconteceu.

## O que o teste faz

Com três contas de teste da loja **Santa Cândida (teste)**, o **Vendedor (teste)**, o **Gerente (teste)** e o **Dono (teste)**, num celular simulado de 360 px, no site no ar:

1. O gerente **abre o caixa dele com R$ 150,00 de troco**, para ter dinheiro a devolver (o dinheiro devolvido sai do caixa de quem cancela ou devolve). Se um caixa dele ficou aberto de uma vez que falhou, antes ele o fecha e o dono confere.
2. O vendedor **vende uma capa de proteção** (R$ 79,00): R$ 50,00 em dinheiro e R$ 29,00 em Pix direto.
3. O gerente abre o comprovante e **cancela com estorno**, com o motivo. A venda fica **cancelada** (nada se apaga: o comprovante continua, com o motivo). Os R$ 50,00 saem do caixa dele; o Pix fica como **estorno a confirmar**.
4. O gerente **confirma o estorno do Pix** com o código do comprovante (um código de teste).
5. A capa **só volta ao estoque depois de conferida**: o gerente diz que ela voltou, "Novo (lacrado)", e ela volta à contagem do Estoque.
6. O vendedor **vende duas capas** (R$ 158,00 em dinheiro).
7. O gerente **devolve uma das duas**, "Novo (lacrado)", com **R$ 79,00 em dinheiro** do caixa dele. A capa volta ao estoque na hora, e o comprovante mostra a devolução e "Devolvido − R$ 79,00".
8. O gerente **fecha o caixa contando R$ 21,00** (R$ 150,00 − R$ 50,00 − R$ 79,00), sem diferença, e o **Dono (teste) confere** (quem fecha não confere o próprio caixa).

Leva cerca de 40 segundos. Rodou duas vezes em 21/11 (às 09:34 e às 09:36) e passou nas duas.

## O que fica gravado (só na loja de teste)

- **Por vez:** uma venda cancelada (a capa, R$ 79,00, com o dinheiro e o Pix estornados, o estorno do Pix confirmado e a capa recebida de volta), uma venda de duas capas com uma devolvida (R$ 79,00 em dinheiro), e um caixa do Gerente (teste) aberto com R$ 150,00, com os dois estornos em dinheiro, fechado com R$ 21,00 e conferido pelo Dono (teste).
- **Em 21/11:** as vendas **nº 12 e 14** (canceladas) e **nº 13 e 15** (com uma capa devolvida cada). Cada vez gasta uma capa (vende três, voltam duas).
- **O caixa do Vendedor (teste) fica aberto**, com o dinheiro das vendas; a prova do caixa (J3-a) fecha e confere esse caixa quando roda.
- **Nenhum dinheiro, Pix ou estorno de verdade:** os comprovantes são códigos de teste. **Nenhum cliente e nenhum pedido de nota fiscal.**

## Os passos (com a sua conta)

1. Entre como dono em **ora5g.com.br** e escolha a loja **Santa Cândida (teste)**.
2. Abra **Vendas** (no menu) e escolha o período que inclui 21/11.
3. Abra a venda **nº 12**: deve aparecer **cancelada**, com o motivo, o estorno do Pix **confirmado** com o comprovante de teste e a capa **recebida** ("Novo (lacrado)").
4. Abra a venda **nº 13**: deve aparecer **concluída**, com a devolução de uma capa e "Devolvido − R$ 79,00".
5. Se quiser, faça você mesmo com uma venda de teste sua: no comprovante, **Cancelar esta venda (estorno)** ou **Devolver ou trocar itens** (precisa do seu caixa aberto quando o reembolso é em dinheiro).
6. Responda **"aceito"** ou **"não aceito"**.

## Como rodar de novo (no servidor)

```bash
cd apps/plataforma && ORA_E2E_URL=https://ora5g.com.br ORA_E2E_CONTAS=$HOME/homologacao/contas-de-teste.txt npx playwright test e2e/cancelar-e-devolver-real.spec.ts --project=celular-360 --workers=1
```

## O que fica de fora

- **Troca por vale-troca** (devolver um item e usar o vale numa venda nova) e **troca com diferença de preço** (ORA-POS-012): ficam para uma próxima prova, se você quiser.
- **Item que não voltou** e **item avariado**: os testes do banco cobrem. Hoje, uma capa devolvida como avariada volta à contagem da loja com a condição registrada (o acessório não tem número de série); levar o item avariado para DEFEITOS é o pedido #60.
- **Cancelar uma venda com nota fiscal emitida:** só depois de registrado o cancelamento no fisco; a prova não pede nota.
- **A política de troca e devolução** (prazos, quem pode, até quanto): é a sua decisão D-026.
- **No CI:** o teste precisa do arquivo das contas de teste, que só existe no servidor; no CI, ele fica pulado.
