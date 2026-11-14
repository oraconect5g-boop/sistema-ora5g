-- Reversão de 20261114131916_previsao_correcoes (só em banco sem dados reais).
-- Volta o texto de previsao_de_caixa do L8c (20261114013159_previsao_de_caixa): devolvido de novo pela data da devolução,
-- com o estorno ainda pendente, e sem estornos_a_confirmar.
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
    select 1 from unnest(array['previsao.ver', 'venda.ver_todas', 'conta_pagar.gerir', 'caixa.conferir']) as p (codigo)
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
      and p.situacao = 'confirmado' and p.criado_em >= v_inicio and p.criado_em < v_fim
  ),
  reembolsos as (
    select (d.criado_em at time zone 'America/Sao_Paulo')::date as dia, r.valor_centavos as valor
    from public.venda_devolucao_reembolsos r
    join public.venda_devolucoes d on d.id = r.devolucao_id
    join public.vendas v on v.id = d.venda_id
    where v.organizacao_id = v_org and (p_unidade is null or v.unidade_id = p_unidade)
      and r.meio <> 'vale_troca' and d.criado_em >= v_inicio and d.criado_em < v_fim
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
               'quantidade', (select count(*) from abertas a where a.vencimento between s.inicio and s.fim)) order by s.i)
      from semanas s),
    'vencidas', (select jsonb_build_object('valor', coalesce(sum(a.valor), 0), 'quantidade', count(*)) from abertas a where a.vencimento < v_hoje),
    'base', (
      select jsonb_agg(jsonb_build_object('inicio', b.inicio, 'fim', b.fim,
               'recebido', coalesce((select sum(x.valor) from recebimentos x where x.dia between b.inicio and b.fim), 0),
               'devolvido', coalesce((select sum(x.valor) from reembolsos x where x.dia between b.inicio and b.fim), 0),
               'saidas_caixa', coalesce((select sum(x.valor) from saidas x where x.dia between b.inicio and b.fim), 0)) order by b.k)
      from base b),
    'financeiras', (
      select jsonb_build_object('valor', coalesce(sum(c.valor_centavos), 0), 'quantidade', count(*))
      from public.contas_a_receber c
      where c.organizacao_id = v_org and (p_unidade is null or c.unidade_id = p_unidade) and c.situacao = 'aberta'),
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

comment on function public.previsao_de_caixa(integer, uuid) is
  'Previsão de caixa (L8c): os fatos das próximas semanas (contas a pagar em aberto por vencimento, as vencidas) e das 8 semanas anteriores (recebido, devolvido e saídas do caixa), o que as financeiras devem, cartão e Pix a conciliar e o dinheiro nas gavetas; da rede ou de uma loja. Só para quem tem, em papel de organização, previsao.ver e as permissões de todas as partes (security invoker). A estimativa e o saldo são contas da tela.';
