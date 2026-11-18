-- =============================================================================
-- Lote ONLINE-d (aceites A03 e A06 do adendo do Codex de 16/11; a orientação da auditoria de 17/11, "Loja online";
-- ORA-ONLINE-002 e ORA-ONLINE-006): o pedido do site com carrinho, reservado de uma vez para retirar e pagar na loja.
-- Decisão: ADR-023 (amplia a ADR-009, sem o pagamento online, que espera o provedor: E1).
--
--   * public.loja_pedidos e privado.loja_pedidos_contato: o pedido (a loja de retirada, o código, o nome, o WhatsApp à
--     parte, de 1 a 3 unidades, o total do balcão, 24 horas) e o WhatsApp dele; loja_reservas.pedido_id liga cada unidade;
--   * privado.reservar_unidade_do_site: a regra de reservar uma unidade que era o passo (2) do loja_reservar, sem mudança,
--     agora usada pela reserva avulsa e pelo pedido (um escritor só; lição do #87);
--   * public.loja_reservar: o texto em vigor (20261117174218), com o passo (2) na função privada e o limite do WhatsApp
--     contando os compromissos (cada reserva avulsa e cada pedido contam um);
--   * public.loja_pedir: o visitante reserva o carrinho de uma vez ou nada (OR001), com as travas na ordem de sempre
--     (o WhatsApp: OR034; a loja: OR035) e a mesma chave devolvendo o mesmo pedido (outros dados: OR004);
--   * public.loja_pedido_consultar: o visitante acompanha pelo código e pelo WhatsApp (sem o par certo, nulo);
--   * public.loja_pedido_atender e public.loja_pedido_cancelar: a loja de retirada atende numa venda só ou cancela;
--   * public.loja_reserva_atender e public.loja_reserva_cancelar: o texto em vigor (20261116093359), recusando a
--     reserva que é de um pedido (ela sai e volta junto com o pedido).
-- As três definições em vigor foram conferidas contra o banco de desenvolvimento (md5 do corpo) antes da cópia.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- O pedido do site e o contato dele
-- -----------------------------------------------------------------------------
create table public.loja_pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null,
  unidade_id uuid not null,
  codigo text not null check (codigo ~ '^[A-HJ-NP-Z2-9]{6}$'),
  nome text not null check (length(nome) between 2 and 80 and nome = trim(nome)),
  whatsapp_mascarado text not null,
  unidades int not null check (unidades between 1 and 3),
  total_centavos bigint not null check (total_centavos >= 0),
  situacao text not null default 'reservado' check (situacao in ('reservado', 'atendido', 'cancelado')),
  expira_em timestamptz not null,
  chave text not null check (length(chave) between 8 and 76 and chave = trim(chave)),
  criado_em timestamptz not null default now(),
  atendido_em timestamptz,
  atendido_por uuid references public.perfis_usuario (id),
  venda_id uuid references public.vendas (id),
  cancelado_em timestamptz,
  cancelado_por uuid references public.perfis_usuario (id),
  motivo_cancelamento text check (motivo_cancelamento is null or length(motivo_cancelamento) between 3 and 200),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  unique (organizacao_id, codigo),
  unique (organizacao_id, chave),
  constraint loja_pedido_atendido_coerente check (
    (situacao = 'atendido') = (atendido_em is not null) and (atendido_em is null) = (venda_id is null)
    and (atendido_em is null) = (atendido_por is null)),
  constraint loja_pedido_cancelado_coerente check (
    (situacao = 'cancelado') = (cancelado_em is not null) and (cancelado_em is null) = (motivo_cancelamento is null))
);
comment on table public.loja_pedidos is
  'ONLINE-d: o pedido do site (o carrinho reservado de uma vez para retirar e pagar na loja; ADR-023). Cada unidade é uma reserva do site ligada a ele.';
