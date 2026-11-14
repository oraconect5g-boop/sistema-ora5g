-- =============================================================================
-- Metas mensais da loja e de cada vendedor (lote G4b: ORA-PERF-001 a ORA-PERF-005; linhas 18 a 20 da
-- matriz, X1 e X2)
--
-- Decisão do proprietário (13/11/2026; D-014 em parte): a meta é MENSAL, com o ritmo esperado do dia;
-- contam quatro medidas (valor vendido líquido, aparelhos, Ora Connect confirmado e acessórios); têm
-- meta a loja e cada vendedor; o dono define todas, e o gerente, as da própria loja. Bonificação e
-- comissão continuam fora (D-014 e P8).
--
-- 1) public.metas: uma linha por versão (só inserção: nada se altera nem se apaga). A meta vigente de
--    (loja, vendedor ou a loja inteira, mês, medida) é a versão mais recente (maior número de versão,
--    que segue a ordem de gravação mesmo dentro de uma transação). Valor nulo é a meta retirada ("meta
--    não definida"). Mês que já terminou não muda: o passado fica com a versão que valia.
-- 2) public.metas_definir: grava as versões de um alvo (a loja ou um vendedor) num mês, de uma a quatro
--    medidas, tudo ou nada, com metas.gerir na loja (o gerente passa a ter a permissão, na loja dele);
--    motivo obrigatório para mudar ou retirar uma meta que já existia. Auditada. Meta nova só para
--    quem vende na loja e não está bloqueado; retirar vale sempre (quem saiu da loja).
-- 3) public.metas_equipe: a equipe da loja (vínculo vigente de vendedor ou gerente, sem bloqueio) e
--    quem tem meta ou fato da loja no mês, com o nome, só para quem vê ou define as metas da loja. O
--    RLS de vínculos e de perfis não deixa o gerente listar a equipe.
-- 4) public.metas_painel: as metas vigentes do mês e o realizado, somado no banco com as regras de
--    leitura de quem chama (security invoker). Regra de contagem 1 (devolvida em regra_contagem):
--      vendido_liquido  vendas concluídas no mês − canceladas no mês − devolvidas no mês (centavos);
--      aparelhos        unidades de aparelho das vendas concluídas no mês − as devolvidas no mês − as
--                       das vendas canceladas no mês;
--      acessorios       o mesmo do líquido, só dos itens de acessório (centavos);
--      connect          operações do Ora Connect confirmadas no mês (ativação, portabilidade, recarga).
--    Cada fato no seu mês de São Paulo, pela loja da venda e pelo vendedor de origem. O número da loja
--    só vem para quem lê as vendas da loja (venda.ver_unidade ou venda.ver_todas); o vendedor recebe só
--    a própria linha.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

do $$
begin
  perform set_config('ora.motivo', 'Metas mensais: o gerente define as metas da própria loja (decisão do proprietário, 13/11/2026)', true);
  insert into public.papel_permissoes (papel, permissao) values ('gerente', 'metas.gerir') on conflict do nothing;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Versões das metas
-- -----------------------------------------------------------------------------
create table public.metas (
  id uuid primary key default gen_random_uuid(),
  versao bigint generated always as identity unique,
  organizacao_id uuid not null,
  unidade_id uuid not null,
  vendedor_id uuid references public.perfis_usuario (id),
  mes date not null check (extract(day from mes) = 1),
  medida text not null check (medida in ('vendido_liquido', 'aparelhos', 'connect', 'acessorios')),
  valor bigint check (valor is null or valor between 1 and 100000000000),
  regra_contagem smallint not null default 1 check (regra_contagem = 1),
  motivo text check (motivo is null or length(motivo) between 3 and 300),
  definida_por uuid not null references public.perfis_usuario (id),
  definida_em timestamptz not null default now(),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id)
);
create index metas_vigente on public.metas (unidade_id, mes, medida, vendedor_id, versao desc);
create index metas_vendedor on public.metas (vendedor_id);
create index metas_definida_por on public.metas (definida_por);
create trigger metas_sem_alteracao before update or delete on public.metas for each row execute function privado.so_insercao();
create trigger metas_auditar after insert on public.metas for each row execute function privado.auditar_mudanca();

