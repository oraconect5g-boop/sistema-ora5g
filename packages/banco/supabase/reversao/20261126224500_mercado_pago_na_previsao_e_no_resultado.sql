-- Reversão de 20261126224500_mercado_pago_na_previsao_e_no_resultado: a previsão e o resultado voltam ao texto anterior,
-- inteiro (20261126223000_repasses_parciais_das_financeiras), sem o Pix e o cartão Mercado Pago na lista dos conciliáveis.

create or replace function public.previsao_de_caixa(p_semanas integer default 8, p_unidade uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_org uuid := (select u.organizacao_id from public.unidades u where u.id = (select public.unidade_atual()));
  v_base date;
  v_inicio timestamptz;
  v_fim timestamptz;
  resultado jsonb;
begin
  -- Todas as partes, em papel de organização: sem uma delas, a regra de leitura esconderia parte dos fatos.
  if v_org is null or exists (
    -- FIN-007b: o prazo de repasse das financeiras só é lido por quem concilia; sem essa permissão a regra de leitura
    -- esconderia os prazos, e toda conta a receber apareceria sem data.
    select 1 from unnest(array['previsao.ver', 'venda.ver_todas', 'conta_pagar.gerir', 'caixa.conferir', 'pagamento.conciliar']) as p (codigo)
    where v_org not in (select privado.organizacoes_com_permissao(p.codigo))
  ) then
    raise exception 'Sem permissão para ver a previsão de caixa' using errcode = '42501';
  end if;
  if p_unidade is not null and not exists (select 1 from public.unidades u where u.id = p_unidade and u.organizacao_id = v_org) then
    raise exception 'Sem permissão para ver a previsão desta loja' using errcode = '42501';
  end if;
  if p_semanas is null or p_semanas not between 1 and 13 then
    raise exception 'Horizonte inválido: de 1 a 13 semanas' using errcode = '22023';
  end if;
  v_base := v_hoje - 56;
  v_inicio := v_base::timestamp at time zone 'America/Sao_Paulo';
  v_fim := v_hoje::timestamp at time zone 'America/Sao_Paulo';

  with
  semanas as (
    select g.i, v_hoje + 7 * g.i as inicio, v_hoje + 7 * g.i + 6 as fim from generate_series(0, p_semanas - 1) as g (i)
  ),
  abertas as (
    select c.vencimento, c.valor_centavos as valor
    from public.contas_a_pagar c
    where c.organizacao_id = v_org and c.situacao = 'aberta'
      and (p_unidade is null or c.unidade_id = p_unidade)
      and c.vencimento < v_hoje + 7 * p_semanas
  ),
  -- FIN-007b: as contas a receber das financeiras em aberto, com o vencimento pelo prazo de repasse em vigor (o dia da
  -- venda, em São Paulo, mais o prazo; sem prazo gravado, sem data), como em public.repasses_atrasados.
  a_receber as (
    select c.valor_centavos - c.parcial_centavos as valor,
      (v.concluida_em at time zone 'America/Sao_Paulo')::date + (
        select p.dias from public.prazos_de_repasse p
        where p.organizacao_id = c.organizacao_id and p.devedor = c.devedor
        order by p.criado_em desc, p.id desc limit 1) as vencimento
    from public.contas_a_receber c
    join public.vendas v on v.id = c.venda_id
    where c.organizacao_id = v_org and (p_unidade is null or c.unidade_id = p_unidade) and c.situacao = 'aberta'
  ),
  base as (
    select g.k, v_base + 7 * g.k as inicio, v_base + 7 * g.k + 6 as fim from generate_series(0, 7) as g (k)
  ),
  -- O recebido na loja (P1), pela data do registro do pagamento.
  recebimentos as (
    select (p.criado_em at time zone 'America/Sao_Paulo')::date as dia,
      case
        -- Financeiras (a mesma lista de privado.meio_financeira, que o teste confere): só a entrada.
        when p.meio in ('payjoy', 'aiva') then p.entrada_centavos
        when p.meio = 'vale_troca' then 0
        -- O troco sai do primeiro pagamento em dinheiro da venda, como no financeiro.
        when p.meio = 'dinheiro' and p.ordem = (
          select min(p2.ordem) from public.venda_pagamentos p2 where p2.venda_id = p.venda_id and p2.meio = 'dinheiro'
        ) then p.valor_centavos - coalesce(v.troco_centavos, 0)
        else p.valor_centavos
      end as valor
    from public.venda_pagamentos p
    join public.vendas v on v.id = p.venda_id
    where v.organizacao_id = v_org and (p_unidade is null or v.unidade_id = p_unidade)
      -- O pagamento de venda cancelada depois continua recebido na semana em que entrou (o dinheiro entrou);
      -- a devolução dele sai em "devolvido" quando o dinheiro sai (#82).
      and p.situacao in ('confirmado', 'estorno_pendente', 'estornado') and p.criado_em >= v_inicio and p.criado_em < v_fim
  ),
  -- Devolvido (#82, REV-PLAN-001): só o dinheiro que saiu, na data em que saiu. Dinheiro: o estorno lançado no
  -- caixa (devolução ou cancelamento). Pix e cartão: o estorno externo confirmado com o comprovante, na data da
  -- confirmação; o pedido de estorno ainda pendente não sai (fica em estornos_a_confirmar). Financeira (a mesma
  -- lista de privado.meio_financeira, que o teste confere): o contrato se cancela na financeira, sem sair dinheiro
  -- da loja; a entrada paga em Pix ou cartão volta pelo meio dela. Vale-troca é crédito, não dinheiro.
  reembolsos as (
    select (m.ocorrido_em at time zone 'America/Sao_Paulo')::date as dia, -m.valor_centavos as valor
    from public.caixa_movimentos m
    join public.caixas c on c.id = m.caixa_id
    where m.organizacao_id = v_org and (p_unidade is null or c.unidade_id = p_unidade)
      and m.tipo = 'estorno' and m.meio = 'dinheiro' and m.ocorrido_em >= v_inicio and m.ocorrido_em < v_fim
    union all
    select (e.confirmado_em at time zone 'America/Sao_Paulo')::date, e.valor_centavos
    from public.estornos_externos e
    where e.organizacao_id = v_org and (p_unidade is null or e.unidade_id = p_unidade)
      and e.situacao = 'confirmado' and e.meio not in ('payjoy', 'aiva')
      and e.confirmado_em >= v_inicio and e.confirmado_em < v_fim
  ),
  saidas as (
    select (s.decidida_em at time zone 'America/Sao_Paulo')::date as dia, s.valor_centavos as valor
    from public.caixa_saidas s
    where s.organizacao_id = v_org and (p_unidade is null or s.unidade_id = p_unidade)
      and s.situacao = 'autorizada' and s.decidida_em >= v_inicio and s.decidida_em < v_fim
  )
  select jsonb_build_object(
    'hoje', v_hoje,
    'unidade', p_unidade,
    'semanas', (
      select jsonb_agg(jsonb_build_object('inicio', s.inicio, 'fim', s.fim,
               'contas', coalesce((select sum(a.valor) from abertas a where a.vencimento between s.inicio and s.fim), 0),
               'quantidade', (select count(*) from abertas a where a.vencimento between s.inicio and s.fim),
               -- FIN-007b: o que as financeiras devem e vence na semana, pelo prazo de repasse.
               'financeiras', coalesce((select sum(x.valor) from a_receber x where x.vencimento between s.inicio and s.fim), 0),
               'financeiras_quantidade', (select count(*) from a_receber x where x.vencimento between s.inicio and s.fim)) order by s.i)
      from semanas s),
    'vencidas', (select jsonb_build_object('valor', coalesce(sum(a.valor), 0), 'quantidade', count(*)) from abertas a where a.vencimento < v_hoje),
    'base', (
      select jsonb_agg(jsonb_build_object('inicio', b.inicio, 'fim', b.fim,
               'recebido', coalesce((select sum(x.valor) from recebimentos x where x.dia between b.inicio and b.fim), 0),
               'devolvido', coalesce((select sum(x.valor) from reembolsos x where x.dia between b.inicio and b.fim), 0),
               'saidas_caixa', coalesce((select sum(x.valor) from saidas x where x.dia between b.inicio and b.fim), 0)) order by b.k)
      from base b),
    -- Pedidos de estorno de Pix e cartão ainda sem comprovante: devem sair, mas ainda não saíram (#82).
    'estornos_a_confirmar', (
      select jsonb_build_object('valor', coalesce(sum(e.valor_centavos), 0), 'quantidade', count(*))
      from public.estornos_externos e
      where e.organizacao_id = v_org and (p_unidade is null or e.unidade_id = p_unidade)
        and e.situacao = 'pendente' and e.meio not in ('payjoy', 'aiva')),
    -- FIN-007b: o total em aberto, como antes, e as quatro partes dele: o que já passou do prazo, o que vence dentro
    -- das semanas pedidas, o que vence depois delas e o que não tem prazo gravado (sem data).
    'financeiras', (
      select jsonb_build_object('valor', coalesce(sum(x.valor), 0), 'quantidade', count(*),
        'atrasadas', jsonb_build_object('valor', coalesce(sum(x.valor) filter (where x.vencimento < v_hoje), 0),
                                        'quantidade', count(*) filter (where x.vencimento < v_hoje)),
        'no_periodo', jsonb_build_object('valor', coalesce(sum(x.valor) filter (where x.vencimento >= v_hoje and x.vencimento < v_hoje + 7 * p_semanas), 0),
                                         'quantidade', count(*) filter (where x.vencimento >= v_hoje and x.vencimento < v_hoje + 7 * p_semanas)),
        'depois', jsonb_build_object('valor', coalesce(sum(x.valor) filter (where x.vencimento >= v_hoje + 7 * p_semanas), 0),
                                     'quantidade', count(*) filter (where x.vencimento >= v_hoje + 7 * p_semanas)),
        'sem_prazo', jsonb_build_object('valor', coalesce(sum(x.valor) filter (where x.vencimento is null), 0),
                                        'quantidade', count(*) filter (where x.vencimento is null)))
      from a_receber x),
    'a_conciliar', (
      select jsonb_build_object('valor', coalesce(sum(p.valor_centavos), 0), 'quantidade', count(*))
      from public.venda_pagamentos p
      join public.vendas v on v.id = p.venda_id
      -- Os meios que se conciliam com o extrato: a mesma lista de privado.meio_liquidavel (que o teste confere).
      where v.organizacao_id = v_org and (p_unidade is null or v.unidade_id = p_unidade)
        and p.situacao = 'confirmado' and p.conciliado_em is null
        and p.meio in ('pix_direto', 'pix_picpay', 'cartao_picpay', 'cartao_pagseguro')
        and p.criado_em >= (v_hoje - 60)::timestamp at time zone 'America/Sao_Paulo'),
    'gavetas', (
      select jsonb_build_object('valor', coalesce(sum(m.valor_centavos), 0), 'caixas', count(distinct c.id))
      from public.caixas c
      left join public.caixa_movimentos m on m.caixa_id = c.id and m.meio = 'dinheiro'
      where c.organizacao_id = v_org and (p_unidade is null or c.unidade_id = p_unidade) and c.situacao = 'aberto'),
    'lojas', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome) order by u.nome, u.id)
      from public.unidades u where u.organizacao_id = v_org and u.status = 'ativa'), '[]'::jsonb)
  ) into resultado;

  return resultado;
