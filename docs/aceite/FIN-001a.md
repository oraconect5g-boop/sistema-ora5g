# Roteiro de aceite: lote FIN-001a (a conta do período: as vendas conferidas com os pagamentos, o caixa e o estoque)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, com a sua conta de dono em `ora5g.com.br`, pelo celular ou pelo computador.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** a primeira parte do "fechamento conferido com o livro" (item ORA-FIN-001, que segue **parcial**: veja "O que ainda falta").
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que mudou

1. **Antes:** o Financeiro somava as vendas, os pagamentos e os caixas, cada um por si. Em lugar nenhum o sistema dizia se essas três coisas **batiam entre si** e com os livros (o do caixa e o do estoque).
2. **Agora o Financeiro tem o cartão "A conta do período"**, logo abaixo do resumo. Para as vendas concluídas no período escolhido (hoje, 7 ou 30 dias), da loja ou da rede, o sistema confere **venda por venda**:
   - **Pagamentos:** o que foi pago, menos o troco, é o total da venda. O cartão mostra de onde veio o vendido: o recebido na loja, o que as financeiras devem, o vale-troca e os pagamentos de vendas canceladas depois.
   - **Livro do caixa:** o que cada venda lançou no caixa ao ser concluída (dinheiro, Pix, cartão, entrada do financiamento e vale-troca, com o troco que saiu) está no livro dos caixas, ligado àquela venda.
   - **Livro do estoque:** cada aparelho, chip e acessório vendido tem a saída no livro do estoque, ligada àquela venda. Serviço e recarga não têm estoque.
3. **Quando tudo bate**, o cartão diz **"A conta fecha"**, com quantas vendas e quanto foi vendido, e cada lado mostra o selo "fecha".
4. **Quando alguma venda não bate**, o cartão diz **"A conta não fecha"**, em qual dos três lados, de quanto é a diferença e **quais vendas abrir** (cada uma com o atalho). O sistema não corrige nada sozinho: ele mostra, e alguém olha.
5. **Sem venda no período**, o cartão diz que não há o que conferir. Se a leitura falhar, ele diz que não deu para conferir: uma falha nunca aparece como "fecha".
6. **Quem vê:** quem já vê o Financeiro (o gerente, na loja dele; o dono e o administrador, em qualquer loja ou na rede inteira). O vendedor não vê, e o banco também recusa.
7. **Um aviso antigo foi corrigido:** no fim da tela, o cartão "Ainda não está no financeiro real" dizia que a conciliação com os extratos ainda dependia dos arquivos. Ela existe desde 17/11 (em **Gestão → Conciliação de pagamentos → Extratos por arquivo**); o que falta é a ligação direta com o banco e com a maquininha, sem arquivo, que depende de contrato. O cartão também passou a citar os caminhos como estão no menu.

## O que ainda falta (por isso o item segue parcial)

- **O que foi desfeito depois:** quando uma venda é cancelada ou devolvida, o estoque volta e o dinheiro é devolvido. Esta conta ainda **não confere** esses dois movimentos; o cartão diz isso no rodapé. É o próximo lote (FIN-001b).
- **O dinheiro que caiu no banco:** a conta confere o que o sistema registrou, não o que o banco pagou. Isso é a conciliação com o extrato, que já existe em outra tela e depende dos seus extratos (item E3 da lista de pendências).

## Os passos

1. Entre na **Santa Cândida (teste)** e abra **Gestão → Financeiro**.
2. No filtro **Período**, toque em **30 dias**.
3. Logo abaixo do resumo, veja o cartão **A conta do período**. Ele deve dizer **"A conta fecha: 20 vendas, R$ 4.281,00 vendidos."** (o número cresce se alguém vender na loja de teste depois de 23/11).
4. Confira os três quadros: **Pagamentos**, **Livro do caixa** e **Livro do estoque**, cada um com o selo "fecha". No de pagamentos, as parcelas somam o vendido; nos outros dois, os dois números são iguais.
5. Compare com o indicador **Vendas concluídas**, no resumo acima: a quantidade de vendas é a mesma.
6. No filtro **Loja**, toque em **Rede inteira**: o cartão continua fechando (as lojas de verdade ainda não têm venda).
7. Toque em **Hoje**: se ninguém vendeu hoje, o cartão diz "Nenhuma venda concluída no período: não há o que conferir."
8. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/financeiro-conferencia.test.ts`): um dia de loja com venda em dinheiro com troco, Pix com dinheiro, PayJoy com entrada, recarga, uma venda cancelada depois e uma devolução parcial, e a conta fecha; outro dia com vale-troca, cartão parcelado, Aiva com a entrada lançada à parte e uma venda em dinheiro com troco cancelada depois, e a conta fecha; uma saída de estoque lançada em dobro é acusada, com a venda; duas diferenças que se anulam na soma são acusadas pela contagem; o período e a loja são respeitados; o gerente confere só a loja dele; o vendedor, o gerente de outra loja e outra empresa são recusados.
- **Na tela** (`apps/plataforma/src/app/financeiro/financeiro.test.ts` e `apps/plataforma/src/lib/financeiro/conferencia.test.ts`): o cartão que fecha, o que não fecha (com as vendas e os atalhos), o sem venda, a falha de leitura (nunca "fecha") e o banco sem a função (o cartão não aparece e o resto da tela continua).
- **No banco do site, sem gravar nada** (23/11): com as cinco contas de teste, a função respondeu o esperado: o Dono (teste) e o Administrador (teste) veem as duas lojas e a rede; cada gerente, só a própria loja (a outra é recusada); o Vendedor (teste) é recusado.
- **A prova de leitura no site** (`apps/plataforma/e2e/conta-do-periodo-real.spec.ts`): só abre telas. Roda depois da publicação, e o resultado fica no registro das publicações, a branch `registro/publicacoes` do repositório.
- **Migration:** `20261123182645_financeiro_conferencia` (aplicada no banco da homologação em 23/11, com a reversão guardada). É uma função nova, que só lê: nenhuma tabela mudou e nada foi trocado.
