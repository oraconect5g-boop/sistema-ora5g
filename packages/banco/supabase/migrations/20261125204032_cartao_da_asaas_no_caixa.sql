-- =============================================================================
-- Lote PAY-015b (25/11/2026; ORA-PAY-001, ORA-PAY-008 e ORA-PAY-014, que seguem parciais; ADR-025, adendo): o cartão pela
-- Asaas no caixa. A D-062 do proprietário (25/11): "pagamento oficial da loja será a asaas", com o cartão de crédito, o QR
-- Code gerado direto do sistema e o pagamento misto. A vendedora gera o link de pagamento da Asaas só no cartão, com o
-- valor; a tela mostra o QR Code do link e o cliente digita o cartão no celular dele, na página da Asaas (o número do cartão
-- nunca passa pelo sistema).
-- Contrato (docs.asaas.com, lida em 25/11): o link de pagamento (POST /v3/paymentLinks: name, billingType CREDIT_CARD,
-- chargeType DETACHED, value, endDate, externalReference, notificationEnabled e limit 1, que fecha o link depois de uma
-- venda), o link desativado (PUT /v3/paymentLinks/{id} com active falso) e as cobranças (GET /v3/payments com billingType
-- CREDIT_CARD e dateCreated[ge]: cada cobrança traz o paymentLink, o status e, do cartão, só os 4 últimos dígitos e a
-- bandeira, creditCard.creditCardNumber e creditCardBrand). A Asaas não tem consulta das cobranças de um link: o worker lê as
-- cobranças de cartão desde o dia do link e acha a dele pelo paymentLink.
--   * public.caixa_cartao: cada link pedido no caixa para uma venda aberta (o valor, a situação, o link e, pago, os 4
--     últimos dígitos e a bandeira do cartão);
--   * quem vende: public.caixa_cartao_pedir (o valor, para a sua venda aberta), public.caixa_cartao_cancelar e
--     public.caixa_cartao_da_venda (se o cartão está ligado e os links da venda aberta);
--   * o worker (só a chave secreta do servidor): a situação do cartão no caixa (a Asaas respondeu), os links a criar, o link
--     registrado, a criação que falhou, os links a conferir, a consulta aplicada (só ela confirma: o link, o valor e a
--     passagem) e os links a desativar (o cancelado e o vencido);
--   * public.caixa_pix_pedir (refeita): o QR do Pix não passa do que falta pagar, contando também o cartão pedido ou pago;
--   * public.concluir_venda e public.cancelar_venda (refeitas): as linhas "Cartão pela Asaas" de cada link pago (o meio
--     cartao_asaas, que a tela não declara), e o link esperando segura a conclusão, como o QR do Pix; a venda aberta com
--     cartão pago não se cancela pelo caixa (OR048), e os links que esperam são cancelados junto;
--   * privado.meio_valido (refeita): o meio cartao_asaas.
-- Funções refeitas a partir do texto em vigor (o md5 do corpo conferido no ora5g-dev em 25/11): concluir_venda,
-- cancelar_venda, caixa_pix_pedir e meio_valido (20261125192529_pix_da_asaas_no_caixa).
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

-- 1) A configuração: o cartão no caixa fica ligado enquanto o worker fala com a Asaas a cada rodada (mais de 5 minutos sem
--    falar: desligado). A validade de cada link (30 minutos; muda com um update).
alter table privado.pagamento_pelo_site add column caixa_cartao_pronto boolean not null default false;
alter table privado.pagamento_pelo_site add column caixa_cartao_conferido_em timestamptz;
alter table privado.pagamento_pelo_site add column caixa_cartao_motivo text
  check (caixa_cartao_motivo is null or length(caixa_cartao_motivo) between 1 and 120);
alter table privado.pagamento_pelo_site add column caixa_cartao_validade interval not null default interval '30 minutes'
  check (caixa_cartao_validade between interval '5 minutes' and interval '2 hours');
comment on table privado.pagamento_pelo_site is
  'PAY-014a, PAY-015a e PAY-015b: a Asaas: o pagamento pelo site (ligado depois de o worker registrar o aviso, o ambiente, o webhook e por quanto tempo o pedido pago fica guardado), o Pix no caixa (pronto quando o worker confere a chave Pix da conta, e a validade do QR) e o cartão no caixa (pronto quando o worker fala com a Asaas, e a validade do link). Acesso só pelas funções do pagamento (RLS ligado, sem política).';

-- 2) Os links do cartão no caixa.
create table public.caixa_cartao (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null references public.organizacoes (id),
  unidade_id uuid not null,
  venda_id uuid not null references public.vendas (id),
  pedido_por uuid not null references public.perfis_usuario (id),
  chave text not null check (length(trim(chave)) between 1 and 120),
  valor_centavos bigint not null check (valor_centavos between 1 and 100000000),
  situacao text not null default 'criando'
    check (situacao in ('criando', 'aguardando', 'pago', 'cancelando', 'cancelado', 'vencido', 'falhou', 'estornado')),
  link_id text unique check (link_id is null or link_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  link_url text check (link_url is null or (length(link_url) between 12 and 500 and link_url ~ '^https://[^[:space:]]+$')),
  expira_em timestamptz,
  id_no_provedor text unique check (id_no_provedor is null or id_no_provedor ~ '^[A-Za-z0-9_-]{1,80}$'),
  cartao_final text check (cartao_final is null or cartao_final ~ '^[0-9]{4}$'),
  cartao_bandeira text check (cartao_bandeira is null or cartao_bandeira ~ '^[A-Z]{2,20}$'),
  pago_em timestamptz,
  estornado_em timestamptz,
  cancelado_em timestamptz,
  link_desativado_em timestamptz,
  tentativas int not null default 0 check (tentativas between 0 and 10),
  reservado_ate timestamptz,
  conferido_em timestamptz,
  ultima_falha text check (ultima_falha is null or length(ultima_falha) between 1 and 120),
  divergencia text check (divergencia is null or length(divergencia) between 1 and 120),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (organizacao_id, chave),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  constraint caixa_cartao_link_coerente check ((link_id is null) = (link_url is null) and (link_id is null) = (expira_em is null)),
  constraint caixa_cartao_com_link check (situacao not in ('aguardando', 'pago', 'estornado', 'vencido') or link_id is not null),
  constraint caixa_cartao_pago_coerente check (
    (pago_em is not null) = (situacao in ('pago', 'estornado')) and (estornado_em is not null) = (situacao = 'estornado')
    and (situacao not in ('pago', 'estornado') or id_no_provedor is not null))
);
comment on table public.caixa_cartao is
  'PAY-015b: os links de pagamento no cartão da Asaas pedidos no caixa, um por pedido do vendedor, para uma venda aberta. Escrita só pelas funções do cartão no caixa; quem vende na loja lê. Só a consulta do worker na Asaas confirma o pago; do cartão, só os 4 últimos dígitos e a bandeira.';
create index caixa_cartao_venda on public.caixa_cartao (venda_id);
create index caixa_cartao_da_loja on public.caixa_cartao (unidade_id, organizacao_id);
create index caixa_cartao_pedido_por on public.caixa_cartao (pedido_por);
create index caixa_cartao_fila on public.caixa_cartao (criado_em) where situacao in ('criando', 'aguardando', 'cancelando');
create trigger caixa_cartao_auditar after insert or update on public.caixa_cartao
  for each row execute function privado.auditar_mudanca();
alter table public.caixa_cartao enable row level security;
revoke all on public.caixa_cartao from anon, authenticated;
revoke all on sequence public.caixa_cartao_numero_seq from anon, authenticated;
grant select on public.caixa_cartao to authenticated;
create policy caixa_cartao_ler on public.caixa_cartao for select to authenticated
  using (unidade_id in (select privado.unidades_com_permissao('venda.registrar')));

-- 3) A linha do pagamento que o banco grava na conclusão (uma por link pago).
alter table public.venda_pagamentos add column caixa_cartao_id uuid unique references public.caixa_cartao (id);
alter table public.venda_pagamentos add constraint venda_pagamento_do_cartao_do_caixa check ((meio = 'cartao_asaas') = (caixa_cartao_id is not null));
comment on column public.venda_pagamentos.caixa_cartao_id is
  'PAY-015b: o link de pagamento no cartão da Asaas (pago) que esta linha registra. Só no meio cartao_asaas, que só a conclusão da venda grava.';

-- 4) O cartão está ligado no caixa? O worker falou com a Asaas nos últimos 5 minutos.
create or replace function privado.caixa_cartao_ligado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.caixa_cartao_pronto and c.caixa_cartao_conferido_em > now() - interval '5 minutes'
                   from privado.pagamento_pelo_site c where c.provedor = 'asaas'), false);
$$;
revoke all on function privado.caixa_cartao_ligado() from public, anon, authenticated;

