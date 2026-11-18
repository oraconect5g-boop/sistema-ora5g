-- =============================================================================
-- Lote MKTPL-a (plano do proprietário de 16/11, Onda 3, item "Marketplaces", a parte que não depende do contrato com os
-- canais; ORA-MKTPL-003 e ORA-MKTPL-005 por arquivo, ORA-MKTPL-008, e partes de ORA-MKTPL-004 e ORA-MKTPL-006).
-- Decisão: ADR-018.
--
-- Os pedidos do Mercado Livre, da Shopee e do TikTok Shop entram por arquivo: o relatório de vendas exportado do painel do
-- vendedor de cada canal. A pessoa diz qual coluna é cada campo (nada é suposto do formato de um canal) e o banco guarda
-- cada pedido com o número do canal (o mesmo número nunca vira dois pedidos), o valor bruto, as tarifas, o frete, os
-- reembolsos, o líquido e os itens, ligados ao catálogo pelos códigos de outros canais (CAT-009) ou pelo SKU.
--
--   * public.marketplace_importacoes: cada arquivo importado (o canal, o arquivo, a impressão digital SHA-256, o período,
--     quantos pedidos, quantos novos e quantos atualizados, quem importou e quando);
--   * public.marketplace_pedidos: o pedido do canal (o número do canal, a data, a situação como o canal escreve, o bruto,
--     as tarifas, o frete pago pelo vendedor, os reembolsos, o líquido e a data do repasse), com a importação que o
--     gravou por último. O arquivo novo com o mesmo pedido atualiza o pedido: a situação e os valores mudam, o pedido não
--     se repete;
--   * public.marketplace_pedido_itens: os itens do pedido (o código no canal, o título, a quantidade, o valor e a
--     variação do catálogo, quando o código ou o SKU casam); o arquivo novo do mesmo pedido troca os itens dele;
--   * public.marketplace_importar: grava a importação, os pedidos e os itens; o mesmo arquivo devolve a mesma importação.
--     Só quem vê o resultado da rede (resultado.ver: o dono);
--   * public.marketplace_painel(início, fim): por canal, por pedido e por produto: os pedidos, as unidades, o bruto, os
--     reembolsos, as tarifas, o frete, o líquido, o custo estimado (o custo do cadastro na data do pedido) e o lucro
--     estimado; e os itens sem produto ligado. Lê com a permissão de quem pede (security invoker).
-- Nada aqui mexe no estoque, na venda, na nota ou na comissão: o pedido do canal é registro para a conta da rede (ADR-018).
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create table public.marketplace_importacoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null references public.organizacoes (id),
  canal text not null check (canal in ('mercado_livre', 'shopee', 'tiktok_shop')),
  arquivo text not null check (length(arquivo) between 1 and 200),
  impressao text not null check (impressao ~ '^[0-9a-f]{64}$'),
  periodo_inicio date not null,
  periodo_fim date not null,
  linhas int not null check (linhas between 1 and 20000),
  pedidos int not null check (pedidos >= 1),
  novos int not null check (novos >= 0),
  atualizados int not null check (atualizados >= 0),
  mapeamento jsonb not null default '{}'::jsonb check (jsonb_typeof(mapeamento) = 'object'),
  importado_por uuid not null references public.perfis_usuario (id),
  importado_em timestamptz not null default now(),
  unique (organizacao_id, impressao),
  constraint marketplace_periodo check (periodo_fim >= periodo_inicio),
  constraint marketplace_contagens check (novos + atualizados = pedidos)
);
comment on table public.marketplace_importacoes is
  'MKTPL-a: cada relatório de vendas de um marketplace importado (ADR-018), com o período, os pedidos novos e atualizados e quem importou.';
create index marketplace_importacoes_organizacao on public.marketplace_importacoes (organizacao_id, importado_em desc);
create index marketplace_importacoes_importado_por on public.marketplace_importacoes (importado_por);
create trigger marketplace_importacoes_auditar after insert on public.marketplace_importacoes
  for each row execute function privado.auditar_mudanca();

