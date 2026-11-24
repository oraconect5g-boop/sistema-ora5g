-- =============================================================================
-- Lote ONLINE-h (24/11/2026; ORA-ONLINE-001 e ORA-ONLINE-002): o endereço do cadastro da loja chega à loja online. A tela
-- "Lojas da rede" grava o endereço na configuração com vigência (public.unidade_configuracoes: rua, número, complemento,
-- bairro e CEP), mas a loja online lia public.unidades.endereco, que nada preenche: o "Retire em" da página do produto,
-- da reserva e do pedido nunca mostrava o endereço. Agora:
--   * privado.endereco_da_loja(unidade): o endereço da configuração em vigor, "rua, número - complemento - bairro" (sem a
--     rua, nulo; o CEP e a cidade ficam de fora: a cidade já vai à parte);
--   * a página do produto (public.loja_produto), a reserva (privado.reserva_do_site_em_json) e o pedido do site
--     (privado.pedido_do_site_em_json) usam esse endereço; sem configuração com rua, o de antes (public.unidades.endereco).
-- As três funções são as em vigor (conferidas pelo md5 no ora5g-dev), só com o endereço trocado.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function privado.endereco_da_loja(p_unidade uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when c.logradouro is null then null
              else concat_ws(' - ', concat_ws(', ', c.logradouro, c.numero), c.complemento, c.bairro) end
  from public.unidade_configuracoes c
  where c.unidade_id = p_unidade and c.vigente_desde <= now()
  order by c.vigente_desde desc, c.id desc
  limit 1;
$$;
revoke all on function privado.endereco_da_loja(uuid) from public, anon, authenticated;

-- A reserva de um item (a do ONLINE-b), com o endereço do cadastro.
create or replace function privado.reserva_do_site_em_json(p_reserva public.loja_reservas)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'codigo', p_reserva.codigo, 'expira_em', p_reserva.expira_em, 'preco_centavos', p_reserva.preco_centavos,
    'produto', (select p.nome from public.variantes v join public.produtos p on p.id = v.produto_id where v.id = p_reserva.variante_id),
    'variacao', (select v.nome from public.variantes v where v.id = p_reserva.variante_id),
    'loja', (select jsonb_build_object('nome', u.nome, 'endereco', coalesce(privado.endereco_da_loja(u.id), u.endereco), 'cidade', u.cidade)
             from public.unidades u where u.id = p_reserva.unidade_id));
$$;
revoke all on function privado.reserva_do_site_em_json(public.loja_reservas) from public, anon, authenticated;

-- O pedido do site (a do PAY-014a, com o pagamento), com o endereço do cadastro.
create or replace function privado.pedido_do_site_em_json(p_pedido public.loja_pedidos)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'codigo', p_pedido.codigo,
    'situacao', case when p_pedido.situacao = 'reservado' and p_pedido.expira_em <= now() then 'vencido' else p_pedido.situacao end,
    'expira_em', p_pedido.expira_em, 'total_centavos', p_pedido.total_centavos, 'unidades', p_pedido.unidades,
    'itens', (select coalesce(jsonb_agg(jsonb_build_object(
                'produto', (select p.nome from public.variantes v join public.produtos p on p.id = v.produto_id where v.id = r.variante_id),
                'variacao', (select v.nome from public.variantes v where v.id = r.variante_id),
                'preco_centavos', r.preco_centavos) order by r.numero), '[]'::jsonb)
              from public.loja_reservas r where r.pedido_id = p_pedido.id),
    'loja', (select jsonb_build_object('nome', u.nome, 'endereco', coalesce(privado.endereco_da_loja(u.id), u.endereco), 'cidade', u.cidade)
             from public.unidades u where u.id = p_pedido.unidade_id),
    'pagamento', privado.pagamento_do_pedido_em_json(p_pedido));
$$;
revoke all on function privado.pedido_do_site_em_json(public.loja_pedidos) from public, anon, authenticated;

-- A página do produto (a do ONLINE-a, sem erro 500), com o endereço do cadastro em cada loja.
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
    return null;
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
                          'id', u.id, 'nome', u.nome, 'cidade', u.cidade, 'endereco', coalesce(privado.endereco_da_loja(u.id), u.endereco),
                          'preco_centavos', o.preco_centavos,
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
