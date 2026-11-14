-- Reversão de 20261114013159_previsao_de_caixa. Apaga a leitura da previsão de caixa e a permissão
-- previsao.ver (não há dado gravado: a previsão só lê).
drop function if exists public.previsao_de_caixa(integer, uuid);
do $$
begin
  perform set_config('ora.motivo', 'Reversão da previsão de caixa (L8c)', true);
  delete from public.papel_permissoes where permissao = 'previsao.ver';
  delete from public.permissoes where codigo = 'previsao.ver';
end;
$$;