create index loja_pedidos_da_loja on public.loja_pedidos (unidade_id, situacao, expira_em);
create index loja_pedidos_unidade_organizacao on public.loja_pedidos (unidade_id, organizacao_id);
create index loja_pedidos_atendido_por on public.loja_pedidos (atendido_por);
create index loja_pedidos_cancelado_por on public.loja_pedidos (cancelado_por);
create index loja_pedidos_venda on public.loja_pedidos (venda_id);

create table privado.loja_pedidos_contato (
  pedido_id uuid primary key references public.loja_pedidos (id),
  whatsapp text not null check (whatsapp ~ '^[1-9]{2}9[0-9]{8}$')
);
create index loja_pedidos_contato_whatsapp on privado.loja_pedidos_contato (whatsapp);

alter table public.loja_reservas add column pedido_id uuid references public.loja_pedidos (id);
create index loja_reservas_pedido on public.loja_reservas (pedido_id);

alter table public.loja_pedidos enable row level security;
alter table privado.loja_pedidos_contato enable row level security;
revoke all on public.loja_pedidos from anon, authenticated;
revoke all on sequence public.loja_pedidos_numero_seq from anon, authenticated;
revoke all on privado.loja_pedidos_contato from anon, authenticated;
grant select on public.loja_pedidos to authenticated;
revoke all on privado.loja_pedidos_contato from public;
-- Quem vende na loja vê os pedidos dela (a mesma regra da tabela das reservas do site).
create policy loja_pedidos_ler on public.loja_pedidos for select to authenticated
  using (unidade_id in (select privado.unidades_com_permissao('venda.registrar')));

-- -----------------------------------------------------------------------------
-- Auxiliares
-- -----------------------------------------------------------------------------
-- Os compromissos ativos de um WhatsApp: cada reserva avulsa ativa e cada pedido reservado ativo contam um.
create or replace function privado.compromissos_do_whatsapp(p_organizacao uuid, p_whatsapp text)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select ((select count(*) from public.loja_reservas r join privado.loja_reservas_contato c on c.reserva_id = r.id
           where r.organizacao_id = p_organizacao and c.whatsapp = p_whatsapp and r.situacao = 'ativa' and r.expira_em > now()
             and r.pedido_id is null)
        + (select count(*) from public.loja_pedidos p join privado.loja_pedidos_contato c on c.pedido_id = p.id
           where p.organizacao_id = p_organizacao and c.whatsapp = p_whatsapp and p.situacao = 'reservado' and p.expira_em > now()))::int;
$$;
revoke all on function privado.compromissos_do_whatsapp(uuid, text) from public, anon, authenticated;