alter table public.metas enable row level security;
revoke all on public.metas from anon, authenticated;
grant select on public.metas to authenticated;
-- Quem gere ou acompanha as metas da loja vê todas; o vendedor, só as próprias.
create policy metas_ler on public.metas for select to authenticated
  using ((select public.tem_permissao('metas.gerir', unidade_id))
         or (select public.tem_permissao('metas.ver_unidade', unidade_id))
         or (vendedor_id = (select auth.uid()) and (select public.tem_permissao('metas.ver_propria', unidade_id))));

-- -----------------------------------------------------------------------------
-- 2. Definir (ou retirar) as metas de um alvo: a loja inteira ou um vendedor, num mês
-- -----------------------------------------------------------------------------
-- p_valores: {"medida": valor inteiro (centavos ou unidades) ou null para retirar}, de uma a quatro
-- medidas. Tudo ou nada: uma medida recusada desfaz as outras da mesma chamada. Medida com o mesmo
-- valor da versão vigente não cria versão. Devolve quantas versões foram gravadas.
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

-- -----------------------------------------------------------------------------
-- 3. Quem aparece nas metas da loja no mês, com o nome
-- -----------------------------------------------------------------------------
-- A equipe atual (vínculo vigente de vendedor ou gerente, sem bloqueio: na_equipe = true, quem pode
-- receber meta nova) e quem tem meta ou fato da loja no mês sem estar na equipe (saiu da loja, ou o
-- dono vendeu): o painel nunca mostra um número sem nome. Só para quem vê ou define as metas da loja.
create or replace function public.metas_equipe(p_unidade uuid, p_mes date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_inicio timestamptz;
  v_fim timestamptz;
begin
  if p_unidade is null or p_mes is null
     or not (public.tem_permissao('metas.gerir', p_unidade) or public.tem_permissao('metas.ver_unidade', p_unidade)) then
    return '[]'::jsonb;
  end if;
  v_inicio := v_mes::timestamp at time zone 'America/Sao_Paulo';
  v_fim := (v_mes + interval '1 month')::timestamp at time zone 'America/Sao_Paulo';
  return (
    with
    equipe as (
      select v.usuario_id from public.vinculos v
      join public.perfis_usuario p on p.id = v.usuario_id and p.status = 'ativo'
      where v.unidade_id = p_unidade and v.escopo = 'unidade' and v.papel in ('vendedor', 'gerente')
        and v.inicio <= now() and (v.fim is null or v.fim > now())
    ),
    no_mes as (
      select m.vendedor_id as usuario_id from public.metas m where m.unidade_id = p_unidade and m.mes = v_mes
      union select v.vendedor_id from public.vendas v
        where v.unidade_id = p_unidade
          and ((v.concluida_em >= v_inicio and v.concluida_em < v_fim)
               or (v.concluida_em is not null and v.cancelada_em >= v_inicio and v.cancelada_em < v_fim))
      union select v.vendedor_id from public.venda_devolucoes d join public.vendas v on v.id = d.venda_id
        where v.unidade_id = p_unidade and d.criado_em >= v_inicio and d.criado_em < v_fim
      union select c.vendedor_id from public.connect_producao c
        where c.unidade_id = p_unidade and c.confirmado_em >= v_inicio and c.confirmado_em < v_fim
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'usuario_id', p.id, 'nome', p.nome, 'na_equipe', exists (select 1 from equipe e where e.usuario_id = p.id)
    ) order by p.nome, p.id), '[]'::jsonb)
    from public.perfis_usuario p
    where exists (select 1 from equipe e where e.usuario_id = p.id) or exists (select 1 from no_mes n where n.usuario_id = p.id)
  );
end;
$$;
revoke all on function public.metas_equipe(uuid, date) from public, anon;
grant execute on function public.metas_equipe(uuid, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Metas vigentes e realizado do mês
-- -----------------------------------------------------------------------------
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