-- O que a venda aberta já tem pedido ou pago na Asaas e no site (o Pix, o cartão e o pedido pago pelo site): o QR e o link
-- não passam do total menos isso.
create or replace function privado.caixa_comprometido(p_venda uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select sum(x.valor_centavos) from public.caixa_pix x
                   where x.venda_id = p_venda and x.situacao in ('criando', 'aguardando', 'pago')), 0)
       + coalesce((select sum(x.valor_centavos) from public.caixa_cartao x
                   where x.venda_id = p_venda and x.situacao in ('criando', 'aguardando', 'pago')), 0)
       + coalesce((select pg.valor_centavos from public.loja_pagamentos pg
                   where pg.pedido_id in (select p.id from public.loja_pedidos p where p.venda_id = p_venda) and pg.situacao = 'pago'), 0);
$$;
revoke all on function privado.caixa_comprometido(uuid) from public, anon, authenticated;

-- 5) Quem vende: pedir o link do cartão para a sua venda aberta, com o valor (até o que falta pagar). O clique repetido (a
--    mesma chave) devolve o mesmo link; com outra venda ou outro valor, OR004.
create or replace function public.caixa_cartao_pedir(p_venda uuid, p_valor_centavos bigint, p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_unidade uuid := (select public.unidade_atual());
  v_venda public.vendas;
  v_existente public.caixa_cartao;
  v_cartao public.caixa_cartao;
  v_total bigint;
begin
  if v_usuario is null or v_unidade is null or not coalesce((select public.tem_permissao('venda.registrar', v_unidade)), false) then
    raise exception 'Sem permissão para vender nesta loja' using errcode = '42501';
  end if;
  if p_chave is null or length(trim(p_chave)) not between 1 and 120 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  if p_valor_centavos is null or p_valor_centavos not between 1 and 100000000 then
    raise exception 'Valor do cartão inválido' using errcode = '22023';
  end if;
  v_venda := privado.minha_venda_aberta(p_venda);
  perform pg_advisory_xact_lock(privado.trava_da_chave('caixa_cartao', v_venda.organizacao_id, p_chave));
  select x.* into v_existente from public.caixa_cartao x where x.organizacao_id = v_venda.organizacao_id and x.chave = p_chave;
  if found then
    if v_existente.venda_id <> v_venda.id or v_existente.valor_centavos <> p_valor_centavos or v_existente.pedido_por <> v_usuario then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return jsonb_build_object('id', v_existente.id, 'numero', v_existente.numero, 'situacao', v_existente.situacao, 'repetido', true);
  end if;
  if not privado.caixa_cartao_ligado() then
    raise exception 'O cartão pela Asaas ainda não está ligado no caixa' using errcode = 'OR058';
  end if;
  -- O link não passa do que falta pagar: o total dos itens menos o que a venda já tem pedido ou pago (o Pix, o cartão e o
  -- site). A conclusão confere de novo (o desconto pode mudar depois).
  select coalesce(sum(i.preco_unitario_centavos * i.quantidade - i.desconto_centavos), 0) into v_total
  from public.venda_itens i where i.venda_id = v_venda.id;
  if p_valor_centavos > v_total - privado.caixa_comprometido(v_venda.id) then
    raise exception 'O cartão passa do que falta pagar nesta venda' using errcode = 'OR009';
  end if;
  perform set_config('ora.motivo', 'Cartão pela Asaas pedido no caixa (PAY-015b)', true);
  insert into public.caixa_cartao (organizacao_id, unidade_id, venda_id, pedido_por, chave, valor_centavos)
  values (v_venda.organizacao_id, v_venda.unidade_id, v_venda.id, v_usuario, p_chave, p_valor_centavos)
  returning * into v_cartao;
  return jsonb_build_object('id', v_cartao.id, 'numero', v_cartao.numero, 'situacao', v_cartao.situacao);
end;
$$;
revoke all on function public.caixa_cartao_pedir(uuid, bigint, text) from public, anon;
grant execute on function public.caixa_cartao_pedir(uuid, bigint, text) to authenticated;

-- 6) Quem vende: cancelar o link que ainda não foi pago (o da sua venda). O link que o worker ainda não pediu sai na hora; o
--    que já está na Asaas o worker desativa (conferindo antes se ele não foi pago nesse meio tempo). O pago não se cancela.
create or replace function public.caixa_cartao_cancelar(p_cartao uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cartao public.caixa_cartao;
begin
  if (select auth.uid()) is null then
    raise exception 'Cartão não encontrado' using errcode = 'P0002';
  end if;
  select x.* into v_cartao from public.caixa_cartao x where x.id = p_cartao for update;
  if not found or v_cartao.unidade_id is distinct from (select public.unidade_atual())
     or not exists (select 1 from public.vendas v where v.id = v_cartao.venda_id and v.vendedor_id = (select auth.uid()))
     or not coalesce((select public.tem_permissao('venda.registrar', v_cartao.unidade_id)), false) then
    raise exception 'Cartão não encontrado' using errcode = 'P0002';
  end if;
  if v_cartao.situacao in ('pago', 'estornado') then
    raise exception 'Este cartão já foi pago: ele entra na venda; para devolver, o estorno é pelo painel da Asaas' using errcode = 'OR048';
  end if;
  if v_cartao.situacao not in ('criando', 'aguardando') then
    return v_cartao.situacao;
  end if;
  perform set_config('ora.motivo', 'Link do cartão pela Asaas cancelado no caixa (PAY-015b)', true);
  update public.caixa_cartao x
  set situacao = case when x.situacao = 'criando' and (x.reservado_ate is null or x.reservado_ate < now()) then 'cancelado' else 'cancelando' end,
      cancelado_em = now(), reservado_ate = case when x.situacao = 'criando' then x.reservado_ate end, atualizado_em = now()
  where x.id = v_cartao.id
  returning x.* into v_cartao;
  return v_cartao.situacao;
end;
$$;
revoke all on function public.caixa_cartao_cancelar(uuid) from public, anon;
grant execute on function public.caixa_cartao_cancelar(uuid) to authenticated;

-- 7) Quem vende: se o cartão está ligado no caixa e os links da sua venda aberta (o mais novo primeiro), com o endereço só
--    do que espera o pagamento. Sem a venda, a aberta da tela do PDV (a mais nova da pessoa na loja do turno, a mesma regra
--    de public.pdv_tela): a tela pede junto com ela.
create or replace function public.caixa_cartao_da_venda(p_venda uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_unidade uuid := (select public.unidade_atual());
  v_venda public.vendas;
begin
  if v_usuario is null or v_unidade is null or not coalesce((select public.tem_permissao('venda.registrar', v_unidade)), false) then
    raise exception 'Sem permissão para vender nesta loja' using errcode = '42501';
  end if;
  if p_venda is null then
    select v.* into v_venda from public.vendas v
    where v.vendedor_id = v_usuario and v.unidade_id = v_unidade and v.situacao in ('rascunho', 'aguardando_aprovacao')
    order by v.criado_em desc, v.id
    limit 1;
    if not found then
      return jsonb_build_object('ligado', privado.caixa_cartao_ligado(), 'venda', null, 'cartoes', '[]'::jsonb);
    end if;
  else
    select v.* into v_venda from public.vendas v where v.id = p_venda;
    if not found or v_venda.vendedor_id <> v_usuario or v_venda.unidade_id is distinct from v_unidade then
      raise exception 'Venda não encontrada' using errcode = 'P0002';
    end if;
  end if;
  return jsonb_build_object(
    'ligado', privado.caixa_cartao_ligado(),
    'venda', v_venda.id,
    'cartoes', (select coalesce(jsonb_agg(jsonb_build_object(
              'id', x.id, 'numero', x.numero, 'valor_centavos', x.valor_centavos, 'situacao', x.situacao,
              'link_url', case when x.situacao = 'aguardando' then x.link_url end,
              'expira_em', x.expira_em, 'pago_em', x.pago_em, 'cartao_final', x.cartao_final, 'cartao_bandeira', x.cartao_bandeira,
              'ultima_falha', x.ultima_falha, 'divergencia', x.divergencia)
            order by x.numero desc), '[]'::jsonb)
            from public.caixa_cartao x where x.venda_id = v_venda.id));
end;
$$;
revoke all on function public.caixa_cartao_da_venda(uuid) from public, anon;
grant execute on function public.caixa_cartao_da_venda(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- O worker (service_role)
-- -----------------------------------------------------------------------------
-- A situação do cartão no caixa: a Asaas respondeu nesta rodada? (sem rodada por 5 minutos, desliga).
create or replace function public.caixa_cartao_situacao(p_pronto boolean, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := nullif(left(btrim(coalesce(p_motivo, '')), 120), '');
begin
  if p_pronto is null or (not p_pronto and v_motivo is null) then
    raise exception 'Diga se o cartão está pronto e, se não, o motivo' using errcode = '22023';
  end if;
  update privado.pagamento_pelo_site c
  set caixa_cartao_pronto = p_pronto, caixa_cartao_conferido_em = now(), caixa_cartao_motivo = case when p_pronto then null else v_motivo end
  where c.provedor = 'asaas';
  return found;
end;
$$;

-- Os links a criar (reservados por 1 minuto; até 10 tentativas), com o que o link precisa: o valor, a venda e a validade.
create or replace function public.caixa_cartao_a_criar(p_limite int default 10)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  lote jsonb;
begin
  with escolhidos as (
    select x.id from public.caixa_cartao x
    where x.situacao = 'criando' and (x.reservado_ate is null or x.reservado_ate < now()) and x.tentativas < 10
    order by x.criado_em, x.id
    limit least(greatest(coalesce(p_limite, 10), 1), 50)
    for update of x skip locked
  ), reservados as (
    update public.caixa_cartao x
    set reservado_ate = now() + interval '1 minute', tentativas = x.tentativas + 1, atualizado_em = now()
    from escolhidos e where x.id = e.id
    returning x.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'valor_centavos', r.valor_centavos, 'tentativa', r.tentativas,
      'venda_numero', (select v.numero from public.vendas v where v.id = r.venda_id),
      'validade_segundos', (select extract(epoch from c.caixa_cartao_validade)::int from privado.pagamento_pelo_site c where c.provedor = 'asaas'))
      order by r.criado_em, r.id), '[]'::jsonb)
  into lote
  from reservados r;
  return lote;
end;
$$;

-- O link criado na Asaas: o pedido passa a esperar o pagamento. Se a venda desistiu enquanto o link era criado
-- (cancelando), o link fica anotado só para o worker desativar.
create or replace function public.caixa_cartao_link_registrar(p_cartao uuid, p_link_id text, p_link_url text, p_expira_em timestamptz)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cartao public.caixa_cartao;
begin
  if coalesce(p_link_id, '') !~ '^[A-Za-z0-9_-]{1,80}$' or length(coalesce(p_link_url, '')) not between 12 and 500
     or p_link_url !~ '^https://[^[:space:]]+$' or p_expira_em is null or p_expira_em <= now() - interval '1 minute' then
    raise exception 'Link inválido' using errcode = '22023';
  end if;
  select x.* into v_cartao from public.caixa_cartao x where x.id = p_cartao for update;
  if not found then
    raise exception 'Cartão não encontrado' using errcode = 'P0002';
  end if;
  if v_cartao.link_id = p_link_id then
    return 'repetido';
  end if;
  if v_cartao.link_id is not null or v_cartao.situacao not in ('criando', 'cancelando') then
    raise exception 'Este cartão não espera um link' using errcode = 'P0002';
  end if;
  perform set_config('ora.motivo', 'Link do cartão pela Asaas criado (PAY-015b)', true);
  update public.caixa_cartao x
  set link_id = p_link_id, link_url = p_link_url, expira_em = p_expira_em, reservado_ate = null, ultima_falha = null,
      situacao = case when x.situacao = 'criando' then 'aguardando' else x.situacao end, atualizado_em = now()
  where x.id = v_cartao.id
  returning x.* into v_cartao;
  return case when v_cartao.situacao = 'aguardando' then 'registrado' else 'cancelar' end;
end;
$$;

-- A criação que falhou: volta para a fila (com o motivo curto) ou para de vez (a recusa da Asaas ou 10 tentativas). A
-- desistência que esperava a criação (cancelando, sem link) termina aqui.
create or replace function public.caixa_cartao_criacao_falhou(p_cartao uuid, p_motivo text, p_definitiva boolean)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := left(btrim(coalesce(p_motivo, '')), 120);
  v_cartao public.caixa_cartao;
begin
  if v_motivo = '' then
    raise exception 'O motivo da falha é obrigatório' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', 'A criação do link do cartão pela Asaas falhou (PAY-015b)', true);
  update public.caixa_cartao x
  set ultima_falha = v_motivo, reservado_ate = null, atualizado_em = now(),
      situacao = case when x.situacao = 'cancelando' then 'cancelado'
                      when coalesce(p_definitiva, false) or x.tentativas >= 10 then 'falhou' else x.situacao end
  where x.id = p_cartao and x.link_id is null and x.situacao in ('criando', 'cancelando')
  returning x.* into v_cartao;
  if not found then
    raise exception 'Este cartão não está sendo criado' using errcode = 'P0002';
  end if;
  return v_cartao.situacao;
end;
$$;

-- Os links a conferir na Asaas (reservados por 30 segundos): o que espera (a cada 5 segundos), o que a venda desistiu (antes
-- de desativar, para ver se não foi pago) e o pago de venda ainda aberta (a cada minuto, por causa do estorno). Junto, o
-- dia (em Brasília) do link mais antigo do lote: o worker lê as cobranças de cartão desde esse dia.
create or replace function public.caixa_cartao_a_conferir(p_limite int default 20)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  lote jsonb;
begin
  with escolhidos as (
    select x.id from public.caixa_cartao x
    where x.link_id is not null and (x.reservado_ate is null or x.reservado_ate < now())
      and ((x.situacao in ('aguardando', 'cancelando') and (x.conferido_em is null or x.conferido_em < now() - interval '5 seconds'))
           or (x.situacao = 'pago' and (x.conferido_em is null or x.conferido_em < now() - interval '1 minute')
               and exists (select 1 from public.vendas v where v.id = x.venda_id and v.situacao in ('rascunho', 'aguardando_aprovacao'))))
    order by x.conferido_em nulls first, x.id
    limit least(greatest(coalesce(p_limite, 20), 1), 50)
    for update of x skip locked
  ), reservados as (
    update public.caixa_cartao x set reservado_ate = now() + interval '30 seconds'
    from escolhidos e where x.id = e.id
    returning x.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'link_id', r.link_id, 'valor_centavos', r.valor_centavos, 'situacao', r.situacao,
                                               'desde', to_char(r.criado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'))
                            order by r.conferido_em nulls first, r.id), '[]'::jsonb)
  into lote
  from reservados r;
  return lote;
end;
$$;

-- A consulta aplicada (a única que confirma; PAY-b). p_consulta é o que a Asaas respondeu sobre as cobranças do link, no
-- formato comum: {"link_id", "situacao": pago | estornado | nenhum | desconhecida, "id_no_provedor", "valor_centavos",
-- "cartao_final", "cartao_bandeira"}. O banco confere de novo: o link é o do pedido, o valor é o pedido e a passagem da
-- situação. O que não fecha vira divergência, sem mudar a situação. Devolve o resultado: confirmado, estorno_registrado,
-- ja_registrado, pendente, vencido, pode_desativar, divergencia, situacao_desconhecida ou link_desconhecido.
create or replace function public.caixa_cartao_consulta_aplicar(p_cartao uuid, p_consulta jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cartao public.caixa_cartao;
  v_situacao text := p_consulta ->> 'situacao';
  v_id text := p_consulta ->> 'id_no_provedor';
  v_final text := nullif(p_consulta ->> 'cartao_final', '');
  v_bandeira text := nullif(p_consulta ->> 'cartao_bandeira', '');
  v_valor bigint;
  v_aberta boolean;
  v_resultado text;
  v_divergencia text;
begin
  if p_consulta is null or jsonb_typeof(p_consulta) <> 'object' or coalesce(v_situacao, '') not in ('pago', 'estornado', 'nenhum', 'desconhecida')
     or coalesce(p_consulta ->> 'link_id', '') !~ '^[A-Za-z0-9_-]{1,80}$'
     or (v_situacao in ('pago', 'estornado') and (coalesce(v_id, '') !~ '^[A-Za-z0-9_-]{1,80}$'
                                                 or coalesce(jsonb_typeof(p_consulta -> 'valor_centavos'), '') <> 'number'))
     or (v_final is not null and v_final !~ '^[0-9]{4}$') or (v_bandeira is not null and v_bandeira !~ '^[A-Z]{2,20}$') then
    raise exception 'Consulta inválida' using errcode = '22023';
  end if;
  if v_situacao in ('pago', 'estornado') then
    begin
      v_valor := (p_consulta ->> 'valor_centavos')::bigint;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Consulta inválida' using errcode = '22023';
    end;
  end if;
  select x.* into v_cartao from public.caixa_cartao x where x.id = p_cartao for update;
  if not found then
    raise exception 'Cartão não encontrado' using errcode = 'P0002';
  end if;
  perform set_config('ora.motivo', 'Consulta do cartão pela Asaas (PAY-015b)', true);
  select v.situacao in ('rascunho', 'aguardando_aprovacao') into v_aberta from public.vendas v where v.id = v_cartao.venda_id;
  if v_cartao.link_id is distinct from p_consulta ->> 'link_id' then
    v_resultado := 'link_desconhecido';
  elsif v_situacao = 'desconhecida' then
    v_resultado := 'situacao_desconhecida';
    v_divergencia := 'a Asaas respondeu uma situação que o sistema não conhece';
  elsif v_situacao = 'pago' then
    if v_valor <> v_cartao.valor_centavos then
      v_resultado := 'divergencia';
      v_divergencia := 'o valor pago é outro';
    elsif v_cartao.situacao in ('aguardando', 'cancelando', 'vencido') then
      update public.caixa_cartao x
      set situacao = 'pago', pago_em = now(), id_no_provedor = v_id, cartao_final = v_final, cartao_bandeira = v_bandeira,
          atualizado_em = now()
      where x.id = v_cartao.id;
      if not v_aberta then
        v_divergencia := 'pago depois de a venda ser cancelada: devolva pela Asaas';
      end if;
      v_resultado := 'confirmado';
    elsif v_cartao.situacao in ('pago', 'estornado') and v_cartao.id_no_provedor = v_id then
      v_resultado := 'ja_registrado';
    else
      v_resultado := 'divergencia';
      v_divergencia := 'pago depois de o link ser cancelado';
    end if;
  elsif v_situacao = 'estornado' then
    if v_cartao.situacao = 'pago' and v_cartao.id_no_provedor = v_id then
      update public.caixa_cartao x set situacao = 'estornado', estornado_em = now(), atualizado_em = now() where x.id = v_cartao.id;
      if exists (select 1 from public.venda_pagamentos p where p.caixa_cartao_id = v_cartao.id) then
        v_divergencia := 'estornado na Asaas depois da venda concluída: registre o estorno na venda';
      end if;
      v_resultado := 'estorno_registrado';
    elsif v_cartao.situacao = 'estornado' then
      v_resultado := 'ja_registrado';
    else
      v_resultado := 'divergencia';
      v_divergencia := 'estorno sem pagamento';
    end if;
  elsif v_cartao.situacao = 'cancelando' then
    v_resultado := 'pode_desativar';
  elsif v_cartao.situacao = 'aguardando' and v_cartao.expira_em < now() - interval '2 minutes' then
    update public.caixa_cartao x set situacao = 'vencido', atualizado_em = now() where x.id = v_cartao.id;
    v_resultado := 'vencido';
  else
    v_resultado := 'pendente';
  end if;
  update public.caixa_cartao x
  set conferido_em = now(), reservado_ate = null, divergencia = coalesce(v_divergencia, x.divergencia)
  where x.id = v_cartao.id;
  return v_resultado;
end;
$$;

-- Os links a desativar na Asaas: o cancelado e o vencido que ainda estão ativos lá (o que a venda desistiu sai pela consulta:
-- pode_desativar).
create or replace function public.caixa_cartao_a_desativar(p_limite int default 20)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'link_id', x.link_id) order by x.atualizado_em, x.id), '[]'::jsonb)
  from (select x.id, x.link_id, x.atualizado_em from public.caixa_cartao x
        where x.link_id is not null and x.link_desativado_em is null and x.situacao in ('cancelado', 'vencido')
        order by x.atualizado_em, x.id
        limit least(greatest(coalesce(p_limite, 20), 1), 50)) x;
