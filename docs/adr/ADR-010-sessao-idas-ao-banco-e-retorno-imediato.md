# ADR-010 — Telas mais rápidas: a sessão conferida no servidor, uma ida ao banco por tela, a conexão mantida e o retorno imediato

**Situação:** proposta (16/11/2026), reversível; aplicada no lote VEL-a com a condição do plano cumprida (decisão 1). **Por:** Claude Code. **Revisor:** Codex. **Aceite:** proprietário. Pedida pelo proprietário no plano de 16/11/2026 (Onda 0.1: ORA-QUAL-010, ORA-POS-002 e D-047); cobre as propostas técnicas T1 e T2 daquele plano.

## Contexto

Em 16/11 o proprietário mediu no navegador, com a conta do dono e boa internet: 2,5 a 2,8 s para abrir o catálogo, o estoque, o PDV e as vendas; 4,7 s para o PDV com busca; 3,6 s no botão "Adicionar" e 5,9 s no "Tirar". Durante a espera o botão não travava e nada avisava que o pedido tinha sido enviado. As medidas estão em `docs/operacao/DESEMPENHO_NO_CELULAR.md`, seção 4.

Medido no servidor da homologação, as causas são quatro:

1. **Cada ida ao Supabase custa caro.** O servidor da homologação fica a cerca de 0,12 s de qualquer destino. Uma ida leva de 0,16 a 0,20 s numa conexão já aberta e de 0,42 a 0,44 s numa conexão nova.
2. **Cada tela fazia muitas idas, uma depois da outra.** Toda tela com menu perguntava ao serviço de login quem era a pessoa (`auth.getUser()`), depois perguntava ao banco a situação da sessão e depois fazia mais 34 pedidos para o menu: 32 ao mesmo tempo (30 permissões, o nome e os vínculos) e 2 contagens. Só então vinham as leituras da própria tela. O PDV com venda aberta fazia de 10 a 13 idas em fila. Cada ação do carrinho repetia tudo: a sessão, a ação e a tela inteira de novo.
3. **A conexão não era reaproveitada de uma tela para a outra.** O Node fecha a conexão que ficou 4 s parada. Com um vendedor só, a tela seguinte quase sempre vem depois disso e abre outra. Os 32 pedidos do menu saíam ao mesmo tempo, e cada um abria a própria conexão: numa medida com 32 pedidos de uma vez, o mais lento levou 0,90 s.
4. **Nada respondia ao toque.** O botão continuava igual enquanto o pedido estava no servidor.

## Decisões

1. **O token diz quem é; o banco decide se a sessão vale (T2).** As telas passam a usar `auth.getClaims()` no lugar de `auth.getUser()`. O proxy já fazia isso (REV-009).
   - Com a chave assimétrica do projeto, a assinatura e a validade do token são conferidas no próprio servidor, sem ida ao serviço de login. As chaves públicas ficam na memória de cada processo por 10 minutos e são buscadas de novo quando aparece uma chave desconhecida. Uma chave aposentada pode continuar aceita por até 10 minutos; reiniciar o servidor esvazia essa memória.
   - Com token de segredo compartilhado (HS256) ou sem identificador de chave, a biblioteca pergunta ao serviço de login, como o `getUser()` fazia. Nada fica mais fraco, e nada fica mais rápido.
   - O que o token não sabe, o banco decide em cada pedido: pessoa bloqueada, sessão encerrada (apagada de `auth.sessions`), turno vencido (12 horas ou a virada do dia), prazo do Auth vencido e segundo fator pendente. Quem responde é `situacao_da_sessao`, agora dentro de `molde_da_sessao`. Por baixo, `tem_permissao` e as políticas de cada loja saem de `privado.vinculos_vigentes()`, que exige as mesmas condições. O token ainda válido de uma sessão encerrada passa pela assinatura, mas o banco não lhe dá loja nem permissão.
   - A API do banco confere o token de novo em cada ida. Em 16/11, `situacao_da_sessao` foi chamada sem token e com três tokens inventados (com assinatura inventada e o identificador da chave do projeto, assinado com outro segredo e sem assinatura). As quatro chamadas foram recusadas (401).
   - Token ausente, vencido ou com assinatura inválida leva à entrada. Falha de rede ou do serviço leva à página de erro, nunca a "sem acesso" (REV-014).
   - A renovação do token continua no proxy.
   - As telas da própria credencial continuam com `getUser()`, por escolha: o código do segundo fator na entrada, a troca e a confirmação de senha e a página da conta. Elas lidam com a senha e o código e não estão no caminho da venda.
   - O e-mail mostrado na tela de segurança da conta passa a vir do token. Se o e-mail mudar, a tela mostra o novo na renovação seguinte.
   - **Condição do plano para aplicar:** os testes de revogação e bloqueio da ORG-006 passando. Passam na branch do lote (16 e 17/11): `apps/plataforma/src/lib/acesso/sessao.test.ts` (bloco "quem decide é o banco, em cada pedido"), `packages/banco/src/sessao-molde-e-pdv.test.ts` (o conteúdo das duas leituras, no banco de teste em memória, o PGlite); `packages/banco/src/sessao-molde-e-pdv-concorrencia.test.ts` (num PostgreSQL 17 de verdade, com duas conexões: o bloqueio feito pelo dono em outra conexão e a sessão apagada em outro lugar valem no pedido seguinte de quem já estava dentro, e também na transação que já estava aberta; a leitura não espera a ação do carrinho ainda não confirmada); e `apps/plataforma/src/proxy.test.ts` (token com a assinatura trocada não passa pela conferência local). A sequência completa do CI roda antes do merge.
   - **Falta confirmar com um login:** o `ora5g-dev` publica uma chave pública ES256, mas isso não prova qual chave assina os tokens de hoje. O log de tempos (decisão 6) mostra: uma linha `GET /auth/v1/user` em cada pedido quer dizer segredo compartilhado. Nesse caso, trocar a chave de assinatura no painel do Supabase é decisão do proprietário, porque é credencial.
