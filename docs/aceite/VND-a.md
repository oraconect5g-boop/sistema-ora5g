# Roteiro de aceite: lote VND-a (o nome de quem vendeu e as vendas da loja para a rede, na lista de Vendas)

- **Quem faz:** o proprietário.
- **Quando:** depois da publicação, com a sua conta de dono em `ora5g.com.br`, de preferência pelo celular.
- **Quanto tempo leva:** uns 3 minutos.
- **O que o lote entrega:** o seu "Sim, corrigir" de 19/11 ao achado das provas de acesso (J2-b), no ORA-POS-008: a lista de Vendas da gerência mostrava "Outro vendedor" em todas as vendas. Na mesma tela havia um segundo defeito, que entrou na correção: quem vê a rede inteira sem ser gerente da loja (o administrador) via "Minhas vendas", vazia.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## O que mudou

1. **A gerência vê o nome de quem vendeu.**
   - O banco só deixa ler o perfil de outra pessoa a quem cuida da equipe (o dono e o administrador), e a lista lia os nomes direto do perfil.
   - Agora, quem tem a permissão de ver o ranking (o gerente) recebe os nomes pelo mesmo caminho do Início: só de quem tem venda concluída nas lojas em que ele vê o ranking.
   - Ninguém ganhou acesso novo: é a mesma informação que o gerente já via na equipe do Início.
2. **A rede vê as vendas da loja.** Quem vê as vendas da rede inteira (o dono e o administrador) passa a ver a lista da loja do turno, como o gerente. Antes, quem não era gerente da loja recebia "Minhas vendas", vazia.
3. **O botão "Nova venda" só aparece para quem vende.** O administrador via o botão e, ao tocar, recebia o aviso "Seu papel não registra vendas nesta loja".
4. **Se a leitura dos nomes falhar,** a lista continua de pé, com "Outro vendedor".

## Como foi conferido

- **Na tela, com o banco simulado** (`apps/plataforma/src/app/vendas/vendas.test.ts`):
  - o simulador passou a seguir a regra de verdade do banco: o gerente só lê o próprio perfil. Foi por isso que o defeito escapou: o simulador antigo devolvia todos os perfis;
  - seis casos novos: o nome pelo ranking; sem o ranking, "Outro vendedor"; a falha dos nomes não derruba a lista; uma ida a mais ao banco, na mesma rodada das outras leituras; a rede vê a loja inteira, sem o botão de nova venda; quem cuida da equipe lê o nome pelo perfil;
  - com a tela antiga, 4 desses casos falham.
- **Com as contas de teste** (`apps/plataforma/e2e/acesso-por-papel-real.spec.ts`, a prova das vendas do J2-b, com um passo novo):
  - num servidor local ligado ao mesmo banco de teste, com a correção: a lista do Gerente (teste) mostra "Vendedor (teste)" na venda dele, e a do Administrador (teste) mostra "Vendas da loja", com as vendas e sem o botão de nova venda. Passou;
  - no site, ainda sem a correção, a mesma prova falhou nesse passo, mostrando "Outro vendedor".
  - Depois da publicação, a prova roda de novo no site; o resultado entra no registro do lote seguinte.

## Os passos (com a sua conta)

1. Entre como dono em **ora5g.com.br** e escolha a **Santa Cândida (teste)**.
2. Abra **Vendas** e escolha **30 dias**: cada venda mostra o nome de quem vendeu (Vendedor (teste) ou Dono de teste). Para você, como dono, o nome já aparecia; o que muda é a tela do gerente, que a prova automática confere com o Gerente (teste) a cada rodada.
3. Responda **"aceito"** ou **"não aceito"**.

## O que fica de fora

- **Quem só tem venda em aberto ou cancelada** (nenhuma concluída) continua aparecendo como "Outro vendedor" para o gerente: o caminho dos nomes é o do ranking, que só conhece quem já concluiu venda. Para mudar isso seria preciso uma permissão nova de ler nomes, que é uma decisão sua.
