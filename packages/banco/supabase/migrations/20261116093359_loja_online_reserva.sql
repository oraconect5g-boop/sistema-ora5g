-- =============================================================================
-- A reserva do site com retirada na loja (lote ONLINE-b: ORA-ONLINE-006 e ORA-ONLINE-004, em parte; ADR-009; decisão do
-- proprietário de 15/11/2026: prazo de 24 horas e até 2 reservas ativas por WhatsApp)
--
-- O visitante, sem login, reserva uma unidade de um produto do site numa loja física com estoque:
--   * public.loja_reservar(organizacao, variante, loja, nome, whatsapp, chave): confere o produto do site, a loja, o
--     preço do balcão e o estoque; segura uma unidade por 24 horas (o aparelho pelo IMEI, escolhido pelo banco; o
--     acessório pela quantidade), na mesma reserva de estoque do PDV (origem "online"); guarda o nome e o WhatsApp (este
--     no esquema privado; no público, só a máscara) e devolve um código de 6 letras para mostrar no balcão. Contra
--     abuso: até 2 reservas ativas por WhatsApp (OR034) e até 20 reservas novas por loja por hora (OR035). A mesma
--     chave devolve a mesma reserva; com outros dados, OR004. Sem estoque: OR001.
--   * a loja (venda.registrar, na loja da reserva) lê as reservas da loja (public.loja_reservas, pelo RLS) e:
--     - public.loja_reserva_contato(reserva): o WhatsApp do cliente, para combinar a retirada (fica na auditoria);
--     - public.loja_reserva_cancelar(reserva, motivo): devolve a unidade ao estoque;
--     - public.loja_reserva_atender(reserva, chave): abre a venda no PDV com a unidade reservada, na mesma transação (a
--       unidade não escapa), e devolve o preço anunciado e o de agora. A oferta obriga: se o de agora for maior, a loja
--       dá a diferença como desconto.
--   * public.loja_reservas_liberar_vencidas(): as reservas do site vencidas da loja do turno saem de vez (o aparelho
--     volta a aparecer livre no PDV); o PDV e a tela "Reservas do site" chamam ao abrir. Só as do site: a reserva do
--     PDV vencida continua com a regra de sempre (sai quando a unidade é pedida de novo).
--   * a vitrine passa a não contar como reservada a reserva vencida que ainda não foi liberada.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create table public.loja_reservas (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null,
  unidade_id uuid not null,
  variante_id uuid not null,
  item_serializado_id uuid references public.itens_serializados (id),
  estoque_reserva_id uuid not null references public.estoque_reservas (id),
  codigo text not null check (codigo ~ '^[A-HJ-NP-Z2-9]{6}$'),
  nome text not null check (length(nome) between 2 and 80 and nome = trim(nome)),
  whatsapp_mascarado text not null,
  preco_centavos bigint not null check (preco_centavos >= 0),
  situacao text not null default 'ativa' check (situacao in ('ativa', 'cancelada', 'atendida')),
  expira_em timestamptz not null,
  chave text not null check (length(chave) between 8 and 80 and chave = trim(chave)),
  criada_em timestamptz not null default now(),
  cancelada_em timestamptz,
  cancelada_por uuid references public.perfis_usuario (id),
  motivo_cancelamento text check (motivo_cancelamento is null or length(motivo_cancelamento) between 3 and 200),
  atendida_em timestamptz,
  atendida_por uuid references public.perfis_usuario (id),
  venda_id uuid references public.vendas (id),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  foreign key (variante_id, organizacao_id) references public.variantes (id, organizacao_id),
  unique (organizacao_id, codigo),
  unique (organizacao_id, chave),
  constraint loja_reserva_cancelada_coerente check (
    (situacao = 'cancelada') = (cancelada_em is not null) and (cancelada_em is null) = (motivo_cancelamento is null)),
  constraint loja_reserva_atendida_coerente check (
    (situacao = 'atendida') = (atendida_em is not null) and (atendida_em is null) = (venda_id is null)
    and (atendida_em is null) = (atendida_por is null))
);
create index loja_reservas_da_loja on public.loja_reservas (unidade_id, situacao, expira_em);
create index loja_reservas_unidade_organizacao on public.loja_reservas (unidade_id, organizacao_id);
create index loja_reservas_variante_organizacao on public.loja_reservas (variante_id, organizacao_id);
create index loja_reservas_item on public.loja_reservas (item_serializado_id);
create index loja_reservas_estoque on public.loja_reservas (estoque_reserva_id);
create index loja_reservas_cancelada_por on public.loja_reservas (cancelada_por);
create index loja_reservas_atendida_por on public.loja_reservas (atendida_por);
create index loja_reservas_venda on public.loja_reservas (venda_id);

