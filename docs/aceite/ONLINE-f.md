# Roteiro de aceite: lote ONLINE-f (a vitrine com o catálogo inteiro: de 60 em 60, os disponíveis primeiro)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, pelo celular, em `ora5g.com.br/loja`.
- **Quanto tempo leva:** uns 2 minutos.
- **O que o lote entrega:** com o seu catálogo de verdade no site (634 produtos marcados em 24/11, sem as peças de ASSISTÊNCIA, como você pediu), a vitrine mostrava só os 60 primeiros por nome, sem como ver o resto. O item ORA-ONLINE-001 (a vitrine) **segue parcial**: faltam as fotos de verdade e o CNPJ das lojas (sem ele, nenhum produto aparece disponível).
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que mudou

1. **Quantos são:** acima dos produtos, a vitrine diz "Mostrando 1–60 de 634 produtos" (ou quantos a busca e a categoria acharem).
2. **As páginas:** embaixo, "Página 1 de 11" e o botão **"Próximos"**; da segunda em diante, também **"Anteriores"**. A busca e a categoria escolhidas continuam valendo ao trocar de página; trocar de categoria ou buscar de novo volta para a primeira página.
3. **Os disponíveis primeiro:** quando as lojas tiverem o CNPJ e o produto estiver disponível, ele aparece antes dos "Sem estoque" (hoje, todos estão "Sem estoque").

## Os passos (só leitura; nada é gravado)

1. Abra `ora5g.com.br/loja` pelo celular. Acima dos produtos: "Mostrando 1–60 de 634 produtos"; no fim da lista, "Página 1 de 11" e "Próximos".
2. Toque em **"Próximos"**: aparecem outros produtos ("Mostrando 61–120 de 634 produtos"), com "Anteriores".
3. Escolha uma categoria (por exemplo, SUPORTE, que tem mais de 60 produtos) e veja que as páginas passam a contar só ela.
4. Confira que as peças de ASSISTÊNCIA não aparecem mais na loja online.
5. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/loja-online-vitrine.test.ts`): com 63 produtos no site, os dois com estoque vêm primeiro (pelo nome, os outros 61 viriam antes); a primeira página com 60 e a segunda com 3; a página que passa do fim vale a última, e a zero ou negativa, a primeira; a busca e a categoria contam só o que filtram. O inventário de autorização com a assinatura nova (o visitante segue vendo só o que é do site).
- **A reversão** volta a vitrine do ONLINE-a (provado no teste das migrations, que aplica e desfaz).
- **Na tela** (`apps/plataforma/src/app/loja/loja.test.ts`): a página vai ao banco; a contagem; "Anteriores" e "Próximos" com a busca e a categoria; página estranha vale a primeira; na última, sem "Próximos"; uma página só, sem o caminho.
- **A prova de leitura no site** (`apps/plataforma/e2e/vitrine-paginas-real.spec.ts`): a contagem, a página 2 com outros produtos, a volta e nada sobrando para o lado em 360 px. Roda depois da publicação, e o resultado fica no registro das publicações, a branch `registro/publicacoes` do repositório.
