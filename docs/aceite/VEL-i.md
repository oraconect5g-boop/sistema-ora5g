# Roteiro de aceite: lote VEL-i (o comprovante da venda em três rodadas)

- **Quem faz:** o proprietário.
- **Quando:** depois da publicação, com a sua conta de dono em `ora5g.com.br`, pelo celular.
- **Quanto tempo leva:** uns 3 minutos.
- **O que o lote entrega:** o seu sim de 19/11 a medir e acelerar o comprovante da venda, dentro da orientação de 18/11 ("medir antes/depois em celular autenticado"). Junto, o nome de quem vendeu no comprovante, para a gerência, pelo mesmo caminho da lista de Vendas (VND-a).
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## O que mudou

1. **O comprovante lê o banco em 3 rodadas, em vez de 7 a 8 em fila.**
   - Antes, a tela esperava a venda, depois os detalhes, depois os produtos, depois o aparelho, depois a regra de preço, depois as notas canceladas e por fim os documentos, cada um pagando a ida e volta até o banco.
   - Agora:
     - a primeira rodada é a sessão;
     - a segunda traz a venda e tudo o que depende só do número dela;
     - a terceira traz o que depende da venda (a loja, o vendedor, as permissões, os produtos, o aparelho, a nota emitida, as notas canceladas e os documentos);
     - os links dos arquivos vêm por último, só quando há arquivo.
   - As mesmas leituras, nas mesmas condições: só a ordem mudou. Nenhuma migration.
2. **O nome de quem vendeu, para a gerência.** O comprovante mostrava "Vendedor: —" ao gerente, pelo mesmo motivo da lista de Vendas (o perfil de outra pessoa só se lê com a permissão de cuidar da equipe). Agora o nome vem pelo ranking, como no Início e na lista.

## Antes e depois

Medido com a conta do Gerente (teste) na Santa Cândida (teste), 5 aberturas de cada. O antes no site; o depois na versão nova montada no servidor, ligada ao mesmo banco de teste.

| Medida | Antes | Depois |
|---|---|---|
| O comprovante de uma capa: tempo no banco | 1,44 s (8 rodadas) | 0,66 s |
| Até a tela carregar | 1,46 s | 0,69 s |
| O comprovante de um aparelho: tempo no banco | 1,62 s (9 rodadas) | 0,74 s |
| Até a tela carregar | 1,64 s | 0,77 s |
| O toque numa venda da lista até o comprovante | 1,86 s | 0,86 s |

## Os passos (com a sua conta)

1. Entre como dono em **ora5g.com.br** e escolha a **Santa Cândida (teste)**.
2. Abra **Vendas**, escolha **30 dias** e toque numa venda: o comprovante deve abrir em menos de um segundo, com tudo o que mostrava antes (itens, pagamentos, nota, devolução e documentos).
3. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **`apps/plataforma/src/app/vendas/comprovante-rodadas.test.ts`,** com o banco simulado respondendo sempre um instante depois e cada pedido anotando a rodada em que saiu:
  - a venda de uma capa espera 2 rodadas depois da sessão (eram 6), e a de um aparelho também 2 (eram 7);
  - com os documentos da venda, 3 (eram 7);
  - a gerência vê o nome do colega pelo ranking; sem o ranking, "—"; a própria venda mostra o próprio nome sem perguntar ao ranking.
  - Com o comprovante antigo, 4 desses casos falham.
- **Os seis testes que já existiam do comprovante** (o cancelamento da nota, a carta de correção, o conserto da OS, os documentos, o envio da nota pelo WhatsApp e a regra de preço) passam sem mudança.

## O que fica de fora

- **O comprovante numa ida só ao banco** (uma função no banco, como no Catálogo e nas Transferências): seriam 2 rodadas em vez de 3, mas a tela lê muitas partes que podem faltar num banco antigo (a nota, os documentos, as cartas, os envios), e uma função juntaria tudo isso. Fica para depois, se valer a pena.
