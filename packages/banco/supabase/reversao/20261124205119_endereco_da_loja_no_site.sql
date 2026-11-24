-- Reversão do lote ONLINE-h (migration 20261124205119_endereco_da_loja_no_site): as três funções voltam às versões de
-- antes (copiadas das migrations 20261116093359, 20261124155208 e 20261117071458), lendo public.unidades.endereco, e a
-- função do endereço do cadastro sai.
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
    'loja', (select jsonb_build_object('nome', u.nome, 'endereco', u.endereco, 'cidade', u.cidade) from public.unidades u where u.id = p_reserva.unidade_id));
$$;
revoke all on function privado.reserva_do_site_em_json(public.loja_reservas) from public, anon, authenticated;

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
    'loja', (select jsonb_build_object('nome', u.nome, 'endereco', u.endereco, 'cidade', u.cidade) from public.unidades u where u.id = p_pedido.unidade_id),
    'pagamento', privado.pagamento_do_pedido_em_json(p_pedido));
$$;
revoke all on function privado.pedido_do_site_em_json(public.loja_pedidos) from public, anon, authenticated;

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

drop function if exists privado.endereco_da_loja(uuid);