2. **A sessão e o molde numa ida só (T1).** A função nova `public.molde_da_sessao` devolve de uma vez a situação da sessão, as permissões pedidas, o nome, os vínculos e as duas contagens do menu.
   - Ela não decide nada por conta própria. A situação é a linha de `situacao_da_sessao`. Cada permissão é respondida pela mesma `tem_permissao`. O nome, os vínculos e as contagens são leituras comuns, sob as políticas de cada tabela. É a mesma resposta de antes, numa ida.
   - Não cria permissão, não muda a matriz de papéis e não grava nada. Roda com os direitos de quem chama e não fica aberta para quem não entrou.
   - Quem não pode entrar recebe o motivo e nenhuma permissão.
   - Aceita até 80 permissões por chamada. A plataforma pede 33: 30 na loja do turno e 3 na rede.
   - No servidor, é uma leitura por tela: o layout e a página dividem a mesma, e a tela seguinte pergunta de novo. Ações e rotas leem a cada chamada.
   - A leitura da resposta é estrita: formato inesperado leva à página de erro, não a "sem permissão".
   - Esconder um item do menu é só experiência de uso. O banco confere a permissão de novo em cada consulta e em cada ação.
3. **Uma leitura por tela, começando pelo PDV (T1).** A função nova `public.pdv_tela` devolve o caixa aberto, a venda em andamento, o carrinho (com o preço, a campanha, a ordem de serviço e o pedido de desconto de cada item) e as maquininhas da loja do turno. Roda com os direitos de quem chama, não lê custo nem estoque e não grava nada.
   - Abrir o PDV passa a ser duas rodadas: o molde e, depois, ao mesmo tempo, a tela, a liberação das reservas do site vencidas e a busca no catálogo, quando há algo digitado.
   - A busca dentro de uma venda aberta ainda faz até três rodadas a mais: o aparelho ou o chip do número digitado, ou as variações achadas pelo nome; depois, ao mesmo tempo, o saldo, os aparelhos livres, as fotos e um preço por resultado; por fim, os endereços das fotos. O preço em lote fica para o VEL-b.
   - Uma ação do carrinho passa a ser quatro rodadas: a sessão, a ação e a tela de novo (duas).
   - Os painéis (`vendas_painel`, `financeiro_painel`) já eram assim. Vendas, Estoque, Catálogo, Clientes e Caixa ganham a sessão e o menu numa ida, mas mantêm as próprias leituras. A leitura única de cada uma fica para o VEL-b.
