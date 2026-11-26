-- Reverter antes do primeiro registro. Depois, somente correção para frente ou restauração com plano
-- específico: nunca apagar o histórico de um repasse, nem converter saldo parcial em tarifa.
do $reverter$
begin
  lock table public.contas_a_receber in access exclusive mode;
  if exists (select 1 from privado.repasses_das_financeiras) then
    raise exception 'Há histórico de repasses neste formato; preserve o histórico e corrija para frente';
  end if;

create or replace function public.financeira_receber(p_conta uuid, p_referencia text, p_valor_recebido bigint, p_recebido_em date)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c public.contas_a_receber;
  v_venda public.vendas;
  v_referencia text := regexp_replace(trim(coalesce(p_referencia, '')), '\s+', ' ', 'g');
begin
  -- #83: a venda primeiro (a mesma ordem do cancelamento, que trava a venda e depois a conta): o estado
  -- comercial lido aqui não muda até o fim, e cancelamento e repasse ao mesmo tempo esperam um pelo outro.
  select v.* into v_venda from public.vendas v where v.id = (select c.venda_id from public.contas_a_receber c where c.id = p_conta) for share;
  select * into v_c from public.contas_a_receber c where c.id = p_conta for no key update;
  if v_c.id is null or not public.tem_permissao('pagamento.conciliar', v_venda.unidade_id) then
    raise exception 'Conta a receber não encontrada para você' using errcode = 'P0002';
  end if;
  if v_c.situacao = 'cancelada' then
    raise exception 'Conta cancelada com a venda: não há o que receber' using errcode = '22023';
  end if;
  if v_c.situacao = 'aberta' and (v_venda.situacao = 'cancelada' or exists (
       select 1 from public.venda_pagamentos p where p.id = v_c.pagamento_id and p.situacao <> 'confirmado')) then
    raise exception 'Venda cancelada: não há o que receber da financeira' using errcode = '22023';
  end if;
  if length(v_referencia) not between 3 and 80 then
    raise exception 'Informe a referência do repasse (de 3 a 80 letras): código, lote ou linha do extrato' using errcode = '22023';
  end if;
  if p_valor_recebido is null or p_valor_recebido < 0 or p_valor_recebido > v_c.valor_centavos then
    raise exception 'Valor recebido entre zero e o valor a receber' using errcode = '22023';
  end if;
  if p_recebido_em is null or p_recebido_em < (v_venda.concluida_em at time zone 'America/Sao_Paulo')::date
     or p_recebido_em > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data do repasse vai do dia da venda até hoje' using errcode = '22023';
  end if;
  if v_c.situacao = 'recebida' then
    if v_c.referencia_recebimento = v_referencia and v_c.valor_recebido_centavos = p_valor_recebido and v_c.recebido_em = p_recebido_em then
      return false;
    end if;
    raise exception 'Recebimento já registrado: desfaça antes de mudar' using errcode = 'OR030';
  end if;
  perform set_config('ora.motivo', 'Repasse da financeira: ' || v_referencia, true);
  update public.contas_a_receber c
  set situacao = 'recebida', recebido_em = p_recebido_em, valor_recebido_centavos = p_valor_recebido,
      referencia_recebimento = v_referencia, registrado_por = (select auth.uid()), atualizado_em = now()
  where c.id = v_c.id;
  return true;
end;
$$;

