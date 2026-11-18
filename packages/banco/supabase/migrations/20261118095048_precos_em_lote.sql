-- =============================================================================
-- Lote VEL-b (18/11/2026; ADR-010, "O que vem depois": o preço em lote na busca do PDV; ORA-QUAL-010 e ORA-POS-002):
-- o preço vigente de várias variações numa loja, numa ida só.
--
-- A busca do PDV pedia o preço de cada resultado à parte (até 9 pedidos ao mesmo tempo, cada um podendo abrir uma
-- conexão). public.precos_vigentes devolve, de uma vez, o mesmo que public.preco_vigente devolveria para cada uma:
-- chama a própria função, sem outra regra de preço (um escritor só). Roda com os direitos de quem chama; a loja que a
-- pessoa não vê não tem preço (a regra de preco_vigente). Só volta a variação que tem preço; até 40 por chamada.
-- Não grava nada e não muda função nenhuma que já existe.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function public.precos_vigentes(p_variantes uuid[], p_unidade uuid)
returns table (variante_id uuid, preco_centavos bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if coalesce(cardinality(p_variantes), 0) > 40 then
    raise exception 'Variações demais numa leitura só: no máximo 40' using errcode = '22023';
  end if;
  return query
    select v.id, p.preco
    from (select distinct x.id from unnest(coalesce(p_variantes, '{}'::uuid[])) as x(id) where x.id is not null) v
    cross join lateral (select public.preco_vigente(v.id, p_unidade) as preco) p
    where p.preco is not null;
end;
$$;
comment on function public.precos_vigentes(uuid[], uuid) is
  'VEL-b: o preço vigente (o do balcão, public.preco_vigente) de até 40 variações numa loja, numa ida; só as que têm preço.';
revoke all on function public.precos_vigentes(uuid[], uuid) from public, anon;
grant execute on function public.precos_vigentes(uuid[], uuid) to authenticated;