$$;

-- O link desativado na Asaas: a desistência termina (cancelando → cancelado).
create or replace function public.caixa_cartao_link_desativado(p_cartao uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cartao public.caixa_cartao;
begin
  perform set_config('ora.motivo', 'Link do cartão pela Asaas desativado (PAY-015b)', true);
  update public.caixa_cartao x
  set link_desativado_em = now(), situacao = case when x.situacao = 'cancelando' then 'cancelado' else x.situacao end,
      reservado_ate = null, atualizado_em = now()
  where x.id = p_cartao and x.link_id is not null and x.link_desativado_em is null and x.situacao in ('cancelando', 'cancelado', 'vencido')
  returning x.* into v_cartao;
  if not found then
    raise exception 'Este link não está para desativar' using errcode = 'P0002';
  end if;
  return v_cartao.situacao;
end;
$$;

revoke all on function public.caixa_cartao_situacao(boolean, text) from public, anon, authenticated;
revoke all on function public.caixa_cartao_a_criar(int) from public, anon, authenticated;
revoke all on function public.caixa_cartao_link_registrar(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.caixa_cartao_criacao_falhou(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.caixa_cartao_a_conferir(int) from public, anon, authenticated;
revoke all on function public.caixa_cartao_consulta_aplicar(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.caixa_cartao_a_desativar(int) from public, anon, authenticated;
revoke all on function public.caixa_cartao_link_desativado(uuid) from public, anon, authenticated;
grant execute on function public.caixa_cartao_situacao(boolean, text) to service_role;
grant execute on function public.caixa_cartao_a_criar(int) to service_role;
grant execute on function public.caixa_cartao_link_registrar(uuid, text, text, timestamptz) to service_role;
grant execute on function public.caixa_cartao_criacao_falhou(uuid, text, boolean) to service_role;
grant execute on function public.caixa_cartao_a_conferir(int) to service_role;
grant execute on function public.caixa_cartao_consulta_aplicar(uuid, jsonb) to service_role;
grant execute on function public.caixa_cartao_a_desativar(int) to service_role;
grant execute on function public.caixa_cartao_link_desativado(uuid) to service_role;

-- 8) O Pix no caixa (o do PAY-015a): o QR não passa do que falta, contando também o cartão.
create or replace function public.caixa_pix_pedir(p_venda uuid, p_valor_centavos bigint, p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_unidade uuid := (select public.unidade_atual());
  v_venda public.vendas;
  v_existente public.caixa_pix;
  v_pix public.caixa_pix;
  v_total bigint;
  v_comprometido bigint;
begin
  if v_usuario is null or v_unidade is null or not coalesce((select public.tem_permissao('venda.registrar', v_unidade)), false) then
    raise exception 'Sem permissão para vender nesta loja' using errcode = '42501';
  end if;
  if p_chave is null or length(trim(p_chave)) not between 1 and 120 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  if p_valor_centavos is null or p_valor_centavos not between 1 and 100000000 then
    raise exception 'Valor do Pix inválido' using errcode = '22023';
  end if;
  v_venda := privado.minha_venda_aberta(p_venda);
  perform pg_advisory_xact_lock(privado.trava_da_chave('caixa_pix', v_venda.organizacao_id, p_chave));
  select x.* into v_existente from public.caixa_pix x where x.organizacao_id = v_venda.organizacao_id and x.chave = p_chave;
  if found then
    if v_existente.venda_id <> v_venda.id or v_existente.valor_centavos <> p_valor_centavos or v_existente.pedido_por <> v_usuario then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return jsonb_build_object('id', v_existente.id, 'numero', v_existente.numero, 'situacao', v_existente.situacao, 'repetido', true);
  end if;
  if not privado.caixa_pix_ligado() then
    raise exception 'O Pix pela Asaas ainda não está ligado no caixa' using errcode = 'OR058';
  end if;
  -- O QR não passa do que falta pagar: o total dos itens menos o que a venda já tem pedido ou pago (o Pix, o cartão pela
  -- Asaas, PAY-015b, e o pedido pago pelo site). A conclusão confere de novo (o desconto pode mudar depois).
  select coalesce(sum(i.preco_unitario_centavos * i.quantidade - i.desconto_centavos), 0) into v_total
  from public.venda_itens i where i.venda_id = v_venda.id;
  v_comprometido := privado.caixa_comprometido(v_venda.id);
  if p_valor_centavos > v_total - v_comprometido then
    raise exception 'O Pix passa do que falta pagar nesta venda' using errcode = 'OR009';
  end if;
  perform set_config('ora.motivo', 'Pix pela Asaas pedido no caixa (PAY-015a)', true);
  insert into public.caixa_pix (organizacao_id, unidade_id, venda_id, pedido_por, chave, valor_centavos)
  values (v_venda.organizacao_id, v_venda.unidade_id, v_venda.id, v_usuario, p_chave, p_valor_centavos)
  returning * into v_pix;
  return jsonb_build_object('id', v_pix.id, 'numero', v_pix.numero, 'situacao', v_pix.situacao);
end;
$$;

-- 9) A conclusão da venda (a do PAY-015a), com as linhas do cartão pela Asaas pago.
create or replace function public.concluir_venda(p_venda uuid, p_pagamentos jsonb, p_cliente jsonb, p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  unidade uuid := (select public.unidade_atual());
  organizacao uuid;
  conteudo text;
  venda public.vendas;
  caixa public.caixas;
  item public.venda_itens;
  pagamento jsonb;
  ordem int := 0;
  meio text;
  valor bigint;
  entrada bigint;
  meio_entrada text;
  comprovante text;
  subtotal bigint := 0;
  descontos bigint := 0;
  total bigint;
  recebido bigint := 0;
  a_receber bigint := 0;
  em_dinheiro bigint := 0;
  excedente bigint;
  troco bigint;
  email text := nullif(lower(trim(coalesce(p_cliente ->> 'email', ''))), '');
  nome text := nullif(trim(coalesce(p_cliente ->> 'nome', '')), '');
  cliente_rede uuid; -- L5a
  terminal_escolhido uuid; -- L7a
  parcelas int; -- PDV-c
  tem_financeira boolean; -- PDV-c
  financiado bigint := 0; -- PDV-c
  valor_aparelhos bigint := 0; -- PDV-c
  pagamento_id uuid;
  reserva public.estoque_reservas;
  os_da_venda public.ordens_servico; -- L12c
  orcamento_da_os public.os_orcamentos; -- L12c
  do_site public.loja_pagamentos; -- PAY-014b
  pago_pelo_site bigint := 0; -- PAY-014b
  pix public.caixa_pix; -- PAY-015a
  pix_pagos bigint := 0; -- PAY-015a
  cartao public.caixa_cartao; -- PAY-015b
  cartao_pagos bigint := 0; -- PAY-015b
begin
  if unidade is null or not (select public.tem_permissao('venda.registrar', unidade)) then
    raise exception 'Sem permissão para vender nesta loja' using errcode = '42501';
  end if;
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  -- PAY-014b: a lista pode vir vazia quando o pedido pago pelo site cobre a venda (conferido depois de ler a venda).
  if p_pagamentos is null or jsonb_typeof(p_pagamentos) <> 'array' then
    raise exception 'Informe ao menos um pagamento' using errcode = 'OR009';
  end if;
  select u.organizacao_id into organizacao from public.unidades u where u.id = unidade;
  conteudo := md5(concat_ws('|', p_venda, p_pagamentos::text, coalesce(p_cliente, '{}'::jsonb)::text));

  -- (0) chave: a repetição devolve o mesmo resultado; outro conteúdo, OR004
  perform pg_advisory_xact_lock(privado.trava_da_chave('vendas_conclusao', organizacao, p_chave));
  select * into venda from public.vendas v where v.organizacao_id = organizacao and v.chave_conclusao = p_chave;
  if found then
    if venda.conteudo_conclusao <> conteudo or venda.vendedor_id <> usuario then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return jsonb_build_object('venda', venda.id, 'numero', venda.numero, 'total', venda.total_centavos, 'troco', venda.troco_centavos,
                              'recebido', venda.recebido_centavos, 'a_receber', venda.a_receber_centavos, 'repetida', true);
  end if;

  -- (1) venda, (2) caixa
  venda := privado.minha_venda_aberta(p_venda);
  if venda.situacao = 'aguardando_aprovacao' then
    raise exception 'Há desconto aguardando aprovação' using errcode = 'OR010';
  end if;
  if not exists (select 1 from public.venda_itens i where i.venda_id = venda.id) then
    raise exception 'A venda não tem itens' using errcode = '22023';
  end if;
  -- PAY-014b: o pedido pago pelo site que esta venda atende. A trava segura até o fim da conclusão o estorno que chega
  -- pelo worker (ele trava o pagamento antes de mexer no resto).
  select pg.* into do_site from public.loja_pagamentos pg
  where pg.pedido_id in (select p.id from public.loja_pedidos p where p.venda_id = venda.id) and pg.situacao = 'pago'
  for update;
  pago_pelo_site := coalesce(do_site.valor_centavos, 0);
  -- PAY-015a: os Pix pela Asaas da venda, travados até o fim da conclusão (o worker trava o QR antes de mexer). Um QR que
  -- ainda espera segura a conclusão: ou ele é pago, ou cancelado.
  perform 1 from public.caixa_pix x where x.venda_id = venda.id order by x.id for update;
  if exists (select 1 from public.caixa_pix x where x.venda_id = venda.id and x.situacao in ('criando', 'aguardando', 'cancelando')) then
    raise exception 'Há um Pix pela Asaas esperando: espere o pagamento ou cancele o QR Code' using errcode = 'OR059';
  end if;
  select coalesce(sum(x.valor_centavos), 0) into pix_pagos from public.caixa_pix x where x.venda_id = venda.id and x.situacao = 'pago';
  -- PAY-015b: os links do cartão pela Asaas, do mesmo jeito (travados; o que espera segura a conclusão).
  perform 1 from public.caixa_cartao x where x.venda_id = venda.id order by x.id for update;
  if exists (select 1 from public.caixa_cartao x where x.venda_id = venda.id and x.situacao in ('criando', 'aguardando', 'cancelando')) then
    raise exception 'Há um cartão pela Asaas esperando: espere o pagamento ou cancele o link' using errcode = 'OR059';
  end if;
  select coalesce(sum(x.valor_centavos), 0) into cartao_pagos from public.caixa_cartao x where x.venda_id = venda.id and x.situacao = 'pago';
  if jsonb_array_length(p_pagamentos) = 0 and pago_pelo_site = 0 and pix_pagos = 0 and cartao_pagos = 0 then
    raise exception 'Informe ao menos um pagamento' using errcode = 'OR009';
  end if;
  caixa := privado.meu_caixa_aberto();
  if email is not null and email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-mail do cliente inválido' using errcode = '22023';
  end if;
  -- L5a: cliente da rede escolhido na venda pela busca exata; o nome e o e-mail digitados seguem como origem.
  if nullif(p_cliente ->> 'id', '') is not null then
    begin
      cliente_rede := (p_cliente ->> 'id')::uuid;
    exception when others then
      raise exception 'Cliente inválido' using errcode = '22023';
    end;
    if not public.tem_permissao('cliente.buscar', unidade) or not exists (
         select 1 from public.clientes c where c.id = cliente_rede and c.organizacao_id = organizacao and c.situacao = 'ativo') then
      raise exception 'Cliente não encontrado nesta rede' using errcode = '22023';
    end if;
  end if;

  -- (3) itens serializados em ordem de id
  perform 1 from public.itens_serializados s
  where s.id in (select i.item_serializado_id from public.venda_itens i where i.venda_id = venda.id and i.item_serializado_id is not null)
  order by s.id for update;
  -- L12c: as OS cobradas por esta venda, travadas em ordem de id (duas vendas com a mesma OS não concluem juntas).
  perform 1 from public.ordens_servico o
  where o.id in (select i.os_id from public.venda_itens i where i.venda_id = venda.id and i.os_id is not null)
  order by o.id for update;

  for item in select * from public.venda_itens i where i.venda_id = venda.id order by i.criado_em, i.id loop
    if item.os_id is not null then
      -- L12c: o conserto da OS vale o orçamento aprovado (não tem preço de catálogo) e só é cobrado uma vez.
      select * into os_da_venda from public.ordens_servico o where o.id = item.os_id;
      if os_da_venda.venda_id is not null then
        raise exception 'Esta ordem de serviço já foi cobrada (venda nº %)', (select v.numero from public.vendas v where v.id = os_da_venda.venda_id)
          using errcode = 'OR032';
      end if;
      if os_da_venda.situacao <> 'aberta' or os_da_venda.servico <> 'concluido' or os_da_venda.local <> 'loja'
         or os_da_venda.unidade_id <> venda.unidade_id then
        raise exception 'A ordem de serviço mudou: tire o conserto do carrinho e cobre de novo pela OS' using errcode = 'OR007';
      end if;
      orcamento_da_os := privado.os_orcamento_aprovado(item.os_id);
      if orcamento_da_os.total_centavos is distinct from item.preco_unitario_centavos then
        raise exception 'O preço de um item mudou: confira o carrinho' using errcode = 'OR007';
      end if;
    elsif item.loja_reserva_id is not null then
      -- PAY-014b: o item do pedido pago vale o preço pago (o da reserva do site), enquanto o pagamento estiver pago.
      if do_site.id is null then
        raise exception 'O pagamento pelo site deste pedido foi estornado: tire os itens do pedido e cobre pelo PDV' using errcode = 'OR007';
      end if;
      if item.preco_unitario_centavos is distinct from (
           select r.preco_centavos from public.loja_reservas r where r.id = item.loja_reserva_id and r.pedido_id = do_site.pedido_id) then
        raise exception 'O preço de um item mudou: confira o carrinho' using errcode = 'OR007';
      end if;
    elsif public.preco_vigente(item.variante_id, venda.unidade_id, case venda.canal when 'online' then 'online' else 'loja' end)
       is distinct from item.preco_unitario_centavos then
      raise exception 'O preço de um item mudou: confira o carrinho' using errcode = 'OR007';
    end if;
    if (item.desconto_centavos > privado.maximo_sem_aprovacao(item) or privado.abaixo_do_custo(item)) and not exists (
         select 1 from public.aprovacoes_desconto a
         where a.item_id = item.id and a.situacao = 'aprovada' and a.conteudo = privado.conteudo_do_item(item) and a.expira_em > now()) then
      raise exception 'Desconto sem aprovação válida' using errcode = 'OR010';
    end if;
    if item.reserva_id is not null then
      select * into reserva from public.estoque_reservas r where r.id = item.reserva_id;
      if reserva.situacao <> 'ativa' or reserva.expira_em <= now() then
        raise exception 'A reserva de um item venceu: tire e coloque de novo' using errcode = 'OR002';
      end if;
    end if;
    subtotal := subtotal + item.preco_unitario_centavos * item.quantidade;
    descontos := descontos + item.desconto_centavos;
    -- PDV-c: o valor do celular (o que a PayJoy e a Aiva podem financiar). PAY-014b: o celular já pago pelo site, não.
    if item.tipo = 'aparelho' and item.loja_reserva_id is null then
      valor_aparelhos := valor_aparelhos + item.preco_unitario_centavos * item.quantidade - item.desconto_centavos;
    end if;
  end loop;
  total := subtotal - descontos;

  -- Pagamentos: a mesma regra de packages/dominio/src/pagamento.ts
  tem_financeira := exists (select 1 from jsonb_array_elements(p_pagamentos) e
                           where jsonb_typeof(e) = 'object' and e ->> 'meio' in ('payjoy', 'aiva'));
  for pagamento in select value from jsonb_array_elements(p_pagamentos) loop
    meio := pagamento ->> 'meio';
    if meio is null or not privado.meio_valido(meio) then
      raise exception 'Meio de pagamento desconhecido' using errcode = 'OR009';
    end if;
    -- PDV-c (pedido do proprietário de 18/11): a quantidade de parcelas em todos os casos que parcelam (a PayJoy, a Aiva
    -- e o cartão) e a entrada do financiamento como um lançamento separado, na mesma venda, em dinheiro, Pix ou cartão.
    if (pagamento ? 'parcelas' and jsonb_typeof(pagamento -> 'parcelas') not in ('number', 'null'))
       or (pagamento ->> 'parcelas' is not null and pagamento ->> 'parcelas' !~ '^[0-9]{1,2}$')
       or (pagamento ? 'entrada_do_financiamento' and jsonb_typeof(pagamento -> 'entrada_do_financiamento') not in ('boolean', 'null')) then
      raise exception 'Parcelas ou entrada em formato inválido' using errcode = 'OR009';
    end if;
    parcelas := (pagamento ->> 'parcelas')::int;
    if privado.meio_financeira(meio) and (parcelas is null or parcelas not between 1 and 48) then
      raise exception 'Informe em quantas parcelas a % financiou (de 1 a 48)', case meio when 'payjoy' then 'PayJoy' else 'Aiva' end
        using errcode = 'OR009';
    end if;
    if meio in ('cartao_picpay', 'cartao_pagseguro') and parcelas is not null and parcelas not between 1 and 24 then
      raise exception 'O cartão parcela de 1 a 24 vezes' using errcode = 'OR009';
    end if;
    if not privado.meio_financeira(meio) and meio not in ('cartao_picpay', 'cartao_pagseguro') and coalesce(parcelas, 1) <> 1 then
      raise exception 'Só o cartão, a PayJoy e a Aiva têm parcelas' using errcode = 'OR009';
    end if;
    if coalesce((pagamento ->> 'entrada_do_financiamento')::boolean, false) then
      if privado.meio_financeira(meio) or meio in ('vale_troca', 'link_pagamento') then
        raise exception 'A entrada do financiamento é paga em dinheiro, Pix ou cartão' using errcode = 'OR009';
      end if;
      if not tem_financeira then
        raise exception 'A entrada só existe numa venda com a PayJoy ou a Aiva' using errcode = 'OR009';
      end if;
    end if;
    if meio = 'link_pagamento' then
      raise exception 'O link de pagamento é só do pagamento pelo site (o banco põe a linha dele): use outro meio' using errcode = 'OR009';
    end if;
    -- PAY-015a: o Pix pela Asaas também entra sozinho (o banco põe a linha de cada QR pago).
    if meio = 'pix_asaas' then
      raise exception 'O Pix pela Asaas entra sozinho quando o QR Code é pago: use outro meio' using errcode = 'OR009';
    end if;
    -- PAY-015b: o cartão pela Asaas também (o banco põe a linha de cada link pago).
    if meio = 'cartao_asaas' then
      raise exception 'O cartão pela Asaas entra sozinho quando o link é pago: use outro meio' using errcode = 'OR009';
    end if;
    begin
      valor := (pagamento ->> 'valor')::bigint;
      entrada := coalesce((pagamento ->> 'entrada')::bigint, 0);
    exception when others then
      raise exception 'Valor de pagamento inválido' using errcode = 'OR009';
    end;
    if valor is null or valor <= 0 or entrada < 0 or entrada > valor then
      raise exception 'Valor de pagamento inválido' using errcode = 'OR009';
    end if;
    if privado.meio_com_comprovante(meio) and length(trim(coalesce(pagamento ->> 'comprovante', ''))) < 4 then
      raise exception 'Informe o código do comprovante' using errcode = 'OR009';
    end if;
    -- L7a: maquininha usada (obrigatória quando a loja tem maquininha ativa daquele provedor).
    perform privado.terminal_do_pagamento(venda.unidade_id, meio, pagamento ->> 'terminal');
    if privado.meio_financeira(meio) then
      -- 16/11/2026: o e-mail do cliente é opcional também na PayJoy (regra do proprietário de 12/11, #76; DEC-U30
      -- substituída). Exigência de um parceiro só com o contrato dele comprovado, no adaptador e só na operação dele.
      meio_entrada := case when entrada > 0 then coalesce(pagamento ->> 'meio_entrada', 'dinheiro') end;
      if meio_entrada is not null and (not privado.meio_valido(meio_entrada) or privado.meio_financeira(meio_entrada)
                                       or meio_entrada in ('link_pagamento', 'vale_troca', 'pix_asaas', 'cartao_asaas')) then
        raise exception 'Meio da entrada inválido' using errcode = 'OR009';
      end if;
      -- Entrada por Pix ou cartão também precisa do comprovante (REV-044, #46).
      if meio_entrada is not null and privado.meio_com_comprovante(meio_entrada)
         and length(trim(coalesce(pagamento ->> 'comprovante', ''))) < 4 then
        raise exception 'Informe o código do comprovante da entrada' using errcode = 'OR009';
      end if;
      recebido := recebido + entrada;
      a_receber := a_receber + valor - entrada;
      financiado := financiado + valor - entrada; -- PDV-c
      -- Troco só sai de linha em dinheiro (REV-046, #48), como em packages/dominio/src/pagamento.ts:
      -- crédito da financeira acima do preço nunca vira dinheiro na mão do cliente.
    else
      if entrada <> 0 then
        raise exception 'Entrada só existe em financiamento' using errcode = 'OR009';
      end if;
      recebido := recebido + valor;
      if meio = 'dinheiro' then
        em_dinheiro := em_dinheiro + valor;
      end if;
    end if;
  end loop;
  -- PAY-014b: o pago pelo site entra como recebido (o dinheiro está com a Asaas; o repasse é da conciliação). O pedido
  -- pago sai pelo preço pago: o desconto que deixe o total abaixo do pago é recusado.
  if pago_pelo_site > total then
    raise exception 'O pedido foi pago pelo site pelo preço anunciado: tire o desconto dos itens dele' using errcode = 'OR009';
  end if;
  -- PAY-015a: o Pix pela Asaas pago entra como recebido (o dinheiro está com a Asaas; o repasse é da conciliação). Ele não
  -- dá troco: o que passar do total volta pela Asaas.
  if pago_pelo_site + pix_pagos > total then
    raise exception 'O Pix pela Asaas pago passa do total da venda: devolva a diferença pela Asaas ou ponha o item de volta' using errcode = 'OR009';
  end if;
  -- PAY-015b: o cartão pela Asaas pago, do mesmo jeito (sem troco: o que passar do total volta pela Asaas).
  if pago_pelo_site + pix_pagos + cartao_pagos > total then
    raise exception 'O cartão pela Asaas pago passa do total da venda: devolva a diferença pela Asaas ou ponha o item de volta' using errcode = 'OR009';
  end if;
  recebido := recebido + pago_pelo_site + pix_pagos + cartao_pagos;
  excedente := greatest(0, recebido + a_receber - total);
  troco := least(excedente, em_dinheiro);
  if excedente > troco then
    raise exception 'Pagamento maior que o total sem dinheiro para dar troco' using errcode = 'OR009';
  end if;
  if recebido + a_receber < total then
    raise exception 'Falta pagar %', total - recebido - a_receber using errcode = 'OR009';
  end if;
  -- PDV-c: a PayJoy e a Aiva financiam só o celular. O chip, os acessórios e os serviços entram na mesma venda e são
  -- pagos à parte (a entrada também é um lançamento à parte).
  if financiado > valor_aparelhos then
    if valor_aparelhos = 0 then
      raise exception 'A PayJoy e a Aiva financiam só o celular: esta venda não tem celular' using errcode = 'OR009';
    end if;
    raise exception 'A PayJoy e a Aiva financiam só o valor do celular: o chip, os acessórios e os serviços são pagos à parte'
      using errcode = 'OR009';
  end if;

  -- Estoque: consome as reservas e lança a saída "venda" (reserva e saldo vêm depois dos itens)
  for item in select * from public.venda_itens i where i.venda_id = venda.id order by i.criado_em, i.id loop
    if item.reserva_id is not null then
      perform privado.encerrar_reserva(item.reserva_id, 'consumida');
    end if;
    if item.tipo in ('aparelho', 'chip', 'acessorio') then
      perform privado.lancar_movimento(venda.unidade_id, item.variante_id, -item.quantidade, 'venda', item.item_serializado_id,
        null, 'venda', venda.id::text, 'venda:' || venda.id || ':item:' || item.id, usuario);
    end if;
  end loop;

  -- Pagamentos, caixa e valores a receber
  -- PAY-014b: a linha "pago pelo site" (o link de pagamento da Asaas), gravada pelo banco e sempre a primeira. Como o
  -- cartão, entra no caixa como recebimento do seu meio (o fechamento conta só o dinheiro).
  if do_site.id is not null then
    ordem := ordem + 1;
    insert into public.venda_pagamentos (organizacao_id, venda_id, ordem, meio, valor_centavos, entrada_centavos, comprovante, confirmacao,
                                         confirmado_por, loja_pagamento_id)
    values (venda.organizacao_id, venda.id, ordem, 'link_pagamento', do_site.valor_centavos, 0, do_site.id_no_provedor, 'provedor',
            usuario, do_site.id)
    returning id into pagamento_id;
    insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, pagamento_id, usuario_id, chave_idempotencia)
    values (venda.organizacao_id, caixa.id, 'recebimento', 'link_pagamento', do_site.valor_centavos, venda.id, pagamento_id, usuario,
            'venda:' || venda.id || ':pagamento:' || ordem);
  end if;
  -- PAY-015a: as linhas "Pix pela Asaas" (uma por QR pago), gravadas pelo banco depois da do site. Como o cartão, entram
  -- no caixa como recebimento do seu meio (o fechamento conta só o dinheiro).
  for pix in select x.* from public.caixa_pix x where x.venda_id = venda.id and x.situacao = 'pago' order by x.numero loop
    ordem := ordem + 1;
    insert into public.venda_pagamentos (organizacao_id, venda_id, ordem, meio, valor_centavos, entrada_centavos, comprovante, confirmacao,
                                         confirmado_por, caixa_pix_id)
    values (venda.organizacao_id, venda.id, ordem, 'pix_asaas', pix.valor_centavos, 0, pix.id_no_provedor, 'provedor', usuario, pix.id)
    returning id into pagamento_id;
    insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, pagamento_id, usuario_id, chave_idempotencia)
    values (venda.organizacao_id, caixa.id, 'recebimento', 'pix_asaas', pix.valor_centavos, venda.id, pagamento_id, usuario,
            'venda:' || venda.id || ':pagamento:' || ordem);
  end loop;
  -- PAY-015b: as linhas "Cartão pela Asaas" (uma por link pago), depois das do Pix. No caixa, recebimento do seu meio.
  for cartao in select x.* from public.caixa_cartao x where x.venda_id = venda.id and x.situacao = 'pago' order by x.numero loop
    ordem := ordem + 1;
    insert into public.venda_pagamentos (organizacao_id, venda_id, ordem, meio, valor_centavos, entrada_centavos, comprovante, confirmacao,
                                         confirmado_por, caixa_cartao_id)
    values (venda.organizacao_id, venda.id, ordem, 'cartao_asaas', cartao.valor_centavos, 0, cartao.id_no_provedor, 'provedor', usuario, cartao.id)
    returning id into pagamento_id;
    insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, pagamento_id, usuario_id, chave_idempotencia)
    values (venda.organizacao_id, caixa.id, 'recebimento', 'cartao_asaas', cartao.valor_centavos, venda.id, pagamento_id, usuario,
            'venda:' || venda.id || ':pagamento:' || ordem);
  end loop;
  for pagamento in select value from jsonb_array_elements(p_pagamentos) loop
    ordem := ordem + 1;
    meio := pagamento ->> 'meio';
    valor := (pagamento ->> 'valor')::bigint;
    entrada := coalesce((pagamento ->> 'entrada')::bigint, 0);
    meio_entrada := case when privado.meio_financeira(meio) and entrada > 0 then coalesce(pagamento ->> 'meio_entrada', 'dinheiro') end;
    comprovante := nullif(trim(coalesce(pagamento ->> 'comprovante', '')), '');
    terminal_escolhido := privado.terminal_do_pagamento(venda.unidade_id, meio, pagamento ->> 'terminal'); -- L7a
    parcelas := (pagamento ->> 'parcelas')::int; -- PDV-c
    insert into public.venda_pagamentos (organizacao_id, venda_id, ordem, meio, valor_centavos, entrada_centavos, meio_entrada, comprovante, confirmacao, confirmado_por,
                                         terminal_id, parcelas, entrada_do_financiamento) -- L7a, PDV-c
    values (venda.organizacao_id, venda.id, ordem, meio, valor, entrada, meio_entrada, comprovante,
            case when meio = 'dinheiro' then 'caixa' when privado.meio_financeira(meio) then 'financeira' else 'manual' end, usuario,
            terminal_escolhido,
            case when privado.meio_financeira(meio) or meio in ('cartao_picpay', 'cartao_pagseguro') then coalesce(parcelas, 1) end,
            coalesce((pagamento ->> 'entrada_do_financiamento')::boolean, false))
    returning id into pagamento_id;
    if privado.meio_financeira(meio) then
      if entrada > 0 then
        insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, pagamento_id, usuario_id, chave_idempotencia)
        values (venda.organizacao_id, caixa.id, 'recebimento', meio_entrada, entrada, venda.id, pagamento_id, usuario, 'venda:' || venda.id || ':pagamento:' || ordem);
      end if;
      if valor - entrada > 0 then
        insert into public.contas_a_receber (organizacao_id, unidade_id, venda_id, pagamento_id, devedor, valor_centavos)
        values (venda.organizacao_id, venda.unidade_id, venda.id, pagamento_id, meio, valor - entrada);
      end if;
    else
      insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, pagamento_id, usuario_id, chave_idempotencia)
      values (venda.organizacao_id, caixa.id, 'recebimento', meio, valor, venda.id, pagamento_id, usuario, 'venda:' || venda.id || ':pagamento:' || ordem);
    end if;
  end loop;
  if troco > 0 then
    insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, usuario_id, chave_idempotencia)
    values (venda.organizacao_id, caixa.id, 'troco', 'dinheiro', -troco, venda.id, usuario, 'venda:' || venda.id || ':troco');
  end if;

  update public.vendas v
  set situacao = 'concluida', concluida_em = now(), subtotal_centavos = subtotal, desconto_centavos = descontos, total_centavos = total,
      troco_centavos = troco, recebido_centavos = recebido - troco, a_receber_centavos = a_receber, caixa_id = caixa.id,
      chave_conclusao = p_chave, conteudo_conclusao = conteudo,
      cliente_nome = coalesce(nome, v.cliente_nome), cliente_email = coalesce(email, v.cliente_email),
      cliente_id = coalesce(cliente_rede, v.cliente_id) -- L5a
  where v.id = venda.id
  returning * into venda;
  -- L12c: a OS fica cobrada por esta venda, com o evento na trilha (a produção é a da venda, uma vez).
  for os_da_venda in select o.* from public.ordens_servico o
                     where o.id in (select i.os_id from public.venda_itens i where i.venda_id = venda.id and i.os_id is not null)
                     order by o.id loop
    update public.ordens_servico o set venda_id = venda.id, cobrada_em = now(), atualizada_em = now() where o.id = os_da_venda.id;
    perform privado.os_evento(os_da_venda, 'cobrada', null, null, 'Venda nº ' || venda.numero, false, venda.unidade_id);
  end loop;
  return jsonb_build_object('venda', venda.id, 'numero', venda.numero, 'total', total, 'troco', troco,
                            'recebido', recebido - troco, 'a_receber', a_receber, 'pago_pelo_site', pago_pelo_site, 'pago_no_pix', pix_pagos, 'pago_no_cartao', cartao_pagos, 'repetida', false);
