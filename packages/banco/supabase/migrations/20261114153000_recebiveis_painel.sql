-- =============================================================================
-- Recebíveis por loja e adquirente (lote L8e: ORA-FIN-005)
--
-- O que as maquininhas (PicPay e PagBank), o Pix direto na conta da loja e as financeiras (PayJoy e Aiva) ainda
-- devem a cada loja e o que caiu na conta nos últimos dias, num lugar só, para o financeiro ver a rede inteira:
--   * a receber: cartão e Pix confirmados e ainda não conciliados com o extrato (lote L7a) e as contas abertas das
--     financeiras (lote L7b), com a idade contada desde a venda (até 7 dias, de 8 a 30, mais de 30). Sem contrato
--     verificado das maquininhas e das financeiras (E2/E3), não há prazo nem data prevista: só a idade;
--   * recebido na janela (7 a 90 dias): o bruto, o líquido que caiu na conta e a diferença observada no extrato
--     (taxa, antecipação e o que mais o extrato descontou; não é a taxa do contrato);
--   * pendências: estorno de cartão ou Pix a confirmar; pagamento de maquininha sem a maquininha informada (a
--     conciliação não sabe de qual terminal veio); entrada de financiamento paga na maquininha ou por Pix (ela
--     entra na conta, mas ainda não se concilia); repasse de financeira de venda que foi cancelada (acerto com a
--     financeira); e os 20 a receber mais antigos, com o total contado no banco.
-- public.recebiveis_painel(p_unidade, p_dias) só lê. Lojas: as que quem chama concilia (pagamento.conciliar: o dono,
-- a rede inteira; o gerente, a loja do turno), ou uma delas; outra loja é recusada (42501), sem resposta parcial.
-- SECURITY DEFINER porque usa as regras privadas dos meios (as mesmas da conciliação); o filtro de lojas é o de
-- privado.unidades_com_permissao, o mesmo do painel do estoque.
-- Sem tabela, coluna, política, permissão ou índice novos. Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function public.recebiveis_painel(p_unidade uuid default null, p_dias int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_permitidas uuid[];
  v_lojas uuid[];
begin
  if p_dias is null or p_dias not between 7 and 90 then
    raise exception 'Escolha de 7 a 90 dias para o recebido' using errcode = '22023';
  end if;
  v_permitidas := array(select u from privado.unidades_com_permissao('pagamento.conciliar') u);
  if cardinality(v_permitidas) = 0 or (p_unidade is not null and not (p_unidade = any (v_permitidas))) then
    raise exception 'Sem permissão para ver os recebíveis desta loja' using errcode = '42501';
  end if;
  v_lojas := case when p_unidade is null then v_permitidas else array[p_unidade] end;
  return (
    with pags as (
      -- Cartão e Pix: o que se concilia com o extrato (privado.meio_liquidavel, a mesma regra da conciliação).
      select p.id, p.venda_id, v.numero as venda_numero, v.unidade_id, v.concluida_em,
        coalesce(privado.meio_provedor(p.meio), 'conta') as adquirente, p.valor_centavos as valor, p.situacao,
        p.terminal_id, t.apelido as terminal, p.conciliado_em, p.liquidado_em, p.valor_liquido_centavos as liquido,
        v_hoje - (v.concluida_em at time zone 'America/Sao_Paulo')::date as dias
      from public.venda_pagamentos p
      join public.vendas v on v.id = p.venda_id
      left join public.terminais t on t.id = p.terminal_id
      where v.unidade_id = any (v_lojas) and v.concluida_em is not null and privado.meio_liquidavel(p.meio)
    ),
    contas as (
      select c.id, c.venda_id, v.numero as venda_numero, v.unidade_id, v.concluida_em, c.devedor as adquirente,
        c.valor_centavos as valor, c.situacao, c.recebido_em, c.valor_recebido_centavos as recebido,
        v.situacao = 'cancelada' as venda_cancelada,
        v_hoje - (v.concluida_em at time zone 'America/Sao_Paulo')::date as dias
      from public.contas_a_receber c
      join public.vendas v on v.id = c.venda_id
      where v.unidade_id = any (v_lojas) and v.concluida_em is not null
    ),
    a_receber as (
      select 'pagamento'::text as tipo, p.id, p.venda_id, p.venda_numero, p.unidade_id, p.concluida_em, p.adquirente, p.valor, p.dias, p.terminal
      from pags p where p.situacao = 'confirmado' and p.conciliado_em is null
      union all
      select 'financeira', c.id, c.venda_id, c.venda_numero, c.unidade_id, c.concluida_em, c.adquirente, c.valor, c.dias, null
      from contas c where c.situacao = 'aberta' and not c.venda_cancelada -- venda cancelada: a financeira não deve (#83)
    ),
    -- O que caiu na conta na janela: pela data em que o dinheiro caiu (a da conciliação ou a do repasse).
    recebidos as (
      select p.unidade_id, p.adquirente, p.valor, p.liquido from pags p
      where p.conciliado_em is not null and p.liquidado_em > v_hoje - p_dias
      union all
      select c.unidade_id, c.adquirente, c.valor, c.recebido from contas c
      where c.situacao = 'recebida' and c.recebido_em > v_hoje - p_dias
    ),
    ar as (
      select a.unidade_id, a.adquirente, count(*) as quantidade, sum(a.valor) as valor,
        coalesce(sum(a.valor) filter (where a.dias <= 7), 0) as ate_7,
        coalesce(sum(a.valor) filter (where a.dias between 8 and 30), 0) as de_8_a_30,
        coalesce(sum(a.valor) filter (where a.dias > 30), 0) as mais_de_30,
        max(a.dias) as mais_antiga
      from a_receber a group by a.unidade_id, a.adquirente
    ),
    rc as (
      select r.unidade_id, r.adquirente, count(*) as quantidade, sum(r.valor) as bruto, sum(r.liquido) as liquido
      from recebidos r group by r.unidade_id, r.adquirente
    ),
    es as (
      select p.unidade_id, p.adquirente, count(*) as quantidade, sum(p.valor) as valor
      from pags p where p.situacao = 'estorno_pendente' group by p.unidade_id, p.adquirente
    ),
    grupos as (
      select x.unidade_id, x.adquirente from ar x union select y.unidade_id, y.adquirente from rc y union select z.unidade_id, z.adquirente from es z
    )
    select jsonb_build_object(
      'hoje', v_hoje,
      'dias', p_dias,
      'unidade', p_unidade,
      'lojas', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome) order by u.nome, u.id)
                         from public.unidades u where u.id = any (v_permitidas)), '[]'::jsonb),
      'linhas', coalesce((
        select jsonb_agg(jsonb_build_object(
          'unidade', g.unidade_id, 'adquirente', g.adquirente,
          'a_receber', coalesce(ar.quantidade, 0), 'valor_a_receber', coalesce(ar.valor, 0),
          'ate_7_dias', coalesce(ar.ate_7, 0), 'de_8_a_30_dias', coalesce(ar.de_8_a_30, 0), 'mais_de_30_dias', coalesce(ar.mais_de_30, 0),
          'mais_antiga_dias', ar.mais_antiga,
          'recebidos', coalesce(rc.quantidade, 0), 'recebido_bruto', coalesce(rc.bruto, 0), 'recebido_liquido', coalesce(rc.liquido, 0),
          'estornos_a_confirmar', coalesce(es.quantidade, 0), 'valor_estornos_a_confirmar', coalesce(es.valor, 0)
        ) order by u.nome, u.id, array_position(array['picpay', 'pagbank', 'conta', 'payjoy', 'aiva'], g.adquirente))
        from grupos g
        join public.unidades u on u.id = g.unidade_id
        left join ar on ar.unidade_id = g.unidade_id and ar.adquirente = g.adquirente
        left join rc on rc.unidade_id = g.unidade_id and rc.adquirente = g.adquirente
        left join es on es.unidade_id = g.unidade_id and es.adquirente = g.adquirente), '[]'::jsonb),
      'total_a_receber', (select jsonb_build_object('quantidade', count(*), 'valor', coalesce(sum(a.valor), 0)) from a_receber a),
      'mais_antigos', coalesce((
        select jsonb_agg(jsonb_build_object(
          'tipo', m.tipo, 'id', m.id, 'venda_id', m.venda_id, 'venda_numero', m.venda_numero, 'unidade', m.unidade_id,
          'adquirente', m.adquirente, 'valor', m.valor, 'dias', m.dias, 'terminal', m.terminal
        ) order by m.dias desc, m.concluida_em, m.id)
        from (select * from a_receber a order by a.dias desc, a.concluida_em, a.id limit 20) m), '[]'::jsonb),
      'pendencias', jsonb_build_object(
        'sem_maquininha', (
          select jsonb_build_object('quantidade', count(*), 'valor', coalesce(sum(p.valor), 0)) from pags p
          where p.situacao = 'confirmado' and p.conciliado_em is null and p.adquirente <> 'conta' and p.terminal_id is null),
        'entradas_na_maquininha', (
          select jsonb_build_object('quantidade', count(*), 'valor', coalesce(sum(p.entrada_centavos), 0))
          from public.venda_pagamentos p join public.vendas v on v.id = p.venda_id
          where v.unidade_id = any (v_lojas) and v.concluida_em is not null and p.situacao = 'confirmado'
            and privado.meio_financeira(p.meio) and p.entrada_centavos > 0 and privado.meio_liquidavel(p.meio_entrada)),
        'financeira_de_venda_cancelada', (
          select jsonb_build_object('quantidade', count(*), 'valor', coalesce(sum(c.recebido), 0)) from contas c
          where c.situacao = 'recebida' and c.venda_cancelada)
      )
    )
  );
end;
$$;
revoke all on function public.recebiveis_painel(uuid, int) from public, anon;
grant execute on function public.recebiveis_painel(uuid, int) to authenticated;
