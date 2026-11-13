-- =============================================================================
-- Margem bruta dos relatórios, lote G2 (ORA-FIN-002, ORA-FIN-008, ORA-FIN-009, ORA-REPORT-006)
--
-- 1) public.margem_painel: a margem bruta do período inteiro, somada no banco, no total e por dia
--    de São Paulo. É SECURITY INVOKER, como vendas_painel e financeiro_painel: valem as regras de
--    leitura (RLS) das tabelas para quem chama. O custo gravado só é lido por quem tem custo.ver
--    na loja da venda (regra de leitura de venda_itens_custos), e a função faz a mesma pergunta
--    para saber de quais lojas pode falar:
--      * loja em que quem chama tem custo.ver: os itens entram, com ou sem custo gravado;
--      * loja em que não tem: fica fora de tudo (do numerador e do denominador) e é só contada em
--        lojas_fora. Sem isso, o custo que o RLS esconde seria lido como "item sem custo".
--    Quem não tem custo.ver em loja nenhuma recebe zeros. Não muda dado.
--
--    Custo histórico: vale o custo gravado no item quando ele entrou na venda (venda_itens_custos,
--    escrito por adicionar_item). Custo novo, entrada de mercadoria ou estorno de entrada não
--    reescrevem a margem de venda passada. Item sem custo gravado não entra na margem e é contado.
--
--    Fatos, cada um na própria data (dia de São Paulo), na janela [início, fim), pela loja da venda:
--      * item vendido (concluida_em da venda), mesmo que a venda seja cancelada depois:
--        preço × quantidade − desconto do item − custo × quantidade;
--      * cancelamento de venda já concluída (cancelada_em): sai a margem inteira da venda;
--      * devolução (venda_devolucoes.criado_em): sai valor devolvido − custo × quantidade devolvida.
--        Venda com devolução não se cancela inteira (OR017): os dois nunca abatem o mesmo item.
--
--    margem = (vendido_com_custo − custo) − (devolvido_com_custo − custo_devolvido)
--                                         − (cancelado_com_custo − custo_cancelado)
--    A cobertura (vendido_com_custo ÷ vendido) e a margem percentual (margem ÷ base líquida, que é
--    vendido_com_custo − devolvido_com_custo − cancelado_com_custo) ficam com a tela, que recebe
--    as parcelas. "itens" conta unidades, como em vendas_painel.
--    Não é lucro: taxa de meio de pagamento, comissão, frete e imposto ficam fora.
--
-- 2) public.margem_itens: o detalhe da margem, uma linha por item das vendas concluídas no período
--    (os mesmos itens de "vendido"), paginado, só das lojas em que quem chama tem custo.ver.
--    Devolução e cancelamento não mudam a linha do item: saem do resumo, cada um na sua data. A
--    linha diz a situação da venda e quantas unidades do item já foram devolvidas.
--
-- Não cria tabela, coluna, política, permissão nem índice.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function public.margem_painel(
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
  -- Os três fatos de venda do período, já no escopo pedido (os mesmos de vendas_painel).
  concluidas as (
    select v.id, v.unidade_id, v.concluida_em as quando
    from public.vendas v
    where v.concluida_em >= p_inicio and v.concluida_em < p_fim
      and (p_unidade is null or v.unidade_id = p_unidade)
  ),
  canceladas as (
    select v.id, v.unidade_id, v.cancelada_em as quando
    from public.vendas v
    where v.situacao = 'cancelada' and v.concluida_em is not null
      and v.cancelada_em >= p_inicio and v.cancelada_em < p_fim
      and (p_unidade is null or v.unidade_id = p_unidade)
  ),
  devolucoes as (
    select d.id, v.unidade_id, d.criado_em as quando
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
    select 'vendido' as fato, c.quando, i.quantidade,
      i.preco_unitario_centavos * i.quantidade - i.desconto_centavos as valor,
      k.custo_unitario_centavos * i.quantidade as custo
    from concluidas c
    join lojas l on l.unidade_id = c.unidade_id and l.com_custo
    join public.venda_itens i on i.venda_id = c.id
    left join public.venda_itens_custos k on k.item_id = i.id
    union all
    select 'cancelado', x.quando, i.quantidade,
      i.preco_unitario_centavos * i.quantidade - i.desconto_centavos,
      k.custo_unitario_centavos * i.quantidade
    from canceladas x
    join lojas l on l.unidade_id = x.unidade_id and l.com_custo
    join public.venda_itens i on i.venda_id = x.id
    left join public.venda_itens_custos k on k.item_id = i.id
    union all
    select 'devolvido', d.quando, di.quantidade, di.valor_centavos,
      k.custo_unitario_centavos * di.quantidade
    from devolucoes d
    join lojas l on l.unidade_id = d.unidade_id and l.com_custo
    join public.venda_devolucao_itens di on di.devolucao_id = d.id
    left join public.venda_itens_custos k on k.item_id = di.venda_item_id
  ),
  -- Uma passada só: a linha "geral" (o período inteiro, que existe mesmo sem fato nenhum) e uma
  -- linha por dia. Cada grão é somado direto dos fatos; o total não é a soma dos dias.
  somas as (
    select
      grouping(f.dia) = 1 as geral,
      f.dia as periodo,
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
    from (
      select to_char(date_trunc('day', t.quando at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD') as dia, t.*
      from fatos t
    ) f
    group by grouping sets ((f.dia), ())
  ),
  linhas as (
    select s.*,
      (s.vendido_com_custo - s.custo)
        - (s.devolvido_com_custo - s.custo_devolvido)
        - (s.cancelado_com_custo - s.custo_cancelado) as margem
    from somas s
  )
  select jsonb_build_object(
    'totais', (select to_jsonb(x) - 'geral' - 'periodo' from linhas x where x.geral),
    'periodos', coalesce((select jsonb_agg(to_jsonb(x) - 'geral' order by x.periodo) from linhas x where not x.geral), '[]'::jsonb),
    'lojas_com_custo', (select count(*) from lojas l where l.com_custo),
    'lojas_fora', (select count(*) from lojas l where not l.com_custo)
  ) into resultado;

  return resultado;
end;
$$;

comment on function public.margem_painel(timestamptz, timestamptz, uuid) is
  'Relatórios (G2): margem bruta do período inteiro, no total e por dia, pelo custo gravado no item, só das lojas em que quem chama tem custo.ver (security invoker). Não é lucro: taxas, comissão, frete e imposto ficam fora.';

revoke all on function public.margem_painel(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.margem_painel(timestamptz, timestamptz, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Detalhe da margem: uma linha por item das vendas concluídas no período
-- -----------------------------------------------------------------------------
create or replace function public.margem_itens(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_unidade uuid default null,
  p_limite integer default 50,
  p_apos integer default 0
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
  if p_limite is null or p_limite < 1 or p_limite > 1000 or p_apos is null or p_apos < 0 then
    raise exception 'Página inválida: de 1 a 1000 itens por vez, a partir de zero ou mais' using errcode = '22023';
  end if;

  with
  concluidas as (
    select v.id, v.numero, v.unidade_id, v.concluida_em, v.situacao
    from public.vendas v
    where v.concluida_em >= p_inicio and v.concluida_em < p_fim
      and (p_unidade is null or v.unidade_id = p_unidade)
  ),
  -- Só as lojas em que quem chama lê o custo (a mesma pergunta de margem_painel).
  lojas as materialized (
    select u.unidade_id
    from (select distinct c.unidade_id from concluidas c) u
    where public.tem_permissao('custo.ver', u.unidade_id)
  ),
  itens as (
    select c.id as venda_id, c.numero, c.concluida_em, c.unidade_id, c.situacao,
      i.id as item_id, i.criado_em as item_criado_em, i.variante_id, i.tipo, i.quantidade,
      i.preco_unitario_centavos as preco_unitario,
      i.desconto_centavos as desconto,
      i.preco_unitario_centavos * i.quantidade - i.desconto_centavos as valor,
      k.custo_unitario_centavos as custo_unitario,
      i.preco_unitario_centavos * i.quantidade - i.desconto_centavos
        - k.custo_unitario_centavos * i.quantidade as margem
    from concluidas c
    join lojas l on l.unidade_id = c.unidade_id
    join public.venda_itens i on i.venda_id = c.id
    left join public.venda_itens_custos k on k.item_id = i.id
  ),
  -- A ordem é total (o número da venda é único), para a página seguinte não repetir nem pular item.
  pagina as (
    select t.*
    from itens t
    order by t.concluida_em desc, t.numero desc, t.item_criado_em, t.item_id
    limit p_limite offset p_apos
  )
  select jsonb_build_object(
    'total', (select count(*) from itens),
    'itens', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'venda_id', p.venda_id,
          'numero', p.numero,
          'concluida_em', p.concluida_em,
          'unidade_id', p.unidade_id,
          'unidade', u.nome,
          'situacao', p.situacao,
          'item_id', p.item_id,
          'tipo', p.tipo,
          'variante', va.nome,
          'sku', va.sku,
          'quantidade', p.quantidade,
          'preco_unitario', p.preco_unitario,
          'desconto', p.desconto,
          'valor', p.valor,
          'custo_unitario', p.custo_unitario,
          'margem', p.margem,
          'devolvidos', (
            select coalesce(sum(di.quantidade), 0)
            from public.venda_devolucao_itens di
            where di.venda_item_id = p.item_id
          )
        )
        order by p.concluida_em desc, p.numero desc, p.item_criado_em, p.item_id
      )
      from pagina p
      left join public.variantes va on va.id = p.variante_id
      left join public.unidades u on u.id = p.unidade_id
    ), '[]'::jsonb)
  ) into resultado;

  return resultado;
end;
$$;

comment on function public.margem_itens(timestamptz, timestamptz, uuid, integer, integer) is
  'Relatórios (G2): detalhe da margem por item das vendas concluídas no período (preço, desconto, custo gravado e margem), paginado, só das lojas em que quem chama tem custo.ver (security invoker).';

revoke all on function public.margem_itens(timestamptz, timestamptz, uuid, integer, integer) from public, anon;
grant execute on function public.margem_itens(timestamptz, timestamptz, uuid, integer, integer) to authenticated;
