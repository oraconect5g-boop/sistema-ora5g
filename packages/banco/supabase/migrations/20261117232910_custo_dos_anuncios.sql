-- =============================================================================
-- Lote META-a (plano do proprietário de 16/11, Onda 3, item "Meta Ads", a parte que não depende do acesso à conta de
-- anúncios; ORA-META-001 por arquivo, ORA-META-003, ORA-META-004 e ORA-META-006). Decisão: ADR-017.
--
-- O custo dos anúncios entra por arquivo: o relatório exportado do Gerenciador de Anúncios da Meta (CSV ou Excel), com o
-- detalhamento por dia. A pessoa diz qual coluna é cada campo (nada é suposto do formato do arquivo) e o banco guarda o
-- gasto, as impressões, os cliques e os resultados de cada campanha em cada dia. Depois, o painel junta o custo da campanha
-- aos contatos que chegaram por ela (a reserva do site com a campanha do link, do MKT-a, e a oportunidade do CRM com a
-- campanha digitada por quem atende) e às vendas que vieram desses contatos.
--
--   * privado.chave_de_campanha(texto): o nome da campanha para comparar (minúsculas, sem acento, espaços simples); a
--     campanha do arquivo e a do link (utm_campaign) casam por ela;
--   * public.anuncios_importacoes: cada arquivo importado (a plataforma, o arquivo, a impressão digital SHA-256, o
--     período, as campanhas, o gasto, quantos dias de campanha foram substituídos, quem importou e quando);
--   * public.anuncios_custos: o custo de cada campanha em cada dia (a chave da campanha, o nome como veio, o gasto, as
--     impressões, os cliques e os resultados), com a importação que o gravou por último. O arquivo novo do mesmo dia e
--     da mesma campanha substitui o anterior: o mesmo dia nunca conta duas vezes;
--   * public.anuncios_importar: grava a importação e os dias de campanha (somando as linhas do mesmo dia e da mesma
--     campanha, quando o arquivo vem por conjunto ou por anúncio); o mesmo arquivo devolve a mesma importação. Só quem vê
--     o resultado da rede (resultado.ver: o dono);
--   * public.anuncios_painel(início, fim): por campanha, o gasto, as impressões, os cliques e os resultados do arquivo;
--     os contatos do período que chegaram por ela; as vendas concluídas que vieram desses contatos (uma venda conta uma
--     vez: se veio da reserva e da oportunidade, vale a campanha da reserva), a receita, a margem (dos itens com custo),
--     o que já foi recebido (dinheiro e cartão ou Pix conciliado) e os clientes novos; e o funil por loja e por vendedor.
--     Lê com a permissão de quem pede (security invoker): só o dono vê o resultado da rede.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function privado.chave_de_campanha(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(btrim(regexp_replace(
    translate(lower(coalesce(p_texto, '')), 'áàâãäåéèêëíìîïóòôõöúùûüçñ', 'aaaaaaeeeeiiiiooooouuuucn'),
    '[[:space:][:cntrl:]]+', ' ', 'g')), 100), '');
$$;
revoke all on function privado.chave_de_campanha(text) from public;
grant execute on function privado.chave_de_campanha(text) to authenticated;

create table public.anuncios_importacoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null references public.organizacoes (id),
  plataforma text not null check (plataforma in ('meta')),
  arquivo text not null check (length(arquivo) between 1 and 200),
  impressao text not null check (impressao ~ '^[0-9a-f]{64}$'),
  periodo_inicio date not null,
  periodo_fim date not null,
  linhas int not null check (linhas between 1 and 20000),
  campanhas int not null check (campanhas >= 1),
  dias_de_campanha int not null check (dias_de_campanha >= 1),
  substituidos int not null check (substituidos >= 0),
  gasto_centavos bigint not null check (gasto_centavos >= 0),
  mapeamento jsonb not null default '{}'::jsonb check (jsonb_typeof(mapeamento) = 'object'),
  importado_por uuid not null references public.perfis_usuario (id),
  importado_em timestamptz not null default now(),
  unique (organizacao_id, impressao),
  constraint anuncios_periodo check (periodo_fim >= periodo_inicio)
);
comment on table public.anuncios_importacoes is
  'META-a: cada arquivo de custo de anúncios importado (ADR-017), com o período, as campanhas, o gasto e quem importou.';
