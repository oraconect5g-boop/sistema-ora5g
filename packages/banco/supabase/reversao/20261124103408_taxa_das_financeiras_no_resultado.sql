-- Reversão de 20261124103408_taxa_das_financeiras_no_resultado (lote FIN-002a): o resultado do mês volta à definição do
-- L8b (migration 20261114013120), sem a taxa das financeiras. Nada é gravado: a função só lê.
create or replace function public.resultado_do_mes(p_mes date, p_unidade uuid default null, p_meses integer default 6)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes_atual date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_mes date := date_trunc('month', p_mes)::date;
  v_org uuid := (select u.organizacao_id from public.unidades u where u.id = (select public.unidade_atual()));
  v_primeiro date;
  v_depois date;
  v_inicio timestamptz;
  v_fim timestamptz;
  resultado jsonb;
begin
  -- Todas as partes, em papel de organização: sem uma delas, a regra de leitura esconderia parte dos
  -- números e o resultado sairia errado sem aviso.
  if v_org is null or exists (
    select 1 from unnest(array['resultado.ver', 'venda.ver_todas', 'custo.ver', 'conta_pagar.gerir', 'caixa.conferir']) as p (codigo)
    where v_org not in (select privado.organizacoes_com_permissao(p.codigo))
  ) then
    raise exception 'Sem permissão para ver o resultado do mês' using errcode = '42501';
  end if;
  if p_unidade is not null and not exists (select 1 from public.unidades u where u.id = p_unidade and u.organizacao_id = v_org) then
    raise exception 'Sem permissão para ver o resultado desta loja' using errcode = '42501';
  end if;
  if p_mes is null or v_mes > v_mes_atual or v_mes < (v_mes_atual - interval '24 months')::date then
    raise exception 'Mês inválido: do mês atual até 24 meses atrás' using errcode = '22023';
  end if;
  if p_meses is null or p_meses not between 1 and 12 then
    raise exception 'Série inválida: de 1 a 12 meses' using errcode = '22023';
  end if;
  v_primeiro := (v_mes - make_interval(months => p_meses - 1))::date;
  v_depois := (v_mes + interval '1 month')::date;
  v_inicio := v_primeiro::timestamp at time zone 'America/Sao_Paulo';
  v_fim := v_depois::timestamp at time zone 'America/Sao_Paulo';

  with
  meses as (
    select (v_primeiro + make_interval(months => g.i))::date as mes from generate_series(0, p_meses - 1) as g (i)
  ),
  -- Os fatos de venda da rede inteira (a divisão das despesas da rede precisa de todas as lojas).
  concluidas as (
    select v.id, v.unidade_id, date_trunc('month', v.concluida_em at time zone 'America/Sao_Paulo')::date as mes,
      v.total_centavos, coalesce(v.desconto_centavos, 0) as desconto
    from public.vendas v
    where v.organizacao_id = v_org and v.concluida_em >= v_inicio and v.concluida_em < v_fim
  ),
  canceladas as (
    select v.id, v.unidade_id, date_trunc('month', v.cancelada_em at time zone 'America/Sao_Paulo')::date as mes, v.total_centavos
    from public.vendas v
    where v.organizacao_id = v_org and v.situacao = 'cancelada' and v.concluida_em is not null
      and v.cancelada_em >= v_inicio and v.cancelada_em < v_fim
  ),
  devolucoes as (
    select d.id, v.unidade_id, date_trunc('month', d.criado_em at time zone 'America/Sao_Paulo')::date as mes, d.valor_centavos
    from public.venda_devolucoes d
    join public.vendas v on v.id = d.venda_id
    where v.organizacao_id = v_org and d.criado_em >= v_inicio and d.criado_em < v_fim
  ),
  vendas_mes as (
    select c.mes, c.unidade_id, count(*) as vendas, sum(c.total_centavos) as vendido, sum(c.desconto) as descontos
    from concluidas c group by 1, 2
  ),
  canceladas_mes as (select x.mes, x.unidade_id, sum(x.total_centavos) as valor from canceladas x group by 1, 2),
  devolucoes_mes as (select d.mes, d.unidade_id, sum(d.valor_centavos) as valor from devolucoes d group by 1, 2),
  -- Custo gravado no item quando ele entrou na venda (como margem_painel).
  custos_vendidos as (
    select c.mes, c.unidade_id,
      coalesce(sum(k.custo_unitario_centavos * i.quantidade), 0) as custo,
      coalesce(sum(i.preco_unitario_centavos * i.quantidade - i.desconto_centavos) filter (where k.item_id is not null), 0) as com_custo,
      coalesce(sum(i.preco_unitario_centavos * i.quantidade - i.desconto_centavos) filter (where k.item_id is null), 0) as sem_custo,
      coalesce(sum(i.quantidade) filter (where k.item_id is null), 0) as itens_sem_custo
    from concluidas c
    join public.venda_itens i on i.venda_id = c.id
    left join public.venda_itens_custos k on k.item_id = i.id
    group by 1, 2
  ),
  custos_cancelados as (
    select x.mes, x.unidade_id, sum(k.custo_unitario_centavos * i.quantidade) as custo
    from canceladas x
    join public.venda_itens i on i.venda_id = x.id
    join public.venda_itens_custos k on k.item_id = i.id
    group by 1, 2
  ),
  custos_devolvidos as (
    select d.mes, d.unidade_id, sum(k.custo_unitario_centavos * di.quantidade) as custo
    from devolucoes d
    join public.venda_devolucao_itens di on di.devolucao_id = d.id
    join public.venda_itens_custos k on k.item_id = di.venda_item_id
    group by 1, 2
  ),
  -- Os meios que se conciliam com o extrato: a mesma lista de privado.meio_liquidavel (que o teste confere).
  taxas_mes as (
    select c.mes, c.unidade_id,
      coalesce(sum(p.valor_centavos - p.valor_liquido_centavos) filter (where p.conciliado_em is not null), 0) as taxas,
      count(*) filter (where p.conciliado_em is not null) as conciliados,
      count(*) filter (where p.conciliado_em is null) as a_conciliar,
      coalesce(sum(p.valor_centavos) filter (where p.conciliado_em is null), 0) as a_conciliar_valor
    from concluidas c
    join public.venda_pagamentos p on p.venda_id = c.id
    where p.situacao = 'confirmado' and p.meio in ('pix_direto', 'pix_picpay', 'cartao_picpay', 'cartao_pagseguro')
    group by 1, 2
  ),
  -- Contas a pagar pelo mês do vencimento: a paga pelo valor pago, a aberta pelo valor; cancelada não entra.
  contas as (
    select date_trunc('month', c.vencimento)::date as mes, c.unidade_id, c.categoria_id, k.nome as categoria, k.entra_no_resultado as entra,
      c.situacao, case when c.situacao = 'paga' then c.valor_pago_centavos else c.valor_centavos end as valor
    from public.contas_a_pagar c
    join public.contas_pagar_categorias k on k.id = c.categoria_id
    where c.organizacao_id = v_org and c.situacao <> 'cancelada' and c.vencimento >= v_primeiro and c.vencimento < v_depois
  ),
  despesas_mes as (
    select x.mes, x.unidade_id, sum(x.valor) as valor, coalesce(sum(x.valor) filter (where x.situacao = 'aberta'), 0) as em_aberto
    from contas x where x.entra and x.unidade_id is not null group by 1, 2
  ),
  rede_mes as (
    select m.mes,
      coalesce(sum(x.valor), 0) as despesas_rede,
      coalesce(sum(x.valor) filter (where x.situacao = 'aberta'), 0) as rede_em_aberto
    from meses m left join contas x on x.mes = m.mes and x.entra and x.unidade_id is null
    group by m.mes
  ),
  saidas_mes as (
    select date_trunc('month', s.decidida_em at time zone 'America/Sao_Paulo')::date as mes, s.unidade_id,
      count(*) as quantidade, sum(s.valor_centavos) as valor
    from public.caixa_saidas s
    where s.organizacao_id = v_org and s.situacao = 'autorizada' and s.decidida_em >= v_inicio and s.decidida_em < v_fim
    group by 1, 2
  ),
  chaves as (
    select mes, unidade_id from vendas_mes
    union select mes, unidade_id from canceladas_mes
    union select mes, unidade_id from devolucoes_mes
    union select mes, unidade_id from despesas_mes
    union select mes, unidade_id from saidas_mes
  ),
  lojas_mes as (
    select k.mes, k.unidade_id,
      coalesce(v.vendas, 0) as vendas,
      coalesce(v.vendido, 0) + coalesce(v.descontos, 0) as bruto,
      coalesce(v.descontos, 0) as descontos,
      coalesce(v.vendido, 0) as vendido,
      coalesce(d.valor, 0) as devolvido,
      coalesce(x.valor, 0) as cancelado,
      coalesce(v.vendido, 0) - coalesce(d.valor, 0) - coalesce(x.valor, 0) as receita_liquida,
      coalesce(cv.custo, 0) as custo_vendido,
      coalesce(cd.custo, 0) as custo_devolvido,
      coalesce(cc.custo, 0) as custo_cancelado,
      coalesce(cv.custo, 0) - coalesce(cd.custo, 0) - coalesce(cc.custo, 0) as cmv,
      coalesce(cv.com_custo, 0) as vendido_com_custo,
      coalesce(cv.sem_custo, 0) as vendido_sem_custo,
      coalesce(cv.itens_sem_custo, 0) as itens_sem_custo,
      coalesce(t.taxas, 0) as taxas,
      coalesce(t.conciliados, 0) as pagamentos_conciliados,
      coalesce(t.a_conciliar, 0) as a_conciliar,
      coalesce(t.a_conciliar_valor, 0) as a_conciliar_valor,
      coalesce(e.valor, 0) as despesas,
      coalesce(e.em_aberto, 0) as despesas_em_aberto,
      coalesce(s.quantidade, 0) as saidas_quantidade,
      coalesce(s.valor, 0) as saidas_caixa
    from chaves k
    left join vendas_mes v on v.mes = k.mes and v.unidade_id = k.unidade_id
    left join devolucoes_mes d on d.mes = k.mes and d.unidade_id = k.unidade_id
    left join canceladas_mes x on x.mes = k.mes and x.unidade_id = k.unidade_id
    left join custos_vendidos cv on cv.mes = k.mes and cv.unidade_id = k.unidade_id
    left join custos_devolvidos cd on cd.mes = k.mes and cd.unidade_id = k.unidade_id
    left join custos_cancelados cc on cc.mes = k.mes and cc.unidade_id = k.unidade_id
    left join taxas_mes t on t.mes = k.mes and t.unidade_id = k.unidade_id
    left join despesas_mes e on e.mes = k.mes and e.unidade_id = k.unidade_id
    left join saidas_mes s on s.mes = k.mes and s.unidade_id = k.unidade_id
  ),
  -- Divisão das despesas da rede pela receita líquida de cada loja no mês, em centavos, fechando exata.
  pesos_mes as (
    select l.mes, sum(greatest(l.receita_liquida, 0)) as total from lojas_mes l group by l.mes
  ),
  partes as (
    select l.mes, l.unidade_id, greatest(l.receita_liquida, 0) as peso, p.total, r.despesas_rede,
      case when p.total > 0 then div(r.despesas_rede::numeric * greatest(l.receita_liquida, 0), p.total) else 0 end as piso,
      case when p.total > 0 then mod(r.despesas_rede::numeric * greatest(l.receita_liquida, 0), p.total) else 0 end as resto
    from lojas_mes l
    join pesos_mes p on p.mes = l.mes
    join rede_mes r on r.mes = l.mes
  ),
  rateio as (
    select q.mes, q.unidade_id, q.peso,
      (q.piso + case when q.total > 0 and q.posicao <= q.sobra then 1 else 0 end)::bigint as rateio
    from (
      select x.*, row_number() over (partition by x.mes order by x.resto desc, x.unidade_id) as posicao,
        x.despesas_rede - sum(x.piso) over (partition by x.mes) as sobra
      from partes x
    ) q
  ),
  lojas as (
    select l.*, a.peso, a.rateio,
      l.receita_liquida - l.cmv as margem_bruta,
      l.receita_liquida - l.cmv - l.taxas - l.despesas - l.saidas_caixa - a.rateio as resultado
    from lojas_mes l
    join rateio a on a.mes = l.mes and a.unidade_id = l.unidade_id
  ),
  -- O escopo pedido, mês a mês (meses sem fato saem com zeros).
  escopo as (
    select m.mes,
      coalesce(sum(l.vendas), 0) as vendas, coalesce(sum(l.bruto), 0) as bruto, coalesce(sum(l.descontos), 0) as descontos,
      coalesce(sum(l.vendido), 0) as vendido, coalesce(sum(l.devolvido), 0) as devolvido, coalesce(sum(l.cancelado), 0) as cancelado,
      coalesce(sum(l.receita_liquida), 0) as receita_liquida,
      coalesce(sum(l.custo_vendido), 0) as custo_vendido, coalesce(sum(l.custo_devolvido), 0) as custo_devolvido,
      coalesce(sum(l.custo_cancelado), 0) as custo_cancelado, coalesce(sum(l.cmv), 0) as cmv,
      coalesce(sum(l.margem_bruta), 0) as margem_bruta,
      coalesce(sum(l.vendido_com_custo), 0) as vendido_com_custo, coalesce(sum(l.vendido_sem_custo), 0) as vendido_sem_custo,
      coalesce(sum(l.itens_sem_custo), 0) as itens_sem_custo,
      coalesce(sum(l.taxas), 0) as taxas, coalesce(sum(l.pagamentos_conciliados), 0) as pagamentos_conciliados,
      coalesce(sum(l.a_conciliar), 0) as a_conciliar, coalesce(sum(l.a_conciliar_valor), 0) as a_conciliar_valor,
      coalesce(sum(l.despesas), 0) as despesas, coalesce(sum(l.despesas_em_aberto), 0) as despesas_em_aberto,
      coalesce(sum(l.saidas_quantidade), 0) as saidas_quantidade, coalesce(sum(l.saidas_caixa), 0) as saidas_caixa,
      coalesce(sum(l.rateio), 0) as rateio, coalesce(sum(l.peso), 0) as peso
    from meses m
    left join lojas l on l.mes = m.mes and (p_unidade is null or l.unidade_id = p_unidade)
    group by m.mes
  ),
  final as (
    select e.*,
      case when p_unidade is null then r.despesas_rede else e.rateio end as rede,
      case when p_unidade is null then r.rede_em_aberto else 0 end as rede_em_aberto,
      case when p_unidade is null then r.despesas_rede - e.rateio else 0 end as nao_dividido,
      coalesce(p.total, 0) as peso_da_rede,
      e.margem_bruta - e.taxas - e.despesas - e.saidas_caixa - case when p_unidade is null then r.despesas_rede else e.rateio end as resultado
    from escopo e
    join rede_mes r on r.mes = e.mes
    left join pesos_mes p on p.mes = e.mes
  )
  select jsonb_build_object(
    'mes', v_mes,
    'hoje', v_hoje,
    'em_andamento', v_mes = v_mes_atual,
    'unidade', p_unidade,
    'linhas', (select to_jsonb(f) - 'mes' - 'rateio' from final f where f.mes = v_mes),
    'meses', (select jsonb_agg(jsonb_build_object('mes', f.mes, 'receita_liquida', f.receita_liquida, 'cmv', f.cmv, 'taxas', f.taxas,
                'despesas', f.despesas, 'saidas_caixa', f.saidas_caixa, 'rede', f.rede, 'resultado', f.resultado) order by f.mes)
              from final f),
    'por_categoria', coalesce((
      select jsonb_agg(jsonb_build_object('categoria', x.categoria_id, 'nome', x.categoria, 'valor', x.valor, 'em_aberto', x.em_aberto)
                       order by x.valor desc, x.categoria)
      from (
        select c.categoria_id, c.categoria, sum(c.valor) as valor, coalesce(sum(c.valor) filter (where c.situacao = 'aberta'), 0) as em_aberto
        from contas c
        where c.mes = v_mes and c.entra and (case when p_unidade is null then true else c.unidade_id = p_unidade end)
        group by 1, 2
      ) x), '[]'::jsonb),
    'fora_do_resultado', coalesce((
      select jsonb_agg(jsonb_build_object('categoria', x.categoria_id, 'nome', x.categoria, 'valor', x.valor) order by x.valor desc, x.categoria)
      from (
        select c.categoria_id, c.categoria, sum(c.valor) as valor
        from contas c
        where c.mes = v_mes and not c.entra and (case when p_unidade is null then true else c.unidade_id = p_unidade end)
        group by 1, 2
      ) x), '[]'::jsonb),
    'por_loja', case when p_unidade is null then coalesce((
      select jsonb_agg(jsonb_build_object('unidade', l.unidade_id, 'nome', u.nome, 'receita_liquida', l.receita_liquida, 'cmv', l.cmv,
                         'margem_bruta', l.margem_bruta, 'taxas', l.taxas, 'despesas', l.despesas, 'saidas_caixa', l.saidas_caixa,
                         'rede', l.rateio, 'resultado', l.resultado)
                       order by l.resultado desc, u.nome, l.unidade_id)
      from lojas l left join public.unidades u on u.id = l.unidade_id
      where l.mes = v_mes), '[]'::jsonb) else '[]'::jsonb end,
    'lojas', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome) order by u.nome, u.id)
      from public.unidades u where u.organizacao_id = v_org and u.status = 'ativa'), '[]'::jsonb)
  ) into resultado;

  return resultado;
end;
$$;

comment on function public.resultado_do_mes(date, uuid, integer) is
  'Resultado do mês (L8b): receita líquida, custo das mercadorias, taxas, despesas pelo vencimento, dinheiro do caixa e despesas da rede divididas pelas vendas; da rede ou de uma loja, com a série dos últimos meses. Só para quem tem, em papel de organização, resultado.ver e as permissões de todas as partes (security invoker). Não é contabilidade.';