create table public.marketplace_pedidos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id),
  canal text not null check (canal in ('mercado_livre', 'shopee', 'tiktok_shop')),
  id_externo text not null check (length(id_externo) between 1 and 80 and id_externo = btrim(id_externo) and id_externo !~ '[[:cntrl:][:space:]]'),
  data date not null,
  situacao_no_canal text check (situacao_no_canal is null or (length(situacao_no_canal) between 1 and 80 and situacao_no_canal = btrim(situacao_no_canal))),
  bruto_centavos bigint not null check (bruto_centavos between 0 and 100000000000),
  tarifas_centavos bigint check (tarifas_centavos is null or tarifas_centavos between 0 and 100000000000),
  frete_centavos bigint check (frete_centavos is null or frete_centavos between 0 and 100000000000),
  reembolsos_centavos bigint check (reembolsos_centavos is null or reembolsos_centavos between 0 and 100000000000),
  liquido_centavos bigint check (liquido_centavos is null or abs(liquido_centavos) <= 100000000000),
  data_repasse date,
  importacao_id uuid not null references public.marketplace_importacoes (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (organizacao_id, canal, id_externo)
);
comment on table public.marketplace_pedidos is
  'MKTPL-a: o pedido do marketplace pelo número do canal (ADR-018); o arquivo novo com o mesmo pedido atualiza, nunca repete.';
create index marketplace_pedidos_data on public.marketplace_pedidos (organizacao_id, data);
create index marketplace_pedidos_importacao on public.marketplace_pedidos (importacao_id);

create table public.marketplace_pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.marketplace_pedidos (id),
  organizacao_id uuid not null references public.organizacoes (id),
  numero int not null check (numero between 1 and 999999),
  codigo text check (codigo is null or (length(codigo) between 1 and 80 and codigo = btrim(codigo))),
  titulo text check (titulo is null or (length(titulo) between 1 and 200 and titulo = btrim(titulo))),
  variante_id uuid,
  quantidade int not null check (quantidade between 1 and 100000),
  valor_centavos bigint not null check (valor_centavos between 0 and 100000000000),
  unique (pedido_id, numero),
  foreign key (variante_id, organizacao_id) references public.variantes (id, organizacao_id)
);
comment on table public.marketplace_pedido_itens is
  'MKTPL-a: os itens do pedido do marketplace (ADR-018), ligados ao catálogo pelo código do canal (CAT-009) ou pelo SKU; o arquivo novo troca os itens do pedido.';
create index marketplace_pedido_itens_organizacao on public.marketplace_pedido_itens (organizacao_id);
create index marketplace_pedido_itens_variante on public.marketplace_pedido_itens (variante_id, organizacao_id);

alter table public.marketplace_importacoes enable row level security;
alter table public.marketplace_pedidos enable row level security;
alter table public.marketplace_pedido_itens enable row level security;
revoke all on public.marketplace_importacoes, public.marketplace_pedidos, public.marketplace_pedido_itens from anon, authenticated;
revoke all on sequence public.marketplace_importacoes_numero_seq from anon, authenticated;
grant select on public.marketplace_importacoes, public.marketplace_pedidos, public.marketplace_pedido_itens to authenticated;
-- Só quem vê o resultado da rede (o dono) vê os pedidos dos marketplaces.
create policy marketplace_importacoes_ler on public.marketplace_importacoes for select to authenticated
  using (organizacao_id in (select privado.organizacoes_com_permissao('resultado.ver')));
create policy marketplace_pedidos_ler on public.marketplace_pedidos for select to authenticated
  using (organizacao_id in (select privado.organizacoes_com_permissao('resultado.ver')));
create policy marketplace_pedido_itens_ler on public.marketplace_pedido_itens for select to authenticated
  using (organizacao_id in (select privado.organizacoes_com_permissao('resultado.ver')));

