# ADR-011 — Rotinas agendadas no próprio banco (Supabase Cron), com o registro de cada rodada

**Situação:** proposta (17/11/2026), reversível; aplicada no lote ROT-a. **Por:** Claude Code. **Revisor:** Codex. **Aceite:** proprietário. Pedida pelo proprietário no plano de 16/11/2026 (Onda 0.3: as rotinas sem agendamento; ORA-INV-005 e outras); cobre a proposta T3 do mesmo plano (as rotinas que não saem do PostgreSQL rodam no próprio banco, pelo Supabase Cron). Autorizada no mesmo plano: agendar no `ora5g-dev` as rotinas que só mexem no banco, por `pg_cron` ou pelo `crontab` do usuário `dev`.

## Contexto

1. **Nenhuma rotina rodava sozinha.** A reserva vencida do PDV só saía quando alguém reservava de novo o mesmo item, transferia, ou quando uma reserva de acessório pedia espaço. A reserva do site vencida saía quando alguém abria o PDV da loja (`loja_reservas_liberar_vencidas`). Até lá, o aparelho continuava "reservado" no estoque e no painel.
2. **O servidor não tem credencial do banco.** A homologação não guarda nem `DATABASE_URL` nem a chave secreta do Supabase (o pedido J1 ao proprietário). Um `crontab` do usuário `dev` precisaria de uma senha do banco no servidor e só rodaria com o servidor de pé.
3. **O Supabase já traz um agendador dentro do banco.** O Supabase Cron é a extensão `pg_cron`: guarda as tarefas em `cron.job`, roda cada uma na hora marcada e anota cada rodada em `cron.job_run_details`. A documentação do Supabase recomenda até 8 tarefas ao mesmo tempo e até 10 minutos por tarefa, e lembra que o histórico do `pg_cron` não se apaga sozinho.
4. **A rotina de vencimento já existia.** `privado.expirar_reservas()`, chamada sem filtro, é a rotina prevista no ADR-003: vence as reservas passadas do prazo e não espera item ocupado por outra transação, que fica para a rodada seguinte.

## Decisões

1. **O agendador é o do próprio banco (`pg_cron`).** A migration cria a extensão, com as permissões que a documentação do Supabase pede, e agenda as tarefas pelo nome (`ora5g-reservas-vencidas` e `ora5g-limpeza-dos-registros`). Agendar de novo pelo mesmo nome só atualiza. Não o `crontab` do servidor: ele pediria uma credencial do banco no servidor e dependeria do servidor de pé, e uma rotina que só mexe no banco não precisa sair dele.
2. **Toda rotina passa por `privado.rodar_rotina(nome)`, que registra cada rodada.** O registro fica em `privado.rotinas_execucoes`: o início, o fim, a situação (certa, com falha ou pulada), quantos itens a rotina tratou e, na falha, só o código do erro. A mensagem não é guardada, porque pode trazer dado. A falha é pega e registrada, inclusive o tempo esgotado (`query_canceled`, que o `when others` do PL/pgSQL não pega sozinho). O que a rotina fez naquela rodada é desfeito, e o registro da falha fica. O agendador vê a tarefa como concluída: quem conta a falha é o nosso registro.
3. **Uma rodada por vez de cada rotina.** Uma trava consultiva da transação garante isso. A rodada que chega enquanto outra roda (uma rodada lenta e a seguinte do agendador) não espera e não repete o trabalho: fica registrada como "pulada".
4. **As rotinas deste lote, num catálogo (`privado.rotinas`):**
   - `reservas_vencidas`, a cada 5 minutos: `privado.expirar_reservas()` sem filtro. Vence as reservas do PDV e do site. O aparelho preso por uma venda em andamento fica para a rodada seguinte.
   - `limpeza_dos_registros`, todo dia às 03:30 de São Paulo (06:30 UTC). Apaga do nosso registro as rodadas certas e puladas com mais de 30 dias e as falhas com mais de 90. Apaga do histórico do agendador as rodadas destas tarefas com mais de 7 dias.
