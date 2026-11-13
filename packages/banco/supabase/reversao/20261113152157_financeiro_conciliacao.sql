-- Reversão de 20261113152157_financeiro_conciliacao: recria public.financeiro_painel com o texto aplicado em
-- 20261110224537_financeiro_painel (sem os números da conciliação). A função só lê: desfazer não perde
-- nenhum registro.
create or replace function public.financeiro_painel(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_unidade uuid default null,
  p_por_hora boolean default false
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
  escopo as (
    select v.id, v.situacao, v.total_centavos, v.troco_centavos, v.concluida_em, v.cancelada_em
    from public.vendas v
    where p_unidade is null or v.unidade_id = p_unidade
  ),
  fatos as (
    select e.concluida_em as quando, 'concluida' as tipo, e.total_centavos as valor
    from escopo e
    where e.concluida_em >= p_inicio and e.concluida_em < p_fim
    union all
    select e.cancelada_em, 'cancelada', e.total_centavos
    from escopo e
    where e.situacao = 'cancelada' and e.concluida_em is not null and e.cancelada_em >= p_inicio and e.cancelada_em < p_fim
    union all
    select d.criado_em, 'devolucao', d.valor_centavos
    from public.venda_devolucoes d
    where d.venda_id in (select e.id from escopo e) and d.criado_em >= p_inicio and d.criado_em < p_fim
  ),
  periodos as (
    select
      to_char(date_trunc(case when p_por_hora then 'hour' else 'day' end, f.quando at time zone 'America/Sao_Paulo'),
              case when p_por_hora then 'YYYY-MM-DD"T"HH24' else 'YYYY-MM-DD' end) as periodo,
      count(*) filter (where f.tipo = 'concluida') as vendas,
      coalesce(sum(f.valor) filter (where f.tipo = 'concluida'), 0) as vendido,
      count(*) filter (where f.tipo = 'cancelada') as cancelamentos,
      coalesce(sum(f.valor) filter (where f.tipo = 'cancelada'), 0) as cancelado,
      count(*) filter (where f.tipo = 'devolucao') as devolucoes,
      coalesce(sum(f.valor) filter (where f.tipo = 'devolucao'), 0) as devolvido
    from fatos f
    group by 1
  ),
  pagamentos as (
    select p.meio, p.situacao, p.meio_entrada, p.valor_centavos, p.entrada_centavos,
      case when p.meio = 'dinheiro' and p.ordem = (
        select min(p2.ordem) from public.venda_pagamentos p2 where p2.venda_id = p.venda_id and p2.meio = 'dinheiro'
      ) then coalesce(e.troco_centavos, 0) else 0 end as troco
    from public.venda_pagamentos p
    join escopo e on e.id = p.venda_id
    where p.criado_em >= p_inicio and p.criado_em < p_fim
  ),
  pagamentos_por_meio as (
    select meio, situacao, meio_entrada, count(*) as quantidade,
      sum(valor_centavos) as valor, sum(entrada_centavos) as entrada, sum(troco) as troco
    from pagamentos
    group by 1, 2, 3
  ),
  reembolsos as (
    select r.meio, count(*) as quantidade, sum(r.valor_centavos) as valor
    from public.venda_devolucao_reembolsos r
    join public.venda_devolucoes d on d.id = r.devolucao_id
    where d.venda_id in (select e.id from escopo e) and d.criado_em >= p_inicio and d.criado_em < p_fim
    group by 1
  ),
  estornos as (
    select x.situacao, count(*) as quantidade, sum(x.valor_centavos) as valor
    from public.estornos_externos x
    where x.venda_id in (select e.id from escopo e) and x.solicitado_em >= p_inicio and x.solicitado_em < p_fim
    group by 1
  ),
  a_receber as (
    select c.devedor, c.situacao, count(*) as quantidade, sum(c.valor_centavos) as valor
    from public.contas_a_receber c
    where c.venda_id in (select e.id from escopo e) and c.criado_em >= p_inicio and c.criado_em < p_fim
    group by 1, 2
  ),
  caixas_escopo as (
    select c.id, c.situacao, c.fechado_em, c.diferenca_centavos
    from public.caixas c
    where p_unidade is null or c.unidade_id = p_unidade
  ),
  movimentos as (
    select
      to_char(date_trunc(case when p_por_hora then 'hour' else 'day' end, m.ocorrido_em at time zone 'America/Sao_Paulo'),
              case when p_por_hora then 'YYYY-MM-DD"T"HH24' else 'YYYY-MM-DD' end) as periodo,
      m.tipo, m.meio, count(*) as quantidade, sum(m.valor_centavos) as valor
    from public.caixa_movimentos m
    where m.caixa_id in (select c.id from caixas_escopo c) and m.ocorrido_em >= p_inicio and m.ocorrido_em < p_fim
    group by 1, 2, 3
  )
  select jsonb_build_object(
    'periodos', coalesce((select jsonb_agg(to_jsonb(x) order by x.periodo) from periodos x), '[]'::jsonb),
    'pagamentos', coalesce((select jsonb_agg(to_jsonb(x) order by x.meio, x.situacao, x.meio_entrada) from pagamentos_por_meio x), '[]'::jsonb),
    'reembolsos', coalesce((select jsonb_agg(to_jsonb(x) order by x.meio) from reembolsos x), '[]'::jsonb),
    'estornos', coalesce((select jsonb_agg(to_jsonb(x) order by x.situacao) from estornos x), '[]'::jsonb),
    'a_receber', coalesce((select jsonb_agg(to_jsonb(x) order by x.devedor, x.situacao) from a_receber x), '[]'::jsonb),
    'movimentos', coalesce((select jsonb_agg(to_jsonb(x) order by x.periodo, x.tipo, x.meio) from movimentos x), '[]'::jsonb),
    'caixas', (
      select jsonb_build_object(
        'abertos_agora', count(*) filter (where c.situacao = 'aberto'),
        'fechados', count(*) filter (where c.fechado_em >= p_inicio and c.fechado_em < p_fim),
        'conferidos', count(*) filter (where c.situacao = 'conferido' and c.fechado_em >= p_inicio and c.fechado_em < p_fim),
        'com_diferenca', count(*) filter (where c.fechado_em >= p_inicio and c.fechado_em < p_fim and c.diferenca_centavos <> 0),
        'diferenca', coalesce(sum(c.diferenca_centavos) filter (where c.fechado_em >= p_inicio and c.fechado_em < p_fim), 0),
        'diferenca_absoluta', coalesce(sum(abs(c.diferenca_centavos)) filter (where c.fechado_em >= p_inicio and c.fechado_em < p_fim), 0))
      from caixas_escopo c)
  ) into resultado;

  return resultado;
end;
$$;

comment on function public.financeiro_painel(timestamptz, timestamptz, uuid, boolean) is
  'Financeiro real (#65): soma do período inteiro com as regras de leitura de quem chama (security invoker).';

revoke all on function public.financeiro_painel(timestamptz, timestamptz, uuid, boolean) from public, anon;
grant execute on function public.financeiro_painel(timestamptz, timestamptz, uuid, boolean) to authenticated;
