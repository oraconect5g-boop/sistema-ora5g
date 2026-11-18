-- Reversão de 20261118192056_chips_nas_metas (lote PERF-a): as seis funções voltam à definição anterior (sem os chips e com o teto de
-- R$ 400.000,00 na aprovação do bônus). As restrições ficam como estão (as medidas aceitando 'chips' e o valor aprovado
-- até R$ 500.000,00): uma meta ou regra de chips já gravada continua no histórico, sem efeito, porque nenhuma função a
-- lê depois da reversão, e um valor já aprovado acima do teto antigo não fica inválido.

create or replace function public.metas_definir(p_unidade uuid, p_vendedor uuid, p_mes date, p_valores jsonb, p_motivo text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_mes date := date_trunc('month', p_mes)::date;
  v_este_mes date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_motivo text := nullif(regexp_replace(trim(coalesce(p_motivo, '')), '\s+', ' ', 'g'), '');
  v_item record;
  v_valor bigint;
  v_atual public.metas;
  v_criadas integer := 0;
begin
  if p_unidade is null or not public.tem_permissao('metas.gerir', p_unidade) then
    raise exception 'Sem permissão para definir metas nesta loja' using errcode = '42501';
  end if;
  select u.organizacao_id into v_org from public.unidades u where u.id = p_unidade and u.tipo in ('loja_fisica', 'online');
  if v_org is null then
    raise exception 'Meta só para loja que vende' using errcode = '22023';
  end if;
  if p_mes is null or v_mes < v_este_mes or v_mes > (v_este_mes + interval '12 months')::date then
    raise exception 'Meta só para este mês ou até 12 meses à frente: o mês que já terminou não muda' using errcode = '22023';
  end if;
  if p_valores is null or jsonb_typeof(p_valores) <> 'object' or p_valores = '{}'::jsonb then
    raise exception 'Informe ao menos uma medida' using errcode = '22023';
  end if;
  for v_item in select e.key, e.value from jsonb_each(p_valores) e loop
    if v_item.key not in ('vendido_liquido', 'aparelhos', 'connect', 'acessorios') then
      raise exception 'Medida de meta desconhecida' using errcode = '22023';
    end if;
    continue when jsonb_typeof(v_item.value) = 'null';
    if jsonb_typeof(v_item.value) <> 'number' or (v_item.value #>> '{}') !~ '^[0-9]{1,12}$' then
      raise exception 'A meta é um número inteiro maior que zero (ou vazia, para retirar)' using errcode = '22023';
    end if;
    if (v_item.value #>> '{}')::bigint not between 1 and 100000000000 then
      raise exception 'A meta é um número inteiro maior que zero (ou vazia, para retirar)' using errcode = '22023';
    end if;
  end loop;
  if v_motivo is not null and length(v_motivo) not between 3 and 300 then
    raise exception 'O motivo tem de 3 a 300 letras' using errcode = '22023';
  end if;
  -- Meta nova só para quem vende na loja e não está bloqueado; retirar a meta vale sempre (quem saiu).
  if p_vendedor is not null
     and exists (select 1 from jsonb_each(p_valores) e where jsonb_typeof(e.value) <> 'null')
     and not exists (
       select 1 from public.vinculos v
       join public.perfis_usuario p on p.id = v.usuario_id and p.status = 'ativo'
       where v.usuario_id = p_vendedor and v.unidade_id = p_unidade and v.escopo = 'unidade' and v.papel in ('vendedor', 'gerente')
         and v.inicio <= now() and (v.fim is null or v.fim > now())
     ) then
    raise exception 'Essa pessoa não vende nesta loja (ou está bloqueada)' using errcode = '22023';
  end if;

  -- Uma definição por vez para o mesmo alvo e mês: a versão vigente é lida e gravada sem corrida.
  perform pg_advisory_xact_lock(hashtextextended('metas:' || p_unidade::text || ':' || coalesce(p_vendedor::text, 'loja') || ':' || v_mes::text, 0));
  for v_item in select e.key, e.value from jsonb_each(p_valores) e order by e.key loop
    v_valor := case when jsonb_typeof(v_item.value) = 'null' then null else (v_item.value #>> '{}')::bigint end;
    select * into v_atual from public.metas m
    where m.unidade_id = p_unidade and m.mes = v_mes and m.medida = v_item.key and m.vendedor_id is not distinct from p_vendedor
    order by m.versao desc limit 1;
    -- O mesmo valor de novo (ou retirar o que não existe): nada muda.
    continue when (v_atual.id is not null and v_atual.valor is not distinct from v_valor) or (v_atual.id is null and v_valor is null);
    if v_atual.id is not null and v_motivo is null then
      raise exception 'Diga o motivo de mudar ou retirar a meta' using errcode = '22023';
    end if;
    perform set_config('ora.motivo', coalesce(v_motivo, 'Meta definida'), true);
    insert into public.metas (organizacao_id, unidade_id, vendedor_id, mes, medida, valor, motivo, definida_por)
    values (v_org, p_unidade, p_vendedor, v_mes, v_item.key, v_valor, v_motivo, (select auth.uid()));
    v_criadas := v_criadas + 1;
  end loop;
  return v_criadas;
end;
$$;
revoke all on function public.metas_definir(uuid, uuid, date, jsonb, text) from public, anon;
grant execute on function public.metas_definir(uuid, uuid, date, jsonb, text) to authenticated;

create or replace function public.bonus_definir(p_vigente_desde date, p_faixas jsonb, p_motivo text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := (select u.organizacao_id from public.unidades u where u.id = (select public.unidade_atual()));
  v_desde date := date_trunc('month', p_vigente_desde)::date;
  v_este_mes date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_motivo text := nullif(regexp_replace(trim(coalesce(p_motivo, '')), '\s+', ' ', 'g'), '');
  v_item record;
  v_faixa jsonb;
  v_porcentagem text;
  v_valor text;
  v_anterior_porcentagem integer;
  v_anterior_valor bigint;
  v_nova jsonb;
  v_atual public.bonus_regras;
  v_criadas integer := 0;
begin
  if v_org is null or v_org not in (select privado.organizacoes_com_permissao('bonus.definir')) then
    raise exception 'Só o dono define as regras do bônus' using errcode = '42501';
  end if;
  if p_vigente_desde is null or v_desde < v_este_mes or v_desde > (v_este_mes + interval '12 months')::date then
    raise exception 'A regra vale a partir deste mês ou de um dos próximos 12: o mês que já terminou não muda' using errcode = '22023';
  end if;
  if p_faixas is null or jsonb_typeof(p_faixas) <> 'object' or p_faixas = '{}'::jsonb then
    raise exception 'Informe ao menos uma medida' using errcode = '22023';
  end if;
  for v_item in select e.key, e.value from jsonb_each(p_faixas) e loop
    if v_item.key not in ('vendido_liquido', 'aparelhos', 'connect', 'acessorios') then
      raise exception 'Medida do bônus desconhecida' using errcode = '22023';
    end if;
    continue when jsonb_typeof(v_item.value) = 'null';
    if jsonb_typeof(v_item.value) <> 'array' or jsonb_array_length(v_item.value) not between 1 and 5 then
      raise exception 'De uma a cinco faixas por medida' using errcode = '22023';
    end if;
    v_anterior_porcentagem := 0;
    v_anterior_valor := 0;
    for v_faixa in select f.value from jsonb_array_elements(v_item.value) f loop
      if jsonb_typeof(v_faixa) <> 'object' or (select count(*) from jsonb_object_keys(v_faixa)) <> 2
         or jsonb_typeof(v_faixa -> 'a_partir_de') is distinct from 'number' or jsonb_typeof(v_faixa -> 'valor') is distinct from 'number' then
        raise exception 'Cada faixa tem a porcentagem da meta e o valor do bônus' using errcode = '22023';
      end if;
      v_porcentagem := v_faixa ->> 'a_partir_de';
      v_valor := v_faixa ->> 'valor';
      if v_porcentagem !~ '^[0-9]{1,3}$' or v_valor !~ '^[0-9]{1,8}$'
         or v_porcentagem::integer not between 1 and 500 or v_valor::bigint not between 1 and 10000000 then
        raise exception 'A faixa vai de 1%% a 500%% da meta, com bônus de R$ 0,01 a R$ 100.000,00' using errcode = '22023';
      end if;
      if v_porcentagem::integer <= v_anterior_porcentagem or v_valor::bigint <= v_anterior_valor then
        raise exception 'As faixas vão da menor para a maior: porcentagem e bônus crescentes' using errcode = '22023';
      end if;
      v_anterior_porcentagem := v_porcentagem::integer;
      v_anterior_valor := v_valor::bigint;
    end loop;
  end loop;
  if v_motivo is not null and length(v_motivo) not between 3 and 300 then
    raise exception 'O motivo tem de 3 a 300 letras' using errcode = '22023';
  end if;

  -- Uma definição por vez na organização: a regra que vale é lida e gravada sem corrida.
  perform pg_advisory_xact_lock(hashtextextended('bonus:' || v_org::text, 0));
  for v_item in select e.key, e.value from jsonb_each(p_faixas) e order by e.key loop
    v_nova := case when jsonb_typeof(v_item.value) = 'null' then null else (
      select jsonb_agg(jsonb_build_object('a_partir_de', (f.value ->> 'a_partir_de')::integer, 'valor', (f.value ->> 'valor')::bigint) order by f.ordem)
      from jsonb_array_elements(v_item.value) with ordinality f(value, ordem)) end;
    select * into v_atual from public.bonus_regras r
    where r.organizacao_id = v_org and r.medida = v_item.key and r.vigente_desde <= v_desde
    order by r.vigente_desde desc, r.versao desc limit 1;
    -- As mesmas faixas de novo (ou retirar o que não vale): nada muda.
    continue when (v_atual.id is not null and v_atual.faixas is not distinct from v_nova) or (v_atual.faixas is null and v_nova is null);
    if v_atual.faixas is not null and v_motivo is null then
      raise exception 'Diga o motivo de mudar ou retirar a regra' using errcode = '22023';
    end if;
    perform set_config('ora.motivo', coalesce(v_motivo, 'Regra do bônus definida'), true);
    insert into public.bonus_regras (organizacao_id, medida, vigente_desde, faixas, motivo, definida_por)
    values (v_org, v_item.key, v_desde, v_nova, v_motivo, (select auth.uid()));
    v_criadas := v_criadas + 1;
  end loop;
  return v_criadas;
end;
$$;
revoke all on function public.bonus_definir(date, jsonb, text) from public, anon;
grant execute on function public.bonus_definir(date, jsonb, text) to authenticated;

create or replace function public.metas_painel(p_mes date, p_unidade uuid)
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
  v_ve_loja boolean;
  resultado jsonb;
begin
  if p_mes is null or p_unidade is null then
    raise exception 'Informe o mês e a loja' using errcode = '22023';
  end if;
  v_inicio := v_mes::timestamp at time zone 'America/Sao_Paulo';
  v_fim := (v_mes + interval '1 month')::timestamp at time zone 'America/Sao_Paulo';
  v_dias := extract(day from (v_mes + interval '1 month' - interval '1 day'))::int;
  v_decorridos := case when v_hoje < v_mes then 0 when v_hoje >= (v_mes + interval '1 month')::date then v_dias else extract(day from v_hoje)::int end;
  v_ve_loja := public.tem_permissao('venda.ver_unidade', p_unidade) or public.tem_permissao('venda.ver_todas', p_unidade);

  with
  -- A versão mais recente de cada alvo e medida; a retirada (valor nulo) é "meta não definida".
  vigentes as (
    select x.vendedor_id, x.medida, x.valor from (
      select distinct on (m.vendedor_id, m.medida) m.vendedor_id, m.medida, m.valor
      from public.metas m
      where m.unidade_id = p_unidade and m.mes = v_mes
      order by m.vendedor_id, m.medida, m.versao desc
    ) x
    where x.valor is not null
  ),
  concluidas as (
    select v.id, v.vendedor_id, v.total_centavos from public.vendas v
    where v.unidade_id = p_unidade and v.concluida_em >= v_inicio and v.concluida_em < v_fim
  ),
  canceladas as (
    select v.id, v.vendedor_id, v.total_centavos from public.vendas v
    where v.unidade_id = p_unidade and v.situacao = 'cancelada' and v.concluida_em is not null and v.cancelada_em >= v_inicio and v.cancelada_em < v_fim
  ),
  devolucoes as (
    select d.id, v.vendedor_id, d.valor_centavos from public.venda_devolucoes d
    join public.vendas v on v.id = d.venda_id
    where v.unidade_id = p_unidade and d.criado_em >= v_inicio and d.criado_em < v_fim
  ),
  fatos as (
    select c.vendedor_id, c.total_centavos as liquido, 0::bigint as aparelhos, 0::bigint as acessorios from concluidas c
    union all select c.vendedor_id, -c.total_centavos, 0, 0 from canceladas c
    union all select d.vendedor_id, -d.valor_centavos, 0, 0 from devolucoes d
    union all
    select c.vendedor_id, 0, case when i.tipo = 'aparelho' then i.quantidade else 0 end,
      case when i.tipo = 'acessorio' then i.preco_unitario_centavos * i.quantidade - i.desconto_centavos else 0 end
    from concluidas c join public.venda_itens i on i.venda_id = c.id where i.tipo in ('aparelho', 'acessorio')
    union all
    select c.vendedor_id, 0, case when i.tipo = 'aparelho' then -i.quantidade else 0 end,
      case when i.tipo = 'acessorio' then -(i.preco_unitario_centavos * i.quantidade - i.desconto_centavos) else 0 end
    from canceladas c join public.venda_itens i on i.venda_id = c.id where i.tipo in ('aparelho', 'acessorio')
    union all
    select d.vendedor_id, 0, case when i.tipo = 'aparelho' then -di.quantidade else 0 end, case when i.tipo = 'acessorio' then -di.valor_centavos else 0 end
    from devolucoes d
    join public.venda_devolucao_itens di on di.devolucao_id = d.id
    join public.venda_itens i on i.id = di.venda_item_id
    where i.tipo in ('aparelho', 'acessorio')
  ),
  connect as (
    select p.vendedor_id, count(*) as quantidade from public.connect_producao p
    where p.unidade_id = p_unidade and p.confirmado_em >= v_inicio and p.confirmado_em < v_fim
    group by 1
  ),
  por_vendedor as (
    select f.vendedor_id, sum(f.liquido) as vendido_liquido, sum(f.aparelhos) as aparelhos, sum(f.acessorios) as acessorios
    from fatos f group by 1
  ),
  vendedores as (
    select x.vendedor_id from (
      select g.vendedor_id from vigentes g where g.vendedor_id is not null
      union select p.vendedor_id from por_vendedor p
      union select c.vendedor_id from connect c
    ) x
  ),
  realizado as (
    select w.vendedor_id,
      coalesce(p.vendido_liquido, 0) as vendido_liquido, coalesce(p.aparelhos, 0) as aparelhos,
      coalesce(c.quantidade, 0) as connect, coalesce(p.acessorios, 0) as acessorios
    from vendedores w
    left join por_vendedor p on p.vendedor_id = w.vendedor_id
    left join connect c on c.vendedor_id = w.vendedor_id
  )
  select jsonb_build_object(
    'mes', to_char(v_mes, 'YYYY-MM-DD'), 'dias_no_mes', v_dias, 'dias_decorridos', v_decorridos, 'regra_contagem', 1,
    'loja', case when v_ve_loja then jsonb_build_object(
      'metas', coalesce((select jsonb_object_agg(g.medida, g.valor) from vigentes g where g.vendedor_id is null), '{}'::jsonb),
      'realizado', jsonb_build_object(
        'vendido_liquido', coalesce((select sum(p.vendido_liquido) from por_vendedor p), 0),
        'aparelhos', coalesce((select sum(p.aparelhos) from por_vendedor p), 0),
        'connect', coalesce((select sum(c.quantidade) from connect c), 0),
        'acessorios', coalesce((select sum(p.acessorios) from por_vendedor p), 0))) end,
    'vendedores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'vendedor_id', r.vendedor_id,
        'metas', coalesce((select jsonb_object_agg(g.medida, g.valor) from vigentes g where g.vendedor_id = r.vendedor_id), '{}'::jsonb),
        'realizado', jsonb_build_object('vendido_liquido', r.vendido_liquido, 'aparelhos', r.aparelhos, 'connect', r.connect, 'acessorios', r.acessorios)
      ) order by r.vendido_liquido desc, r.vendedor_id)
      from realizado r), '[]'::jsonb)
  ) into resultado;

  return resultado;
end;
$$;
comment on function public.metas_painel(date, uuid) is
  'Metas (G4b): metas vigentes do mês e o realizado da loja e de cada vendedor, regra de contagem 1, com as regras de leitura de quem chama (security invoker).';
revoke all on function public.metas_painel(date, uuid) from public, anon;
grant execute on function public.metas_painel(date, uuid) to authenticated;

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

create or replace function public.extrato_do_vendedor(p_mes date, p_unidade uuid, p_vendedor uuid)
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
begin
  if p_mes is null or p_unidade is null or p_vendedor is null then
    raise exception 'Informe o mês, a loja e o vendedor' using errcode = '22023';
  end if;
  if not (
    ((public.tem_permissao('metas.gerir', p_unidade) or public.tem_permissao('metas.ver_unidade', p_unidade))
      and (public.tem_permissao('venda.ver_unidade', p_unidade) or public.tem_permissao('venda.ver_todas', p_unidade)))
    or (p_vendedor = (select auth.uid()) and public.tem_permissao('metas.ver_propria', p_unidade))
  ) then
    raise exception 'Sem permissão para ver este extrato' using errcode = '42501';
  end if;
  v_inicio := v_mes::timestamp at time zone 'America/Sao_Paulo';
  v_fim := (v_mes + interval '1 month')::timestamp at time zone 'America/Sao_Paulo';
  return (
    with
    vendas as (
      select v.id, v.numero, v.total_centavos, v.concluida_em, v.cancelada_em, v.situacao from public.vendas v
      where v.unidade_id = p_unidade and v.vendedor_id = p_vendedor
        and ((v.concluida_em >= v_inicio and v.concluida_em < v_fim)
             or (v.situacao = 'cancelada' and v.concluida_em is not null and v.cancelada_em >= v_inicio and v.cancelada_em < v_fim))
    ),
    itens as (
      select i.venda_id,
        sum(case when i.tipo = 'aparelho' then i.quantidade else 0 end) as aparelhos,
        sum(case when i.tipo = 'acessorio' then i.preco_unitario_centavos * i.quantidade - i.desconto_centavos else 0 end) as acessorios
      from public.venda_itens i
      where i.venda_id in (select v.id from vendas v) and i.tipo in ('aparelho', 'acessorio')
      group by i.venda_id
    ),
    devolucoes as (
      select d.id, d.numero, d.criado_em, d.valor_centavos, v.numero as venda from public.venda_devolucoes d
      join public.vendas v on v.id = d.venda_id
      where v.unidade_id = p_unidade and v.vendedor_id = p_vendedor and d.criado_em >= v_inicio and d.criado_em < v_fim
    ),
    devolvidos as (
      select di.devolucao_id,
        sum(case when i.tipo = 'aparelho' then di.quantidade else 0 end) as aparelhos,
        sum(case when i.tipo = 'acessorio' then di.valor_centavos else 0 end) as acessorios
      from public.venda_devolucao_itens di
      join public.venda_itens i on i.id = di.venda_item_id
      where di.devolucao_id in (select d.id from devolucoes d) and i.tipo in ('aparelho', 'acessorio')
      group by di.devolucao_id
    ),
    fatos as (
      select 'venda'::text as tipo, v.concluida_em as quando, v.numero as venda, null::bigint as devolucao, null::bigint as operacao, null::text as servico,
        v.total_centavos as vendido_liquido, coalesce(x.aparelhos, 0) as aparelhos, coalesce(x.acessorios, 0) as acessorios, 0 as connect
      from vendas v left join itens x on x.venda_id = v.id
      where v.concluida_em >= v_inicio and v.concluida_em < v_fim
      union all
      select 'cancelamento', v.cancelada_em, v.numero, null, null, null,
        -v.total_centavos, -coalesce(x.aparelhos, 0), -coalesce(x.acessorios, 0), 0
      from vendas v left join itens x on x.venda_id = v.id
      where v.situacao = 'cancelada' and v.concluida_em is not null and v.cancelada_em >= v_inicio and v.cancelada_em < v_fim
      union all
      select 'devolucao', d.criado_em, d.venda, d.numero, null, null,
        -d.valor_centavos, -coalesce(x.aparelhos, 0), -coalesce(x.acessorios, 0), 0
      from devolucoes d left join devolvidos x on x.devolucao_id = d.id
      union all
      select 'connect', p.confirmado_em, null, null, o.numero, p.tipo, 0, 0, 0, 1
      from public.connect_producao p
      left join public.connect_operacoes o on o.id = p.operacao_id
      where p.unidade_id = p_unidade and p.vendedor_id = p_vendedor and p.confirmado_em >= v_inicio and p.confirmado_em < v_fim
    ),
    ordenados as (
      select f.*, row_number() over (order by f.quando desc, f.tipo, f.venda desc nulls last, f.devolucao desc nulls last, f.operacao desc nulls last) as n
      from fatos f
    )
    select jsonb_build_object(
      'mes', to_char(v_mes, 'YYYY-MM-DD'),
      'regra_contagem', 1,
      'unidade_id', p_unidade,
      'vendedor_id', p_vendedor,
      'quantidade', (select count(*) from fatos),
      'totais', jsonb_build_object(
        'vendido_liquido', coalesce((select sum(f.vendido_liquido) from fatos f), 0),
        'aparelhos', coalesce((select sum(f.aparelhos) from fatos f), 0),
        'acessorios', coalesce((select sum(f.acessorios) from fatos f), 0),
        'connect', coalesce((select sum(f.connect) from fatos f), 0)),
      'linhas', coalesce((
        select jsonb_agg(jsonb_build_object(
          'tipo', o.tipo, 'quando', o.quando, 'venda', o.venda, 'devolucao', o.devolucao, 'operacao', o.operacao, 'servico', o.servico,
          'vendido_liquido', o.vendido_liquido, 'aparelhos', o.aparelhos, 'acessorios', o.acessorios, 'connect', o.connect) order by o.n)
        from ordenados o where o.n <= 2000), '[]'::jsonb)
    )
  );
end;
$$;
comment on function public.extrato_do_vendedor(date, uuid, uuid) is
  'Bônus por meta (L9a): os fatos do mês do vendedor na loja, um por linha, pela regra de contagem 1 de metas_painel, com as regras de leitura de quem chama (security invoker).';
revoke all on function public.extrato_do_vendedor(date, uuid, uuid) from public, anon;
grant execute on function public.extrato_do_vendedor(date, uuid, uuid) to authenticated;

create or replace function public.bonus_fechamento_aprovar(p_fechamento uuid, p_decisoes jsonb)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_f public.bonus_fechamentos;
  v_decisoes jsonb := coalesce(p_decisoes, '{}'::jsonb);
  v_item record;
  v_calculado bigint;
  v_motivo text;
  v_total bigint;
begin
  select * into v_f from public.bonus_fechamentos f where f.id = p_fechamento for update;
  if v_f.id is null or not public.tem_permissao('bonus.aprovar', v_f.unidade_id) then
    raise exception 'Só o dono aprova o pagamento do bônus' using errcode = '42501';
  end if;
  if v_f.situacao = 'aprovado' then
    raise exception 'Este fechamento já foi aprovado' using errcode = '22023';
  end if;
  if jsonb_typeof(v_decisoes) <> 'object' then
    raise exception 'Cada decisão é manter o valor ou pagar outro' using errcode = '22023';
  end if;
  for v_item in select e.key, e.value from jsonb_each(v_decisoes) e loop
    select l.total_calculado into v_calculado from public.bonus_fechamento_linhas l
    where l.fechamento_id = v_f.id and l.vendedor_id::text = v_item.key;
    if not found then
      raise exception 'Decisão de quem não está no fechamento' using errcode = '22023';
    end if;
    if jsonb_typeof(v_item.value) <> 'object' or v_item.value ->> 'decisao' is null
       or v_item.value ->> 'decisao' not in ('manter', 'ajustar')
       or exists (select 1 from jsonb_object_keys(v_item.value) k where k not in ('decisao', 'valor', 'motivo')) then
      raise exception 'Cada decisão é manter o valor ou pagar outro' using errcode = '22023';
    end if;
    if v_item.value ? 'motivo' and jsonb_typeof(v_item.value -> 'motivo') <> 'string' then
      raise exception 'O motivo tem de 3 a 300 letras' using errcode = '22023';
    end if;
    v_motivo := nullif(regexp_replace(trim(coalesce(v_item.value ->> 'motivo', '')), '\s+', ' ', 'g'), '');
    if v_motivo is not null and length(v_motivo) not between 3 and 300 then
      raise exception 'O motivo tem de 3 a 300 letras' using errcode = '22023';
    end if;
    if v_item.value ->> 'decisao' = 'manter' then
      if v_item.value ? 'valor' then
        raise exception 'Cada decisão é manter o valor ou pagar outro' using errcode = '22023';
      end if;
    else
      if jsonb_typeof(v_item.value -> 'valor') is distinct from 'number' or (v_item.value ->> 'valor') !~ '^[0-9]{1,8}$'
         or (v_item.value ->> 'valor')::bigint > 40000000 then
        raise exception 'O valor a pagar vai de R$ 0,00 a R$ 400.000,00' using errcode = '22023';
      end if;
      if (v_item.value ->> 'valor')::bigint = v_calculado then
        raise exception 'Para pagar o valor calculado, escolha manter' using errcode = '22023';
      end if;
      if v_motivo is null then
        raise exception 'Diga o motivo de pagar outro valor: o vendedor vê' using errcode = '22023';
      end if;
    end if;
  end loop;
  if exists (select 1 from public.bonus_contestacoes c where c.fechamento_id = v_f.id and not (v_decisoes ? c.vendedor_id::text)) then
    raise exception 'Decida cada contestação: manter o valor ou pagar outro' using errcode = '22023';
  end if;

  perform set_config('ora.motivo', 'Pagamento do bônus de ' || to_char(v_f.mes, 'MM/YYYY') || ' aprovado pelo dono', true);
  update public.bonus_fechamento_linhas l
  set total_aprovado = case when v_decisoes -> l.vendedor_id::text ->> 'decisao' = 'ajustar'
                            then (v_decisoes -> l.vendedor_id::text ->> 'valor')::bigint else l.total_calculado end,
      ajuste_motivo = case when v_decisoes -> l.vendedor_id::text ->> 'decisao' = 'ajustar'
                           then regexp_replace(trim(v_decisoes -> l.vendedor_id::text ->> 'motivo'), '\s+', ' ', 'g') end,
      aprovado_em = now()
  where l.fechamento_id = v_f.id;
  update public.bonus_contestacoes c
  set decisao = case when v_decisoes -> c.vendedor_id::text ->> 'decisao' = 'ajustar' then 'ajustado' else 'mantido' end,
      resposta = nullif(regexp_replace(trim(coalesce(v_decisoes -> c.vendedor_id::text ->> 'motivo', '')), '\s+', ' ', 'g'), ''),
      decidida_por = (select auth.uid()),
      decidida_em = now()
  where c.fechamento_id = v_f.id;
  v_total := (select coalesce(sum(l.total_aprovado), 0) from public.bonus_fechamento_linhas l where l.fechamento_id = v_f.id);
  update public.bonus_fechamentos f
  set situacao = 'aprovado', total_aprovado = v_total, aprovado_por = (select auth.uid()), aprovado_em = now()
  where f.id = v_f.id;
  return v_total;
end;
$$;
revoke all on function public.bonus_fechamento_aprovar(uuid, jsonb) from public, anon;
grant execute on function public.bonus_fechamento_aprovar(uuid, jsonb) to authenticated;