5. **Fica de fora o que sai do banco.** A limpeza das fotos apaga arquivos no Storage, o que pede a API do Storage e a chave secreta. Ela continua pelo cartão "Arquivos sem registro" das fotos em lote, até haver o worker com a chave (J1). O que chama serviço de fora (WhatsApp, Nogle) continua nos workers (proposta T5).
6. **A Saúde da operação mostra as rotinas.** `public.rotinas_situacao()` é para quem vê a Saúde da operação (`venda.ver_unidade` ou `venda.ver_todas` na loja do turno). Ela devolve cada rotina com a última rodada certa, a última falha e uma situação, que o banco decide:
   - **com falha:** a última rodada que terminou falhou;
   - **atrasada:** nenhuma rodada certa no prazo (20 minutos no vencimento e 26 horas na limpeza), contado da criação se a rotina nunca rodou;
   - **aguardando:** criada há pouco e ainda sem rodada;
   - **em dia:** todos os outros casos.

   A tela mostra um aviso no topo quando uma rotina está com falha ou atrasada, e um cartão "Rotinas automáticas" com todas. As rotinas são do sistema, não de uma empresa: a lista é a mesma para todo dono e gerente, e não traz dado de loja nem de cliente.
7. **Ninguém roda uma rotina pela API.** `privado.rodar_rotina` e `privado.limpar_registros_das_rotinas` não podem ser executadas pelo visitante nem pelo usuário logado, e as duas tabelas têm RLS ligado, sem política. Só o agendador as usa, como dono do banco.
8. **O PDV continua soltando as reservas do site vencidas ao abrir** (`loja_reservas_liberar_vencidas`). A rotina cobre o tempo entre as aberturas, e a tela segue com a garantia imediata. Tirar essa chamada, uma ida ao banco a menos, fica para quando a medida das telas (VEL-a) pedir.
9. **Nos testes, um agendador sem relógio.** O Supabase simulado (`packages/banco/src/supabase-simulado.sql`) traz um esquema `cron` com as colunas do `pg_cron`, e os testes chamam a rotina direto. A migration só cria a extensão quando o banco a oferece. Sem a extensão e sem o esquema simulado, ela para com um erro: sem agendador, as rotinas não rodariam.

## Consequências

- **O que melhora:** a reserva vencida sai em até 5 minutos sem depender de alguém, cada rodada fica registrada, e a falha ou o atraso aparecem para o dono e a gerência.
- **Limites:**
  1. Se o banco cair no meio de uma rodada, nada fica registrado dela. A falta de rodada certa vira "atrasada" no prazo.
  2. O horário do agendador é o UTC. O Brasil não tem horário de verão desde 2019, então as 06:30 UTC são sempre 03:30 em São Paulo.
  3. A produção (T7) precisa da mesma extensão. A migration já a cria.
  4. Mais rotinas, mais tarefas: a recomendação do Supabase (até 8 ao mesmo tempo e até 10 minutos cada) vale. As duas de hoje rodam em milissegundos.
- **Reversão:** `supabase/reversao/20261117124230_rotinas_agendadas.sql` tira as tarefas, as funções e as tabelas. A extensão fica: sem tarefa, ela não roda nada, e tirá-la apagaria qualquer outra tarefa agendada.

## Como conferir

- **No banco, só leitura:**
  - `select jobname, schedule, active from cron.job` mostra as duas tarefas;
  - `select situacao, count(*) from privado.rotinas_execucoes group by 1` mostra as rodadas;
  - `select status, count(*) from cron.job_run_details group by 1` mostra o histórico do agendador.
- **Na tela:** Gestão → Saúde da operação, o cartão "Rotinas automáticas".
- **Nos testes:**
  - `packages/banco/src/rotinas-agendadas.test.ts`: o agendamento, o vencimento, a falha, a limpeza, a situação e quem pode ler;
  - `rotinas-agendadas-concorrencia.test.ts`, num PostgreSQL 17 de verdade: duas rodadas ao mesmo tempo e o aparelho preso;
  - `apps/plataforma/src/app/operacao/operacao.test.ts`: a tela.
