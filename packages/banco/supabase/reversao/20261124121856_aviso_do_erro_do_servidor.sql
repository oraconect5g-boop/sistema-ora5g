-- Reversão do lote QUAL-006a (o aviso no celular do erro do servidor). Os alertas do servidor saem da fila antes de a
-- permissão do alerta voltar a ser a de antes.
drop function if exists public.erros_do_servidor_situacao();
drop function if exists public.erros_do_servidor_relatar(text, jsonb);
drop function if exists privado.alerta_do_servidor(text, text);
drop table if exists privado.erros_do_servidor;
delete from privado.avisos where permissao = 'unidades.gerir';
alter table privado.avisos drop constraint avisos_permissao_check;
alter table privado.avisos add constraint avisos_permissao_check
  check (permissao is null or permissao in ('desconto.aprovar', 'nota.aprovar', 'caixa.conferir', 'auditoria.ver'));
