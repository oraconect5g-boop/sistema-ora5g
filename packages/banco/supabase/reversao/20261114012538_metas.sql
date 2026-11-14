-- Reversão de 20261114012538_metas. ATENÇÃO: apaga as metas gravadas (a tabela inteira); exporte antes se houver
-- metas reais. A permissão do gerente volta ao que era antes.
drop function if exists public.metas_painel(date, uuid);
drop function if exists public.metas_equipe(uuid, date);
drop function if exists public.metas_definir(uuid, uuid, date, jsonb, text);
drop table if exists public.metas;
do $$
begin
  perform set_config('ora.motivo', 'Reversão das metas mensais', true);
  delete from public.papel_permissoes where papel = 'gerente' and permissao = 'metas.gerir';
end;
$$;
