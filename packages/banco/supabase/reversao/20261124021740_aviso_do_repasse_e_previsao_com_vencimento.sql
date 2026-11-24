-- Reversão de 20261124021740_aviso_do_repasse_e_previsao_com_vencimento (lote FIN-007b): volta as duas funções às
-- definições anteriores (pendencias_da_loja do TRF-e; previsao_de_caixa do L8c com a correção #82). Nada se perde: as
-- duas só leem. O sino deixa de avisar do repasse atrasado e a previsão volta a mostrar as financeiras sem data.
create or replace function public.pendencias_da_loja()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_eu constant uuid := (select auth.uid());
  v_unidade constant uuid := (select public.unidade_atual());
  v_hoje constant date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ha_sete_dias constant timestamptz := now() - interval '7 days';
  v_ha_um_dia constant timestamptz := now() - interval '1 day';
  r jsonb := '{}'::jsonb;
  v_permissoes text[];
begin
  if v_eu is null or v_unidade is null then
    return r;
  end if;

  -- VEL-e: as permissões das filas numa conta só, pela MESMA regra de tem_permissao (privado.permissoes_vigentes).
  select coalesce(array_agg(x.permissao), '{}'::text[]) into v_permissoes
  from privado.permissoes_vigentes(array['desconto.aprovar', 'nota.aprovar', 'caixa.conferir', 'conta_pagar.gerir',
    'bonus.aprovar', 'estoque.consultar', 'connect.gerir', 'venda.ver_unidade', 'os.abrir', 'os.gerir', 'os.orcar'],
    v_unidade) as x(permissao);

  if 'desconto.aprovar' = any (v_permissoes) then
    r := r || jsonb_build_object('aprovacoes',
      (select count(*) from public.aprovacoes_desconto a where a.unidade_id = v_unidade and a.situacao = 'pendente'));
  end if;

  if 'nota.aprovar' = any (v_permissoes) then
    r := r || jsonb_build_object(
      'notas', (select count(*) from public.notas_pedidos n where n.unidade_id = v_unidade and n.situacao in ('aguardando_aprovacao', 'aprovada')),
      'notas_paradas', (select count(*) from public.notas_pedidos n
                        where n.unidade_id = v_unidade and n.situacao in ('aguardando_aprovacao', 'correcao_solicitada', 'aprovada')
                          and n.criado_em < v_ha_um_dia));
  end if;

  if 'caixa.conferir' = any (v_permissoes) then
    r := r || jsonb_build_object(
      'caixas', (select count(*) from public.caixas c where c.unidade_id = v_unidade and c.situacao = 'fechado'),
      -- Saídas do caixa que outra pessoa pediu: quem pediu não autoriza a própria.
      'saidas', (select count(*) from public.caixa_saidas s where s.unidade_id = v_unidade and s.situacao = 'pendente' and s.pedida_por <> v_eu),
      'caixas_com_diferenca', (select count(*) from public.caixas c
                               where c.unidade_id = v_unidade and c.diferenca_centavos <> 0 and c.fechado_em >= v_ha_sete_dias));
  end if;

  -- As contas que a pessoa gere: o RLS dá ao dono a rede e todas as lojas; ao gerente, a loja dele.
  if 'conta_pagar.gerir' = any (v_permissoes) then
    r := r || jsonb_build_object('contas_a_pagar',
      (select count(*) from public.contas_a_pagar p where p.situacao = 'aberta' and p.vencimento <= v_hoje));
  end if;

  if 'bonus.aprovar' = any (v_permissoes) then
    r := r || jsonb_build_object('fechamentos', (select count(*) from public.bonus_fechamentos f where f.situacao = 'enviado'));
  end if;

  if 'estoque.consultar' = any (v_permissoes) then
    r := r || jsonb_build_object('transferencias',
      (select count(*) from public.transferencias t
       where (t.origem_id = v_unidade and t.situacao in ('solicitada', 'separada')) or (t.destino_id = v_unidade and t.situacao = 'enviada')
          -- TRF-e: a recebida com falta espera, dos dois lados, o destino do que faltou (TRF-d).
          or (t.situacao = 'recebida_com_divergencia' and t.divergencia_resolvida_em is null and v_unidade in (t.origem_id, t.destino_id))));
  end if;

  if 'connect.gerir' = any (v_permissoes) then
    r := r || jsonb_build_object(
      'connect', (select count(*) from public.connect_operacoes o where o.unidade_id = v_unidade and o.situacao = 'resultado_desconhecido'),
      'ativacoes_com_falha', (select count(*) from public.connect_operacoes o
                              where o.unidade_id = v_unidade and o.tipo in ('ativacao', 'portabilidade')
                                and o.situacao in ('recusada', 'negada', 'erro_operadora') and o.atualizado_em >= v_ha_sete_dias));
  end if;

  if 'venda.ver_unidade' = any (v_permissoes) then
    r := r || jsonb_build_object(
      'estornos', (select count(*) from public.estornos_externos e where e.unidade_id = v_unidade and e.situacao = 'pendente'),
      'retornos', (select count(*) from public.venda_retornos v where v.unidade_id = v_unidade and v.situacao = 'pendente'));
  end if;

  -- A assistência: as OS atrasadas e as prontas (o RLS dá à loja as dela e ao dono as da rede); ao técnico, as que
  -- estão com ele esperando o orçamento ou o conserto.
  if 'os.abrir' = any (v_permissoes) or 'os.gerir' = any (v_permissoes) then
    r := r || jsonb_build_object(
      'os_atrasadas', (select count(*) from public.ordens_servico o where o.situacao = 'aberta' and o.prazo < v_hoje),
      'os_prontas', (select count(*) from public.ordens_servico o where o.situacao = 'aberta' and o.local = 'loja' and o.servico = 'concluido'));
  end if;
  if 'os.orcar' = any (v_permissoes) then
    r := r || jsonb_build_object('os_do_tecnico',
      (select count(*) from public.ordens_servico o
       where o.situacao = 'aberta' and o.local = 'com_tecnico' and o.servico in ('aguardando_orcamento', 'aprovado')));
  end if;

  return r;
end;
$$;

comment on function public.pendencias_da_loja() is
  'VEL-c, VEL-e e TRF-e: numa ida só, as contagens das pendências da loja do turno (o sino e o Início). Cada contagem só para quem tem a permissão da fila (a regra de tem_permissao, numa conta só: privado.permissoes_vigentes), com o RLS de quem chama; sem a permissão, a chave não aparece. As transferências contam também a recebida com falta sem o destino do que faltou. Só lê.';

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
               'quantidade', (select count(*) from abertas a where a.vencimento between s.inicio and s.fim)) order by s.i)
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
  'Previsão de caixa (L8c; correção #82 em 14/11/2026): os fatos das próximas semanas (contas a pagar em aberto por vencimento, as vencidas) e das 8 semanas anteriores (recebido, devolvido só quando o dinheiro saiu e saídas do caixa), os estornos de Pix e cartão a confirmar, o que as financeiras devem, cartão e Pix a conciliar e o dinheiro nas gavetas; da rede ou de uma loja. Só para quem tem, em papel de organização, previsao.ver e as permissões de todas as partes (security invoker). A estimativa e o saldo são contas da tela.';

revoke all on function public.pendencias_da_loja() from public, anon;
grant execute on function public.pendencias_da_loja() to authenticated;
revoke all on function public.previsao_de_caixa(integer, uuid) from public, anon;
grant execute on function public.previsao_de_caixa(integer, uuid) to authenticated;
