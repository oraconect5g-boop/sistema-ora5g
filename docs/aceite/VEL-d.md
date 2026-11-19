# Roteiro de aceite: lote VEL-d (o Catálogo e a lista do Estoque numa ida só ao banco)

- **Quem faz:** o proprietário.
- **Quando:** depois da publicação, com a sua conta de dono em `ora5g.com.br`, de preferência pelo celular.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** o resto do VEL-c que a orientação de 18/11 libera ("medir antes/depois em celular autenticado; não remover RLS ou cachear permissões entre usuários"): a leitura única do Catálogo e da lista do Estoque, medida antes e depois com a conta de teste do vendedor.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## O que mudou

1. **O Catálogo lê tudo numa ida só ao banco.** Antes, a tela fazia 9 pedidos ao banco em 8 rodadas, uma depois da outra: as pendências de foto, os produtos, as variações, as fotos e os saldos da loja. Agora, a sessão e mais um pedido.
2. **A lista do Estoque também.** Antes, 4 pedidos em 4 rodadas (a sessão, o total, a página e as fotos). Agora, a sessão e mais um.
3. **Nada muda no que você vê.** Os mesmos produtos, na mesma ordem, com as mesmas fotos e os mesmos saldos da loja do turno. A busca, o filtro "só os pendentes de foto" e as páginas do Estoque funcionam como antes.
4. **A segurança é a mesma.** As duas leituras usam as regras de leitura (RLS) de quem pede, como as de antes. Nenhuma permissão nova e nada guardado entre uma pessoa e outra.

## Antes e depois

Medido com a conta de teste do vendedor, num celular simulado (tela de 360 px), no site no ar, 3 aberturas de cada tela. O passo a passo da medida está em `docs/operacao/DESEMPENHO_NO_CELULAR.md`, seção 4.9.

| Tela | Antes (19/11, a versão `4063f39`) | Depois |
|---|---|---|
| Catálogo | 9 pedidos ao banco em 8 rodadas, 1,52 s no banco; a tela carregada em 1,55 s | Pela conta do código: 2 pedidos em 2 rodadas. A medida entra na seção 4.9 depois da publicação |
| Lista do Estoque | 4 pedidos em 4 rodadas, 1,20 s no banco; a tela carregada em 1,20 s | Pela conta do código: 2 pedidos em 2 rodadas. A medida entra na seção 4.9 depois da publicação |

## Os passos

1. Entre como dono em **ora5g.com.br**, de preferência pelo celular.
2. Abra o **Catálogo**:
   - os produtos, as fotos e os saldos devem ser os de antes;
   - procure um produto pelo nome e marque "só os pendentes de foto": o resultado deve ser o de antes;
   - a tela deve abrir mais rápido.
3. Abra o **Estoque**: a lista da loja deve ser a de antes, com o mesmo total no alto.
4. Responda **"aceito"** ou **"não aceito"**. Se algo parecer diferente ou mais lento, diga qual tela.

## O que fica de fora

- **A ação do carrinho** ainda lê a sessão duas vezes. Mudar isso mexe na camada de segurança das ações do PDV, por isso espera a revisão do Codex e o seu sim (ADR-010).
- **A busca do Catálogo** (com um termo digitado) continua com a sua leitura própria antes da leitura única: a busca por nome, código e SKU é a mesma da tela de antes.
- **O painel do Estoque e a busca do Estoque** não mudam neste lote.
- **A medida no celular e na internet da loja piloto, com o vendedor de verdade,** é da piloto.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/catalogo-estoque-numa-ida.test.ts`):
  - para o vendedor, a leitura única devolve exatamente o que as leituras de antes devolviam: as pendências de foto, os produtos ativos, as variações, as fotos em uso (a substituída fica de fora) e os saldos da loja do turno;
  - a busca por produtos, o "só os pendentes", o limite e o "há mais";
  - na outra loja, os saldos são os da outra loja;
  - a outra rede não vê nada desta;
  - a lista do Estoque: o mesmo total e a mesma página; a página além da última vira a última; o tamanho da página tem teto.
- **Na plataforma** (`apps/plataforma/src/lib/catalogo/tela.test.ts`, `apps/plataforma/src/lib/estoque/lista.test.ts`):
  - uma ida só com a função;
  - a resposta estranha vira a página de erro, nunca a tela vazia;
  - o banco sem a função usa as leituras de antes.
- **As telas** continuam com os testes de antes, agora pelos dois caminhos, com a função e sem ela (`app/catalogo/busca.test.ts` e `app/estoque/saldo.test.ts`).