-- Uma unidade reservada para o site: a regra que era o passo (2) do loja_reservar, sem mudança. As reservas vencidas
-- desta loja e deste produto saem antes; depois, o aparelho (o mais antigo livre, sem esperar trava) ou o saldo fica
-- seguro, e a reserva de estoque de origem "online" é gravada. Um escritor só para a reserva avulsa e o pedido.
create or replace function privado.reservar_unidade_do_site(
  p_organizacao uuid, p_unidade uuid, p_variante uuid, p_tipo text, p_chave_estoque text, p_expira_em timestamptz
)
returns table (item uuid, estoque uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item uuid;
  v_estoque uuid;
begin
  perform privado.expirar_reservas(p_unidade, p_variante);
  if p_tipo = 'aparelho' then
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
  values (p_organizacao, p_unidade, p_variante, v_item, 1, 'online', p_chave_estoque, p_expira_em, null)
  returning id into v_estoque;
  item := v_item;
  estoque := v_estoque;
  return next;
end;
$$;
revoke all on function privado.reservar_unidade_do_site(uuid, uuid, uuid, text, text, timestamptz) from public, anon, authenticated;

-- Um código de reserva ou de pedido que não se repete na empresa, nem entre as reservas e os pedidos.
create or replace function privado.codigo_do_site(p_organizacao uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_codigo text;
begin
  loop
    v_codigo := privado.codigo_de_reserva();
    exit when not exists (select 1 from public.loja_reservas r where r.organizacao_id = p_organizacao and r.codigo = v_codigo)
      and not exists (select 1 from public.loja_pedidos p where p.organizacao_id = p_organizacao and p.codigo = v_codigo);
  end loop;
  return v_codigo;
end;
$$;
revoke all on function privado.codigo_do_site(uuid) from public, anon, authenticated;

-- O que o visitante vê do pedido (sem o nome nem o WhatsApp). O pedido reservado que passou da hora aparece vencido.
create or replace function privado.pedido_do_site_em_json(p_pedido public.loja_pedidos)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'codigo', p_pedido.codigo,
    'situacao', case when p_pedido.situacao = 'reservado' and p_pedido.expira_em <= now() then 'vencido' else p_pedido.situacao end,
    'expira_em', p_pedido.expira_em, 'total_centavos', p_pedido.total_centavos, 'unidades', p_pedido.unidades,
    'itens', (select coalesce(jsonb_agg(jsonb_build_object(
                'produto', (select p.nome from public.variantes v join public.produtos p on p.id = v.produto_id where v.id = r.variante_id),
                'variacao', (select v.nome from public.variantes v where v.id = r.variante_id),
                'preco_centavos', r.preco_centavos) order by r.numero), '[]'::jsonb)
              from public.loja_reservas r where r.pedido_id = p_pedido.id),
    'loja', (select jsonb_build_object('nome', u.nome, 'endereco', u.endereco, 'cidade', u.cidade) from public.unidades u where u.id = p_pedido.unidade_id));
$$;
revoke all on function privado.pedido_do_site_em_json(public.loja_pedidos) from public, anon, authenticated;

-- O pedido do site para a loja do turno: quem vende nela (venda.registrar); de outra loja, "não encontrado".
create or replace function privado.pedido_do_site_para_a_loja(p_pedido uuid)
returns public.loja_pedidos
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pedido public.loja_pedidos;
begin
  select * into v_pedido from public.loja_pedidos p where p.id = p_pedido for update;
  if not found or v_pedido.unidade_id is distinct from (select public.unidade_atual())
     or not (select public.tem_permissao('venda.registrar', v_pedido.unidade_id)) then
    raise exception 'Pedido não encontrado' using errcode = 'P0002';
  end if;
  return v_pedido;
end;
$$;
revoke all on function privado.pedido_do_site_para_a_loja(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- O pedido pelo visitante (sem login)
-- -----------------------------------------------------------------------------
create or replace function public.loja_pedir(
  p_organizacao uuid, p_unidade uuid, p_itens jsonb, p_nome text, p_whatsapp text, p_chave text, p_origem jsonb default null
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
  -- De onde o visitante chegou (a mesma limpeza da reserva avulsa, MKT-a).
  v_origem text := case when jsonb_typeof(p_origem -> 'origem') = 'string' and p_origem ->> 'origem' in
    ('direto', 'google', 'instagram', 'facebook', 'whatsapp', 'tiktok', 'youtube', 'email', 'outro_site', 'outra_campanha')
    then p_origem ->> 'origem' end;
  v_referencia text := case when jsonb_typeof(p_origem -> 'referencia') = 'string'
    and lower(p_origem ->> 'referencia') ~ '^[a-z0-9]([a-z0-9.-]{0,98}[a-z0-9])?$' then lower(p_origem ->> 'referencia') end;
  v_variantes uuid[] := '{}';
  v_tipos text[] := '{}';
  v_precos bigint[] := '{}';
  v_linha jsonb;
  v_variante uuid;
  v_tipo text;
  v_preco bigint;
  v_total bigint := 0;
  v_existente public.loja_pedidos;
  v_pedido public.loja_pedidos;
  v_n int;
  v_item uuid;
  v_estoque uuid;
  v_reserva public.loja_reservas;
  v_expira timestamptz := now() + interval '24 hours';
begin
  if length(v_whatsapp) = 13 and left(v_whatsapp, 2) = '55' then
    v_whatsapp := substr(v_whatsapp, 3);
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 3 then
    raise exception 'O pedido leva de 1 a 3 unidades' using errcode = '22023';
  end if;
  if not exists (select 1 from public.unidades u where u.id = p_unidade and u.organizacao_id = p_organizacao
                   and u.tipo = 'loja_fisica' and u.status = 'ativa') then
    raise exception 'Loja não encontrada' using errcode = 'OR036';
  end if;
  for v_linha in select e from jsonb_array_elements(p_itens) e loop
    if jsonb_typeof(v_linha) <> 'object'
       or coalesce(v_linha ->> 'variante', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Item do pedido em formato inválido' using errcode = '22023';
    end if;
    v_variante := (v_linha ->> 'variante')::uuid;
    v_tipo := null;
    select p.tipo into v_tipo
    from public.variantes v join public.produtos p on p.id = v.produto_id
    where v.id = v_variante and v.ativa and p.organizacao_id = p_organizacao and p.publicar_online and p.ativo
      and p.tipo in ('aparelho', 'acessorio');
    if v_tipo is null then
      raise exception 'Produto não encontrado na loja online' using errcode = 'OR036';
    end if;
    v_preco := privado.preco_do_balcao(v_variante, p_unidade);
    if v_preco is null then
      raise exception 'Este produto não está à venda nesta loja' using errcode = 'OR036';
    end if;
    v_variantes := v_variantes || v_variante;
    v_tipos := v_tipos || v_tipo;
    v_precos := v_precos || v_preco;
    v_total := v_total + v_preco;
  end loop;
  if length(v_nome) not between 2 and 80 then
    raise exception 'Informe o seu nome (de 2 a 80 letras)' using errcode = '22023';
  end if;
  if v_whatsapp !~ '^[1-9]{2}9[0-9]{8}$' then
    raise exception 'Informe um WhatsApp de celular com DDD (11 números)' using errcode = '22023';
  end if;
  if length(v_chave) not between 8 and 76 then
    raise exception 'Chave do pedido inválida' using errcode = '22023';
  end if;

  -- (0) A mesma chave devolve o mesmo pedido; com outros dados, é recusada.
  perform pg_advisory_xact_lock(privado.trava_da_chave('loja_pedidos', p_organizacao, v_chave));
  select * into v_existente from public.loja_pedidos p where p.organizacao_id = p_organizacao and p.chave = v_chave;
  if found then
    if v_existente.unidade_id <> p_unidade or v_existente.nome <> v_nome
       or (select c.whatsapp from privado.loja_pedidos_contato c where c.pedido_id = v_existente.id) is distinct from v_whatsapp
       or (select array_agg(r.variante_id order by r.numero) from public.loja_reservas r where r.pedido_id = v_existente.id) is distinct from v_variantes then
      raise exception 'Este pedido já foi feito com outros dados' using errcode = 'OR004';
    end if;
    return privado.pedido_do_site_em_json(v_existente);
  end if;

  -- (1) Os limites contra abuso, com as travas na mesma ordem da reserva avulsa (WhatsApp, depois a loja; #102).
  perform pg_advisory_xact_lock(privado.trava_da_chave('loja_reservas_whatsapp', p_organizacao, v_whatsapp));
  if privado.compromissos_do_whatsapp(p_organizacao, v_whatsapp) >= 2 then
    raise exception 'Este WhatsApp já tem 2 reservas ou pedidos ativos: retire um deles na loja ou espere vencer' using errcode = 'OR034';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('loja_reservas_loja', p_organizacao, p_unidade::text));
  if (select count(*) from public.loja_reservas r where r.unidade_id = p_unidade and r.criada_em > now() - interval '1 hour')
     + cardinality(v_variantes) > 20 then
    raise exception 'Muitas reservas nesta loja agora: tente de novo daqui a pouco' using errcode = 'OR035';
  end if;

  -- (2) O pedido e o contato.
  insert into public.loja_pedidos (organizacao_id, unidade_id, codigo, nome, whatsapp_mascarado, unidades, total_centavos, expira_em, chave)
  values (p_organizacao, p_unidade, privado.codigo_do_site(p_organizacao), v_nome, privado.mascara_telefone(v_whatsapp),
    cardinality(v_variantes), v_total, v_expira, v_chave)
  returning * into v_pedido;
  insert into privado.loja_pedidos_contato (pedido_id, whatsapp) values (v_pedido.id, v_whatsapp);

  -- (3) Cada unidade, pela mesma regra da reserva avulsa. Faltou uma, nada fica reservado (a transação inteira volta).
  for v_n in 1 .. cardinality(v_variantes) loop
    select u.item, u.estoque into v_item, v_estoque
    from privado.reservar_unidade_do_site(p_organizacao, p_unidade, v_variantes[v_n], v_tipos[v_n],
      'site:' || v_chave || ':' || v_n, v_expira) u;
    insert into public.loja_reservas (organizacao_id, unidade_id, variante_id, item_serializado_id, estoque_reserva_id, codigo,
      nome, whatsapp_mascarado, preco_centavos, expira_em, chave, pedido_id,
      origem, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referencia)
    values (p_organizacao, p_unidade, v_variantes[v_n], v_item, v_estoque, privado.codigo_do_site(p_organizacao),
      v_nome, v_pedido.whatsapp_mascarado, v_precos[v_n], v_expira, v_chave || ':' || v_n, v_pedido.id,
      v_origem, privado.campo_de_campanha(p_origem, 'utm_source'), privado.campo_de_campanha(p_origem, 'utm_medium'),
      privado.campo_de_campanha(p_origem, 'utm_campaign'), privado.campo_de_campanha(p_origem, 'utm_content'),
      privado.campo_de_campanha(p_origem, 'utm_term'), v_referencia)
    returning * into v_reserva;
    insert into privado.loja_reservas_contato (reserva_id, whatsapp) values (v_reserva.id, v_whatsapp);
  end loop;
  return privado.pedido_do_site_em_json(v_pedido);
end;
$$;
revoke all on function public.loja_pedir(uuid, uuid, jsonb, text, text, text, jsonb) from public;
grant execute on function public.loja_pedir(uuid, uuid, jsonb, text, text, text, jsonb) to anon, authenticated;

-- O visitante acompanha o pedido pelo código e pelo WhatsApp. Sem o par certo, nulo (sem erro: nada de HTTP 500).
create or replace function public.loja_pedido_consultar(p_organizacao uuid, p_codigo text, p_whatsapp text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_whatsapp text := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
  v_pedido public.loja_pedidos;
begin
  if length(v_whatsapp) = 13 and left(v_whatsapp, 2) = '55' then
    v_whatsapp := substr(v_whatsapp, 3);
  end if;
  select p.* into v_pedido
  from public.loja_pedidos p join privado.loja_pedidos_contato c on c.pedido_id = p.id
  where p.organizacao_id = p_organizacao and p.codigo = upper(btrim(coalesce(p_codigo, ''))) and c.whatsapp = v_whatsapp;
  if not found then
    return null;
  end if;
  return privado.pedido_do_site_em_json(v_pedido);
end;
$$;
revoke all on function public.loja_pedido_consultar(uuid, text, text) from public;
grant execute on function public.loja_pedido_consultar(uuid, text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- O pedido no balcão (a loja de retirada)
-- -----------------------------------------------------------------------------
-- Uma venda com todas as unidades do pedido: cada uma sai da reserva do site e entra na venda na mesma transação.
-- Como na reserva avulsa, volta o total anunciado e o de hoje (o preço do balcão de agora; sem ele, o anunciado): a
-- oferta anunciada vale, e o PDV avisa o desconto a dar se o de hoje for maior.
create or replace function public.loja_pedido_atender(p_pedido uuid, p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pedido public.loja_pedidos := privado.pedido_do_site_para_a_loja(p_pedido);
  v_chave text := trim(coalesce(p_chave, ''));
  v_venda uuid;
  v_reserva public.loja_reservas;
  v_n int := 0;
  v_hoje bigint := (select coalesce(sum(coalesce(privado.preco_do_balcao(r.variante_id, r.unidade_id), r.preco_centavos)), 0)
                    from public.loja_reservas r where r.pedido_id = v_pedido.id);
begin
  if v_pedido.situacao = 'atendido' then
    return jsonb_build_object('venda', v_pedido.venda_id, 'total_reservado_centavos', v_pedido.total_centavos,
      'total_atual_centavos', v_hoje, 'repetida', true);
  end if;
  if v_pedido.situacao = 'cancelado' then
    raise exception 'Este pedido foi cancelado' using errcode = '22023';
  end if;
  if v_pedido.expira_em <= now() then
    raise exception 'Este pedido venceu: venda pelo PDV, se ainda houver estoque' using errcode = '22023';
  end if;
  if length(v_chave) not between 8 and 70 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  v_venda := public.criar_venda(v_chave || ':venda');
  for v_reserva in select * from public.loja_reservas r where r.pedido_id = v_pedido.id order by r.numero for update loop
    if v_reserva.situacao <> 'ativa' or not privado.encerrar_reserva(v_reserva.estoque_reserva_id, 'liberada') then
      raise exception 'A reserva de estoque de um item deste pedido não está mais ativa' using errcode = '22023';
    end if;
    v_n := v_n + 1;
    perform public.adicionar_item(v_venda, v_reserva.variante_id, v_reserva.item_serializado_id, 1, v_chave || ':item:' || v_n);
    update public.loja_reservas r
    set situacao = 'atendida', atendida_em = now(), atendida_por = (select auth.uid()), venda_id = v_venda
    where r.id = v_reserva.id;
  end loop;
  update public.loja_pedidos p
  set situacao = 'atendido', atendido_em = now(), atendido_por = (select auth.uid()), venda_id = v_venda
  where p.id = v_pedido.id;
  return jsonb_build_object('venda', v_venda, 'total_reservado_centavos', v_pedido.total_centavos,
    'total_atual_centavos', v_hoje, 'repetida', false);
end;
$$;
revoke all on function public.loja_pedido_atender(uuid, text) from public, anon;
grant execute on function public.loja_pedido_atender(uuid, text) to authenticated;

-- Cancelar o pedido: cada reserva ativa dele volta ao disponível, como no cancelamento da reserva avulsa.
create or replace function public.loja_pedido_cancelar(p_pedido uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pedido public.loja_pedidos := privado.pedido_do_site_para_a_loja(p_pedido);
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_reserva public.loja_reservas;
begin
  if length(v_motivo) > 200 then
    raise exception 'O motivo tem até 200 letras' using errcode = '22023';
  end if;
  if v_pedido.situacao = 'cancelado' then
    return false;
  end if;
  if v_pedido.situacao = 'atendido' then
    raise exception 'Este pedido já foi atendido: a venda segue no PDV' using errcode = '22023';
  end if;
  -- Cada unidade volta como no cancelamento da reserva avulsa (a reserva de estoque liberada), aqui mesmo: a reserva
  -- que é de um pedido não se cancela sozinha.
  for v_reserva in select r.* from public.loja_reservas r where r.pedido_id = v_pedido.id and r.situacao = 'ativa' order by r.numero for update loop
    perform privado.encerrar_reserva(v_reserva.estoque_reserva_id, 'liberada');
    update public.loja_reservas r
    set situacao = 'cancelada', cancelada_em = now(), cancelada_por = (select auth.uid()), motivo_cancelamento = v_motivo
    where r.id = v_reserva.id;
  end loop;
  update public.loja_pedidos p
  set situacao = 'cancelado', cancelado_em = now(), cancelado_por = (select auth.uid()), motivo_cancelamento = v_motivo
  where p.id = v_pedido.id;
  return true;
end;
$$;
revoke all on function public.loja_pedido_cancelar(uuid, text) from public, anon;
grant execute on function public.loja_pedido_cancelar(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- As três funções da reserva em vigor, com a mudança do pedido
-- -----------------------------------------------------------------------------
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
  -- ONLINE-d: o pedido do site conta como um compromisso, como a reserva avulsa (as reservas dele não contam à parte).
  if privado.compromissos_do_whatsapp(p_organizacao, v_whatsapp) >= 2 then
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
  -- ONLINE-d: a mesma regra de antes, agora na função privada que o pedido do site também usa (um escritor só).
  select u.item, u.estoque into v_item, v_estoque
  from privado.reservar_unidade_do_site(p_organizacao, p_unidade, p_variante, v_tipo, 'site:' || v_chave, now() + interval '24 hours') u;

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

create or replace function public.loja_reserva_atender(p_reserva uuid, p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reserva public.loja_reservas := privado.reserva_do_site_para_a_loja(p_reserva);
  v_chave text := trim(coalesce(p_chave, ''));
  v_venda uuid;
begin
  if v_reserva.situacao = 'atendida' then
    return jsonb_build_object('venda', v_reserva.venda_id, 'preco_reservado_centavos', v_reserva.preco_centavos,
      'preco_atual_centavos', privado.preco_do_balcao(v_reserva.variante_id, v_reserva.unidade_id), 'repetida', true);
  end if;
  if v_reserva.situacao = 'cancelada' then
    raise exception 'Esta reserva foi cancelada' using errcode = '22023';
  end if;
  -- ONLINE-d: a reserva que é de um pedido do site sai junto com o pedido (uma venda só).
  if v_reserva.pedido_id is not null then
    raise exception 'Esta reserva é de um pedido do site: atenda o pedido inteiro' using errcode = '22023';
  end if;
  if v_reserva.expira_em <= now() then
    raise exception 'Esta reserva venceu: venda pelo PDV, se ainda houver estoque' using errcode = '22023';
  end if;
  if length(v_chave) not between 8 and 80 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  -- A unidade sai da reserva do site e entra na venda na mesma transação: ninguém a pega no meio.
  if not privado.encerrar_reserva(v_reserva.estoque_reserva_id, 'liberada') then
    raise exception 'A reserva de estoque desta reserva não está mais ativa' using errcode = '22023';
  end if;
  v_venda := public.criar_venda(v_chave || ':venda');
  perform public.adicionar_item(v_venda, v_reserva.variante_id, v_reserva.item_serializado_id, 1, v_chave || ':item');
  update public.loja_reservas r
  set situacao = 'atendida', atendida_em = now(), atendida_por = (select auth.uid()), venda_id = v_venda
  where r.id = v_reserva.id;
  return jsonb_build_object('venda', v_venda, 'preco_reservado_centavos', v_reserva.preco_centavos,
    'preco_atual_centavos', privado.preco_do_balcao(v_reserva.variante_id, v_reserva.unidade_id), 'repetida', false);
end;
$$;

create or replace function public.loja_reserva_cancelar(p_reserva uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reserva public.loja_reservas := privado.reserva_do_site_para_a_loja(p_reserva);
  v_motivo text := privado.exigir_motivo(p_motivo);
begin
  if length(v_motivo) > 200 then
    raise exception 'O motivo tem até 200 letras' using errcode = '22023';
  end if;
  if v_reserva.situacao = 'cancelada' then
    return false;
  end if;
  -- ONLINE-d: a reserva que é de um pedido do site se cancela junto com o pedido.
  if v_reserva.pedido_id is not null then
    raise exception 'Esta reserva é de um pedido do site: cancele o pedido inteiro' using errcode = '22023';
  end if;
  if v_reserva.situacao = 'atendida' then
    raise exception 'Esta reserva já foi atendida: a venda segue no PDV' using errcode = '22023';
  end if;
  perform privado.encerrar_reserva(v_reserva.estoque_reserva_id, 'liberada');
  update public.loja_reservas r
  set situacao = 'cancelada', cancelada_em = now(), cancelada_por = (select auth.uid()), motivo_cancelamento = v_motivo
  where r.id = v_reserva.id;
  return true;
end;
$$;
