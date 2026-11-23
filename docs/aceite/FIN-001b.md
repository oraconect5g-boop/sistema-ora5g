# Roteiro de aceite: lote FIN-001b (a conta do que foi desfeito: cancelamentos e devoluções)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, com a sua conta de dono em `ora5g.com.br`, pelo celular ou pelo computador.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** a segunda parte da conta do período. Com ela, o item ORA-FIN-001 passa a **testado**; para virar homologado, faltam a revisão do Codex e o seu aceite.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que mudou

1. **Antes:** o cartão "A conta do período" conferia as vendas concluídas e avisava, no rodapé, que o que era desfeito depois ainda não era conferido.
2. **Agora o mesmo cartão tem a parte de baixo, "O que foi desfeito no período".** Para cada cancelamento e cada devolução do período, da loja ou da rede, o sistema confere:
   - **Destino do valor:** o valor desfeito tem para onde ir. É a soma do que voltou em dinheiro, do que ficou como estorno de Pix, cartão ou financeira e do que virou vale-troca.
   - **Livro do caixa:** o dinheiro devolvido está lançado no livro dos caixas, como estorno, ligado à venda.
   - **Livro do estoque:** o que voltou está no livro do estoque. Na devolução, a mercadoria volta na hora. No cancelamento, cada item espera a conferência de quem recebe: só o conferido entra no estoque.
3. **O que espera alguém aparece, sem ser erro:**
   - o estorno de Pix, cartão ou financeira que ainda espera o comprovante;
   - o item de venda cancelada que espera a conferência;
   - o item que não voltou, com a explicação registrada.
   Cada um vem com o atalho **"Ver as vendas canceladas"**.
4. **Quando alguma coisa não bate**, o cartão diz **"O desfeito não fecha"**, em qual dos três lados, de quanto é a diferença e quais vendas abrir. O sistema não corrige nada sozinho.
5. **Cada fato entra na data dele:** a venda feita no mês passado e cancelada hoje aparece no desfeito de hoje, como no resumo do Financeiro.

## Os passos

1. Entre na **Santa Cândida (teste)** e abra **Gestão → Financeiro**.
2. No filtro **Período**, toque em **30 dias**.
3. No cartão **A conta do período**, veja a parte de baixo, **O que foi desfeito no período**. Ela deve dizer **"O desfeito fecha: 2 cancelamentos e 2 devoluções, R$ 316,00."** (os números crescem se alguém cancelar ou devolver na loja de teste depois de 23/11).
4. Confira os três quadros, cada um com o selo "fecha":
   - **Destino do valor:** "O desfeito (R$ 316,00) é a soma de: R$ 258,00 devolvidos em dinheiro + R$ 58,00 em estorno de Pix, cartão ou financeira."
   - **Livro do caixa:** R$ 258,00 dos dois lados.
   - **Livro do estoque:** 4 unidades desfeitas, 4 voltaram, 4 no livro.
5. Toque em **Hoje**: se ninguém cancelou nem devolveu hoje, a parte de baixo diz "Nenhum cancelamento nem devolução no período."
6. No filtro **Loja**, toque em **Rede inteira**: o cartão continua fechando.
7. Responda **"aceito"** ou **"não aceito"**.

## O que fica de fora

- **O dinheiro que caiu no banco.** As duas contas conferem o que o sistema registrou, não o que o banco pagou. Isso é a conciliação com o extrato, que fica em **Gestão → Conciliação de pagamentos** e espera os seus extratos (item E3 da lista de pendências).

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/financeiro-conferencia-do-desfeito.test.ts`):
  - um dia com quatro cancelamentos (dinheiro com troco, Pix, PayJoy com entrada, vale com cartão) e três devoluções (em dinheiro, no Pix e em vale-troca), e a conta fecha;
  - a volta ao estoque sem a conferência, o dinheiro devolvido a mais, o estorno por fora que não soma, o item cancelado sem o registro do retorno e o reembolso em dinheiro que não está no livro do caixa são acusados, cada um com a venda;
  - duas devoluções da mesma venda contam como dois fatos e uma venda só;
  - o período e a loja são respeitados; o gerente confere só a loja dele; o vendedor e outra empresa são recusados.
- **Na tela** (`apps/plataforma/src/app/financeiro/financeiro.test.ts` e `apps/plataforma/src/lib/financeiro/conferencia.test.ts`): o desfeito que fecha, o que não fecha, o que só espera alguém, o período sem nada desfeito, a falha de leitura (nunca "fecha") e o banco sem a função (o cartão volta a dizer que o desfeito não é conferido).
- **No banco do site, sem gravar nada** (23/11): com as cinco contas de teste, a função respondeu o esperado. O dono e o administrador veem as duas lojas e a rede; cada gerente, só a própria loja; o vendedor é recusado. Na loja de teste: 2 cancelamentos e 2 devoluções, R$ 316,00, com o destino, o caixa e o estoque fechando.
- **A prova de leitura no site** (`apps/plataforma/e2e/conta-do-periodo-real.spec.ts`): só abre telas. Roda depois da publicação, e o resultado fica no registro das publicações, a branch `registro/publicacoes` do repositório.
- **Migration:** `20261123221242_financeiro_conferencia_do_desfeito` (aplicada no banco da homologação em 23/11, com a reversão guardada). É uma função nova, que só lê, e um índice no livro do estoque, para a conferência não ficar lenta quando o livro crescer. Nenhuma tabela mudou.
