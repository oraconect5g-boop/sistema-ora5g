-- =============================================================================
-- Lote FIN-001b (ORA-FIN-001; a segunda parte da conta do período, a que o cartão do FIN-001a dizia que ainda não fazia): a
-- conferência do que foi DESFEITO no período.
--
-- O FIN-001a confere o que cada venda gravou ao ser concluída. Faltava o outro sentido: quando uma venda é cancelada ou
-- um item é devolvido, o valor tem de ter um destino, o dinheiro que saiu tem de estar no livro do caixa e o que voltou
-- tem de estar no livro do estoque. Esta função faz essa conta, fato a fato, para os cancelamentos de venda CONCLUÍDA e
-- as devoluções com a data no período (cada fato na sua data, como o financeiro_painel):
--
--   * destino do valor: o total da venda cancelada, ou o valor da devolução, tem de fechar com o que foi registrado para
--     devolver: o dinheiro (do caixa; no cancelamento, o que a venda recebeu em dinheiro, com o troco descontado), o
--     estorno por fora (Pix, cartão e financeira: fica a confirmar com o comprovante) e o vale-troca (o vale gerado na
--     devolução, ou o saldo devolvido ao vale que pagou a venda cancelada);
--   * livro do caixa: o dinheiro devolvido tem de estar no livro dos caixas como estorno, ligado à venda (o da devolução,
--     pela chave do próprio lançamento);
--   * livro do estoque: cada unidade devolvida tem a entrada no livro, ligada à devolução; no cancelamento, cada unidade
--     tem um retorno a conferir, e só o retorno recebido tem a entrada no livro, ligada à venda. O que espera a
--     conferência e o que não voltou são contados à parte: não são diferença.
--
-- Cada conferência devolve os dois lados, a diferença, quantas vendas não fecham e até 20 delas, como no FIN-001a.
-- A venda cancelada ainda no rascunho (nunca concluída) não entra: ela não gravou pagamento, caixa nem estoque.
--
-- Quem: o mesmo do FIN-001a (quem vê as vendas da loja ou da rede, só nas lojas em que tem a permissão), pelo mesmo
-- motivo o SECURITY DEFINER com a conferência dentro da função. Só devolve somas, contagens e números de venda.
-- Códigos: 42501 e 22023, como no FIN-001a. Só lê.
--
-- O índice: as duas conferências procuram no livro do estoque pela referência do lançamento (a venda ou a devolução). O
-- livro cresce com cada venda e não tinha índice por ela.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create index if not exists estoque_movimentos_referencia
  on public.estoque_movimentos (referencia_tipo, referencia_id) where referencia_id is not null;

