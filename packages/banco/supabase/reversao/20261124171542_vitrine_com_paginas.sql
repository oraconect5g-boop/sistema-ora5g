-- Reversão do lote ONLINE-f (migration 20261124171542_vitrine_com_paginas): volta a vitrine do ONLINE-a (os 60 primeiros
-- por nome, sem página), com a assinatura de três argumentos e as mesmas permissões. O site publicado com o ONLINE-f chama
-- a vitrine com p_pagina: antes de reverter, volte o site também (ou ele cai no "a loja não carregou").
drop function if exists public.loja_vitrine(uuid, text, uuid, int);

create or replace function public.loja_vitrine(p_organizacao uuid, p_busca text default null, p_categoria uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with busca as (
    select nullif(lower(left(regexp_replace(trim(coalesce(p_busca, '')), '\s+', ' ', 'g'), 60)), '') as termo
  ),
  do_site as (
    select p.id, p.nome, p.modelo, m.nome as marca, c.id as categoria_id, c.nome as categoria
    from public.produtos p
    join public.categorias c on c.id = p.categoria_id
    left join public.marcas m on m.id = p.marca_id
    where p.organizacao_id = p_organizacao and p.publicar_online and p.ativo and p.tipo in ('aparelho', 'acessorio')
  ),
  resumo as (
    select d.*, min(o.preco_centavos) filter (where o.disponivel > 0) as preco_disponivel, min(o.preco_centavos) as preco_qualquer,
           bool_or(o.disponivel > 0) as disponivel
    from do_site d
    cross join lateral privado.ofertas_da_vitrine(p_organizacao, d.id) o
    group by d.id, d.nome, d.modelo, d.marca, d.categoria_id, d.categoria
  ),
  escolhidos as (
    select r.* from resumo r, busca b
    where (p_categoria is null or r.categoria_id = p_categoria)
      and (b.termo is null or position(b.termo in lower(concat_ws(' ', r.nome, r.marca, r.modelo))) > 0)
    order by r.nome, r.id
    limit 60
  )
  select jsonb_build_object(
    'categorias', (
      select coalesce(jsonb_agg(jsonb_build_object('id', x.categoria_id, 'nome', x.categoria) order by x.categoria), '[]'::jsonb)
      from (select distinct r.categoria_id, r.categoria from resumo r) x),
    'produtos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', e.id, 'nome', e.nome, 'marca', e.marca, 'categoria', e.categoria,
               'preco_a_partir_centavos', coalesce(e.preco_disponivel, e.preco_qualquer), 'disponivel', e.disponivel,
               'foto', privado.foto_principal_da_vitrine(e.id)) order by e.nome, e.id), '[]'::jsonb)
      from escolhidos e));
$$;

revoke all on function public.loja_vitrine(uuid, text, uuid) from public;
grant execute on function public.loja_vitrine(uuid, text, uuid) to anon, authenticated;
