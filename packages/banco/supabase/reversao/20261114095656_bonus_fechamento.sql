-- Reversão de 20261114095656_bonus_fechamento. Apaga a leitura, o envio e a aprovação do fechamento,
-- as tabelas (com os fechamentos gravados: guarde uma cópia antes, se houver) e as permissões
-- bonus.conferir e bonus.aprovar.
drop function if exists public.bonus_fechamento_do_mes(date, uuid);
drop function if exists public.bonus_fechamento_aprovar(uuid, jsonb);
drop function if exists public.bonus_fechamento_enviar(date, uuid, jsonb, jsonb);
drop table if exists public.bonus_contestacoes;
drop table if exists public.bonus_fechamento_linhas;
drop table if exists public.bonus_fechamentos;
drop function if exists privado.bonus_so_aprovacao();
drop function if exists privado.gestao_do_bonus(uuid);
do $$
begin
  perform set_config('ora.motivo', 'Reversão do fechamento do bônus (L9b)', true);
  delete from public.papel_permissoes where permissao in ('bonus.conferir', 'bonus.aprovar');
  delete from public.permissoes where codigo in ('bonus.conferir', 'bonus.aprovar');
end;
$$;
