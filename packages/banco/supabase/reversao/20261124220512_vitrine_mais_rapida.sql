-- Reversão do lote ONLINE-i (migration 20261124220512_vitrine_mais_rapida): a vitrine e as ofertas de um produto voltam às versões em vigor
-- antes do lote (as cópias abaixo) e sai a função das ofertas de vários produtos.

create or replace function privado.ofertas_da_vitrine(p_organizacao uuid, p_produto uuid)
returns table (variante_id uuid, unidade_id uuid, preco_centavos bigint, disponivel int)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, u.id, privado.preco_do_balcao(v.id, u.id),
         greatest(coalesce(s.quantidade - s.reservado, 0) + coalesce((
           select sum(r.quantidade)::int from public.estoque_reservas r
           where r.unidade_id = u.id and r.variante_id = v.id and r.situacao = 'ativa' and r.expira_em <= now()), 0), 0)
  from public.produtos p
  join public.variantes v on v.produto_id = p.id and v.ativa
  join public.unidades u on u.organizacao_id = p.organizacao_id and u.tipo = 'loja_fisica' and u.status = 'ativa'
    and u.cnpj is not null
  left join public.estoque_saldos s on s.unidade_id = u.id and s.variante_id = v.id
  where p.id = p_produto and p.organizacao_id = p_organizacao and p.publicar_online and p.ativo and p.tipo in ('aparelho', 'acessorio')
    and privado.preco_do_balcao(v.id, u.id) is not null;
$$;

create or replace function public.loja_vitrine(p_organizacao uuid, p_busca text default null, p_categoria uuid default null, p_pagina int default 1)
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

drop function if exists privado.ofertas_dos_produtos(uuid, uuid[]);
