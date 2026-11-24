# Roteiro de aceite: lote ONLINE-g (a cara de loja da loja online)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, em `ora5g.com.br/loja`, no celular e, se puder, no computador.
- **Quanto tempo leva:** uns 3 minutos.
- **O que o lote entrega:** o seu pedido de 24/11: "esse é o antigo site [lojasupercell.com.br], a loja tem que ficar melhor do que ele visualmente". O site antigo tem banners grandes e um rodapé completo, mas no celular corta texto pelas bordas e, no computador, metade da página fica em branco (a lista de produtos, o Instagram e as promoções não carregam). A loja nova ganhou a cara de loja sem copiar o antigo e só com o que é verdade hoje. O item ORA-ONLINE-001 (a vitrine) **segue parcial**: faltam as fotos de todos os produtos e o CNPJ das lojas.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu (e, se quiser, o que mudaria no visual).

## O que mudou

1. **O topo:** um painel com gradiente azul e violeta, o título "Tudo para o seu celular, com retirada na loja" e a busca em destaque. No computador, ao lado, quatro atalhos ilustrados das categorias (Fones, Capinhas, Carregadores e Caixa de som), que levam direto a cada uma.
2. **As vantagens:** "Retire na loja", "Reserva por 24 horas" e "Pague na retirada (dinheiro, Pix ou cartão no balcão)". No celular, em três blocos compactos, para os produtos aparecerem logo.
3. **As categorias em blocos com ícone** (fone, carregador, cabo, caixa de som...), numa fileira que corre para o lado; a escolhida fica azul.
4. **O título da seção:** "Todos os produtos", o nome da categoria ou "Resultados para ..." da busca, com a contagem ao lado.
5. **Os cartões dos produtos:** a foto em fundo branco, o nome mais leve e uma sombra suave ao passar o mouse.
6. **O rodapé escuro:** a marca, "Como comprar" em três passos (escolha, reserve, retire e pague na loja), "Acompanhar o pedido" e "Ver o carrinho", e o aviso dos preços e das imagens.

O que fica para depois, porque depende de você: o CNPJ e o endereço de cada loja (para o rodapé dizer onde fica cada uma e para a loja online vender), o telefone e o WhatsApp de atendimento (os do site antigo podem estar velhos) e os textos das políticas (troca, garantia e privacidade).

## Os passos (só leitura; nada é gravado)

1. Abra `ora5g.com.br/loja` pelo celular. Confira o topo, as três vantagens e as categorias em blocos (deslize para o lado).
2. Toque numa categoria: o título passa a ser o nome dela, e as vantagens somem para os produtos virem primeiro.
3. Busque "fone": "Resultados para "fone"".
4. Desça até o fim: o rodapé com "Como comprar".
5. Se puder, abra no computador: os quatro atalhos ilustrados ao lado do título.
6. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **Na tela** (`apps/plataforma/src/app/loja/loja.test.ts` e `layout.test.ts`): a vitrine principal com as vantagens, os atalhos e "Todos os produtos"; a categoria e a busca com o título delas e sem as vantagens; a categoria escolhida marcada; o rodapé com os passos e os links. O ícone de cada família e a escolha dos atalhos (`src/lib/loja/categorias.test.ts`).
- **Conferido na loja local, com o catálogo de verdade (só leitura),** em 360 e 1280 px: nada sobrando para o lado, o título em duas linhas equilibradas e os nomes das categorias dentro dos blocos.
- **A prova de leitura no site** (`apps/plataforma/e2e/vitrine-cara-de-loja-real.spec.ts`): o topo, as vantagens, as categorias, a seção e o rodapé no celular; a busca; os atalhos no computador. Roda depois da publicação, e o resultado fica no registro das publicações, a branch `registro/publicacoes` do repositório.
- **Sem migration:** nada mudou no banco.