create or replace function public.financeira_desfazer_recebimento(p_conta uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_c public.contas_a_receber;
  v_venda public.vendas;
  v_cancelada boolean;
begin
  -- #83: a venda primeiro, como no registro do repasse e no cancelamento.
  select v.* into v_venda from public.vendas v where v.id = (select c.venda_id from public.contas_a_receber c where c.id = p_conta) for share;
  select * into v_c from public.contas_a_receber c where c.id = p_conta for no key update;
  if v_c.id is null or not public.tem_permissao('pagamento.conciliar', v_venda.unidade_id) then
    raise exception 'Conta a receber não encontrada para você' using errcode = 'P0002';
  end if;
  if v_c.situacao <> 'recebida' then
    return false;
  end if;
  -- Venda cancelada (ou o pagamento financiado já estornado): desfazer não reabre crédito que ninguém deve.
  -- A conta fica cancelada, como teria ficado se o repasse não tivesse sido registrado; o registro desfeito
  -- fica na auditoria, com o motivo. Se o dinheiro caiu e só a referência estava errada, corrija o
  -- recebimento (financeira_corrigir_recebimento), que mantém a conta recebida.
  v_cancelada := v_venda.situacao = 'cancelada' or exists (
    select 1 from public.venda_pagamentos p where p.id = v_c.pagamento_id and p.situacao <> 'confirmado');
  perform set_config('ora.motivo', 'Recebimento da financeira desfeito: ' || v_motivo
    || case when v_cancelada then ' (venda cancelada: a conta fica cancelada)' else '' end, true);
  update public.contas_a_receber c
  set situacao = case when v_cancelada then 'cancelada' else 'aberta' end,
      recebido_em = null, valor_recebido_centavos = null, referencia_recebimento = null, registrado_por = null, atualizado_em = now()
  where c.id = v_c.id;
  return true;
end;
$$;

create or replace function public.financeira_corrigir_recebimento(
  p_conta uuid, p_referencia text, p_valor_recebido bigint, p_recebido_em date, p_motivo text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_c public.contas_a_receber;
  v_venda public.vendas;
  v_referencia text := regexp_replace(trim(coalesce(p_referencia, '')), '\s+', ' ', 'g');
begin
  select v.* into v_venda from public.vendas v where v.id = (select c.venda_id from public.contas_a_receber c where c.id = p_conta) for share;
  select * into v_c from public.contas_a_receber c where c.id = p_conta for no key update;
  if v_c.id is null or not public.tem_permissao('pagamento.conciliar', v_venda.unidade_id) then
    raise exception 'Conta a receber não encontrada para você' using errcode = 'P0002';
  end if;
  if v_c.situacao <> 'recebida' then
    raise exception 'Só se corrige um repasse já registrado' using errcode = '22023';
  end if;
  if length(v_referencia) not between 3 and 80 then
    raise exception 'Informe a referência do repasse (de 3 a 80 letras): código, lote ou linha do extrato' using errcode = '22023';
  end if;
  if p_valor_recebido is null or p_valor_recebido < 0 or p_valor_recebido > v_c.valor_centavos then
    raise exception 'Valor recebido entre zero e o valor a receber' using errcode = '22023';
  end if;
  if p_recebido_em is null or p_recebido_em < (v_venda.concluida_em at time zone 'America/Sao_Paulo')::date
     or p_recebido_em > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data do repasse vai do dia da venda até hoje' using errcode = '22023';
  end if;
  if v_c.referencia_recebimento = v_referencia and v_c.valor_recebido_centavos = p_valor_recebido and v_c.recebido_em = p_recebido_em then
    return false;
  end if;
  perform set_config('ora.motivo', 'Recebimento da financeira corrigido: ' || v_motivo, true);
  update public.contas_a_receber c
  set recebido_em = p_recebido_em, valor_recebido_centavos = p_valor_recebido, referencia_recebimento = v_referencia,
      registrado_por = (select auth.uid()), atualizado_em = now()
  where c.id = v_c.id;
  return true;
end;
$$;

create or replace function public.financeiras_a_receber()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_unidade is null or not public.tem_permissao('pagamento.conciliar', v_unidade) then
    raise exception 'Sem permissão para conciliar pagamentos nesta loja' using errcode = '42501';
  end if;
  return (
    with contas as (
      select c.*, v.numero as venda_numero, v.concluida_em, v.situacao = 'cancelada' as venda_cancelada,
        v_hoje - (v.concluida_em at time zone 'America/Sao_Paulo')::date as dias
      from public.contas_a_receber c
      join public.vendas v on v.id = c.venda_id
      where v.unidade_id = v_unidade
        and (c.situacao = 'aberta' or (c.situacao = 'recebida' and c.recebido_em >= v_hoje - 60))
    )
    select jsonb_build_object(
      'por_devedor', coalesce((
        select jsonb_agg(jsonb_build_object(
          'devedor', x.devedor, 'abertas', x.abertas, 'valor_aberto', x.valor_aberto, 'mais_antiga_dias', x.mais_antiga,
          'recebidas', x.recebidas, 'valor_recebido', x.valor_recebido, 'taxa_observada', x.taxa
        ) order by x.devedor)
        from (
          select c.devedor,
            count(*) filter (where c.situacao = 'aberta') as abertas,
            coalesce(sum(c.valor_centavos) filter (where c.situacao = 'aberta'), 0) as valor_aberto,
            max(c.dias) filter (where c.situacao = 'aberta') as mais_antiga,
            count(*) filter (where c.situacao = 'recebida') as recebidas,
            coalesce(sum(c.valor_recebido_centavos) filter (where c.situacao = 'recebida'), 0) as valor_recebido,
            coalesce(sum(c.valor_centavos - c.valor_recebido_centavos) filter (where c.situacao = 'recebida'), 0) as taxa
          from contas c group by c.devedor
        ) x), '[]'::jsonb),
      'contas', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id, 'venda_id', c.venda_id, 'venda_numero', c.venda_numero, 'concluida_em', c.concluida_em, 'devedor', c.devedor,
          'valor', c.valor_centavos, 'situacao', c.situacao, 'dias', c.dias, 'recebido_em', c.recebido_em,
          'valor_recebido', c.valor_recebido_centavos, 'referencia', c.referencia_recebimento, 'venda_cancelada', c.venda_cancelada
        ) order by (c.situacao = 'aberta') desc, c.concluida_em, c.id)
        from contas c), '[]'::jsonb)
    )
  );
