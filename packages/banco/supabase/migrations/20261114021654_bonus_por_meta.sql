-- =============================================================================
-- Bônus por meta, lote L9a: ORA-PERF-001 a 003, 005 e 006 (decisão do proprietário de 13/11/2026,
-- D-014)
--
-- Decisões do proprietário:
--   * a Ora não paga comissão por venda: paga BÔNUS ao vendedor que bate a meta do mês;
--   * a venda conta na CONCLUSÃO, inclusive a financiada pela PayJoy ou pela Aiva; devolução e
--     cancelamento descontam no mês em que acontecem (a regra de contagem 1 das metas, lote G4b);
--   * só o DONO cria e muda as regras do bônus, com histórico (permissão nova bonus.definir); no
--     fechamento do mês (lote L9b) o gerente confere e contesta, e o dono aprova o pagamento;
--   * o vendedor vê o próprio extrato, venda a venda, provisório até o fechamento; nunca o custo nem o
--     bônus dos colegas.
--
-- 1) public.bonus_regras: uma linha por versão (só inserção, auditada). A regra de uma medida vale do
--    mês vigente_desde em diante, até a próxima versão: em cada mês vale a versão de maior
--    vigente_desde que não passa do mês (no mesmo vigente_desde, a de maior número de versão, que segue
--    a ordem de gravação). Faixas nulas retiram o bônus da medida dali em diante. Só se muda a partir
--    deste mês: o mês que já terminou não muda. Faixas: de 1 a 5, cada uma "a partir de X% da meta,
--    R$ Y", com X e Y crescentes; vale a maior faixa alcançada (as faixas não somam). A regra é da rede
--    inteira (a mesma em todas as lojas) e vale para a meta de cada vendedor; a meta da loja inteira
--    não paga bônus. Sem meta na medida, não há bônus nela.
-- 2) public.bonus_definir(p_vigente_desde, p_faixas, p_motivo): grava as versões de uma a quatro
--    medidas, tudo ou nada, com bonus.definir em papel de organização (o dono), na organização da loja
--    do turno; motivo obrigatório para mudar ou retirar uma regra que já valia no mês escolhido.
-- 3) public.bonus_do_mes(p_mes, p_unidade): as regras que valem no mês e, para cada vendedor com meta
--    ou fato, em cada medida com regra, a meta, o realizado (os mesmos de public.metas_painel), a
--    faixa alcançada, o bônus e a próxima faixa (quanto falta). SECURITY INVOKER: chama metas_painel
--    com as regras de leitura de quem chama (o vendedor recebe só a própria linha).
-- 4) public.extrato_do_vendedor(p_mes, p_unidade, p_vendedor): os fatos que somam o realizado do
--    vendedor na loja no mês, um por linha (venda concluída, cancelamento, devolução, Ora Connect
--    confirmado), com o efeito em cada medida; os totais são os de metas_painel. SECURITY INVOKER; o
--    próprio vendedor (metas.ver_propria) ou a gestão da loja que lê as vendas dela.
--
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

do $$
begin
  perform set_config('ora.motivo', 'Bônus por meta: só o dono define as regras (decisão do proprietário, 13/11/2026)', true);
  insert into public.permissoes (codigo, descricao, modulo) values
    ('bonus.definir', 'Definir as regras do bônus por meta dos vendedores (faixas e mês em que passam a valer)', 'metas');
  insert into public.papel_permissoes (papel, permissao) values ('dono', 'bonus.definir');
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Versões das regras do bônus
-- -----------------------------------------------------------------------------
create table public.bonus_regras (
  id uuid primary key default gen_random_uuid(),
  versao bigint generated always as identity unique,
  organizacao_id uuid not null references public.organizacoes (id),
  medida text not null check (medida in ('vendido_liquido', 'aparelhos', 'connect', 'acessorios')),
  vigente_desde date not null check (extract(day from vigente_desde) = 1),
  faixas jsonb check (faixas is null or (jsonb_typeof(faixas) = 'array' and jsonb_array_length(faixas) between 1 and 5)),
  motivo text check (motivo is null or length(motivo) between 3 and 300),
  definida_por uuid not null references public.perfis_usuario (id),
  definida_em timestamptz not null default now()
);
create index bonus_regras_vigente on public.bonus_regras (organizacao_id, medida, vigente_desde desc, versao desc);
create index bonus_regras_definida_por on public.bonus_regras (definida_por);
create trigger bonus_regras_sem_alteracao before update or delete on public.bonus_regras
  for each row execute function privado.so_insercao();
create trigger bonus_regras_sem_truncate before truncate on public.bonus_regras
  for each statement execute function privado.so_insercao();
create trigger bonus_regras_auditar after insert on public.bonus_regras
  for each row execute function privado.auditar_mudanca();

alter table public.bonus_regras enable row level security;
revoke all on public.bonus_regras from anon, authenticated;
grant select on public.bonus_regras to authenticated;
-- Toda a equipe da organização lê as regras: o vendedor precisa saber quanto vale bater a meta.
create policy bonus_regras_ler on public.bonus_regras for select to authenticated
  using (organizacao_id in (select v.organizacao_id from privado.vinculos_vigentes() v));

-- -----------------------------------------------------------------------------
-- 2. Definir (ou retirar) as regras de uma a quatro medidas, a partir de um mês
-- -----------------------------------------------------------------------------
-- p_faixas: {"medida": [{"a_partir_de": porcentagem da meta (1 a 500), "valor": bônus em centavos}, ...]
-- ou null para retirar}. Tudo ou nada. Medida com as mesmas faixas da regra que já vale no mês não cria
-- versão. Devolve quantas versões foram gravadas.
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