4. **A conexão com o Supabase fica aberta por até 180 s parada.** Antes eram 4 s, o padrão do Node.
   - Ao subir, o servidor troca o despachante global do `fetch` por outro igual, com esse limite (`apps/plataforma/src/lib/supabase/conexao-mantida.ts`).
   - Por que 180 s: o Supabase não avisa por quanto tempo guarda a conexão. Nas medidas de 16/11, fechou a conexão parada aos 400 s, nas nove vezes. O pedido que cruza com esse fechamento falha uma vez, e o Node não repete. Com o nosso limite abaixo da metade do deles, a nossa conexão fecha antes.
   - A plataforma não repete o pedido que falhou. Quase toda ida é a chamada de uma função (POST), e repetir uma gravação sem saber se ela chegou é pior do que mostrar o erro. O log de tempos conta essas falhas como "conexão fechada".
   - Medido no servidor (`docs/operacao/DESEMPENHO_NO_CELULAR.md`, seção 4.4): a `/loja` depois de 8 s parada foi de 0,47 para 0,21 s; depois de 30 s, de 0,65 para 0,19 s.
   - Também medido: de 75 s parada em diante, perto da metade das idas (5 de 11) levou de 0,35 a 0,60 s, mesmo na conexão aberta. Até 60 s, as 4 foram rápidas. A causa não foi identificada. Com várias pessoas usando ao mesmo tempo, o intervalo entre pedidos tende a ser menor; isso é expectativa, não medida. Com uma pessoa só, a primeira tela depois de mais de um minuto parado pode levar o mesmo que antes.
   - Depende de uma peça interna do Node, o despachante global do `fetch`. Se o Node mudar, a função devolve "não deu", o servidor escreve um aviso e funciona como antes. Uma linha na subida diz qual das duas situações vale.
   - Vale para todo `fetch` do servidor da plataforma, que hoje só fala com o Supabase.
   - Não há variável de ligar e desligar. Para desfazer, tira-se a chamada em `apps/plataforma/src/instrumentation.ts`.
5. **Retorno imediato em todo formulário de ação.**
   - O `BotaoDeEnvio` (`useFormStatus`) trava assim que é tocado e mostra "Aguarde…" ou o texto de espera próprio. Num formulário com vários botões, todos travam e só o tocado muda o texto.
   - O teste `apps/plataforma/src/retorno-imediato.test.ts` lê os arquivos das telas e só aceita três formas de formulário: `<form action={açãoDoServidor}>`; `<Form action="/tela">` (`next/form`), para busca e filtro; e `FormularioDeArquivo`, para envio de arquivo, que destrava depois de um minuto ou quando a pessoa volta para a tela. As duas exceções estão escritas no próprio teste, com o motivo.
   - Toda pasta de tela do menu tem `loading.tsx` (29 esqueletos). A sessão é conferida no `layout.tsx`, antes do esqueleto: quem não entrou vai para a entrada sem ver o contorno da tela (`apps/plataforma/src/proxy.test.ts` confere).
   - Quando o endereço traz uma âncora (`#…`), a tela rola até ela depois que o conteúdo real substitui o esqueleto (`apps/plataforma/src/componentes/ancora.tsx`).
   - Não adotada agora: a navegação "instantânea" do Next 16 (Cache Components e Partial Prefetching). Exige ligar `cacheComponents` e `partialPrefetching` no projeto inteiro e rever cada tela que lê a sessão. É candidata para depois do VEL-b, com medida.
6. **Log de tempos, desligado por padrão.** Com `ORA_MEDIR_TEMPOS=1`, o servidor escreve uma linha por ida ao Supabase: qual pedido chegou, a ordem da ida, quanto depois do começo ela saiu, quanto demorou, o status e o caminho.
   - Nunca entram: o que vem depois do "?" no endereço, cabeçalhos, corpo, token, chave, o endereço do projeto e o texto do erro.
   - O plano oferecia o cabeçalho `Server-Timing` ou o log. Ficou o log, porque a tela montada no servidor não escreve cabeçalhos de resposta.
   - Ligar e desligar exige publicar de novo. A variável entra na lista de permissão de `deploy/homologacao/ambiente-web.sh`. O passo a passo está em "Como medir de novo", no documento de desempenho.

## Consequências

- O que muda para quem usa:
  - a sessão e o menu vão de 2 idas em fila e mais 34 pedidos para 1 ida;
  - com a chave assimétrica, não há mais ida ao serviço de login a cada tela;
  - o PDV com venda aberta vai de 10 a 13 idas em fila para 2 rodadas;
  - o botão trava e avisa assim que é tocado.