create index anuncios_importacoes_organizacao on public.anuncios_importacoes (organizacao_id, importado_em desc);
create index anuncios_importacoes_importado_por on public.anuncios_importacoes (importado_por);
create trigger anuncios_importacoes_auditar after insert on public.anuncios_importacoes
  for each row execute function privado.auditar_mudanca();

create table public.anuncios_custos (
  organizacao_id uuid not null references public.organizacoes (id),
  plataforma text not null check (plataforma in ('meta')),
  campanha_chave text not null check (campanha_chave = privado.chave_de_campanha(campanha_chave)),
  campanha text not null check (length(campanha) between 1 and 200 and campanha = btrim(campanha)),
  dia date not null,
  gasto_centavos bigint not null check (gasto_centavos between 0 and 100000000000),
  impressoes bigint check (impressoes is null or impressoes between 0 and 1000000000000),
  cliques bigint check (cliques is null or cliques between 0 and 1000000000000),
  resultados bigint check (resultados is null or resultados between 0 and 1000000000000),
  importacao_id uuid not null references public.anuncios_importacoes (id),
  atualizado_em timestamptz not null default now(),
  primary key (organizacao_id, plataforma, campanha_chave, dia)
);
comment on table public.anuncios_custos is
  'META-a: o custo de cada campanha em cada dia (ADR-017); o arquivo novo do mesmo dia e da mesma campanha substitui o anterior.';
create index anuncios_custos_importacao on public.anuncios_custos (importacao_id);
create index anuncios_custos_dia on public.anuncios_custos (organizacao_id, dia);

alter table public.anuncios_importacoes enable row level security;
alter table public.anuncios_custos enable row level security;
revoke all on public.anuncios_importacoes, public.anuncios_custos from anon, authenticated;
revoke all on sequence public.anuncios_importacoes_numero_seq from anon, authenticated;
grant select on public.anuncios_importacoes, public.anuncios_custos to authenticated;
-- Só quem vê o resultado da rede (o dono) vê o custo dos anúncios.
create policy anuncios_importacoes_ler on public.anuncios_importacoes for select to authenticated
  using (organizacao_id in (select privado.organizacoes_com_permissao('resultado.ver')));
create policy anuncios_custos_ler on public.anuncios_custos for select to authenticated
  using (organizacao_id in (select privado.organizacoes_com_permissao('resultado.ver')));

