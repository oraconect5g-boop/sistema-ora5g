# Roteiro de aceite: lote OBS-a (os erros do servidor na Saúde da operação)

- **Quem faz:** o proprietário.
- **Onde:** no sistema real, em **ora5g.com.br**, com a sua conta de dono.
- **Quanto tempo leva:** uns 3 minutos.
- **O que o lote entrega:** até aqui, quando uma tela mostrava a página de erro numa loja, só o log do servidor sabia. Agora a **Saúde da operação** mostra os erros do servidor: quantos, em que tela e quando. Mostra também o código que a página de erro mostra à loja.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## O que mudou

1. **O cartão "Erros do servidor",** na Saúde da operação, mostra:
   - quantos erros houve na última hora, nas últimas 24 horas e desde que o servidor subiu;
   - as telas com erro, as de mais erros primeiro;
   - os mais recentes, com a hora e o código.
2. **O código é o mesmo da página de erro.** A página de erro diz à loja: "avise o administrador com o código ...". Com o código, você acha o erro no cartão.
3. **Um aviso vermelho no topo** aparece quando houve erro na última hora.
4. **Quem vê:** só quem gere a rede (o dono e o administrador). Os erros são do sistema inteiro, não de uma loja.
5. **O que nunca aparece:**
   - o texto do erro;
   - os dados do endereço da tela (só o modelo dela, como "/vendas/[id]");
   - dados de cliente.

## Os passos (no sistema real)

1. Entre em **ora5g.com.br** com a sua conta.
2. Abra **Gestão → Saúde da operação**.
3. Confira o cartão **Erros do servidor**. Ele diz desde que horas conta: a conta recomeça a cada publicação.
4. Se houver erro, confira a tela e a hora de cada um.
5. Responda **"aceito"** ou **"não aceito"**.

## O que fica de fora

- **O tempo de resposta do servidor.** Depende de um serviço de monitoramento, a escolher.
- **O aviso no celular quando há erro do servidor.** Hoje o aviso aparece só na tela.
- **A conta recomeça a cada publicação.** O histórico mais antigo fica no log do servidor, com uma linha por erro.

## O que você não vê (provado pelo Claude Code)

- **A regra** (`apps/plataforma/src/lib/saude/erros-do-servidor.test.ts`):
  - o texto do erro, o CPF e os valores do endereço não entram na linha do log nem na lista;
  - os desvios de tela do próprio sistema (ir para a entrada, a página 404) não contam como erro;
  - a lista guarda os 200 mais recentes, e o total conta todos.
- **O servidor** (`apps/plataforma/src/instrumentation.test.ts`): o erro de uma tela vira uma linha no log, com o código e a etapa que falhou, e entra no resumo.
- **A tela** (`apps/plataforma/src/app/operacao/operacao.test.ts`):
  - o cartão com as contas, as telas e o código;
  - o aviso no topo;
  - o gerente de uma loja não vê o cartão.
