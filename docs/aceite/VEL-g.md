# Roteiro de aceite: lote VEL-g (a tela de Transferências numa ida só ao banco)

- **Quem faz:** o proprietário.
- **Quando:** depois da publicação, com a sua conta de dono em `ora5g.com.br`, de preferência pelo celular.
- **Quanto tempo leva:** uns 3 minutos.
- **O que o lote entrega:** o seu sim de 19/11 para medir e acelerar a tela de Transferências, dentro da orientação de 18/11 ("medir antes/depois em celular autenticado; não remover RLS ou cachear permissões entre usuários").
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## O que a medida mostrou

Em uso contínuo, com os dois gerentes de teste, a tela de Transferências levava 0,69 s para o Gerente (teste) e 0,60 s para o Gerente 2 (teste). Isso está no nível das outras telas (Vendas: 0,78 s). A abertura de 1,1 s vista antes era a primeira depois de o servidor reiniciar.

A tela ia ao banco em 3 rodadas, uma depois da outra:

1. a sessão;
2. a lista das transferências;
3. ao mesmo tempo, os produtos, as lojas, os aparelhos separados, as remessas e os saldos.

Quando havia aparelho a separar, havia uma quarta rodada, para os aparelhos livres.

## O que mudou

1. **A lista e tudo o que a tela mostra dela vêm numa ida só,** depois da sessão: são 2 rodadas em vez de 3 (ou 4, com aparelho a separar).
2. **Nada muda no que você vê.** As mesmas transferências, na mesma ordem, com os mesmos saldos de cada lado e os mesmos aparelhos para separar.
3. **A segurança é a mesma.** A leitura usa as regras de leitura (RLS) de quem pede, como as de antes. Nenhuma permissão nova e nada guardado entre uma pessoa e outra.

## Antes e depois

| Medida (os gerentes de teste, 5 aberturas) | Antes (19/11) | Depois |
|---|---|---|
| Idas ao banco | 6 a 7, em 3 rodadas | 2, em 2 rodadas |
| Tempo no banco | de 0,57 a 0,66 s | de 0,42 a 0,61 s (0,39 e 0,41 s na segunda medida) |
| Até a tela carregar | de 0,60 a 0,69 s | de 0,44 a 0,63 s (0,41 e 0,43 s na segunda medida) |

O depois foi medido em 19/11, na versão `5711cab` (no ar desde 16:04). Na mesma medida do antes (1,5 s entre uma abertura e a seguinte), a tela ficou 8% mais rápida para o Gerente (teste) e 26% para o Gerente 2 (teste). A diferença entre os dois não é da tela: em metade das leituras dessa medida, o Supabase demorou mais lá dentro, por um motivo que não é a função (ela leva 0,045 s no banco). Numa segunda medida, com 6 s entre as aberturas e sem essa demora, a tela carregou em 0,43 s e 0,41 s. Para ficar bem mais rápido, falta o servidor da produção perto do banco: cada ida ainda paga 0,14 s de ida e volta até o Supabase.

## Os passos

1. Entre como dono em **ora5g.com.br** e escolha a **Santa Cândida (teste)**.
2. Abra **Transferências**: a lista deve ser a de antes, com os mesmos números, situações e saldos.
3. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/transferencias-tela.test.ts`):
  - a leitura única devolve exatamente o que as leituras de antes devolviam, para a mesma pessoa, na origem e no destino, com acessório e aparelho, pedido, separado, enviado e recebido;
  - o aparelho separado aparece com a transferência, e os livres que sobram continuam para os outros pedidos;
  - o limite corta a lista nas mais novas;
  - quem não escolheu a loja e a outra rede não veem nada.
- **Na plataforma** (`apps/plataforma/src/lib/transferencias/tela.test.ts` e `apps/plataforma/src/app/transferencias/transferencias.test.ts`):
  - com a função, a tela não lê nenhuma tabela em separado;
  - a resposta estranha vira a página de erro, nunca a lista vazia;
  - o banco sem a função usa as leituras de antes;
  - a tela diz o mesmo pelos dois caminhos.