-- -----------------------------------------------------------------------------
-- A importação
-- -----------------------------------------------------------------------------
-- p_pedidos: os pedidos já agrupados pela tela (cada um com os itens): {id_externo, data, situacao, bruto, tarifas, frete,
-- reembolsos, liquido, data_repasse, itens: [{numero, codigo, titulo, quantidade, valor}]}. O banco confere tudo de novo.
create or replace function public.marketplace_importar(
  p_canal text, p_arquivo text, p_impressao text, p_linhas int, p_pedidos jsonb, p_mapeamento jsonb
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
  existente public.marketplace_importacoes;
  v_importacao public.marketplace_importacoes;
  invalidos int;
  v_novos int;
begin
  select u.organizacao_id into organizacao from public.unidades u where u.id = (select public.unidade_atual());
  if usuario is null or organizacao is null or organizacao not in (select privado.organizacoes_com_permissao('resultado.ver')) then
    raise exception 'Sem permissão para os pedidos dos marketplaces' using errcode = '42501';
  end if;
  if p_canal is null or p_canal not in ('mercado_livre', 'shopee', 'tiktok_shop') or length(v_arquivo) = 0
     or coalesce(p_impressao, '') !~ '^[0-9a-f]{64}$' or p_linhas is null or p_linhas not between 1 and 20000 then
    raise exception 'Importação inválida' using errcode = '22023';
  end if;
  if p_pedidos is null or jsonb_typeof(p_pedidos) <> 'array' or jsonb_array_length(p_pedidos) not between 1 and 20000 then
    raise exception 'O arquivo leva de 1 a 20.000 pedidos' using errcode = '22023';
  end if;
  -- O mesmo arquivo (a mesma impressão digital) devolve a mesma importação.
  perform pg_advisory_xact_lock(privado.trava_da_chave('marketplace', organizacao, p_impressao));
  select * into existente from public.marketplace_importacoes i where i.organizacao_id = organizacao and i.impressao = p_impressao;
  if found then
    return jsonb_build_object('importacao', existente.id, 'numero', existente.numero, 'pedidos', existente.pedidos, 'novos', existente.novos,
      'atualizados', existente.atualizados, 'repetido', true);
  end if;
  -- Cada pedido: o número do canal, a data, os valores em centavos e ao menos um item; cada item com quantidade e valor.
  select count(*) into invalidos
  from jsonb_array_elements(p_pedidos) p
  where jsonb_typeof(p) <> 'object'
     or coalesce(p ->> 'id_externo', '') !~ '^[^[:space:][:cntrl:]]{1,80}$'
     or coalesce(p ->> 'data', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or (p ? 'situacao' and p ->> 'situacao' is not null and length(btrim(p ->> 'situacao')) not between 1 and 80)
     or coalesce(p ->> 'bruto', '') !~ '^[0-9]{1,12}$'
     or (p ? 'tarifas' and p ->> 'tarifas' is not null and p ->> 'tarifas' !~ '^[0-9]{1,12}$')
     or (p ? 'frete' and p ->> 'frete' is not null and p ->> 'frete' !~ '^[0-9]{1,12}$')
     or (p ? 'reembolsos' and p ->> 'reembolsos' is not null and p ->> 'reembolsos' !~ '^[0-9]{1,12}$')
     or (p ? 'liquido' and p ->> 'liquido' is not null and p ->> 'liquido' !~ '^-?[0-9]{1,12}$')
     or (p ? 'data_repasse' and p ->> 'data_repasse' is not null and p ->> 'data_repasse' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
     or jsonb_typeof(p -> 'itens') is distinct from 'array' or jsonb_array_length(p -> 'itens') not between 1 and 500
     or exists (
       select 1 from jsonb_array_elements(p -> 'itens') i
       where jsonb_typeof(i) <> 'object'
          or coalesce(i ->> 'numero', '') !~ '^[1-9][0-9]{0,5}$'
          or coalesce(i ->> 'quantidade', '') !~ '^[1-9][0-9]{0,4}$'
          or coalesce(i ->> 'valor', '') !~ '^[0-9]{1,12}$'
          or length(coalesce(i ->> 'codigo', '')) > 80 or length(coalesce(i ->> 'titulo', '')) > 200);
  if invalidos > 0 then
    raise exception 'Pedido do arquivo fora do formato' using errcode = '22023';
  end if;
  if (select count(distinct p ->> 'id_externo') from jsonb_array_elements(p_pedidos) p) <> jsonb_array_length(p_pedidos) then
    raise exception 'Pedido repetido no arquivo' using errcode = '22023';
  end if;
  select count(*) into v_novos
  from jsonb_array_elements(p_pedidos) p
  where not exists (select 1 from public.marketplace_pedidos m where m.organizacao_id = organizacao and m.canal = p_canal and m.id_externo = p ->> 'id_externo');
  perform set_config('ora.motivo', 'Pedidos de marketplace importados: ' || v_arquivo, true);
  insert into public.marketplace_importacoes (organizacao_id, canal, arquivo, impressao, periodo_inicio, periodo_fim, linhas, pedidos, novos, atualizados,
    mapeamento, importado_por)
  select organizacao, p_canal, v_arquivo, p_impressao, min((p ->> 'data')::date), max((p ->> 'data')::date), p_linhas, count(*), v_novos, count(*) - v_novos,
    case when jsonb_typeof(p_mapeamento) = 'object' then p_mapeamento else '{}'::jsonb end, usuario
  from jsonb_array_elements(p_pedidos) p
  returning * into v_importacao;
  -- O pedido novo entra; o que já existia é atualizado (a situação e os valores do arquivo mais novo).
  insert into public.marketplace_pedidos as m (organizacao_id, canal, id_externo, data, situacao_no_canal, bruto_centavos, tarifas_centavos, frete_centavos,
    reembolsos_centavos, liquido_centavos, data_repasse, importacao_id)
  select organizacao, p_canal, p ->> 'id_externo', (p ->> 'data')::date, nullif(btrim(regexp_replace(coalesce(p ->> 'situacao', ''), '\s+', ' ', 'g')), ''),
    (p ->> 'bruto')::bigint, nullif(p ->> 'tarifas', '')::bigint, nullif(p ->> 'frete', '')::bigint, nullif(p ->> 'reembolsos', '')::bigint,
    nullif(p ->> 'liquido', '')::bigint, nullif(p ->> 'data_repasse', '')::date, v_importacao.id
  from jsonb_array_elements(p_pedidos) p
  on conflict (organizacao_id, canal, id_externo) do update
    set data = excluded.data, situacao_no_canal = excluded.situacao_no_canal, bruto_centavos = excluded.bruto_centavos,
      tarifas_centavos = excluded.tarifas_centavos, frete_centavos = excluded.frete_centavos, reembolsos_centavos = excluded.reembolsos_centavos,
      liquido_centavos = excluded.liquido_centavos, data_repasse = excluded.data_repasse, importacao_id = excluded.importacao_id, atualizado_em = now();
  -- Os itens do pedido vêm do arquivo mais novo: os de antes saem e os do arquivo entram, ligados ao catálogo pelo código
  -- do canal (CAT-009, ativo) ou pelo SKU da variação.
  delete from public.marketplace_pedido_itens i
  using public.marketplace_pedidos m
  where i.pedido_id = m.id and m.organizacao_id = organizacao and m.canal = p_canal and m.importacao_id = v_importacao.id;
  insert into public.marketplace_pedido_itens (pedido_id, organizacao_id, numero, codigo, titulo, variante_id, quantidade, valor_centavos)
  select m.id, organizacao, (i ->> 'numero')::int, nullif(btrim(i ->> 'codigo'), ''),
    nullif(btrim(regexp_replace(left(coalesce(i ->> 'titulo', ''), 200), '\s+', ' ', 'g')), ''),
    coalesce(
      (select c.variante_id from public.variante_codigos_externos c
       where c.organizacao_id = organizacao and c.canal = p_canal and c.desligado_em is null
         and (lower(c.codigo) = lower(btrim(i ->> 'codigo')) or lower(c.sku_no_canal) = lower(btrim(i ->> 'codigo')))
       order by c.ligado_em, c.id limit 1),
      (select v.id from public.variantes v where v.organizacao_id = organizacao and lower(v.sku) = lower(btrim(i ->> 'codigo')) limit 1)),
    (i ->> 'quantidade')::int, (i ->> 'valor')::bigint
  from jsonb_array_elements(p_pedidos) p
  join public.marketplace_pedidos m on m.organizacao_id = organizacao and m.canal = p_canal and m.id_externo = p ->> 'id_externo'
  cross join lateral jsonb_array_elements(p -> 'itens') i;
  return jsonb_build_object('importacao', v_importacao.id, 'numero', v_importacao.numero, 'pedidos', v_importacao.pedidos, 'novos', v_importacao.novos,
    'atualizados', v_importacao.atualizados, 'repetido', false);
exception when invalid_datetime_format or datetime_field_overflow then
  raise exception 'Data fora do calendário no arquivo' using errcode = '22023';
end;
$$;
revoke all on function public.marketplace_importar(text, text, text, int, jsonb, jsonb) from public, anon;
grant execute on function public.marketplace_importar(text, text, text, int, jsonb, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- O painel: por canal, por anúncio e por pedido, o bruto, o líquido, o custo e o lucro estimados
-- -----------------------------------------------------------------------------
create or replace function public.marketplace_painel(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  organizacao uuid;
  resultado jsonb;
begin
  if p_inicio is null or p_fim is null or p_fim < p_inicio or p_fim - p_inicio > 400 then
    raise exception 'Período inválido: o fim vem depois do início e o período tem no máximo 400 dias' using errcode = '22023';
  end if;
  select u.organizacao_id into organizacao from public.unidades u where u.id = (select public.unidade_atual());
  if organizacao is null or organizacao not in (select privado.organizacoes_com_permissao('resultado.ver')) then
    raise exception 'Sem permissão para os pedidos dos marketplaces' using errcode = '42501';
  end if;
  with
  pedidos as (
    select m.*,
      -- O líquido do arquivo; sem ele, o bruto menos as tarifas, o frete e os reembolsos (estimado).
      coalesce(m.liquido_centavos, m.bruto_centavos - coalesce(m.tarifas_centavos, 0) - coalesce(m.frete_centavos, 0) - coalesce(m.reembolsos_centavos, 0)) as liquido,
      (m.liquido_centavos is null) as liquido_estimado,
      -- Reembolsado por inteiro: o produto voltou ou não saiu, e o custo não conta.
      (m.bruto_centavos > 0 and coalesce(m.reembolsos_centavos, 0) >= m.bruto_centavos) as reembolsado
    from public.marketplace_pedidos m
    where m.organizacao_id = organizacao and m.data between p_inicio and p_fim
  ),
  itens as (
    select i.*, p.canal, p.reembolsado,
      -- O custo do cadastro que valia no dia do pedido (o custo de agora não reescreve o passado).
      (select c.valor_centavos from public.custos c
       where c.variante_id = i.variante_id and c.inicio < ((p.data + 1)::timestamp at time zone 'America/Sao_Paulo')
       order by c.inicio desc, c.criado_em desc, c.id desc limit 1) as custo_unitario,
      -- A parte do item no líquido do pedido, pelo valor dele no bruto.
      case when p.bruto_centavos > 0 then round(i.valor_centavos::numeric * p.liquido / p.bruto_centavos)::bigint else 0 end as liquido_do_item
    from public.marketplace_pedido_itens i
    join pedidos p on p.id = i.pedido_id
  ),
  por_pedido as (
    select p.id, p.canal, p.id_externo, p.data, p.situacao_no_canal, p.bruto_centavos as bruto, coalesce(p.tarifas_centavos, 0) as tarifas,
      coalesce(p.frete_centavos, 0) as frete, coalesce(p.reembolsos_centavos, 0) as reembolsos, p.liquido, p.liquido_estimado, p.data_repasse,
      coalesce((select sum(i.quantidade) from itens i where i.pedido_id = p.id), 0) as unidades,
      (select count(*) from itens i where i.pedido_id = p.id and (i.variante_id is null or i.custo_unitario is null)) as itens_sem_custo,
      case when p.reembolsado then 0 else (select sum(i.quantidade * i.custo_unitario) from itens i where i.pedido_id = p.id) end as custo
    from pedidos p
  ),
  -- O lucro estimado só existe quando todo item do pedido tem custo (ou o pedido foi reembolsado por inteiro).
  com_lucro as (
    select x.*, case when x.itens_sem_custo = 0 or x.custo = 0 and x.bruto > 0 and x.reembolsos >= x.bruto then x.liquido - coalesce(x.custo, 0) end as lucro
    from por_pedido x
  ),
  por_canal as (
    select x.canal, count(*) as pedidos, sum(x.unidades) as unidades, sum(x.bruto) as bruto, sum(x.reembolsos) as reembolsos, sum(x.tarifas) as tarifas,
      sum(x.frete) as frete, sum(x.liquido) as liquido, count(*) filter (where x.liquido_estimado) as liquidos_estimados,
      coalesce(sum(x.custo) filter (where x.lucro is not null), 0) as custo, coalesce(sum(x.lucro), 0) as lucro,
      count(*) filter (where x.lucro is null) as pedidos_sem_custo
    from com_lucro x
    group by x.canal
  ),
  por_anuncio as (
    select i.canal, coalesce(i.codigo, '—') as codigo, min(i.titulo) as titulo, i.variante_id, sum(i.quantidade) as unidades, sum(i.valor_centavos) as bruto,
      sum(i.liquido_do_item) as liquido,
      sum(case when i.reembolsado then 0 else i.quantidade * i.custo_unitario end) as custo,
      bool_or(i.variante_id is null or (i.custo_unitario is null and not i.reembolsado)) as sem_custo
    from itens i
    group by i.canal, coalesce(i.codigo, '—'), i.variante_id
  )
  select jsonb_build_object(
    'canais', coalesce((select jsonb_agg(to_jsonb(c) order by c.bruto desc, c.canal) from por_canal c), '[]'::jsonb),
    'anuncios', coalesce((
      select jsonb_agg(jsonb_build_object('canal', a.canal, 'codigo', a.codigo, 'titulo', a.titulo, 'variante_id', a.variante_id, 'produto', v.nome,
        'unidades', a.unidades, 'bruto', a.bruto, 'liquido', a.liquido, 'custo', case when a.sem_custo then null else a.custo end,
        'lucro', case when a.sem_custo then null else a.liquido - coalesce(a.custo, 0) end) order by a.bruto desc, a.canal, a.codigo)
      from (select * from por_anuncio order by bruto desc limit 200) a
      left join public.variantes v on v.id = a.variante_id), '[]'::jsonb),
    'pedidos', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'canal', x.canal, 'id_externo', x.id_externo, 'data', x.data, 'situacao', x.situacao_no_canal,
        'bruto', x.bruto, 'tarifas', x.tarifas, 'frete', x.frete, 'reembolsos', x.reembolsos, 'liquido', x.liquido, 'liquido_estimado', x.liquido_estimado,
        'data_repasse', x.data_repasse, 'unidades', x.unidades, 'custo', case when x.lucro is null then null else coalesce(x.custo, 0) end, 'lucro', x.lucro,
        'itens_sem_custo', x.itens_sem_custo) order by x.data desc, x.id_externo desc)
      from (select * from com_lucro order by data desc, id_externo desc limit 200) x), '[]'::jsonb),
    'pedidos_no_periodo', (select count(*) from pedidos),
    'itens_sem_produto', (select count(*) from itens i where i.variante_id is null))
  into resultado;
  return resultado;
end;
$$;
revoke all on function public.marketplace_painel(date, date) from public, anon;
grant execute on function public.marketplace_painel(date, date) to authenticated;
