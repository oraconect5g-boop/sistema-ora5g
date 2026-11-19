# Roteiro de aceite: lote VEL-f (as conexões com o banco aquecidas)

- **Quem faz:** o proprietário.
- **Quando:** depois da publicação, com a sua conta de dono em `ora5g.com.br`, de preferência pelo celular, de preferência depois de alguns minutos sem usar o sistema.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** o que a medida de 19/11 mostrou depois do VEL-e, dentro da orientação de 18/11 ("medir antes/depois em celular autenticado; não remover RLS ou cachear permissões entre usuários").
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## O que mudou

1. **As telas que buscam várias coisas ao mesmo tempo** (o Início do gerente, os Relatórios, a Saúde da operação) pedem de 5 a 17 dados ao banco de uma vez. Cada pedido usa uma conexão com o banco. Quando não há conexão aberta sobrando, o pedido abre uma nova no meio da tela, e isso custa cerca de 0,26 s a mais. A tela espera o pedido mais lento.
2. **Agora o servidor mantém 20 conexões abertas e prontas.** Ele as abre ao subir e as usa de novo a cada 2 minutos, com um pedido leve que não traz dado de ninguém. Assim, a tela não precisa abrir conexão no meio, nem depois de o sistema ficar parado entre um atendimento e outro.
3. **Nada muda no que você vê, e a segurança é a mesma.** Os mesmos dados, as mesmas regras e o mesmo login. O pedido leve usa só a chave pública, que já vai para o navegador de qualquer visitante.

## Antes e depois

Medido com a conta de teste do gerente, num celular simulado, em duas situações: em uso contínuo e com 200 s de pausa entre uma abertura e outra (como numa loja entre um atendimento e outro). O passo a passo da medida está em `docs/operacao/DESEMPENHO_NO_CELULAR.md`, seção 4.11.

| Medida (a conta de teste do gerente) | Antes, em uso contínuo | Antes, depois de 200 s parado | Depois |
|---|---|---|---|
| Início, até a tela carregar | 0,62 s | 1,29 s | 0,60 s em uso contínuo; 0,86 s depois de parado |
| Relatórios | 0,81 s | 1,61 s | 0,95 s em uso contínuo; 1,47 s depois de parado |
| Saúde da operação | 0,80 s | 1,42 s | 0,53 s em uso contínuo; 0,93 s depois de parado |
| Pedidos feitos ao mesmo tempo que passaram de 0,4 s | 17% | 74% | 38% depois de parado |

O depois foi medido em 19/11, na versão `ce8b5db` (no ar desde 12:15). Em uso contínuo, quase nada muda: com movimento, as conexões já ficavam abertas. O ganho é depois de o sistema ficar parado: um terço a menos no Início e na Saúde da operação. Nos Relatórios, o ganho foi pequeno (9%): o que sobra não é mais a conexão do nosso servidor e parece vir do lado do Supabase, que também "esfria" quando o sistema fica parado (é uma hipótese, ainda não provada).

## Os passos

1. Fique uns 5 minutos sem usar o sistema.
2. Entre como dono em **ora5g.com.br**, de preferência pelo celular, e abra o **Início**, os **Relatórios** e a **Saúde da operação**:
   - os dados devem ser os de antes;
   - as telas devem abrir sem a espera que acontecia na primeira abertura depois de um tempo parado.
3. Responda **"aceito"** ou **"não aceito"**. Se alguma tela parecer mais lenta, diga qual.

## O que fica de fora

- **A distância entre o servidor e o banco.** O banco fica em São Paulo, mas o servidor da homologação está a 0,124 s de ida e volta dele, e cada rodada de pedidos paga isso. Na produção, o servidor deve ficar perto do banco (decisões D-027 e D-044): cada rodada cairia para poucos milésimos.
- **As pré-cargas do menu** (de 12 a 18 por tela, de 21 a 30 KB) ficam como estão: desde o VEL-e, cada uma custa pouco.
- **A ação do carrinho** ainda lê a sessão duas vezes: espera a revisão do Codex e o seu sim (ADR-010).

## O que você não vê (provado pelo Claude Code)

- **Na plataforma** (`apps/plataforma/src/lib/supabase/conexao-mantida.test.ts`, com um servidor de mentira que conta as conexões):
  - o aquecimento abre de uma vez as conexões que faltam, e os pedidos seguintes ao mesmo tempo reaproveitam todas;
  - pede só a saúde do serviço de login, com a chave pública, sem login nem cookie de ninguém;
  - sem o Supabase no ar, não derruba nada;
  - o relógio repete o aquecimento, não segura o servidor ao desligar e para quando pedido.
- **Na subida do servidor** (`apps/plataforma/src/instrumentation.test.ts`): o aquecimento só liga com a conexão mantida, o endereço e a chave pública, e nunca durante o build.