- Os tempos com login, medidos depois da publicação, entram na seção 4.6 do documento de desempenho, com as metas da D-047 para o proprietário aprovar.
- O que não muda: a distância. O servidor da homologação fica a cerca de 0,12 s do banco. Na produção, o servidor da plataforma e o banco devem ficar na mesma região (D-027 e D-044).
- Ordem de publicação: a migration primeiro. A plataforma nova não abre tela com menu sem `molde_da_sessao`. As duas funções são novas e nada do que existia muda; voltar uma versão da plataforma não exige desfazer a migration.
- O que depende das contas de teste (a chave secreta do Supabase não está no servidor): a medida por script das telas com login, a confirmação do tipo de token e o teste de ponta a ponta no celular que adiciona, tira e conclui uma venda. Hoje, o estado de espera do botão é provado no navegador só na tela de entrada; nas outras telas, pelo teste que lê os arquivos.
- Para desfazer, por decisão:
  - (1) `lerSessao` volta a chamar `getUser()`;
  - (2) e (3) a reversão da migration apaga as duas funções, depois de voltar uma versão da plataforma;
  - (4) tira-se a chamada em `instrumentation.ts`;
  - (5) é só tela: volta com o código;
  - (6) a variável fica vazia.
- O que veio no VEL-b (18/11; nenhuma decisão acima muda):
  - **As permissões vêm do molde.**
    - Antes, 47 arquivos faziam 79 perguntas de permissão ao banco, uma a uma. Em 46 deles, 73 perguntas eram sobre a loja do turno ou a rede.
    - O molde passou a trazer as 12 permissões que faltavam: são 45 ao todo, abaixo do limite de 80.
    - As telas, as rotas e as ações leem `permite(sessao, "...")` (`apps/plataforma/src/lib/acesso/molde.ts`).
    - Por que vale: perguntar na loja do turno ou sem loja dá a mesma resposta numa sessão. O vínculo de organização vale sem loja e em toda loja dela; o de loja só vale na loja do turno. Está provado para o catálogo inteiro de permissões e todos os papéis em `packages/banco/src/sessao-molde-e-pdv.test.ts`.
    - Continuam indo ao banco só as perguntas sobre outra loja: a da venda, em `/vendas/[id]`, e a do inventário, em `/estoque/inventario/[id]`.
    - O teste `apps/plataforma/src/permissoes-do-molde.test.ts` impede que uma tela nova volte a perguntar.
  - **O preço da busca do PDV numa ida.**
    - A função nova `public.precos_vigentes` chama `preco_vigente` para cada variação, sem outra regra de preço (migration `20261118095048_precos_em_lote`).
    - Até 9 pedidos ao mesmo tempo viraram 1.
    - Se a leitura falha, a tela mostra a página de erro: escrever "sem preço" em todos os resultados seria falso.
  - **O Caixa em 3 rodadas, contando o molde.**
    - Os caixas fechados e as saídas a autorizar vêm junto com o caixa aberto.
    - Os nomes de quem pediu a saída vêm junto com os movimentos.
    - Antes eram 4 rodadas quando havia saída a autorizar.
  - **O efeito, pela conta das rodadas:**
    - Clientes, de 3 para 2;
    - Vendas, de 4 ou 5 para 3 ou 4;
    - o painel do Estoque, de 4 para 3;
    - o Ora Connect e as Transferências fazem 4 e 2 pedidos a menos ao mesmo tempo.
  - **A medida com login** é feita depois da publicação, pelo log de tempos, com `scripts/idas-por-tela.mjs`. O "antes", tirado do mesmo log, está na seção 4.7 do documento de desempenho.
- O que fica para depois (VEL-c):
  - **A ação do carrinho ainda lê a sessão duas vezes.**
    - Tirar a leitura do molde da ação deixaria só o banco decidindo a sessão naquela ação. Ele já decide em cada função.
    - Como isso muda a camada de segurança das ações do PDV, espera a revisão do Codex e o sim do proprietário.
  - **A leitura única do Catálogo e do Estoque.** Hoje são 3 a 5 rodadas, de 0,8 a 1,5 s no banco, pelo log.
  - **O sino de avisos (`/api/pendencias`) e o Início.** São 17 a 28 pedidos ao mesmo tempo a cada abertura, de 0,7 a 1,5 s pelo log: é o maior ganho que sobra.
  - **A conexão parada.** Medir se um pedido leve periódico mantém a ida rápida depois de um minuto parado (não foi feito).
  - **A navegação instantânea do Next.** Avaliar.