-- O WhatsApp do cliente, fora da API (a loja vê pela função, na auditoria).
create table privado.loja_reservas_contato (
  reserva_id uuid primary key references public.loja_reservas (id),
  whatsapp text not null check (whatsapp ~ '^[1-9]{2}9[0-9]{8}$')
);

alter table public.loja_reservas enable row level security;
alter table privado.loja_reservas_contato enable row level security;
revoke all on public.loja_reservas from anon, authenticated;
revoke all on privado.loja_reservas_contato from public, anon, authenticated;
revoke all on sequence public.loja_reservas_numero_seq from anon, authenticated;
grant select on public.loja_reservas to authenticated;
create policy loja_reservas_ler on public.loja_reservas for select to authenticated
  using (unidade_id in (select privado.unidades_com_permissao('venda.registrar')));

-- -----------------------------------------------------------------------------
-- Auxiliares
-- -----------------------------------------------------------------------------
-- Um código de 6 letras e números sem os que se confundem (0, O, 1, I): 32 símbolos, um byte aleatório por posição.
create or replace function privado.codigo_de_reserva()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(x.b, i.n) % 32) + 1, 1), '' order by i.n)
  from (select decode(md5(gen_random_uuid()::text), 'hex') as b) x, generate_series(0, 5) as i (n);
$$;
revoke all on function privado.codigo_de_reserva() from public, anon, authenticated;

-- O que o cliente vê da reserva (sem o nome nem o WhatsApp).
create or replace function privado.reserva_do_site_em_json(p_reserva public.loja_reservas)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'codigo', p_reserva.codigo, 'expira_em', p_reserva.expira_em, 'preco_centavos', p_reserva.preco_centavos,
    'produto', (select p.nome from public.variantes v join public.produtos p on p.id = v.produto_id where v.id = p_reserva.variante_id),
    'variacao', (select v.nome from public.variantes v where v.id = p_reserva.variante_id),
    'loja', (select jsonb_build_object('nome', u.nome, 'endereco', u.endereco, 'cidade', u.cidade) from public.unidades u where u.id = p_reserva.unidade_id));
$$;
revoke all on function privado.reserva_do_site_em_json(public.loja_reservas) from public, anon, authenticated;

-- A reserva do site para a loja do turno: quem vende nela (venda.registrar); de outra loja, "não encontrada".
create or replace function privado.reserva_do_site_para_a_loja(p_reserva uuid)
returns public.loja_reservas
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reserva public.loja_reservas;
begin
  select * into v_reserva from public.loja_reservas r where r.id = p_reserva for update;
  if not found or v_reserva.unidade_id is distinct from (select public.unidade_atual())
     or not (select public.tem_permissao('venda.registrar', v_reserva.unidade_id)) then
    raise exception 'Reserva não encontrada' using errcode = 'P0002';
  end if;
  return v_reserva;
end;
$$;
revoke all on function privado.reserva_do_site_para_a_loja(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- A reserva pelo visitante
-- -----------------------------------------------------------------------------
create or replace function public.loja_reservar(
  p_organizacao uuid, p_variante uuid, p_unidade uuid, p_nome text, p_whatsapp text, p_chave text
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
    raise exception 'Produto não encontrado na loja online' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.unidades u where u.id = p_unidade and u.organizacao_id = p_organizacao
                   and u.tipo = 'loja_fisica' and u.status = 'ativa') then
    raise exception 'Loja não encontrada' using errcode = 'P0002';
  end if;
  v_preco := privado.preco_do_balcao(p_variante, p_unidade);
  if v_preco is null then
    raise exception 'Este produto não está à venda nesta loja' using errcode = 'P0002';
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
    nome, whatsapp_mascarado, preco_centavos, expira_em, chave)
  values (p_organizacao, p_unidade, p_variante, v_item, v_estoque, v_codigo,
    v_nome, privado.mascara_telefone(v_whatsapp), v_preco, now() + interval '24 hours', v_chave)
  returning * into v_reserva;
  insert into privado.loja_reservas_contato (reserva_id, whatsapp) values (v_reserva.id, v_whatsapp);
  return privado.reserva_do_site_em_json(v_reserva);
