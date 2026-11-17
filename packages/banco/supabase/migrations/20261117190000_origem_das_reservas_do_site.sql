-- =============================================================================
-- Lote MKT-a (plano do proprietário de 16/11, Onda 2; ORA-ONLINE-003 e ORA-META-002): de onde veio a reserva do site.
--
-- A reserva do site guarda de onde o visitante chegou: a origem (Google, Instagram, Facebook, WhatsApp, TikTok,
-- YouTube, e-mail, outro site, outra campanha ou direto), os cinco parâmetros de campanha do link (utm_source,
-- utm_medium, utm_campaign, utm_content e utm_term) e o domínio do site que mandou o visitante. Nada disso identifica
-- a pessoa: é o que estava no link em que ela tocou.
--   * public.loja_reservas: as colunas novas, todas opcionais. As reservas de antes ficam sem origem ("sem registro");
--   * privado.campo_de_campanha(origem, campo): o texto de um parâmetro de campanha, limpo (minúsculas, espaços e
--     caracteres de controle viram um espaço, até 100 letras); o que não é texto fica vazio;
--   * public.loja_reservar: a do INTEG-c (20261117135133), com o parâmetro novo p_origem (jsonb, opcional, o último).
--     O banco limpa o que chega: a origem fora da lista e o domínio inválido ficam vazios, e a reserva segue. A origem
--     não entra na conferência da chave: a mesma chave devolve a mesma reserva. Quem chama sem o parâmetro (a versão
--     anterior do site) continua funcionando, e a reserva fica sem origem;
--   * public.reservas_do_site_painel(início, fim, loja): para os Relatórios, as reservas feitas no período por origem,
--     fonte e campanha (quantas, atendidas, canceladas, vencidas, e as vendas concluídas que vieram delas, com o valor)
--     e, por vendedor, as vendas concluídas que vieram das reservas. Lê com a permissão de quem pede (security
--     invoker): a reserva pelo RLS das reservas (venda.registrar na loja) e a venda pelo RLS das vendas.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

alter table public.loja_reservas
  add column origem text,
  add column utm_source text,
  add column utm_medium text,
  add column utm_campaign text,
  add column utm_content text,
  add column utm_term text,
  add column referencia text;
alter table public.loja_reservas
  add constraint loja_reserva_origem_valida check (origem is null or origem in
    ('direto', 'google', 'instagram', 'facebook', 'whatsapp', 'tiktok', 'youtube', 'email', 'outro_site', 'outra_campanha')),
  add constraint loja_reserva_campanha_valida check (
    (utm_source is null or (length(utm_source) between 1 and 100 and utm_source = lower(btrim(utm_source))))
    and (utm_medium is null or (length(utm_medium) between 1 and 100 and utm_medium = lower(btrim(utm_medium))))
    and (utm_campaign is null or (length(utm_campaign) between 1 and 100 and utm_campaign = lower(btrim(utm_campaign))))
    and (utm_content is null or (length(utm_content) between 1 and 100 and utm_content = lower(btrim(utm_content))))
    and (utm_term is null or (length(utm_term) between 1 and 100 and utm_term = lower(btrim(utm_term))))),
  add constraint loja_reserva_referencia_valida check (referencia is null or referencia ~ '^[a-z0-9]([a-z0-9.-]{0,98}[a-z0-9])?$');
comment on column public.loja_reservas.origem is
  'MKT-a: de onde o visitante chegou ao site (pela campanha do link ou pelo site que o mandou); nula nas reservas de antes de 17/11/2026.';
create index loja_reservas_criada on public.loja_reservas (unidade_id, criada_em);

create or replace function privado.campo_de_campanha(p_origem jsonb, p_campo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_origem -> p_campo) = 'string' then
    nullif(btrim(left(btrim(regexp_replace(lower(p_origem ->> p_campo), '[[:space:][:cntrl:]]+', ' ', 'g')), 100)), '')
  end;
$$;
revoke all on function privado.campo_de_campanha(jsonb, text) from public;

-- A assinatura muda (o parâmetro novo): a função antiga sai e a nova entra, com as mesmas permissões.
drop function public.loja_reservar(uuid, uuid, uuid, text, text, text);

