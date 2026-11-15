-- =============================================================================
-- A vitrine da loja online (lote ONLINE-a: ORA-ONLINE-001, em parte; decisão do proprietário de 15/11/2026: a loja
-- online começa como "reserve no site e retire na loja", sem pagamento online; ADR-009)
--
-- Qualquer visitante, sem login, vê só o que o dono marcou para o site ("mostrar na loja online", que o cadastro do
-- produto já tinha: produtos.publicar_online) e está ativo. Nesta primeira etapa, só aparelhos e acessórios (o que se
-- retira na loja; chip, ativação, recarga e serviço ficam fora). De cada produto: o nome, a marca, a categoria, o modelo,
-- a descrição, as variações ativas (cor e capacidade), as fotos vigentes e, em cada loja física ativa, o preço do balcão
-- (o mesmo que o PDV cobra: a campanha, o preço da loja ou o da rede, canal "loja") e se há estoque ("disponível" ou
-- "últimas unidades", sem a quantidade). Nada de custo, SKU, código de barras, quantidade exata, IMEI, reserva ou outro
-- dado interno. Sem preço numa loja, o produto não aparece nela; sem preço em loja nenhuma, não aparece no site.
--   * public.loja_vitrine(organizacao, busca, categoria): a lista (até 60 produtos, por nome) e as categorias que têm
--     produto no site;
--   * public.loja_produto(organizacao, produto): o detalhe de um produto do site (P0002 se não está no site);
--   * privado.foto_na_vitrine(caminho): a foto vigente de produto do site; a política nova do armazenamento deixa o
--     visitante gerar o link temporário só dessas fotos (as outras continuam privadas).
-- É a primeira vez que o visitante sem login executa algo no banco: só estas três leituras, de propósito (o teste de
-- autorização lista exatamente estas). A organização vem da configuração do site. A reserva é o ONLINE-b.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