-- -----------------------------------------------------------------------------
-- A importação
-- -----------------------------------------------------------------------------
create or replace function public.anuncios_importar(
  p_plataforma text, p_arquivo text, p_impressao text, p_linhas jsonb, p_mapeamento jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  organizacao uuid;
  v_arquivo text := left(btrim(coalesce(p_arquivo, '')), 200);
  existente public.anuncios_importacoes;
  v_importacao public.anuncios_importacoes;
  invalidas int;
  v_dias jsonb;
  v_substituidos int;
begin
  select u.organizacao_id into organizacao from public.unidades u where u.id = (select public.unidade_atual());
  if usuario is null or organizacao is null or organizacao not in (select privado.organizacoes_com_permissao('resultado.ver')) then
    raise exception 'Sem permissão para o custo dos anúncios' using errcode = '42501';
  end if;
  if p_plataforma is null or p_plataforma not in ('meta') or length(v_arquivo) = 0 or coalesce(p_impressao, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Importação inválida' using errcode = '22023';
  end if;
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) not between 1 and 20000 then
    raise exception 'O arquivo leva de 1 a 20.000 linhas' using errcode = '22023';
  end if;
  -- O mesmo arquivo (a mesma impressão digital) devolve a mesma importação.
  perform pg_advisory_xact_lock(privado.trava_da_chave('anuncios', organizacao, p_impressao));
  select * into existente from public.anuncios_importacoes i where i.organizacao_id = organizacao and i.impressao = p_impressao;
  if found then
    return jsonb_build_object('importacao', existente.id, 'numero', existente.numero, 'campanhas', existente.campanhas,
      'dias_de_campanha', existente.dias_de_campanha, 'substituidos', existente.substituidos, 'repetido', true);
  end if;
  -- Cada linha: número, dia, campanha e gasto (em centavos); impressões, cliques e resultados, quando o arquivo traz.
  select count(*) into invalidas
  from jsonb_array_elements(p_linhas) l
  where jsonb_typeof(l) <> 'object'
     or coalesce(l ->> 'numero', '') !~ '^[1-9][0-9]{0,5}$'
     or coalesce(l ->> 'dia', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or privado.chave_de_campanha(l ->> 'campanha') is null or length(l ->> 'campanha') > 200
     or coalesce(l ->> 'gasto', '') !~ '^[0-9]{1,12}$'
     or (l ? 'impressoes' and l ->> 'impressoes' is not null and l ->> 'impressoes' !~ '^[0-9]{1,13}$')
     or (l ? 'cliques' and l ->> 'cliques' is not null and l ->> 'cliques' !~ '^[0-9]{1,13}$')
     or (l ? 'resultados' and l ->> 'resultados' is not null and l ->> 'resultados' !~ '^[0-9]{1,13}$');
  if invalidas > 0 then
    raise exception 'Linha do arquivo fora do formato' using errcode = '22023';
  end if;
  if (select count(distinct (l ->> 'numero')::int) from jsonb_array_elements(p_linhas) l) <> jsonb_array_length(p_linhas) then
    raise exception 'Linha repetida no arquivo' using errcode = '22023';
  end if;
  -- O mesmo dia da mesma campanha, em várias linhas (o arquivo por conjunto ou por anúncio), vira um dia de campanha só.
  select jsonb_agg(to_jsonb(x)) into v_dias
  from (
    select privado.chave_de_campanha(l ->> 'campanha') as chave, min(left(regexp_replace(btrim(l ->> 'campanha'), '\s+', ' ', 'g'), 200)) as campanha,
      (l ->> 'dia')::date as dia, sum((l ->> 'gasto')::bigint) as gasto, sum(nullif(l ->> 'impressoes', '')::bigint) as impressoes,
      sum(nullif(l ->> 'cliques', '')::bigint) as cliques, sum(nullif(l ->> 'resultados', '')::bigint) as resultados
    from jsonb_array_elements(p_linhas) l
    group by 1, 3
  ) x;
  select count(*) into v_substituidos
  from jsonb_to_recordset(v_dias) as a(chave text, dia date)
  join public.anuncios_custos c on c.organizacao_id = organizacao and c.plataforma = p_plataforma and c.campanha_chave = a.chave and c.dia = a.dia;
  perform set_config('ora.motivo', 'Custo de anúncios importado: ' || v_arquivo, true);
  insert into public.anuncios_importacoes (organizacao_id, plataforma, arquivo, impressao, periodo_inicio, periodo_fim, linhas, campanhas,
    dias_de_campanha, substituidos, gasto_centavos, mapeamento, importado_por)
  select organizacao, p_plataforma, v_arquivo, p_impressao, min(a.dia), max(a.dia), jsonb_array_length(p_linhas),
    count(distinct a.chave), count(*), v_substituidos, sum(a.gasto),
    case when jsonb_typeof(p_mapeamento) = 'object' then p_mapeamento else '{}'::jsonb end, usuario
  from jsonb_to_recordset(v_dias) as a(chave text, dia date, gasto bigint)
  returning * into v_importacao;
  insert into public.anuncios_custos (organizacao_id, plataforma, campanha_chave, campanha, dia, gasto_centavos, impressoes, cliques,
    resultados, importacao_id)
  select organizacao, p_plataforma, a.chave, a.campanha, a.dia, a.gasto, a.impressoes, a.cliques, a.resultados, v_importacao.id
  from jsonb_to_recordset(v_dias) as a(chave text, campanha text, dia date, gasto bigint, impressoes bigint, cliques bigint, resultados bigint)
  on conflict (organizacao_id, plataforma, campanha_chave, dia) do update
    set campanha = excluded.campanha, gasto_centavos = excluded.gasto_centavos, impressoes = excluded.impressoes,
      cliques = excluded.cliques, resultados = excluded.resultados, importacao_id = excluded.importacao_id, atualizado_em = now();
  return jsonb_build_object('importacao', v_importacao.id, 'numero', v_importacao.numero, 'campanhas', v_importacao.campanhas,
    'dias_de_campanha', v_importacao.dias_de_campanha, 'substituidos', v_importacao.substituidos, 'repetido', false);
exception when invalid_datetime_format or datetime_field_overflow then
  raise exception 'Dia fora do calendário no arquivo' using errcode = '22023';
end;
$$;
revoke all on function public.anuncios_importar(text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.anuncios_importar(text, text, text, jsonb, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- O painel: o custo de cada campanha junto aos contatos e às vendas que vieram dela
-- -----------------------------------------------------------------------------
create or replace function public.anuncios_painel(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  organizacao uuid;
  v_inicio timestamptz;
  v_fim timestamptz;
  resultado jsonb;
begin
  if p_inicio is null or p_fim is null or p_fim < p_inicio or p_fim - p_inicio > 400 then
    raise exception 'Período inválido: o fim vem depois do início e o período tem no máximo 400 dias' using errcode = '22023';
  end if;
  select u.organizacao_id into organizacao from public.unidades u where u.id = (select public.unidade_atual());
  if organizacao is null or organizacao not in (select privado.organizacoes_com_permissao('resultado.ver')) then
    raise exception 'Sem permissão para o custo dos anúncios' using errcode = '42501';
  end if;
  v_inicio := (p_inicio::timestamp at time zone 'America/Sao_Paulo');
  v_fim := ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo');
  with
  custos as (
    select c.campanha_chave as chave, max(c.campanha) as campanha, sum(c.gasto_centavos) as gasto, sum(c.impressoes) as impressoes,
      sum(c.cliques) as cliques, sum(c.resultados) as resultados, count(*) as dias
    from public.anuncios_custos c
    where c.organizacao_id = organizacao and c.plataforma = 'meta' and c.dia between p_inicio and p_fim
    group by c.campanha_chave
  ),
  -- Os contatos do período que dizem a campanha: a reserva do site (a campanha do link) e a oportunidade do CRM (a
  -- campanha digitada por quem atende).
  contatos as (
    select 'reserva' as tipo, r.id, privado.chave_de_campanha(r.utm_campaign) as chave, r.utm_campaign as nome, r.unidade_id, r.venda_id,
      r.criada_em as quando
    from public.loja_reservas r
    where r.organizacao_id = organizacao and r.criada_em >= v_inicio and r.criada_em < v_fim and r.utm_campaign is not null
    union all
    select 'oportunidade', o.id, privado.chave_de_campanha(o.campanha), o.campanha, o.unidade_id, o.venda_id, o.criado_em
    from public.oportunidades o
    where o.organizacao_id = organizacao and o.criado_em >= v_inicio and o.criado_em < v_fim and o.campanha is not null
  ),
  -- Uma venda conta uma vez: se veio de mais de um contato, vale a reserva (o clique no link) e, entre iguais, o mais recente.
  da_campanha as (
    select distinct on (c.venda_id) c.venda_id, c.chave
    from contatos c
    where c.venda_id is not null and c.chave is not null
    order by c.venda_id, (c.tipo = 'reserva') desc, c.quando desc
  ),
  vendas as (
    select x.chave, v.id, v.unidade_id, v.vendedor_id, v.cliente_id, v.total_centavos, v.concluida_em
    from da_campanha x
    join public.vendas v on v.id = x.venda_id and v.situacao = 'concluida'
  ),
  margens as (
    select i.venda_id,
      coalesce(sum(i.preco_unitario_centavos * i.quantidade - i.desconto_centavos - k.custo_unitario_centavos * i.quantidade)
        filter (where k.item_id is not null), 0) as margem,
      count(*) filter (where k.item_id is null) as itens_sem_custo
    from public.venda_itens i
    left join public.venda_itens_custos k on k.item_id = i.id
    where i.venda_id in (select v.id from vendas v)
    group by i.venda_id
  ),
  -- O que já é dinheiro de fato: o dinheiro no caixa e o cartão ou Pix conciliado (o líquido). O resto é estimativa.
  recebidos as (
    select p.venda_id, sum(case when p.situacao <> 'confirmado' then 0 when p.meio = 'dinheiro' then p.valor_centavos
      when p.conciliado_em is not null then coalesce(p.valor_liquido_centavos, 0) else 0 end) as recebido
    from public.venda_pagamentos p
    where p.venda_id in (select v.id from vendas v)
    group by p.venda_id
  ),
  -- Cliente novo: a venda da campanha é a primeira venda concluída do cliente.
  novos as (
    select v.id
    from vendas v
    where v.cliente_id is not null
      and not exists (select 1 from public.vendas a where a.cliente_id = v.cliente_id and a.situacao = 'concluida' and a.concluida_em < v.concluida_em)
  ),
  por_venda as (
    select v.*, coalesce(m.margem, 0) as margem, coalesce(m.itens_sem_custo, 0) as itens_sem_custo, coalesce(r.recebido, 0) as recebido,
      (v.id in (select n.id from novos n)) as cliente_novo
    from vendas v
    left join margens m on m.venda_id = v.id
    left join recebidos r on r.venda_id = v.id
  ),
  chaves as (
    select c.chave from custos c
    union
    select c.chave from contatos c where c.chave is not null
  ),
  por_campanha as (
    select k.chave,
      coalesce((select c.campanha from custos c where c.chave = k.chave), (select min(x.nome) from contatos x where x.chave = k.chave)) as campanha,
      coalesce(c.gasto, 0) as gasto, c.impressoes, c.cliques, c.resultados, coalesce(c.dias, 0) as dias,
      (select count(*) from contatos x where x.chave = k.chave and x.tipo = 'reserva') as reservas,
      (select count(*) from contatos x where x.chave = k.chave and x.tipo = 'oportunidade') as oportunidades,
      (select count(*) from por_venda v where v.chave = k.chave) as vendas,
      (select coalesce(sum(v.total_centavos), 0) from por_venda v where v.chave = k.chave) as receita,
      (select coalesce(sum(v.margem), 0) from por_venda v where v.chave = k.chave) as margem,
      (select count(*) from por_venda v where v.chave = k.chave and v.itens_sem_custo > 0) as vendas_sem_custo,
      (select coalesce(sum(v.recebido), 0) from por_venda v where v.chave = k.chave) as recebido,
      (select count(*) from por_venda v where v.chave = k.chave and v.cliente_novo) as clientes_novos
    from chaves k
    left join custos c on c.chave = k.chave
  )
  select jsonb_build_object(
    'campanhas', coalesce((select jsonb_agg(to_jsonb(p) order by p.gasto desc, p.vendas desc, p.chave) from por_campanha p), '[]'::jsonb),
    'por_loja', coalesce((
      select jsonb_agg(jsonb_build_object('chave', l.chave, 'unidade_id', l.unidade_id, 'loja', u.nome, 'contatos', l.contatos, 'vendas', l.vendas,
        'receita', l.receita) order by l.chave, l.receita desc, u.nome)
      from (
        select c.chave, c.unidade_id, count(*) as contatos,
          (select count(*) from por_venda v where v.chave = c.chave and v.unidade_id = c.unidade_id) as vendas,
          (select coalesce(sum(v.total_centavos), 0) from por_venda v where v.chave = c.chave and v.unidade_id = c.unidade_id) as receita
        from contatos c where c.chave is not null
        group by c.chave, c.unidade_id
      ) l
      join public.unidades u on u.id = l.unidade_id), '[]'::jsonb),
    'por_vendedor', coalesce((
      select jsonb_agg(jsonb_build_object('chave', x.chave, 'vendedor_id', x.vendedor_id, 'vendas', x.vendas, 'receita', x.receita)
        order by x.chave, x.receita desc, x.vendedor_id)
      from (select v.chave, v.vendedor_id, count(*) as vendas, sum(v.total_centavos) as receita from por_venda v group by v.chave, v.vendedor_id) x), '[]'::jsonb),
    'contatos_sem_campanha', (
      (select count(*) from public.loja_reservas r where r.organizacao_id = organizacao and r.criada_em >= v_inicio and r.criada_em < v_fim and r.utm_campaign is null)
      + (select count(*) from public.oportunidades o where o.organizacao_id = organizacao and o.criado_em >= v_inicio and o.criado_em < v_fim and o.campanha is null)),
    'importado_ate', (select max(c.dia) from public.anuncios_custos c where c.organizacao_id = organizacao and c.plataforma = 'meta'))
  into resultado;
  return resultado;
end;
$$;
revoke all on function public.anuncios_painel(date, date) from public, anon;
grant execute on function public.anuncios_painel(date, date) to authenticated;
