-- Reversão de 20261117124230_rotinas_agendadas (lote ROT-a; ADR-011): tira as duas tarefas do agendador, as funções e
-- as tabelas (o registro das rodadas vai junto). A extensão pg_cron fica: sem tarefa, não roda nada, e tirá-la apagaria
-- qualquer outra tarefa agendada. Depois disto, a reserva vencida volta a sair só quando alguém mexe no mesmo item ou
-- abre o PDV da loja, como antes.
select cron.unschedule(j.jobname) from cron.job j
where j.jobname in ('ora5g-reservas-vencidas', 'ora5g-limpeza-dos-registros');

drop function public.rotinas_situacao();
drop function privado.rodar_rotina(text);
drop function privado.limpar_registros_das_rotinas();
drop table privado.rotinas_execucoes;
drop table privado.rotinas;