-- O preço do balcão de uma variação numa loja agora (a mesma escolha do PDV: campanha, preço da loja, preço da rede),
-- sem o filtro de lojas visíveis da sessão (a vitrine é pública e só chama isto para produto do site).
create or replace function privado.preco_do_balcao(p_variante uuid, p_unidade uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select x.valor_centavos from public.precos x
  where x.variante_id = p_variante and x.canal = 'loja' and (x.unidade_id is null or x.unidade_id = p_unidade)
    and x.inicio <= now() and (x.fim is null or x.fim > now()) and x.cancelado_em is null
  order by (x.origem = 'campanha') desc, (x.unidade_id is null), x.inicio desc
  limit 1;
$$;
revoke all on function privado.preco_do_balcao(uuid, uuid) from public, anon, authenticated;

-- As ofertas de um produto do site: cada variação ativa em cada loja física ativa com preço, e o que há para vender.
create or replace function privado.ofertas_da_vitrine(p_organizacao uuid, p_produto uuid)
returns table (variante_id uuid, unidade_id uuid, preco_centavos bigint, disponivel int)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, u.id, privado.preco_do_balcao(v.id, u.id), greatest(coalesce(s.quantidade - s.reservado, 0), 0)
  from public.produtos p
  join public.variantes v on v.produto_id = p.id and v.ativa
  join public.unidades u on u.organizacao_id = p.organizacao_id and u.tipo = 'loja_fisica' and u.status = 'ativa'
  left join public.estoque_saldos s on s.unidade_id = u.id and s.variante_id = v.id
  where p.id = p_produto and p.organizacao_id = p_organizacao and p.publicar_online and p.ativo and p.tipo in ('aparelho', 'acessorio')
    and privado.preco_do_balcao(v.id, u.id) is not null;
$$;
revoke all on function privado.ofertas_da_vitrine(uuid, uuid) from public, anon, authenticated;

-- A foto principal de um produto do site: a do produto (sem variação) primeiro, depois a de uma variação ativa.
create or replace function privado.foto_principal_da_vitrine(p_produto uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select f.caminho from public.fotos_produto f
  left join public.variantes v on v.id = f.variante_id
  where f.produto_id = p_produto and f.substituida_em is null and (f.variante_id is null or v.ativa)
  order by (f.variante_id is null) desc, f.criado_em, f.id
  limit 1;
$$;
revoke all on function privado.foto_principal_da_vitrine(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- A lista
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- O detalhe
-- -----------------------------------------------------------------------------
create or replace function public.loja_produto(p_organizacao uuid, p_produto uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_produto public.produtos;
begin
  select * into v_produto from public.produtos p
  where p.id = p_produto and p.organizacao_id = p_organizacao and p.publicar_online and p.ativo and p.tipo in ('aparelho', 'acessorio');
  if not found or not exists (select 1 from privado.ofertas_da_vitrine(p_organizacao, p_produto)) then
    raise exception 'Produto não encontrado na loja online' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'id', v_produto.id, 'nome', v_produto.nome, 'modelo', v_produto.modelo, 'descricao', v_produto.descricao,
    'marca', (select m.nome from public.marcas m where m.id = v_produto.marca_id),
    'categoria', (select c.nome from public.categorias c where c.id = v_produto.categoria_id),
    'fotos', (
      select coalesce(jsonb_agg(jsonb_build_object('caminho', f.caminho, 'variante', f.variante_id, 'largura', f.largura, 'altura', f.altura)
               order by (f.variante_id is null) desc, f.criado_em, f.id), '[]'::jsonb)
      from public.fotos_produto f left join public.variantes v on v.id = f.variante_id
      where f.produto_id = v_produto.id and f.substituida_em is null and (f.variante_id is null or v.ativa)),
    'variantes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', v.id, 'nome', v.nome, 'cor', v.cor, 'capacidade', v.capacidade,
               'lojas', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'id', u.id, 'nome', u.nome, 'cidade', u.cidade, 'endereco', u.endereco, 'preco_centavos', o.preco_centavos,
                          'disponibilidade', case when o.disponivel = 0 then 'sem_estoque' when o.disponivel <= 2 then 'ultimas_unidades' else 'disponivel' end)
                          order by (o.disponivel > 0) desc, u.nome), '[]'::jsonb)
                 from privado.ofertas_da_vitrine(p_organizacao, v_produto.id) o join public.unidades u on u.id = o.unidade_id
                 where o.variante_id = v.id))
             order by v.nome, v.id), '[]'::jsonb)
      from public.variantes v
      where v.produto_id = v_produto.id and v.ativa
        and exists (select 1 from privado.ofertas_da_vitrine(p_organizacao, v_produto.id) o where o.variante_id = v.id)));
end;
$$;

-- -----------------------------------------------------------------------------
-- As fotos do site no armazenamento
-- -----------------------------------------------------------------------------
create or replace function privado.foto_na_vitrine(p_caminho text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.fotos_produto f
    join public.produtos p on p.id = f.produto_id
    left join public.variantes v on v.id = f.variante_id
    where f.caminho = p_caminho and f.substituida_em is null and (f.variante_id is null or v.ativa)
      and p.publicar_online and p.ativo and p.tipo in ('aparelho', 'acessorio'));
$$;
revoke all on function privado.foto_na_vitrine(text) from public, anon, authenticated;
-- O visitante só alcança, no esquema privado, esta conferência (a política do armazenamento a chama por ele).
grant usage on schema privado to anon;
grant execute on function privado.foto_na_vitrine(text) to anon, authenticated;
create policy produtos_fotos_vitrine on storage.objects for select to anon, authenticated
  using (bucket_id = 'produtos' and privado.foto_na_vitrine(name));

revoke all on function public.loja_vitrine(uuid, text, uuid), public.loja_produto(uuid, uuid) from public;
grant execute on function public.loja_vitrine(uuid, text, uuid), public.loja_produto(uuid, uuid) to anon, authenticated;
