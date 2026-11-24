# Roteiro de aceite: lote ONLINE-e (a compra com um botão só e o número no Carrinho)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, pelo celular, em `ora5g.com.br/loja`. A vitrine ainda está vazia (os produtos chegam com o catálogo de verdade). Por isso, a página do produto você confere nas telas com produtos de mentira que mandei na conversa em 24/11, e no site confere o topo e o carrinho.
- **Quanto tempo leva:** uns 3 minutos.
- **O que o lote entrega:** o seu pedido de 24/11 ("Sim, simplificar"), depois de ver as telas da loja com produtos de mentira. Os itens ORA-ONLINE-001 (a vitrine e a página do produto) e ORA-ONLINE-002 (o pedido do site) **seguem parciais**: faltam os produtos de verdade, o pagamento pelo site e a entrega.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que mudou

1. **Um botão só para comprar.** Na página do produto, cada loja com estoque tem só **"Pôr no carrinho"**. Antes eram dois ("Reservar" e "Pôr no carrinho"), dois caminhos para a mesma coisa. No carrinho, o cliente reserva tudo de uma vez por 24 horas (até 3 unidades da mesma loja) e paga e retira na loja.
2. **O número no Carrinho.** No topo de todas as telas da loja, o "Carrinho" ganha uma bolinha com quantos itens há nele. Quem usa leitor de tela ouve "Carrinho, 2 itens". Quando o carrinho fica vazio, a bolinha some.
3. **Sem foto, um espaço baixo.** Enquanto o produto não tem foto, a página mostra "Sem foto por enquanto" num espaço baixo, em vez de um quadrado grande vazio: o preço e as lojas aparecem logo.
4. **O topo cabe no celular.** Num celular de 360 px, o topo fica numa linha só. Nos aparelhos bem pequenos (320 px), o selo "Loja online" some para tudo caber.
5. **A página de reservar um item continua no ar** para algum link antigo que exista, mas não é mais oferecida na loja.

## Os passos (só leitura; nada é gravado)

1. Abra `ora5g.com.br/loja` pelo celular. No topo, o **"Carrinho"** aparece sem número.
2. Veja as telas com produtos de mentira que mandei na conversa: a página do produto com um botão só em cada loja e o carrinho com o número **2** no canto do "Carrinho".
3. Quando os produtos de verdade estiverem no site: abra um produto, toque em **"Pôr no carrinho"** numa loja e veja o número **1** aparecer no topo; no carrinho, toque em **"Tirar"**, e o número some. Pôr no carrinho e tirar não reservam nada: a reserva só acontece no botão "Reservar o pedido por 24 horas".
4. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **Na tela** (`apps/plataforma/src/app/loja/loja.test.ts` e `apps/plataforma/src/app/loja/layout.test.ts`): a página do produto sem o "Reservar" e sem nenhum link para a página de reservar; o "Pôr no carrinho" só nas lojas com estoque; o texto novo de "Como comprar"; sem foto, o espaço baixo; o topo com o número e o nome para o leitor de tela (1 item, 2 itens) e, com o carrinho vazio ou estranho, sem número.
- **Na loja local, com produtos de mentira** (24/11; um servidor de mentira no papel do banco, sem tocar o banco de verdade): na página do produto, nenhum "Reservar" e três "Pôr no carrinho" (só nas lojas com estoque); pondo dois itens, o topo foi a 1 e a 2; tirando um, voltou a 1, e continuou certo de volta na vitrine; o topo numa linha só em 320, 360 e 412 px, sem rolagem para o lado.
- **A prova de leitura no site** (`apps/plataforma/e2e/loja-um-botao-real.spec.ts`): com um carrinho fictício só no navegador da prova (dois itens que não existem no site), o topo diz "Carrinho, 2 itens"; o carrinho mostra os dois como fora de venda, sem o botão de reservar; tirar um item leva o topo a 1, e tirar o outro deixa o carrinho vazio. Tirar só reescreve o carrinho do navegador: nada vai ao banco. Roda depois da publicação, e o resultado fica no registro das publicações, a branch `registro/publicacoes` do repositório.
- **Sem migration:** nada mudou no banco.