end;
$$;

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
  -- FIN-002a: a taxa das financeiras (PayJoy, Aiva) observada no repasse: o valor financiado menos o que a financeira
  -- repassou, nas contas com o repasse registrado, no mês da venda (como a de cartão e Pix). A conta ainda sem repasse é
  -- contada à parte (a taxa dela ainda não se conhece). A venda cancelada sai, como no cartão e no Pix: o pagamento
  -- dela não está mais "confirmado", e o acerto com a financeira fica no estorno.
  financeiras_mes as (
    select c.mes, c.unidade_id,
      coalesce(sum(r.valor_centavos - r.valor_recebido_centavos) filter (where r.situacao = 'recebida'), 0) as taxas_financeiras,
      count(*) filter (where r.situacao = 'recebida') as recebidas,
      count(*) filter (where r.situacao = 'aberta') as a_receber,
      coalesce(sum(r.valor_centavos - r.parcial_centavos) filter (where r.situacao = 'aberta'), 0) as a_receber_valor
    from concluidas c
    join public.contas_a_receber r on r.venda_id = c.id
    join public.venda_pagamentos p on p.id = r.pagamento_id
    where p.situacao = 'confirmado' and r.situacao in ('aberta', 'recebida')
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
      -- As taxas do mês: as de cartão e Pix (na conciliação) e as das financeiras (no repasse).
      coalesce(t.taxas, 0) + coalesce(f.taxas_financeiras, 0) as taxas,
      coalesce(t.taxas, 0) as taxas_cartao_pix,
      coalesce(f.taxas_financeiras, 0) as taxas_financeiras,
      coalesce(f.recebidas, 0) as financeiras_recebidas,
      coalesce(f.a_receber, 0) as financeiras_a_receber,
      coalesce(f.a_receber_valor, 0) as financeiras_a_receber_valor,
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
    left join financeiras_mes f on f.mes = k.mes and f.unidade_id = k.unidade_id
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
      coalesce(sum(l.taxas), 0) as taxas, coalesce(sum(l.taxas_cartao_pix), 0) as taxas_cartao_pix,
      coalesce(sum(l.taxas_financeiras), 0) as taxas_financeiras, coalesce(sum(l.financeiras_recebidas), 0) as financeiras_recebidas,
      coalesce(sum(l.financeiras_a_receber), 0) as financeiras_a_receber,
      coalesce(sum(l.financeiras_a_receber_valor), 0) as financeiras_a_receber_valor,
      coalesce(sum(l.pagamentos_conciliados), 0) as pagamentos_conciliados,
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
                         'margem_bruta', l.margem_bruta, 'taxas', l.taxas, 'taxas_cartao_pix', l.taxas_cartao_pix,
                         'taxas_financeiras', l.taxas_financeiras, 'despesas', l.despesas, 'saidas_caixa', l.saidas_caixa,
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