create or replace function public.loja_reservar(
  p_organizacao uuid, p_variante uuid, p_unidade uuid, p_nome text, p_whatsapp text, p_chave text, p_origem jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nome text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_whatsapp text := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
  v_chave text := trim(coalesce(p_chave, ''));
  -- MKT-a: de onde o visitante chegou. O banco limpa o que vem do site; o que não serve fica vazio, sem recusar a reserva.
  v_origem text := case when jsonb_typeof(p_origem -> 'origem') = 'string' and p_origem ->> 'origem' in
    ('direto', 'google', 'instagram', 'facebook', 'whatsapp', 'tiktok', 'youtube', 'email', 'outro_site', 'outra_campanha')
    then p_origem ->> 'origem' end;
  v_referencia text := case when jsonb_typeof(p_origem -> 'referencia') = 'string'
    and lower(p_origem ->> 'referencia') ~ '^[a-z0-9]([a-z0-9.-]{0,98}[a-z0-9])?$' then lower(p_origem ->> 'referencia') end;
  v_tipo text;
  v_preco bigint;
  v_existente public.loja_reservas;
  v_item uuid;
  v_estoque uuid;
  v_codigo text;
  v_reserva public.loja_reservas;
begin
  if length(v_whatsapp) = 13 and left(v_whatsapp, 2) = '55' then
    v_whatsapp := substr(v_whatsapp, 3);
  end if;
  select p.tipo into v_tipo
  from public.variantes v join public.produtos p on p.id = v.produto_id
  where v.id = p_variante and v.ativa and p.organizacao_id = p_organizacao and p.publicar_online and p.ativo
    and p.tipo in ('aparelho', 'acessorio');
  if v_tipo is null then
    raise exception 'Produto não encontrado na loja online' using errcode = 'OR036';
  end if;
  if not exists (select 1 from public.unidades u where u.id = p_unidade and u.organizacao_id = p_organizacao
                   and u.tipo = 'loja_fisica' and u.status = 'ativa') then
    raise exception 'Loja não encontrada' using errcode = 'OR036';
  end if;
  v_preco := privado.preco_do_balcao(p_variante, p_unidade);
  if v_preco is null then
    raise exception 'Este produto não está à venda nesta loja' using errcode = 'OR036';
  end if;
  if length(v_nome) not between 2 and 80 then
    raise exception 'Informe o seu nome (de 2 a 80 letras)' using errcode = '22023';
  end if;
  if v_whatsapp !~ '^[1-9]{2}9[0-9]{8}$' then
    raise exception 'Informe um WhatsApp de celular com DDD (11 números)' using errcode = '22023';
  end if;
  if length(v_chave) not between 8 and 80 then
    raise exception 'Chave da reserva inválida' using errcode = '22023';
  end if;

  -- (0) A mesma chave devolve a mesma reserva; com outros dados, é recusada.
  perform pg_advisory_xact_lock(privado.trava_da_chave('loja_reservas', p_organizacao, v_chave));
  select * into v_existente from public.loja_reservas r where r.organizacao_id = p_organizacao and r.chave = v_chave;
  if found then
    if v_existente.variante_id <> p_variante or v_existente.unidade_id <> p_unidade or v_existente.nome <> v_nome
       or (select c.whatsapp from privado.loja_reservas_contato c where c.reserva_id = v_existente.id) is distinct from v_whatsapp then
      raise exception 'Esta reserva já foi feita com outros dados' using errcode = 'OR004';
    end if;
    return privado.reserva_do_site_em_json(v_existente);
  end if;

  -- (1) Os limites contra abuso: por WhatsApp (uma trava por número) e por loja.
  perform pg_advisory_xact_lock(privado.trava_da_chave('loja_reservas_whatsapp', p_organizacao, v_whatsapp));
  if (select count(*) from public.loja_reservas r join privado.loja_reservas_contato c on c.reserva_id = r.id
      where r.organizacao_id = p_organizacao and c.whatsapp = v_whatsapp and r.situacao = 'ativa' and r.expira_em > now()) >= 2 then
    raise exception 'Este WhatsApp já tem 2 reservas ativas: retire uma delas na loja ou espere vencer' using errcode = 'OR034';
  end if;
  -- #102 (INTEG-c): a cota da loja com uma trava por loja. Duas reservas ao mesmo tempo, com outros WhatsApp e outras
  -- chaves, contam uma depois da outra: a segunda espera a primeira terminar e vê a conta já com ela. A trava vem
  -- antes de qualquer trava de aparelho ou de saldo, sempre na mesma ordem.
  perform pg_advisory_xact_lock(privado.trava_da_chave('loja_reservas_loja', p_organizacao, p_unidade::text));
  if (select count(*) from public.loja_reservas r where r.unidade_id = p_unidade and r.criada_em > now() - interval '1 hour') >= 20 then
    raise exception 'Muitas reservas nesta loja agora: tente de novo daqui a pouco' using errcode = 'OR035';
  end if;

  -- (2) O estoque: as reservas vencidas desta loja e deste produto saem antes; depois, uma unidade fica segura.
  perform privado.expirar_reservas(p_unidade, p_variante);
  if v_tipo = 'aparelho' then
    select i.id into v_item from public.itens_serializados i
    where i.unidade_id = p_unidade and i.variante_id = p_variante and i.situacao = 'disponivel' and i.em_estoque
    order by i.criado_em, i.id
    limit 1
    for update skip locked;
    if v_item is null then
      raise exception 'Sem estoque nesta loja agora' using errcode = 'OR001';
    end if;
    update public.itens_serializados set situacao = 'reservado' where id = v_item;
  end if;
  update public.estoque_saldos s
  set reservado = s.reservado + 1, atualizado_em = now()
  where s.unidade_id = p_unidade and s.variante_id = p_variante and s.quantidade - s.reservado >= 1;
  if not found then
    raise exception 'Sem estoque nesta loja agora' using errcode = 'OR001';
  end if;
  insert into public.estoque_reservas (organizacao_id, unidade_id, variante_id, item_serializado_id, quantidade,
    origem, chave_idempotencia, expira_em, criado_por)
  values (p_organizacao, p_unidade, p_variante, v_item, 1, 'online', 'site:' || v_chave, now() + interval '24 hours', null)
  returning id into v_estoque;

  -- (3) A reserva do site, com um código que não se repete na empresa.
  loop
    v_codigo := privado.codigo_de_reserva();
    exit when not exists (select 1 from public.loja_reservas r where r.organizacao_id = p_organizacao and r.codigo = v_codigo);
  end loop;
  insert into public.loja_reservas (organizacao_id, unidade_id, variante_id, item_serializado_id, estoque_reserva_id, codigo,
    nome, whatsapp_mascarado, preco_centavos, expira_em, chave,
    origem, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referencia)
  values (p_organizacao, p_unidade, p_variante, v_item, v_estoque, v_codigo,
    v_nome, privado.mascara_telefone(v_whatsapp), v_preco, now() + interval '24 hours', v_chave,
    v_origem, privado.campo_de_campanha(p_origem, 'utm_source'), privado.campo_de_campanha(p_origem, 'utm_medium'),
    privado.campo_de_campanha(p_origem, 'utm_campaign'), privado.campo_de_campanha(p_origem, 'utm_content'),
    privado.campo_de_campanha(p_origem, 'utm_term'), v_referencia)
  returning * into v_reserva;
  insert into privado.loja_reservas_contato (reserva_id, whatsapp) values (v_reserva.id, v_whatsapp);
  return privado.reserva_do_site_em_json(v_reserva);
end;
$$;

revoke all on function public.loja_reservar(uuid, uuid, uuid, text, text, text, jsonb) from public;
grant execute on function public.loja_reservar(uuid, uuid, uuid, text, text, text, jsonb) to anon, authenticated;

create or replace function public.reservas_do_site_painel(p_inicio timestamptz, p_fim timestamptz, p_unidade uuid default null)
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
  reservas as (
    select coalesce(r.origem, 'sem_registro') as origem, r.utm_source as fonte, r.utm_campaign as campanha,
      r.situacao, r.expira_em, r.venda_id
    from public.loja_reservas r
    where r.criada_em >= p_inicio and r.criada_em < p_fim and (p_unidade is null or r.unidade_id = p_unidade)
  ),
  vendas as (
    select v.id, v.vendedor_id, v.total_centavos
    from public.vendas v
    where v.id in (select x.venda_id from reservas x where x.venda_id is not null) and v.situacao = 'concluida'
  ),
  por_origem as (
    select x.origem, x.fonte, x.campanha,
      count(*) as reservas,
      count(*) filter (where x.situacao = 'atendida') as atendidas,
      count(*) filter (where x.situacao = 'cancelada') as canceladas,
      count(*) filter (where x.situacao = 'ativa' and x.expira_em <= now()) as vencidas,
      count(v.id) as vendas,
      coalesce(sum(v.total_centavos), 0) as vendas_centavos
    from reservas x left join vendas v on v.id = x.venda_id
    group by x.origem, x.fonte, x.campanha
  ),
  por_vendedor as (
    select v.vendedor_id, count(*) as vendas, coalesce(sum(v.total_centavos), 0) as vendas_centavos
    from vendas v
    group by v.vendedor_id
  )
  select jsonb_build_object(
    'origens', coalesce((
      select jsonb_agg(jsonb_build_object('origem', o.origem, 'fonte', o.fonte, 'campanha', o.campanha, 'reservas', o.reservas,
        'atendidas', o.atendidas, 'canceladas', o.canceladas, 'vencidas', o.vencidas, 'vendas', o.vendas, 'vendas_centavos', o.vendas_centavos)
        order by o.reservas desc, o.origem, o.fonte nulls first, o.campanha nulls first)
      from por_origem o), '[]'::jsonb),
    'vendedores', coalesce((
      select jsonb_agg(jsonb_build_object('vendedor_id', p.vendedor_id, 'vendas', p.vendas, 'vendas_centavos', p.vendas_centavos)
        order by p.vendas_centavos desc, p.vendedor_id)
      from por_vendedor p), '[]'::jsonb))
  into resultado;
  return resultado;
end;
$$;
revoke all on function public.reservas_do_site_painel(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.reservas_do_site_painel(timestamptz, timestamptz, uuid) to authenticated;