-- -----------------------------------------------------------------------------
-- 3. O bônus de cada vendedor no mês
-- -----------------------------------------------------------------------------
-- Uma medida: a maior faixa alcançada (realizado × 100 ≥ meta × porcentagem, em inteiros, sem
-- arredondar) e a próxima, com quanto falta para ela. Sem meta, sem faixa e sem bônus.
create or replace function privado.bonus_da_medida(p_meta bigint, p_realizado bigint, p_faixas jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with faixas as (
    select f.ordem::integer as faixa, (f.value ->> 'a_partir_de')::bigint as a_partir_de, (f.value ->> 'valor')::bigint as valor
    from jsonb_array_elements(p_faixas) with ordinality f(value, ordem)
    where p_meta is not null and p_meta > 0
  ),
  alcancada as (
    select x.faixa, x.valor from faixas x where p_realizado * 100 >= p_meta * x.a_partir_de order by x.faixa desc limit 1
  ),
  proxima as (
    select x.faixa, x.a_partir_de, x.valor from faixas x where p_realizado * 100 < p_meta * x.a_partir_de order by x.faixa limit 1
  )
  select jsonb_build_object(
    'meta', p_meta,
    'realizado', p_realizado,
    'faixa', (select a.faixa from alcancada a),
    'bonus', coalesce((select a.valor from alcancada a), 0),
    'proxima', (select jsonb_build_object('faixa', p.faixa, 'a_partir_de', p.a_partir_de, 'valor', p.valor,
                                          'falta', (p_meta * p.a_partir_de + 99) / 100 - p_realizado)
                from proxima p)
  );
$$;
revoke all on function privado.bonus_da_medida(bigint, bigint, jsonb) from public, anon;
grant execute on function privado.bonus_da_medida(bigint, bigint, jsonb) to authenticated;

create or replace function public.bonus_do_mes(p_mes date, p_unidade uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_org uuid;
  v_painel jsonb;
begin
  if p_mes is null or p_unidade is null then
    raise exception 'Informe o mês e a loja' using errcode = '22023';
  end if;
  if not (public.tem_permissao('metas.gerir', p_unidade) or public.tem_permissao('metas.ver_unidade', p_unidade)
          or public.tem_permissao('metas.ver_propria', p_unidade)) then
    raise exception 'Sem permissão para ver o bônus desta loja' using errcode = '42501';
  end if;
  select u.organizacao_id into v_org from public.unidades u where u.id = p_unidade;
  v_painel := public.metas_painel(v_mes, p_unidade);
  return (
    with
    regras as (
      select distinct on (r.medida) r.medida, r.vigente_desde, r.versao, r.faixas
      from public.bonus_regras r
      where r.organizacao_id = v_org and r.vigente_desde <= v_mes
      order by r.medida, r.vigente_desde desc, r.versao desc
    ),
    vigentes as (select g.medida, g.vigente_desde, g.versao, g.faixas from regras g where g.faixas is not null),
    vendedores as (
      select (x.value ->> 'vendedor_id')::uuid as vendedor_id, x.value -> 'metas' as metas, x.value -> 'realizado' as realizado, x.ordem
      from jsonb_array_elements(v_painel -> 'vendedores') with ordinality x(value, ordem)
    ),
    por_medida as (
      select w.vendedor_id, g.medida,
        privado.bonus_da_medida((w.metas ->> g.medida)::bigint, (w.realizado ->> g.medida)::bigint, g.faixas) as conta
      from vendedores w cross join vigentes g
    ),
    por_vendedor as (
      select w.vendedor_id, w.ordem,
        coalesce(jsonb_object_agg(p.medida, p.conta) filter (where p.medida is not null), '{}'::jsonb) as medidas,
        coalesce(sum((p.conta ->> 'bonus')::bigint), 0) as total
      from vendedores w left join por_medida p on p.vendedor_id = w.vendedor_id
      group by w.vendedor_id, w.ordem
    )
    select jsonb_build_object(
      'mes', to_char(v_mes, 'YYYY-MM-DD'),
      'regra_contagem', v_painel -> 'regra_contagem',
      'regras', coalesce((
        select jsonb_object_agg(g.medida, jsonb_build_object('vigente_desde', to_char(g.vigente_desde, 'YYYY-MM-DD'), 'versao', g.versao, 'faixas', g.faixas))
        from vigentes g), '{}'::jsonb),
      'vendedores', coalesce((
        select jsonb_agg(jsonb_build_object('vendedor_id', p.vendedor_id, 'medidas', p.medidas, 'total', p.total) order by p.ordem)
        from por_vendedor p), '[]'::jsonb)
    )
  );
end;
$$;
comment on function public.bonus_do_mes(date, uuid) is
  'Bônus por meta (L9a): as regras que valem no mês e, por vendedor e medida, a meta, o realizado de metas_painel, a faixa alcançada, o bônus e a próxima faixa, com as regras de leitura de quem chama (security invoker).';
revoke all on function public.bonus_do_mes(date, uuid) from public, anon;
grant execute on function public.bonus_do_mes(date, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. O extrato do vendedor: cada fato que soma o realizado do mês
-- -----------------------------------------------------------------------------
-- A mesma regra de contagem 1 de public.metas_painel, fato a fato: a venda concluída no mês (o total, os
-- aparelhos e os acessórios com o desconto do item); o cancelamento no mês de venda concluída (tudo
-- negativo); a devolução no mês (o valor devolvido, os aparelhos e os acessórios devolvidos); a operação
-- do Ora Connect confirmada no mês. Pela loja da venda e pelo vendedor de origem. As linhas vêm da mais
-- recente para a mais antiga, até 2.000; os totais somam todas.
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
