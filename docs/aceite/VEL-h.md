# Roteiro de aceite: lote VEL-h (a pré-carga mais leve e a barra de baixo à vista no celular)

- **Quem faz:** o proprietário.
- **Quando:** depois da publicação, com a sua conta de dono em `ora5g.com.br`, pelo celular.
- **Quanto tempo leva:** uns 3 minutos.
- **O que o lote entrega:** o seu sim de 19/11 a medir e deixar mais leve a pré-carga do menu, dentro da orientação de 18/11 ("medir antes/depois em celular autenticado"). Na medida apareceu um defeito maior, corrigido no mesmo lote: no celular, a barra de baixo ficava fora da vista em todas as telas.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## O que mudou

1. **A barra de baixo voltou para a vista no celular.**
   - No topo de toda tela ficam a logo, o nome da loja, o sino e o menu da pessoa. O botão da loja não encolhia: com um nome longo, como "Santa Cândida (teste)", o topo passava de 360 px.
   - O navegador do celular então alargava a página para 406 px. A barra de baixo, com os atalhos e o "Mais", ficava abaixo da área visível, e o menu da pessoa ficava fora da tela, à direita.
   - Agora o nome da loja encolhe e termina em reticências ("Santa Când…"); o nome inteiro continua no alto de cada tela.
2. **A pré-carga ficou só nos 4 atalhos.**
   - Antes, cada link à vista pré-carregava a tela dele, e cada pré-carga consultava a sessão no banco: o menu do computador, a logo, a loja, os cartões e os atalhos do Início, cada venda da lista, cada filtro e cada "na rede" do Estoque.
   - Agora só os 4 atalhos principais pré-carregam: a barra de baixo no celular e os mesmos 4 no menu lateral do computador. O resto carrega no toque.

## Antes e depois

Medido com a conta do Gerente (teste), com o script `scripts/medir-pre-carga.mjs`. O antes foi medido no site; o depois, na versão nova montada no servidor, ligada ao mesmo banco de teste.

| Pré-cargas por tela aberta | Celular, antes → depois | Computador, antes → depois |
|---|---|---|
| Início | 22 → 6 | 35 → 4 |
| Vendas (30 dias) | 18 → 7 | 39 → 5 |
| Estoque | 21 → 8 | 37 → 6 |

| No celular | Antes | Depois |
|---|---|---|
| Largura da página | 406 px, barra de baixo fora da vista | 360 px, barra de baixo à vista (as 20 telas principais) |
| Toque numa venda da lista até o comprovante | 1,89 s (com pré-carga) | 1,86 s (sem pré-carga) |
| Toque no atalho Início, a partir de Vendas | não dava para tocar: a barra estava fora da vista | 1,35 s |
| Toque no "Mais" até o Estoque | não dava para tocar | 0,83 s |

Tirar a pré-carga não deixou nenhum toque mais lento: o tempo é o da tela que se abre, e não o da pré-carga. Em toda a medida, o banco recebeu 899 pedidos no depois, contra 1.229 no antes, mesmo com 10 toques a mais medidos no depois.

## Os passos (com a sua conta)

1. No celular, entre como dono em **ora5g.com.br** e escolha uma loja de nome longo, como a **Santa Cândida (teste)**.
2. Em qualquer tela, a **barra de baixo** (Início, Vender e os outros atalhos, com o "Mais") deve aparecer inteira, sem afastar o zoom.
3. No topo, o nome da loja aparece cortado com reticências, e o botão com a sua inicial aparece à direita.
4. Toque nos atalhos e no "Mais": as telas devem abrir como antes.
5. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **Na tela, com o banco simulado:** `apps/plataforma/src/componentes/pre-carga.test.ts` (a barra do celular, o menu lateral e os filtros: quem pré-carrega e quem carrega no toque; a demonstração segue como antes) e `apps/plataforma/src/app/vendas/vendas.test.ts` (no molde das telas reais, o botão da loja encolhe e nenhum link pré-carrega por conta própria; só os atalhos, nos dois menus).
- **No site, com as contas de teste** (`apps/plataforma/e2e/navegacao-real.spec.ts`, só lendo):
  - nenhuma das 10 telas principais passa de 360 px, com a barra de baixo à vista, para as quatro contas;
  - cada tela pré-carrega no máximo 10 vezes.
  - Na versão nova, montada no servidor, as duas provas passaram. No site atual, as duas falharam, com 406 px e 22 pré-cargas, o que confirma que elas pegam os dois problemas. Depois da publicação, elas rodam no site.

## O que fica de fora

- **O comprovante da venda leva 1,86 s para abrir,** com ou sem pré-carga: a tela lê a venda e depois uma dúzia de detalhes. Fica como próximo candidato de velocidade, se você quiser.
- **Os links das outras telas** (fora do menu, do Início, de Vendas e do Estoque) seguem com a pré-carga de antes: são menos e aparecem menos. A prova da navegação confere o Início, Vendas e Estoque.
