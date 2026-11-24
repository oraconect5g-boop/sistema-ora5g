-- =============================================================================
-- Lote ONLINE-i (24/11/2026; ORA-ONLINE-001, que segue parcial; ORA-QUAL-010): a vitrine mais rápida. Com o catálogo de
-- verdade (634 produtos no site), public.loja_vitrine levava de 0,3 s a 0,7 s no banco a cada visita: calculava as ofertas
-- produto por produto (634 chamadas de privado.ofertas_da_vitrine, ~0,42 ms cada, e o preço do balcão duas vezes por
-- variação e loja). Agora:
--   * privado.ofertas_dos_produtos(organização, produtos): as ofertas de vários produtos numa conta só, com a mesma regra
--     de privado.ofertas_da_vitrine (as lojas físicas ativas com CNPJ, a variação ativa com preço do balcão, o disponível
--     com as reservas vencidas de volta) e o preço do balcão uma vez por variação e loja;
--   * privado.ofertas_da_vitrine(organização, produto) passa a ser esse cálculo para um produto só (a mesma assinatura e
--     o mesmo resultado: a página do produto, a reserva e o pedido seguem iguais);
--   * public.loja_vitrine calcula as ofertas de todos os produtos do site de uma vez (o resto da função não muda).
-- As duas funções refeitas são as em vigor (o md5 do corpo conferido no ora5g-dev): ofertas_da_vitrine (20261117160216) e
-- loja_vitrine (20261124171542). Os acessos ficam como estão (create or replace mantém os grants).
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

-- 1) As ofertas de vários produtos de uma vez (a regra da privado.ofertas_da_vitrine do lote de 17/11, com o preço do
--    balcão calculado uma vez por variação e loja: o "offset 0" impede o banco de repetir a conta no filtro).
create or replace function privado.ofertas_dos_produtos(p_organizacao uuid, p_produtos uuid[])
returns table (produto_id uuid, variante_id uuid, unidade_id uuid, preco_centavos bigint, disponivel int)
language sql
stable
security definer
set search_path = ''
as $$
  select x.produto_id, x.variante_id, x.unidade_id, x.preco_centavos,
         greatest(coalesce(s.quantidade - s.reservado, 0) + coalesce((
           select sum(r.quantidade)::int from public.estoque_reservas r
           where r.unidade_id = x.unidade_id and r.variante_id = x.variante_id and r.situacao = 'ativa' and r.expira_em <= now()), 0), 0)
  from (
    select p.id as produto_id, v.id as variante_id, u.id as unidade_id, privado.preco_do_balcao(v.id, u.id) as preco_centavos
    from public.produtos p
    join public.variantes v on v.produto_id = p.id and v.ativa
    join public.unidades u on u.organizacao_id = p.organizacao_id and u.tipo = 'loja_fisica' and u.status = 'ativa'
      and u.cnpj is not null
    where p.id = any(p_produtos) and p.organizacao_id = p_organizacao and p.publicar_online and p.ativo
      and p.tipo in ('aparelho', 'acessorio')
    offset 0
  ) x
  left join public.estoque_saldos s on s.unidade_id = x.unidade_id and s.variante_id = x.variante_id
  where x.preco_centavos is not null;
$$;
revoke all on function privado.ofertas_dos_produtos(uuid, uuid[]) from public, anon, authenticated;

-- 2) As ofertas de um produto: o mesmo cálculo, para um produto só (a mesma assinatura e o mesmo resultado de antes).
create or replace function privado.ofertas_da_vitrine(p_organizacao uuid, p_produto uuid)
returns table (variante_id uuid, unidade_id uuid, preco_centavos bigint, disponivel int)
language sql
stable
security definer
set search_path = ''
as $$
  select o.variante_id, o.unidade_id, o.preco_centavos, o.disponivel
  from privado.ofertas_dos_produtos(p_organizacao, array[p_produto]) o;
$$;
revoke all on function privado.ofertas_da_vitrine(uuid, uuid) from public, anon, authenticated;

-- 3) A vitrine (a do ONLINE-f), com as ofertas de todos os produtos do site numa conta só.
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
    -- ONLINE-i: as ofertas de todos os produtos do site numa conta só (antes, uma chamada por produto).
    join privado.ofertas_dos_produtos(p_organizacao, array(select s.id from do_site s)) o on o.produto_id = d.id
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
