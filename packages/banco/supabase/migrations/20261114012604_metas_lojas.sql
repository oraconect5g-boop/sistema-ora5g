-- =============================================================================
-- Metas das lojas no mês (lote G4c: linhas 2, 6 e 8 da matriz; X1 e X2)
--
-- public.metas_lojas(p_mes, p_unidade): para cada loja que vende em que quem chama lê as vendas
-- (venda.ver_unidade ou venda.ver_todas) e acompanha as metas (metas.gerir ou metas.ver_unidade), as
-- metas vigentes da loja inteira no mês e o realizado da loja, pela regra de contagem 1 de
-- public.metas_painel (G4b; os mesmos fatos, a mesma data). Sem p_unidade, todas essas lojas (a rede
-- de quem chama); com ela, só essa loja. Loja sem meta vem com "metas" vazio: meta não definida não
-- é zero. Serve ao Início (a meta do mês da loja ou da rede) e aos Relatórios (a meta do dia).
-- SECURITY INVOKER e STABLE, como os outros painéis: valem as regras de leitura (RLS) de quem chama.
-- Não cria tabela, coluna, política, permissão nem índice; não muda dado.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function public.metas_lojas(p_mes date, p_unidade uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_inicio timestamptz;
  v_fim timestamptz;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dias int;
  v_decorridos int;
  resultado jsonb;
begin
  if p_mes is null then
    raise exception 'Informe o mês' using errcode = '22023';
  end if;
  v_inicio := v_mes::timestamp at time zone 'America/Sao_Paulo';
  v_fim := (v_mes + interval '1 month')::timestamp at time zone 'America/Sao_Paulo';
  v_dias := extract(day from (v_mes + interval '1 month' - interval '1 day'))::int;
  v_decorridos := case when v_hoje < v_mes then 0 when v_hoje >= (v_mes + interval '1 month')::date then v_dias else extract(day from v_hoje)::int end;

  with
  -- tem_permissao já separa papel de organização (qualquer loja dela) de papel de loja (só a do turno).
  lojas as (
    select u.id from public.unidades u
    where u.tipo in ('loja_fisica', 'online') and (p_unidade is null or u.id = p_unidade)
      and (public.tem_permissao('venda.ver_unidade', u.id) or public.tem_permissao('venda.ver_todas', u.id))
      and (public.tem_permissao('metas.gerir', u.id) or public.tem_permissao('metas.ver_unidade', u.id))
  ),
  -- A versão mais recente da meta da loja inteira; a retirada (valor nulo) é "meta não definida".
  vigentes as (
    select x.unidade_id, x.medida, x.valor from (
      select distinct on (m.unidade_id, m.medida) m.unidade_id, m.medida, m.valor
      from public.metas m
      where m.mes = v_mes and m.vendedor_id is null and m.unidade_id in (select l.id from lojas l)
      order by m.unidade_id, m.medida, m.versao desc
    ) x
    where x.valor is not null
  ),
  concluidas as (
    select v.id, v.unidade_id, v.total_centavos from public.vendas v
    where v.unidade_id in (select l.id from lojas l) and v.concluida_em >= v_inicio and v.concluida_em < v_fim
  ),
  canceladas as (
    select v.id, v.unidade_id, v.total_centavos from public.vendas v
    where v.unidade_id in (select l.id from lojas l) and v.situacao = 'cancelada' and v.concluida_em is not null
      and v.cancelada_em >= v_inicio and v.cancelada_em < v_fim
  ),
  devolucoes as (
    select d.id, v.unidade_id, d.valor_centavos from public.venda_devolucoes d
    join public.vendas v on v.id = d.venda_id
    where v.unidade_id in (select l.id from lojas l) and d.criado_em >= v_inicio and d.criado_em < v_fim
  ),
  fatos as (
    select c.unidade_id, c.total_centavos as liquido, 0::bigint as aparelhos, 0::bigint as acessorios from concluidas c
    union all select c.unidade_id, -c.total_centavos, 0, 0 from canceladas c
    union all select d.unidade_id, -d.valor_centavos, 0, 0 from devolucoes d
    union all
    select c.unidade_id, 0, case when i.tipo = 'aparelho' then i.quantidade else 0 end,
      case when i.tipo = 'acessorio' then i.preco_unitario_centavos * i.quantidade - i.desconto_centavos else 0 end
    from concluidas c join public.venda_itens i on i.venda_id = c.id where i.tipo in ('aparelho', 'acessorio')
    union all
    select c.unidade_id, 0, case when i.tipo = 'aparelho' then -i.quantidade else 0 end,
      case when i.tipo = 'acessorio' then -(i.preco_unitario_centavos * i.quantidade - i.desconto_centavos) else 0 end
    from canceladas c join public.venda_itens i on i.venda_id = c.id where i.tipo in ('aparelho', 'acessorio')
    union all
    select d.unidade_id, 0, case when i.tipo = 'aparelho' then -di.quantidade else 0 end, case when i.tipo = 'acessorio' then -di.valor_centavos else 0 end
    from devolucoes d
    join public.venda_devolucao_itens di on di.devolucao_id = d.id
    join public.venda_itens i on i.id = di.venda_item_id
    where i.tipo in ('aparelho', 'acessorio')
  ),
  por_loja as (
    select f.unidade_id, sum(f.liquido) as vendido_liquido, sum(f.aparelhos) as aparelhos, sum(f.acessorios) as acessorios
    from fatos f group by 1
  ),
  connect as (
    select p.unidade_id, count(*) as quantidade from public.connect_producao p
    where p.unidade_id in (select l.id from lojas l) and p.confirmado_em >= v_inicio and p.confirmado_em < v_fim
    group by 1
  )
  select jsonb_build_object(
    'mes', to_char(v_mes, 'YYYY-MM-DD'), 'dias_no_mes', v_dias, 'dias_decorridos', v_decorridos, 'regra_contagem', 1,
    'lojas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'unidade_id', l.id,
        'metas', coalesce((select jsonb_object_agg(g.medida, g.valor) from vigentes g where g.unidade_id = l.id), '{}'::jsonb),
        'realizado', jsonb_build_object(
          'vendido_liquido', coalesce(p.vendido_liquido, 0), 'aparelhos', coalesce(p.aparelhos, 0),
          'connect', coalesce(c.quantidade, 0), 'acessorios', coalesce(p.acessorios, 0))
      ) order by l.id)
      from lojas l
      left join por_loja p on p.unidade_id = l.id
      left join connect c on c.unidade_id = l.id), '[]'::jsonb)
  ) into resultado;

  return resultado;
end;
$$;
comment on function public.metas_lojas(date, uuid) is
  'Metas (G4c): metas vigentes da loja inteira no mês e o realizado de cada loja (regra de contagem 1), só das lojas em que quem chama lê as vendas e acompanha as metas (security invoker).';
revoke all on function public.metas_lojas(date, uuid) from public, anon;
grant execute on function public.metas_lojas(date, uuid) to authenticated;