end;
$$;

-- 10) Cancelar a venda (a do PAY-015a): a venda aberta com cartão pago presa até o estorno; os links que esperam saem junto.
create or replace function public.cancelar_venda(p_venda uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  venda public.vendas;
  caixa public.caixas;
  item public.venda_itens;
  pagamento public.venda_pagamentos;
  troco_a_descontar bigint;
  devolver bigint;
  descontar bigint;
  em_dinheiro bigint := 0;
  dinheiro_por_pagamento jsonb := '{}'::jsonb;
  externo boolean;
begin
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Informe o motivo' using errcode = '22023';
  end if;
  select * into venda from public.vendas v where v.id = p_venda for update;
  if not found or venda.unidade_id is distinct from (select public.unidade_atual())
     or not ((venda.vendedor_id = usuario and venda.situacao in ('rascunho', 'aguardando_aprovacao')
              and (select public.tem_permissao('venda.registrar', venda.unidade_id)))
             or (select public.tem_permissao('venda.cancelar', venda.unidade_id))) then
    raise exception 'Venda não encontrada' using errcode = 'P0002';
  end if;
  if venda.situacao = 'cancelada' then
    return false;
  end if;
  -- PAY-014b: a venda aberta do pedido pago pelo site não se cancela enquanto o dinheiro não voltar (OR048, como o pedido):
  -- o estorno é pelo painel da Asaas, e o aviso dele volta pelo worker. Concluída, segue o cancelamento de sempre (a linha
  -- do link vira estorno externo a confirmar com o comprovante).
  if venda.situacao in ('rascunho', 'aguardando_aprovacao') and exists (
       select 1 from public.loja_pedidos p join public.loja_pagamentos pg on pg.pedido_id = p.id
       where p.venda_id = venda.id and pg.situacao = 'pago') then
    raise exception 'O pedido desta venda foi pago pelo site: conclua a venda; para desistir, o estorno é pelo painel da Asaas'
      using errcode = 'OR048';
  end if;
  -- PAY-015a: a venda aberta com Pix pela Asaas pago também não se cancela enquanto o dinheiro não voltar (OR048).
  if venda.situacao in ('rascunho', 'aguardando_aprovacao') and exists (
       select 1 from public.caixa_pix x where x.venda_id = venda.id and x.situacao = 'pago') then
    raise exception 'Esta venda tem Pix pela Asaas pago: conclua a venda; para desistir, o estorno é pelo painel da Asaas'
      using errcode = 'OR048';
  end if;
  -- PAY-015b: e com cartão pela Asaas pago (OR048).
  if venda.situacao in ('rascunho', 'aguardando_aprovacao') and exists (
       select 1 from public.caixa_cartao x where x.venda_id = venda.id and x.situacao = 'pago') then
    raise exception 'Esta venda tem cartão pela Asaas pago: conclua a venda; para desistir, o estorno é pelo painel da Asaas'
      using errcode = 'OR048';
  end if;

  if venda.situacao in ('rascunho', 'aguardando_aprovacao') then
    -- PAY-015a: os QR que ainda esperam saem junto (o que o worker já pediu à Asaas é excluído por ele).
    update public.caixa_pix x
    set situacao = case when x.situacao = 'criando' and (x.reservado_ate is null or x.reservado_ate < now()) then 'cancelado' else 'cancelando' end,
        cancelado_em = now(), reservado_ate = case when x.situacao = 'criando' then x.reservado_ate end, atualizado_em = now()
    where x.venda_id = venda.id and x.situacao in ('criando', 'aguardando');
    delete from privado.caixa_pix_imagens i using public.caixa_pix x where i.pix_id = x.id and x.venda_id = venda.id;
    -- PAY-015b: os links do cartão que ainda esperam saem junto (o que está na Asaas o worker desativa).
    update public.caixa_cartao x
    set situacao = case when x.situacao = 'criando' and (x.reservado_ate is null or x.reservado_ate < now()) then 'cancelado' else 'cancelando' end,
        cancelado_em = now(), reservado_ate = case when x.situacao = 'criando' then x.reservado_ate end, atualizado_em = now()
    where x.venda_id = venda.id and x.situacao in ('criando', 'aguardando');
    for item in select * from public.venda_itens i where i.venda_id = venda.id loop
      if item.reserva_id is not null then
        perform privado.encerrar_reserva(item.reserva_id, 'liberada');
      end if;
    end loop;
    update public.aprovacoes_desconto a set situacao = 'invalidada' where a.venda_id = venda.id and a.situacao in ('pendente', 'aprovada');
  else
    -- Concluída: o cancelamento comercial separa três coisas (REV-047/048/049, #49–#51):
    --   * dinheiro: devolve o recebido líquido (troco descontado), do caixa de quem cancela, com o
    --     saldo conferido sob a trava do caixa — inclusive a entrada em dinheiro (#47);
    --   * Pix, cartão e financeira: estorno A CONFIRMAR com o comprovante (estornos_externos);
    --     o pagamento fica "estorno_pendente" até lá (#50);
    --   * aparelho, chip e acessório: aguardam o retorno físico conferido (venda_retornos); nada volta
    --     sozinho ao estoque (#51). Chip com ativação viva na Ora Connect impede o cancelamento.
    caixa := privado.meu_caixa_aberto();
    if exists (
         select 1 from public.connect_operacoes o
         where o.organizacao_id = venda.organizacao_id and o.tipo = 'ativacao'
           and o.situacao not in ('recusada', 'negada', 'nao_recebida', 'cancelada')
           and (o.venda_chip_id = venda.id or o.iccid in (
                 select s.iccid from public.venda_itens i join public.itens_serializados s on s.id = i.item_serializado_id
                 where i.venda_id = venda.id and s.iccid is not null))) then
      raise exception 'Chip com ativação na Ora Connect: resolva a operação antes de cancelar' using errcode = 'OR013';
    end if;
    troco_a_descontar := coalesce(venda.troco_centavos, 0);
    for pagamento in select * from public.venda_pagamentos p where p.venda_id = venda.id and p.situacao = 'confirmado' order by p.ordem loop
      devolver := case when pagamento.meio = 'dinheiro' then pagamento.valor_centavos
                       when privado.meio_financeira(pagamento.meio) and pagamento.meio_entrada = 'dinheiro' then pagamento.entrada_centavos
                       else 0 end;
      descontar := least(devolver, troco_a_descontar);
      troco_a_descontar := troco_a_descontar - descontar;
      devolver := devolver - descontar;
      if devolver > 0 then
        dinheiro_por_pagamento := dinheiro_por_pagamento || jsonb_build_object(pagamento.id::text, devolver);
        em_dinheiro := em_dinheiro + devolver;
      end if;
    end loop;
    if em_dinheiro > privado.dinheiro_no_caixa(caixa.id) then
      raise exception 'Não há dinheiro suficiente no seu caixa para devolver' using errcode = '23514';
    end if;
    for item in select * from public.venda_itens i where i.venda_id = venda.id order by i.criado_em, i.id loop
      if item.tipo in ('aparelho', 'chip', 'acessorio') then
        insert into public.venda_retornos (organizacao_id, unidade_id, venda_id, venda_item_id, quantidade, motivo, solicitado_por)
        values (venda.organizacao_id, venda.unidade_id, venda.id, item.id, item.quantidade, trim(p_motivo), usuario);
      end if;
    end loop;
    for pagamento in select * from public.venda_pagamentos p where p.venda_id = venda.id and p.situacao = 'confirmado' order by p.ordem loop
      devolver := coalesce((dinheiro_por_pagamento ->> pagamento.id::text)::bigint, 0);
      if devolver > 0 then
        insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, pagamento_id, motivo, usuario_id, chave_idempotencia)
        values (venda.organizacao_id, caixa.id, 'estorno', 'dinheiro', -devolver, venda.id, pagamento.id,
                trim(p_motivo), usuario, 'venda:' || venda.id || ':estorno:' || pagamento.ordem);
      end if;
      externo := false;
      if privado.meio_financeira(pagamento.meio) then
        update public.contas_a_receber r set situacao = 'cancelada', atualizado_em = now() where r.pagamento_id = pagamento.id and r.situacao = 'aberta';
        -- O contrato na financeira se cancela fora daqui: fica a confirmar com o protocolo.
        if pagamento.valor_centavos - pagamento.entrada_centavos > 0 then
          insert into public.estornos_externos (organizacao_id, unidade_id, venda_id, pagamento_id, meio, valor_centavos, solicitado_por)
          values (venda.organizacao_id, venda.unidade_id, venda.id, pagamento.id, pagamento.meio,
                  pagamento.valor_centavos - pagamento.entrada_centavos, usuario);
          externo := true;
        end if;
        if pagamento.entrada_centavos > 0 and pagamento.meio_entrada <> 'dinheiro' then
          insert into public.estornos_externos (organizacao_id, unidade_id, venda_id, pagamento_id, meio, valor_centavos, solicitado_por)
          values (venda.organizacao_id, venda.unidade_id, venda.id, pagamento.id, pagamento.meio_entrada, pagamento.entrada_centavos, usuario);
          externo := true;
        end if;
      elsif pagamento.meio not in ('dinheiro', 'vale_troca') then
        insert into public.estornos_externos (organizacao_id, unidade_id, venda_id, pagamento_id, meio, valor_centavos, solicitado_por)
        values (venda.organizacao_id, venda.unidade_id, venda.id, pagamento.id, pagamento.meio, pagamento.valor_centavos, usuario);
        externo := true;
      end if;
      -- Dinheiro e vale-troca se resolvem aqui; o resto espera o comprovante do estorno.
      update public.venda_pagamentos p
      set situacao = case when externo then 'estorno_pendente' else 'estornado' end,
          estornado_em = case when externo then null else now() end
      where p.id = pagamento.id;
    end loop;
  end if;
  perform set_config('ora.motivo', trim(p_motivo), true);
  update public.vendas v
  set situacao = 'cancelada', cancelada_em = now(), cancelada_por = usuario, motivo_cancelamento = trim(p_motivo)
  where v.id = venda.id;
  return true;
end;
$$;

-- 11) Os meios de pagamento (a lista do PAY-015a), com o cartao_asaas.
create or replace function privado.meio_valido(p_meio text)
returns boolean language sql immutable set search_path = ''
as $$ select p_meio in ('dinheiro', 'pix_direto', 'pix_picpay', 'cartao_picpay', 'cartao_pagseguro', 'link_pagamento', 'payjoy', 'aiva', 'vale_troca', 'pix_asaas', 'cartao_asaas'); $$;
