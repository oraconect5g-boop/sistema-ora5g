-- Reversão de 20261114092832_bonus_por_meta. Apaga as leituras do bônus e do extrato, a definição das
-- regras, a tabela das versões (com as regras gravadas: guarde uma cópia antes, se houver) e a
-- permissão bonus.definir.
drop function if exists public.extrato_do_vendedor(date, uuid, uuid);
drop function if exists public.bonus_do_mes(date, uuid);
drop function if exists privado.bonus_da_medida(bigint, bigint, jsonb);
drop function if exists public.bonus_definir(date, jsonb, text);
drop table if exists public.bonus_regras;
do $$
begin
  perform set_config('ora.motivo', 'Reversão do bônus por meta (L9a)', true);
  delete from public.papel_permissoes where permissao = 'bonus.definir';
  delete from public.permissoes where codigo = 'bonus.definir';
end;
$$;