end;
$$;

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
    select c.valor_centavos as valor,
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

create or replace function public.repasses_atrasados(p_unidade uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_org uuid := (select u.organizacao_id from public.unidades u where u.id = (select public.unidade_atual()));
  lojas uuid[];
  resultado jsonb;
begin
  select coalesce(array_agg(x.id), '{}') into lojas
  from (select u as id from privado.unidades_com_permissao('pagamento.conciliar') u) x
  where p_unidade is null or x.id = p_unidade;
  if cardinality(lojas) = 0 then
    raise exception 'Os repasses atrasados são de quem concilia os pagamentos da loja ou da rede' using errcode = '42501';
  end if;

  with
  -- O prazo em vigor de cada financeira, por rede: a linha mais recente (a que não tem dias retirou o prazo).
  prazo as (
    select distinct on (p.organizacao_id, p.devedor) p.organizacao_id, p.devedor, p.dias, p.criado_em
    from public.prazos_de_repasse p
    order by p.organizacao_id, p.devedor, p.criado_em desc, p.id desc
  ),
  aberta as (
    select c.id, c.venda_id, v.numero as venda_numero, v.unidade_id, u.nome as unidade_nome, c.devedor, c.valor_centavos as valor, v.concluida_em,
      v_hoje - (v.concluida_em at time zone 'America/Sao_Paulo')::date as dias,
      p.dias as prazo,
      (v.concluida_em at time zone 'America/Sao_Paulo')::date + p.dias as vencimento
    from public.contas_a_receber c
    join public.vendas v on v.id = c.venda_id
    join public.unidades u on u.id = v.unidade_id
    left join prazo p on p.organizacao_id = c.organizacao_id and p.devedor = c.devedor
    where c.situacao = 'aberta' and v.unidade_id = any (lojas)
  ),
  conta as (
    select a.*,
      case when a.vencimento is null then null else greatest(v_hoje - a.vencimento, 0) end as atraso,
      case when a.vencimento is null then 'sem_prazo' when a.vencimento < v_hoje then 'atrasada' else 'no_prazo' end as estado
    from aberta a
  ),
  cobranca as (
    select k.conta_id, count(*) as quantidade,
      jsonb_agg(jsonb_build_object(
        'id', k.id, 'quando', k.criado_em, 'canal', k.canal, 'resumo', k.resumo, 'protocolo', k.protocolo, 'retornar_em', k.retornar_em,
        'por', (select f.nome from public.perfis_usuario f where f.id = k.registrado_por)
      ) order by k.criado_em desc, k.id desc) as historico
    from public.cobrancas_de_repasse k
    where k.conta_id in (select c.id from conta c)
    group by k.conta_id
  )
  select jsonb_build_object(
    'hoje', v_hoje,
    -- O prazo de cada financeira na rede da loja do turno, e se quem lê pode mudá-lo.
    'prazos', (
      select jsonb_agg(jsonb_build_object('devedor', d.devedor, 'dias', p.dias, 'definido_em', case when p.dias is null then null else p.criado_em end) order by d.devedor)
      from (values ('aiva'), ('payjoy')) d (devedor)
      left join prazo p on p.organizacao_id = v_org and p.devedor = d.devedor),
    'pode_definir_prazo', v_org is not null and v_org in (select privado.organizacoes_com_permissao('pagamento.conciliar')),
    'totais', (
      select jsonb_build_object(
        'atrasadas', count(*) filter (where c.estado = 'atrasada'), 'valor_atrasado', coalesce(sum(c.valor) filter (where c.estado = 'atrasada'), 0),
        'no_prazo', count(*) filter (where c.estado = 'no_prazo'), 'valor_no_prazo', coalesce(sum(c.valor) filter (where c.estado = 'no_prazo'), 0),
        'sem_prazo', count(*) filter (where c.estado = 'sem_prazo'), 'valor_sem_prazo', coalesce(sum(c.valor) filter (where c.estado = 'sem_prazo'), 0),
        'maior_atraso', coalesce(max(c.atraso), 0))
      from conta c),
    'por_loja', coalesce((
      select jsonb_agg(jsonb_build_object('unidade_id', x.unidade_id, 'nome', x.unidade_nome, 'abertas', x.abertas, 'atrasadas', x.atrasadas, 'valor_atrasado', x.valor_atrasado)
                       order by x.valor_atrasado desc, x.unidade_nome)
      from (select c.unidade_id, c.unidade_nome, count(*) as abertas, count(*) filter (where c.estado = 'atrasada') as atrasadas,
              coalesce(sum(c.valor) filter (where c.estado = 'atrasada'), 0) as valor_atrasado
            from conta c group by c.unidade_id, c.unidade_nome) x), '[]'::jsonb),
    'contas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'venda_id', c.venda_id, 'venda_numero', c.venda_numero, 'unidade_id', c.unidade_id, 'unidade_nome', c.unidade_nome,
        'devedor', c.devedor, 'valor', c.valor, 'concluida_em', c.concluida_em, 'dias', c.dias, 'prazo', c.prazo, 'vencimento', c.vencimento,
        'atraso', c.atraso, 'estado', c.estado, 'cobrancas', coalesce(k.quantidade, 0), 'historico', coalesce(k.historico, '[]'::jsonb)
      -- As atrasadas primeiro, da mais atrasada para a menos; depois as que vencem antes; por fim as sem prazo, da mais antiga.
      ) order by case c.estado when 'atrasada' then 0 when 'no_prazo' then 1 else 2 end, c.atraso desc nulls last, c.vencimento nulls last, c.concluida_em, c.id)
      from conta c left join cobranca k on k.conta_id = c.id), '[]'::jsonb)
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
      coalesce(sum(r.valor_centavos) filter (where r.situacao = 'aberta'), 0) as a_receber_valor
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
      p.conciliado_em, p.valor_liquido_centavos, -- G2b
      case when p.meio = 'dinheiro' and p.ordem = (
        select min(p2.ordem) from public.venda_pagamentos p2 where p2.venda_id = p.venda_id and p2.meio = 'dinheiro'
      ) then coalesce(e.troco_centavos, 0) else 0 end as troco
    from public.venda_pagamentos p
    join escopo e on e.id = p.venda_id
    where p.criado_em >= p_inicio and p.criado_em < p_fim
  ),
  pagamentos_por_meio as (
    select meio, situacao, meio_entrada, count(*) as quantidade,
      sum(valor_centavos) as valor, sum(entrada_centavos) as entrada, sum(troco) as troco,
      -- G2b: a conciliação manual do grupo (só cartão e Pix chegam a ter).
      count(*) filter (where conciliado_em is not null) as conciliados,
      coalesce(sum(valor_centavos) filter (where conciliado_em is not null), 0) as conciliado,
      coalesce(sum(valor_liquido_centavos), 0) as liquido
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

drop function public.financeira_desfazer_repasse_parcial(uuid, uuid, text);
drop function public.financeira_desfazer_repasse_final(uuid, uuid, text);
drop function public.financeira_registrar_repasse(uuid, text, bigint, date, bigint, uuid);
drop table privado.repasses_das_financeiras;
alter table public.contas_a_receber drop column parcial_centavos;
end;
$reverter$;