end;
$$;

-- -----------------------------------------------------------------------------
-- A loja: o contato, o cancelamento e o atendimento
-- -----------------------------------------------------------------------------
create or replace function public.loja_reserva_contato(p_reserva uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reserva public.loja_reservas := privado.reserva_do_site_para_a_loja(p_reserva);
begin
  insert into public.auditoria (usuario_id, unidade_id, organizacao_id, acao, alvo_tipo, alvo_id, origem)
  values ((select auth.uid()), v_reserva.unidade_id, v_reserva.organizacao_id, 'loja_reserva.contato_revelado', 'loja_reservas', v_reserva.id::text, 'aplicacao');
  return (select c.whatsapp from privado.loja_reservas_contato c where c.reserva_id = v_reserva.id);
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

-- As reservas do site vencidas da loja do turno saem de vez: sem isso, o aparelho de uma reserva vencida continuaria
-- "reservado" até alguém pedir aquela unidade. Não espera trava (a unidade presa por outra transação fica para a
-- próxima vez) e devolve quantas liberou. Só quem vende na loja do turno.
create or replace function public.loja_reservas_liberar_vencidas()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  v_reserva uuid;
  v_total int := 0;
begin
  if v_unidade is null or not (select public.tem_permissao('venda.registrar', v_unidade)) then
    raise exception 'Sem permissão para vender nesta unidade' using errcode = '42501';
  end if;
  for v_reserva in
    select e.id from public.loja_reservas r join public.estoque_reservas e on e.id = r.estoque_reserva_id
    where r.unidade_id = v_unidade and r.situacao = 'ativa' and r.expira_em <= now() and e.situacao = 'ativa'
    order by e.id
  loop
    begin
      if privado.encerrar_reserva(v_reserva, 'expirada', true) then
        v_total := v_total + 1;
      end if;
    exception when deadlock_detected or lock_not_available then
      null;
    end;
  end loop;
  return v_total;
end;
$$;

-- -----------------------------------------------------------------------------
-- A vitrine: a reserva vencida (ainda não liberada) não conta como reservada
-- -----------------------------------------------------------------------------
-- privado.ofertas_da_vitrine: a versão de 20261115210812_loja_online_vitrine.sql, com o disponível somando de volta as
-- reservas ativas já vencidas desta loja e variação (a liberação delas é preguiçosa: a próxima reserva as encerra).
create or replace function privado.ofertas_da_vitrine(p_organizacao uuid, p_produto uuid)
returns table (variante_id uuid, unidade_id uuid, preco_centavos bigint, disponivel int)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, u.id, privado.preco_do_balcao(v.id, u.id),
         greatest(coalesce(s.quantidade - s.reservado, 0) + coalesce((
           select sum(r.quantidade)::int from public.estoque_reservas r
           where r.unidade_id = u.id and r.variante_id = v.id and r.situacao = 'ativa' and r.expira_em <= now()), 0), 0)
  from public.produtos p
  join public.variantes v on v.produto_id = p.id and v.ativa
  join public.unidades u on u.organizacao_id = p.organizacao_id and u.tipo = 'loja_fisica' and u.status = 'ativa'
  left join public.estoque_saldos s on s.unidade_id = u.id and s.variante_id = v.id
  where p.id = p_produto and p.organizacao_id = p_organizacao and p.publicar_online and p.ativo and p.tipo in ('aparelho', 'acessorio')
    and privado.preco_do_balcao(v.id, u.id) is not null;
$$;
revoke all on function privado.ofertas_da_vitrine(uuid, uuid) from public, anon, authenticated;

revoke all on function public.loja_reservar(uuid, uuid, uuid, text, text, text) from public;
grant execute on function public.loja_reservar(uuid, uuid, uuid, text, text, text) to anon, authenticated;
revoke all on function public.loja_reserva_contato(uuid), public.loja_reserva_cancelar(uuid, text), public.loja_reserva_atender(uuid, text),
  public.loja_reservas_liberar_vencidas() from public, anon;
grant execute on function public.loja_reserva_contato(uuid), public.loja_reserva_cancelar(uuid, text), public.loja_reserva_atender(uuid, text),
  public.loja_reservas_liberar_vencidas() to authenticated;