create or replace function public.financeiro_conferencia_do_desfeito(p_inicio timestamptz, p_fim timestamptz, p_unidade uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lojas uuid[];
  resultado jsonb;
begin
  if p_inicio is null or p_fim is null or p_fim <= p_inicio or p_fim - p_inicio > interval '400 days' then
    raise exception 'Período inválido: o fim vem depois do início e o período tem no máximo 400 dias' using errcode = '22023';
  end if;
  select coalesce(array_agg(x.id), '{}') into lojas
  from (select u as id from privado.unidades_com_permissao('venda.ver_unidade') u
        union
        select u from privado.unidades_com_permissao('venda.ver_todas') u) x
  where p_unidade is null or x.id = p_unidade;
  if cardinality(lojas) = 0 then
    raise exception 'A conferência é de quem vê as vendas da loja ou da rede' using errcode = '42501';
  end if;

  with
  -- Os cancelamentos de venda concluída, pela data do cancelamento.
  c as (
    select x.id, x.numero, x.total_centavos as total, coalesce(x.troco_centavos, 0) as troco
    from public.vendas x
    where x.situacao = 'cancelada' and x.concluida_em is not null
      and x.cancelada_em >= p_inicio and x.cancelada_em < p_fim and x.unidade_id = any (lojas)
  ),
  c_pag as (
    -- O dinheiro que a venda recebeu: o pagamento em dinheiro e a entrada em dinheiro lançada dentro da financeira.
    select p.venda_id,
      sum(case when p.meio = 'dinheiro' then p.valor_centavos
               when privado.meio_financeira(p.meio) and p.meio_entrada = 'dinheiro' then p.entrada_centavos else 0 end) as dinheiro
    from public.venda_pagamentos p
    where p.venda_id in (select c.id from c)
    group by p.venda_id
  ),
  c_ext as (
    select e.venda_id, sum(e.valor_centavos) as valor,
      coalesce(sum(e.valor_centavos) filter (where e.situacao = 'pendente'), 0) as pendente
    from public.estornos_externos e
    where e.pagamento_id is not null and e.venda_id in (select c.id from c)
    group by e.venda_id
  ),
  c_vale as (
    select u.venda_id, sum(u.valor_centavos) as devolvido
    from public.vales_troca_usos u
    where u.venda_id in (select c.id from c) and u.devolvido_em is not null
    group by u.venda_id
  ),
  c_cx as (
    select m.venda_id, -sum(m.valor_centavos) as no_livro
    from public.caixa_movimentos m
    where m.tipo = 'estorno' and m.venda_id in (select c.id from c)
    group by m.venda_id
  ),
  c_it as (
    select i.venda_id, sum(i.quantidade) as unidades
    from public.venda_itens i
    where i.venda_id in (select c.id from c) and i.tipo in ('aparelho', 'chip', 'acessorio')
    group by i.venda_id
  ),
  c_ret as (
    select r.venda_id,
      coalesce(sum(r.quantidade) filter (where r.situacao = 'recebido'), 0) as recebidas,
      coalesce(sum(r.quantidade) filter (where r.situacao = 'pendente'), 0) as esperando,
      coalesce(sum(r.quantidade) filter (where r.situacao = 'nao_recebido'), 0) as nao_voltaram
    from public.venda_retornos r
    where r.venda_id in (select c.id from c)
    group by r.venda_id
  ),
  c_mv as (
    select m.referencia_id as venda, sum(m.quantidade) as no_livro
    from public.estoque_movimentos m
    where m.tipo = 'devolucao' and m.referencia_tipo = 'venda' and m.referencia_id in (select c.id::text from c)
    group by m.referencia_id
  ),
  -- As devoluções, pela data da devolução.
  d as (
    select x.id, x.venda_id, v.numero as venda_numero, x.valor_centavos as valor
    from public.venda_devolucoes x
    join public.vendas v on v.id = x.venda_id
    where x.criado_em >= p_inicio and x.criado_em < p_fim and x.unidade_id = any (lojas)
  ),
  d_re as (
    select r.devolucao_id, sum(r.valor_centavos) as dinheiro
    from public.venda_devolucao_reembolsos r
    where r.devolucao_id in (select d.id from d) and r.meio = 'dinheiro'
    group by r.devolucao_id
  ),
  d_ext as (
    select e.devolucao_id, sum(e.valor_centavos) as valor,
      coalesce(sum(e.valor_centavos) filter (where e.situacao = 'pendente'), 0) as pendente
    from public.estornos_externos e
    where e.devolucao_id in (select d.id from d)
    group by e.devolucao_id
  ),
  d_vale as (
    select t.devolucao_id, sum(t.valor_centavos) as valor
    from public.vales_troca t
    where t.devolucao_id in (select d.id from d)
    group by t.devolucao_id
  ),
  d_cx as (
    select d.id as devolucao_id, -sum(m.valor_centavos) as no_livro
    from d
    join public.caixa_movimentos m
      on m.venda_id = d.venda_id and m.tipo = 'estorno' and m.chave_idempotencia = 'devolucao:' || d.id || ':reembolso:dinheiro'
    group by d.id
  ),
  d_it as (
    select di.devolucao_id, sum(di.quantidade) as unidades
    from public.venda_devolucao_itens di
    join public.venda_itens i on i.id = di.venda_item_id
    where di.devolucao_id in (select d.id from d) and i.tipo in ('aparelho', 'chip', 'acessorio')
    group by di.devolucao_id
  ),
  d_mv as (
    select m.referencia_id as devolucao, sum(m.quantidade) as no_livro
    from public.estoque_movimentos m
    where m.tipo = 'devolucao' and m.referencia_tipo = 'devolucao' and m.referencia_id in (select d.id::text from d)
    group by m.referencia_id
  ),
  -- Um fato por linha: o cancelamento ou a devolução, com os dois lados de cada conta.
  fato as (
    select 'cancelamento'::text as tipo, c.id as venda_id, c.numero as venda_numero, c.total as valor,
      coalesce(p.dinheiro, 0) - c.troco as dinheiro,
      coalesce(e.valor, 0) as por_fora, coalesce(e.pendente, 0) as a_confirmar,
      coalesce(vl.devolvido, 0) as vale,
      coalesce(cx.no_livro, 0) as caixa_no_livro,
      coalesce(it.unidades, 0) as unidades,
      coalesce(rt.recebidas, 0) as voltaram, coalesce(rt.esperando, 0) as esperando, coalesce(rt.nao_voltaram, 0) as nao_voltaram,
      coalesce(mv.no_livro, 0) as estoque_no_livro
    from c
    left join c_pag p on p.venda_id = c.id
    left join c_ext e on e.venda_id = c.id
    left join c_vale vl on vl.venda_id = c.id
    left join c_cx cx on cx.venda_id = c.id
    left join c_it it on it.venda_id = c.id
    left join c_ret rt on rt.venda_id = c.id
    left join c_mv mv on mv.venda = c.id::text
    union all
    -- Na devolução, o que volta entra no livro na hora: tudo "voltou", nada espera.
    select 'devolucao', d.venda_id, d.venda_numero, d.valor,
      coalesce(r.dinheiro, 0),
      coalesce(e.valor, 0), coalesce(e.pendente, 0),
      coalesce(vl.valor, 0),
      coalesce(cx.no_livro, 0),
      coalesce(it.unidades, 0),
      coalesce(it.unidades, 0), 0, 0,
      coalesce(mv.no_livro, 0)
    from d
    left join d_re r on r.devolucao_id = d.id
    left join d_ext e on e.devolucao_id = d.id
    left join d_vale vl on vl.devolucao_id = d.id
    left join d_cx cx on cx.devolucao_id = d.id
    left join d_it it on it.devolucao_id = d.id
    left join d_mv mv on mv.devolucao = d.id::text
  ),
  linha as (
    select f.*,
      f.dinheiro + f.por_fora + f.vale - f.valor as dif_destino,
      f.caixa_no_livro - f.dinheiro as dif_caixa,
      -- Cada unidade desfeita tem um retorno (recebido, esperando ou não voltou), e só o recebido está no livro.
      f.voltaram + f.esperando + f.nao_voltaram - f.unidades as dif_retornos,
      f.estoque_no_livro - f.voltaram as dif_estoque
    from fato f
  )
  select jsonb_build_object(
    'cancelamentos', count(*) filter (where l.tipo = 'cancelamento'),
    'cancelado', coalesce(sum(l.valor) filter (where l.tipo = 'cancelamento'), 0),
    'devolucoes', count(*) filter (where l.tipo = 'devolucao'),
    'devolvido', coalesce(sum(l.valor) filter (where l.tipo = 'devolucao'), 0),
    'destino', jsonb_build_object(
      'em_dinheiro', coalesce(sum(l.dinheiro), 0),
      'por_fora', coalesce(sum(l.por_fora), 0),
      'a_confirmar', coalesce(sum(l.a_confirmar), 0),
      'vale_troca', coalesce(sum(l.vale), 0),
      'diferenca', coalesce(sum(l.dif_destino), 0),
      'vendas_com_diferenca', count(distinct l.venda_id) filter (where l.dif_destino <> 0),
      'exemplos', coalesce((select jsonb_agg(jsonb_build_object('id', e.venda_id, 'numero', e.venda_numero) order by e.venda_numero)
                            from (select distinct x.venda_id, x.venda_numero from linha x where x.dif_destino <> 0 order by x.venda_numero limit 20) e), '[]'::jsonb)),
    'caixa', jsonb_build_object(
      'esperado', coalesce(sum(l.dinheiro), 0),
      'no_livro', coalesce(sum(l.caixa_no_livro), 0),
      'diferenca', coalesce(sum(l.dif_caixa), 0),
      'vendas_com_diferenca', count(distinct l.venda_id) filter (where l.dif_caixa <> 0),
      'exemplos', coalesce((select jsonb_agg(jsonb_build_object('id', e.venda_id, 'numero', e.venda_numero) order by e.venda_numero)
                            from (select distinct x.venda_id, x.venda_numero from linha x where x.dif_caixa <> 0 order by x.venda_numero limit 20) e), '[]'::jsonb)),
    'estoque', jsonb_build_object(
      'unidades', coalesce(sum(l.unidades), 0),
      'voltaram', coalesce(sum(l.voltaram), 0),
      'esperando', coalesce(sum(l.esperando), 0),
      'nao_voltaram', coalesce(sum(l.nao_voltaram), 0),
      'no_livro', coalesce(sum(l.estoque_no_livro), 0),
      'diferenca', coalesce(sum(l.dif_estoque), 0),
      'vendas_com_diferenca', count(distinct l.venda_id) filter (where l.dif_estoque <> 0 or l.dif_retornos <> 0),
      'exemplos', coalesce((select jsonb_agg(jsonb_build_object('id', e.venda_id, 'numero', e.venda_numero) order by e.venda_numero)
                            from (select distinct x.venda_id, x.venda_numero from linha x where x.dif_estoque <> 0 or x.dif_retornos <> 0 order by x.venda_numero limit 20) e), '[]'::jsonb))
  ) into resultado
  from linha l;

  return resultado;
end;
$$;

comment on function public.financeiro_conferencia_do_desfeito(timestamptz, timestamptz, uuid) is
  'FIN-001b: a conferência do que foi desfeito no período (cancelamentos de venda concluída e devoluções), fato a fato: o valor tem destino (dinheiro, estorno por fora ou vale-troca), o dinheiro devolvido está no livro do caixa e o que voltou está no livro do estoque. Para quem vê as vendas da loja ou da rede, só nas lojas em que tem essa permissão. Só lê.';

revoke all on function public.financeiro_conferencia_do_desfeito(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.financeiro_conferencia_do_desfeito(timestamptz, timestamptz, uuid) to authenticated;
