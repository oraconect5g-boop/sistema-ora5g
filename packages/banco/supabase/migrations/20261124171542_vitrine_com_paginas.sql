-- =============================================================================
-- Lote ONLINE-f (24/11/2026; ORA-ONLINE-001): a vitrine com o catálogo inteiro. Com o catálogo de verdade no site (634
-- produtos marcados em 24/11), a vitrine mostrava só os 60 primeiros por nome, sem como ver o resto. Agora:
--   * os disponíveis primeiro (depois por nome), para o que dá para comprar aparecer antes do "sem estoque";
--   * de 60 em 60, pela página pedida (p_pagina: começa em 1; fora do que existe, vale a primeira ou a última), com o
--     total e o número de páginas;
--   * as categorias do filtro seguem todas as que têm produto no site, como antes.
-- A assinatura muda (ganha p_pagina, com padrão 1): sai a função de três argumentos e entra a de quatro. O site de antes,
-- que chama sem a página (pelo nome dos argumentos), segue funcionando entre esta migration e a publicação.
-- Reversão: supabase/reversao/<mesmo nome>.sql (volta a função do ONLINE-a).
-- =============================================================================

drop function public.loja_vitrine(uuid, text, uuid);

create function public.loja_vitrine(p_organizacao uuid, p_busca text default null, p_categoria uuid default null, p_pagina int default 1)
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
  filtrados as (
    select r.* from resumo r, busca b
    where (p_categoria is null or r.categoria_id = p_categoria)
      and (b.termo is null or position(b.termo in lower(concat_ws(' ', r.nome, r.marca, r.modelo))) > 0)
  ),
  conta as (
    select count(*)::int as total, ceil(count(*) / 60.0)::int as paginas from filtrados
  ),
  pagina as (
    select least(greatest(coalesce(p_pagina, 1), 1), greatest(c.paginas, 1)) as n from conta c
  ),
  escolhidos as (
    select f.* from filtrados f
    order by f.disponivel desc, f.nome, f.id
    limit 60 offset (select (n - 1) * 60 from pagina)
  )
  select jsonb_build_object(
    'categorias', (
      select coalesce(jsonb_agg(jsonb_build_object('id', x.categoria_id, 'nome', x.categoria) order by x.categoria), '[]'::jsonb)
      from (select distinct r.categoria_id, r.categoria from resumo r) x),
    'produtos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', e.id, 'nome', e.nome, 'marca', e.marca, 'categoria', e.categoria,
               'preco_a_partir_centavos', coalesce(e.preco_disponivel, e.preco_qualquer), 'disponivel', e.disponivel,
               'foto', privado.foto_principal_da_vitrine(e.id)) order by e.disponivel desc, e.nome, e.id), '[]'::jsonb)
      from escolhidos e),
    'total', (select c.total from conta c),
    'pagina', (select g.n from pagina g),
    'paginas', (select c.paginas from conta c));
$$;

revoke all on function public.loja_vitrine(uuid, text, uuid, int) from public;
grant execute on function public.loja_vitrine(uuid, text, uuid, int) to anon, authenticated;
