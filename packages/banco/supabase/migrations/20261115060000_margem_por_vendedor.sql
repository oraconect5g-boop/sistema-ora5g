-- =============================================================================
-- Margem por vendedor (lote PERF-003b: ORA-PERF-003 e ORA-PERF-005, a margem por vendedor para a gestão)
--
-- public.margem_por_vendedor(início, fim, loja): a margem bruta do período por vendedor de origem, com as mesmas
-- regras de public.margem_painel (lote G2), que continua igual:
--   * SECURITY INVOKER: valem as regras de leitura (RLS) das vendas e do custo para quem chama;
--   * só entram as lojas em que quem chama tem custo.ver; as outras ficam fora de tudo e são só contadas
--     (lojas_fora). Quem não tem custo.ver em loja nenhuma recebe a lista vazia;
--   * o custo é o gravado no item quando ele entrou na venda (venda_itens_custos): custo novo não muda a margem
--     de venda passada. Item sem custo gravado não entra na margem e é contado;
--   * cada fato pelo vendedor de origem da venda, na janela [início, fim): o item vendido (concluida_em, mesmo
--     que a venda seja cancelada depois), o cancelamento de venda concluída (cancelada_em) e a devolução
--     (venda_devolucoes.criado_em). Cancelar ou devolver por outra pessoa não muda o vendedor do fato.
-- Uma linha por vendedor com fato, com as mesmas parcelas da margem_painel (a tela refaz a conta e falha se não
-- fechar), da maior margem para a menor. O nome não vem aqui: a tela pede a public.ranking_nomes, que só devolve
-- nome a quem tem ranking.ver. Só lê. Não é lucro nem comissão: taxa de meio de pagamento, frete e imposto ficam
-- fora. Sem tabela, coluna, política, permissão ou índice novos. Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function public.margem_por_vendedor(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_unidade uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  resultado jsonb;
begin
  if p_inicio is null or p_fim is null or p_fim <= p_inicio or p_fim - p_inicio > interval '400 days' then
    raise exception 'Período inválido: o fim vem depois do início e o período tem no máximo 400 dias' using errcode = '22023';
  end if;

  with
  -- Os três fatos de venda do período, já no escopo pedido, com o vendedor de origem.
  concluidas as (
    select v.id, v.unidade_id, v.vendedor_id
    from public.vendas v
    where v.concluida_em >= p_inicio and v.concluida_em < p_fim
      and (p_unidade is null or v.unidade_id = p_unidade)
  ),
  canceladas as (
    select v.id, v.unidade_id, v.vendedor_id
    from public.vendas v
    where v.situacao = 'cancelada' and v.concluida_em is not null
      and v.cancelada_em >= p_inicio and v.cancelada_em < p_fim
      and (p_unidade is null or v.unidade_id = p_unidade)
  ),
  devolucoes as (
    select d.id, v.unidade_id, v.vendedor_id
    from public.venda_devolucoes d
    join public.vendas v on v.id = d.venda_id
    where d.criado_em >= p_inicio and d.criado_em < p_fim
      and (p_unidade is null or v.unidade_id = p_unidade)
  ),
  -- As lojas dos fatos, cada uma perguntada uma só vez: é a pergunta da regra de leitura do custo.
  lojas as materialized (
    select u.unidade_id, public.tem_permissao('custo.ver', u.unidade_id) as com_custo
    from (
      select c.unidade_id from concluidas c
      union
      select x.unidade_id from canceladas x
      union
      select d.unidade_id from devolucoes d
    ) u
  ),
  -- Grão do item, só das lojas com custo.ver. "custo" é nulo quando o item não tem custo gravado.
  fatos as (
    select 'vendido' as fato, c.vendedor_id, i.quantidade,
      i.preco_unitario_centavos * i.quantidade - i.desconto_centavos as valor,
      k.custo_unitario_centavos * i.quantidade as custo
    from concluidas c
    join lojas l on l.unidade_id = c.unidade_id and l.com_custo
    join public.venda_itens i on i.venda_id = c.id
    left join public.venda_itens_custos k on k.item_id = i.id
    union all
    select 'cancelado', x.vendedor_id, i.quantidade,
      i.preco_unitario_centavos * i.quantidade - i.desconto_centavos,
      k.custo_unitario_centavos * i.quantidade
    from canceladas x
    join lojas l on l.unidade_id = x.unidade_id and l.com_custo
    join public.venda_itens i on i.venda_id = x.id
    left join public.venda_itens_custos k on k.item_id = i.id
    union all
    select 'devolvido', d.vendedor_id, di.quantidade, di.valor_centavos,
      k.custo_unitario_centavos * di.quantidade
    from devolucoes d
    join lojas l on l.unidade_id = d.unidade_id and l.com_custo
    join public.venda_devolucao_itens di on di.devolucao_id = d.id
    left join public.venda_itens_custos k on k.item_id = di.venda_item_id
  ),
  somas as (
    select
      f.vendedor_id as vendedor,
      coalesce(sum(f.quantidade) filter (where f.fato = 'vendido'), 0) as itens,
      coalesce(sum(f.valor) filter (where f.fato = 'vendido'), 0) as vendido,
      coalesce(sum(f.quantidade) filter (where f.fato = 'vendido' and f.custo is not null), 0) as itens_com_custo,
      coalesce(sum(f.valor) filter (where f.fato = 'vendido' and f.custo is not null), 0) as vendido_com_custo,
      coalesce(sum(f.custo) filter (where f.fato = 'vendido'), 0) as custo,
      coalesce(sum(f.quantidade) filter (where f.fato = 'vendido' and f.custo is null), 0) as itens_sem_custo,
      coalesce(sum(f.valor) filter (where f.fato = 'vendido' and f.custo is null), 0) as vendido_sem_custo,
      coalesce(sum(f.quantidade) filter (where f.fato = 'devolvido' and f.custo is not null), 0) as itens_devolvidos_com_custo,
      coalesce(sum(f.valor) filter (where f.fato = 'devolvido' and f.custo is not null), 0) as devolvido_com_custo,
      coalesce(sum(f.custo) filter (where f.fato = 'devolvido'), 0) as custo_devolvido,
      coalesce(sum(f.quantidade) filter (where f.fato = 'cancelado' and f.custo is not null), 0) as itens_cancelados_com_custo,
      coalesce(sum(f.valor) filter (where f.fato = 'cancelado' and f.custo is not null), 0) as cancelado_com_custo,
      coalesce(sum(f.custo) filter (where f.fato = 'cancelado'), 0) as custo_cancelado
    from fatos f
    group by f.vendedor_id
  ),
  linhas as (
    select s.*,
      (s.vendido_com_custo - s.custo)
        - (s.devolvido_com_custo - s.custo_devolvido)
        - (s.cancelado_com_custo - s.custo_cancelado) as margem
    from somas s
  )
  select jsonb_build_object(
    'vendedores', coalesce((select jsonb_agg(to_jsonb(x) order by x.margem desc, x.vendedor) from linhas x), '[]'::jsonb),
    'lojas_com_custo', (select count(*) from lojas l where l.com_custo),
    'lojas_fora', (select count(*) from lojas l where not l.com_custo)
  ) into resultado;

  return resultado;
end;
$$;

comment on function public.margem_por_vendedor(timestamptz, timestamptz, uuid) is
  'Relatórios (PERF-003b): margem bruta do período por vendedor de origem, pelo custo gravado no item, só das lojas em que quem chama tem custo.ver (security invoker). Não é lucro nem comissão.';

revoke all on function public.margem_por_vendedor(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.margem_por_vendedor(timestamptz, timestamptz, uuid) to authenticated;
