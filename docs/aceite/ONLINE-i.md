# Roteiro de aceite: lote ONLINE-i (a vitrine mais rápida)

- **Quem faz:** o proprietário.
- **Quando:** agora, pelo celular, uns 2 minutos.
- **O que o lote entrega:** a loja online abre mais rápido. Com o catálogo de verdade (634 produtos no site desde 24/11), o banco levava de 0,3 s a 0,7 s para montar cada página da vitrine, porque calculava o preço e o estoque de cada produto, um por um, em cada loja. Agora a conta é feita de uma vez para todos os produtos. O resultado é o mesmo de antes (provado em teste, comparando com a regra antiga), só que mais rápido. O item ORA-ONLINE-001 (a vitrine) **segue parcial**.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## Os passos (só leitura; nada é gravado)

1. No celular, abra `ora5g.com.br/loja`. A vitrine deve abrir sem demora, com "Mostrando 1–60 de ... produtos".
2. Toque em **"Próximos"** e depois em **"Anteriores"**: cada página deve abrir sem demora.
3. Toque numa categoria (por exemplo, Carregadores) e num produto: a página do produto mostra as lojas, os preços e o "Disponível" ou "Sem estoque" como antes.
4. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/loja-online-vitrine.test.ts`): a conta nova dá exatamente o mesmo que a regra antiga, de uma vez e produto por produto (o preço de cada loja, a loja sem CNPJ fora, a variação inativa fora, o chip fora e a reserva vencida de volta ao disponível); só os produtos pedidos; o visitante não chama a função interna; a vitrine e a página do produto seguem iguais (os testes de antes passam sem mudança).
- **No banco do site:** a vitrine medida antes e depois, três vezes seguidas: de 341, 288 e 272 ms para 64, 36 e 36 ms; a busca "carregador", de 322 para 43 ms, com os mesmos 44 produtos. Com os dados de verdade, a conta nova e a regra de antes deram as mesmas 1.268 ofertas, sem nenhuma diferença.
- **A reversão** volta as duas funções de antes (provado no teste das migrations, que aplica e desfaz).