- O que veio no VEL-c (18/11/2026; a orientação do proprietário de 18/11):
  - **O sino e o Início numa ida.** A migration `20261118165816_pendencias_numa_ida` cria `public.pendencias_da_loja()`: as 16 contagens das pendências da loja do turno numa ida só, cada uma só para quem tem a permissão da fila (a mesma `tem_permissao`) e com o RLS de quem chama (SECURITY INVOKER). Nada fica guardado entre chamadas nem entre pessoas.
  - **O efeito, pela conta dos pedidos:** o sino, de 17 pedidos para 2 ao mesmo tempo (as contagens e as divergências das notas); o Início, 15 pedidos a menos. O antes, pelo log de 18/11: de 17 a 29 pedidos por abertura, de 0,72 a 1,47 s. O depois se mede pelo mesmo log (seção 4.8 do documento de desempenho).
  - **Banco sem a função:** a tela usa as contagens uma a uma, como antes.
  - **Segue para depois:** a ação do carrinho (espera a revisão e o sim do proprietário), a leitura única do Catálogo e do Estoque, a conexão parada e a navegação instantânea.
- O que veio no VEL-d (19/11/2026; a mesma orientação de 18/11, com a medida antes e depois feita com a conta de teste):
  - **O Catálogo e a lista do Estoque numa ida.** A migration `20261119131724_catalogo_e_estoque_numa_ida` cria `public.catalogo_tela` (as pendências de foto, os produtos, as variações, as fotos em uso e os saldos da loja do turno) e `public.estoque_lista` (a página, o total e as fotos da página). As duas só leem, SECURITY INVOKER: com o RLS de quem pede, como as leituras que substituem. Nenhuma permissão nova e nada guardado entre chamadas nem entre pessoas.
  - **A medida com login virou script.** `scripts/medir-com-login.mjs` entra com a conta de teste num celular simulado e anota o tempo de cada tela; o log de tempos dá as idas. O antes, em 19/11: 9 idas em 8 rodadas no Catálogo (1,52 s no banco; a tela carregada em 1,55 s) e 4 em 4 na lista do Estoque (1,20 s). Pela conta do código, 2 em 2 cada. O depois entra na seção 4.9 do documento de desempenho.
  - **Banco sem as funções:** as telas usam as leituras de antes. A resposta fora da forma vira a página de erro, nunca a tela vazia.
  - **O que a medida mostrou do VEL-c:** o sino caiu de 17 pedidos para 2, mas o tempo não caiu (de 0,80 a 0,88 s, contra 0,72 s antes, com outra conta): as contagens já iam ao mesmo tempo. O ganho do sino é a carga no banco, não a espera.
  - **Segue para depois:** a ação do carrinho (espera a revisão e o sim do proprietário), o tempo do sino no banco, a conexão parada e a navegação instantânea.
- O que veio no VEL-e (19/11/2026; a mesma orientação, com a medida do VEL-d):
  - **As permissões da sessão numa conta só.** A medida com login mostrou que o molde da sessão, lido em toda tela com login e em cada tela que o menu pré-carrega, era o maior atraso: 45 perguntas à `tem_permissao`, uma a uma, cada uma conferindo a sessão inteira de novo. A migration `20261119134800_permissoes_numa_conta` cria `privado.permissoes_vigentes`, a mesma regra de `tem_permissao` aplicada a um conjunto (os vínculos vigentes e a loja do turno lidos uma vez). O molde e o sino passam a usá-la.
  - **A decisão de antes continua valendo** ("cada permissão pela mesma regra das telas e das ações"): o texto da regra é o mesmo, e o banco de teste prova a igualdade com `tem_permissao` para o catálogo inteiro de permissões, em todo papel e loja e nos estados da sessão. As ações continuam perguntando à `tem_permissao`, que não muda. Nada guardado entre chamadas nem entre pessoas.
  - **Medido:** o molde da sessão de 0,19 s para 0,023 s no banco e de 0,54 s para 0,18 s por ida no site (mediana); o sino de 0,052 s para 0,016 s no banco (seção 4.10 do documento de desempenho).
  - **Segue para depois:** a ação do carrinho, os painéis do Início e dos Relatórios (de 0,3 a 0,4 s por ida), a pré-carga do menu (que abre o molde de cada link), a conexão parada e a navegação instantânea.
