-- =============================================================================
-- Lote PAY-015c (25/11/2026; ORA-PAY-001, ORA-PAY-014 e ORA-CRM-002, que seguem parciais; ADR-025, adendo): a assinatura no
-- cartão pela Asaas (a recorrência). O proprietário, em 25/11: "tem que ter espaço para cadastrar os cartões, caso a pessoa
-- queira adicionar recorrência", com o cartão guardado "na Asaas" (a D-062). Na ficha do cliente, a loja cria a assinatura
-- (a descrição, o valor, o ciclo e, se quiser, a linha da Ora Connect); a tela mostra o QR Code do link recorrente da Asaas
-- e o cliente cadastra o cartão no celular dele, na página da Asaas (o cartão fica guardado lá; o sistema só vê a bandeira e
-- os 4 últimos dígitos). Depois, a Asaas cobra sozinha a cada ciclo, e o sistema acompanha a assinatura e as cobranças.
-- Contrato (docs.asaas.com, lida em 25/11): o link recorrente (POST /v3/paymentLinks com chargeType RECURRENT,
-- subscriptionCycle, billingType CREDIT_CARD e limit 1: preencher o link cria a assinatura), as cobranças de cartão (GET
-- /v3/payments: cada uma traz o paymentLink e o subscription), a assinatura (GET /v3/subscriptions/{id}: status ACTIVE,
-- INACTIVE ou EXPIRED, nextDueDate, value, cycle, paymentLink e deleted), as cobranças da assinatura (GET
-- /v3/subscriptions/{id}/payments) e a remoção (DELETE /v3/subscriptions/{id}: para as cobranças futuras e apaga as
-- pendentes).
--   * public.assinaturas e public.assinatura_cobrancas: a assinatura de cada cliente e as cobranças que a Asaas gerou. Escrita
--     e leitura só pelas funções (RLS ligado, sem política);
--   * quem vende: public.assinatura_pedir (na loja do turno, para um cliente ativo da rede), public.assinatura_cancelar (quem
--     criou, ou quem cancela vendas na loja) e public.assinaturas_do_cliente (quem busca clientes na loja do turno);
--   * o worker (só a chave secreta do servidor): as assinaturas a criar, o link registrado, a criação que falhou, as
--     assinaturas a conferir, a consulta aplicada (só ela confirma: o link, o valor, o ciclo e as cobranças) e as assinaturas a
--     cancelar na Asaas.
-- A recarga automática da linha quando a cobrança é paga NÃO entra aqui: ela pede o crédito da carteira na Nogle ou a loja
-- pagando o Pix da Nogle a cada mês (uma decisão do proprietário).
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

-- 1) A validade do link recorrente (o cliente pode cadastrar o cartão depois, em casa): 3 dias; muda com um update.
alter table privado.pagamento_pelo_site add column assinatura_validade interval not null default interval '3 days'
  check (assinatura_validade between interval '1 hour' and interval '30 days');

-- 2) As assinaturas e as cobranças.
create table public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null references public.organizacoes (id),
  unidade_id uuid not null,
  cliente_id uuid not null references public.clientes (id),
  criada_por uuid not null references public.perfis_usuario (id),
  chave text not null check (length(trim(chave)) between 1 and 120),
  descricao text not null check (length(trim(descricao)) between 3 and 60 and descricao ~ '^[^<>]+$'),
  valor_centavos bigint not null check (valor_centavos between 100 and 10000000),
  ciclo text not null check (ciclo in ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY')),
  linha text check (linha is null or linha ~ '^[1-9]{2}9?[0-9]{8}$'),
  situacao text not null default 'criando'
    check (situacao in ('criando', 'aguardando_cartao', 'ativa', 'pausada', 'encerrada', 'cancelando', 'cancelada', 'sem_cartao', 'falhou')),
  link_id text unique check (link_id is null or link_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  link_url text check (link_url is null or (length(link_url) between 12 and 500 and link_url ~ '^https://[^[:space:]]+$')),
  link_expira_em timestamptz,
  link_desativado_em timestamptz,
  assinatura_id text unique check (assinatura_id is null or assinatura_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  cartao_final text check (cartao_final is null or cartao_final ~ '^[0-9]{4}$'),
  cartao_bandeira text check (cartao_bandeira is null or cartao_bandeira ~ '^[A-Z]{2,20}$'),
  proxima_cobranca date,
  tentativas int not null default 0 check (tentativas between 0 and 10),
  reservado_ate timestamptz,
  conferido_em timestamptz,
  ultima_falha text check (ultima_falha is null or length(ultima_falha) between 1 and 120),
  divergencia text check (divergencia is null or length(divergencia) between 1 and 120),
  cancelada_por uuid references public.perfis_usuario (id),
  cancelada_em timestamptz,
  motivo_cancelamento text check (motivo_cancelamento is null or length(trim(motivo_cancelamento)) between 3 and 200),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (organizacao_id, chave),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  constraint assinaturas_link_coerente check ((link_id is null) = (link_url is null) and (link_id is null) = (link_expira_em is null)),
  constraint assinaturas_com_link check (situacao not in ('aguardando_cartao', 'ativa', 'pausada', 'encerrada', 'sem_cartao') or link_id is not null),
  constraint assinaturas_ativa_com_id check (situacao not in ('ativa', 'pausada', 'encerrada') or assinatura_id is not null),
  constraint assinaturas_cancelada_coerente check ((cancelada_em is not null) = (motivo_cancelamento is not null))
);
comment on table public.assinaturas is
  'PAY-015c: as assinaturas no cartão pela Asaas (a recorrência), uma por pedido da loja para um cliente. O cartão fica guardado na Asaas; aqui, só a bandeira e os 4 últimos dígitos. Acesso só pelas funções da assinatura (RLS ligado, sem política).';
create index assinaturas_cliente on public.assinaturas (cliente_id);
create index assinaturas_da_loja on public.assinaturas (unidade_id, organizacao_id);
create index assinaturas_criada_por on public.assinaturas (criada_por);
create index assinaturas_cancelada_por on public.assinaturas (cancelada_por);
create index assinaturas_fila on public.assinaturas (criado_em) where situacao in ('criando', 'aguardando_cartao', 'ativa', 'pausada', 'cancelando');
create trigger assinaturas_auditar after insert or update on public.assinaturas
  for each row execute function privado.auditar_mudanca();
alter table public.assinaturas enable row level security;
revoke all on public.assinaturas from public, anon, authenticated;
revoke all on sequence public.assinaturas_numero_seq from public, anon, authenticated;

create table public.assinatura_cobrancas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id),
  assinatura_id uuid not null references public.assinaturas (id),
  id_no_provedor text not null unique check (id_no_provedor ~ '^[A-Za-z0-9_-]{1,80}$'),
  valor_centavos bigint not null check (valor_centavos between 0 and 100000000),
  situacao text not null check (situacao in ('pago', 'pendente', 'vencido', 'estornado', 'desconhecida')),
  vencimento date,
  pago_em date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table public.assinatura_cobrancas is
  'PAY-015c: as cobranças que a Asaas gerou para cada assinatura (a situação, o valor, o vencimento e o dia do pagamento), como o worker leu na própria Asaas. Acesso só pelas funções da assinatura (RLS ligado, sem política).';
create index assinatura_cobrancas_da_assinatura on public.assinatura_cobrancas (assinatura_id, vencimento desc);
create index assinatura_cobrancas_organizacao on public.assinatura_cobrancas (organizacao_id);
create trigger assinatura_cobrancas_auditar after insert or update on public.assinatura_cobrancas
  for each row execute function privado.auditar_mudanca();
alter table public.assinatura_cobrancas enable row level security;
revoke all on public.assinatura_cobrancas from public, anon, authenticated;

-- 3) Quem vende: pedir a assinatura no cartão para um cliente ativo da rede, na loja do turno. O clique repetido (a mesma
--    chave) devolve a mesma; com outro conteúdo, OR004. Desligado (a Asaas sem responder): OR058, como o cartão no caixa.
create or replace function public.assinatura_pedir(p_cliente uuid, p_descricao text, p_valor_centavos bigint, p_ciclo text, p_linha text, p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_unidade uuid := (select public.unidade_atual());
  v_organizacao uuid;
  v_descricao text := btrim(coalesce(p_descricao, ''));
  v_linha text := nullif(regexp_replace(coalesce(p_linha, ''), '[^0-9]', '', 'g'), '');
  v_existente public.assinaturas;
  v_nova public.assinaturas;
begin
  if v_usuario is null or v_unidade is null or not coalesce((select public.tem_permissao('venda.registrar', v_unidade)), false) then
    raise exception 'Sem permissão para vender nesta loja' using errcode = '42501';
  end if;
  if p_chave is null or length(trim(p_chave)) not between 1 and 120 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  if length(v_descricao) not between 3 and 60 or v_descricao ~ '[<>]' then
    raise exception 'Descreva a assinatura (de 3 a 60 letras)' using errcode = '22023';
  end if;
  if p_valor_centavos is null or p_valor_centavos not between 100 and 10000000 then
    raise exception 'Valor da assinatura inválido' using errcode = '22023';
  end if;
  if p_ciclo is null or p_ciclo not in ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY') then
    raise exception 'Ciclo da assinatura inválido' using errcode = '22023';
  end if;
  if v_linha is not null and v_linha !~ '^[1-9]{2}9?[0-9]{8}$' then
    raise exception 'Linha com DDD: 10 ou 11 dígitos' using errcode = '22023';
  end if;
  select u.organizacao_id into v_organizacao from public.unidades u where u.id = v_unidade;
  if not exists (select 1 from public.clientes c where c.id = p_cliente and c.organizacao_id = v_organizacao and c.situacao = 'ativo') then
    raise exception 'Cliente não encontrado nesta rede' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('assinaturas', v_organizacao, p_chave));
  select a.* into v_existente from public.assinaturas a where a.organizacao_id = v_organizacao and a.chave = p_chave;
  if found then
    if v_existente.cliente_id <> p_cliente or v_existente.valor_centavos <> p_valor_centavos or v_existente.ciclo <> p_ciclo
       or v_existente.descricao <> v_descricao or v_existente.linha is distinct from v_linha or v_existente.criada_por <> v_usuario then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return jsonb_build_object('id', v_existente.id, 'numero', v_existente.numero, 'situacao', v_existente.situacao, 'repetida', true);
  end if;
  if not privado.caixa_cartao_ligado() then
    raise exception 'O cartão pela Asaas ainda não está ligado' using errcode = 'OR058';
  end if;
  perform set_config('ora.motivo', 'Assinatura no cartão pedida (PAY-015c)', true);
  insert into public.assinaturas (organizacao_id, unidade_id, cliente_id, criada_por, chave, descricao, valor_centavos, ciclo, linha)
  values (v_organizacao, v_unidade, p_cliente, v_usuario, p_chave, v_descricao, p_valor_centavos, p_ciclo, v_linha)
  returning * into v_nova;
  return jsonb_build_object('id', v_nova.id, 'numero', v_nova.numero, 'situacao', v_nova.situacao);
end;
$$;
revoke all on function public.assinatura_pedir(uuid, text, bigint, text, text, text) from public, anon;
grant execute on function public.assinatura_pedir(uuid, text, bigint, text, text, text) to authenticated;

-- 4) Cancelar a assinatura: quem criou (com a permissão de vender na loja dela) ou quem cancela vendas na loja dela, com o
--    motivo. A que o worker ainda não pediu sai na hora; a que está na Asaas o worker remove lá (as cobranças futuras param).
create or replace function public.assinatura_cancelar(p_assinatura uuid, p_motivo text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_a public.assinaturas;
begin
  if p_motivo is null or length(trim(p_motivo)) not between 3 and 200 then
    raise exception 'Informe o motivo' using errcode = '22023';
  end if;
  select a.* into v_a from public.assinaturas a where a.id = p_assinatura for update;
  if not found or v_usuario is null or v_a.unidade_id is distinct from (select public.unidade_atual())
     or not ((v_a.criada_por = v_usuario and coalesce((select public.tem_permissao('venda.registrar', v_a.unidade_id)), false))
             or coalesce((select public.tem_permissao('venda.cancelar', v_a.unidade_id)), false)) then
    raise exception 'Assinatura não encontrada' using errcode = 'P0002';
  end if;
  if v_a.situacao in ('cancelando', 'cancelada', 'encerrada', 'sem_cartao', 'falhou') then
    return v_a.situacao;
  end if;
  perform set_config('ora.motivo', trim(p_motivo), true);
  update public.assinaturas a
  set situacao = case when a.situacao = 'criando' and (a.reservado_ate is null or a.reservado_ate < now()) then 'cancelada' else 'cancelando' end,
      cancelada_por = v_usuario, cancelada_em = now(), motivo_cancelamento = trim(p_motivo),
      reservado_ate = case when a.situacao = 'criando' then a.reservado_ate end, atualizado_em = now()
  where a.id = v_a.id
  returning a.* into v_a;
  return v_a.situacao;
end;
$$;
revoke all on function public.assinatura_cancelar(uuid, text) from public, anon;
grant execute on function public.assinatura_cancelar(uuid, text) to authenticated;

-- 5) As assinaturas do cliente (as da rede, a mais nova primeiro), com as 6 últimas cobranças de cada uma, para quem busca
--    clientes na loja do turno; o link só enquanto espera o cartão; pode cancelar, quando a pessoa pode.
create or replace function public.assinaturas_do_cliente(p_cliente uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_unidade uuid := (select public.unidade_atual());
  v_organizacao uuid;
begin
  if v_usuario is null or v_unidade is null or not coalesce((select public.tem_permissao('cliente.buscar', v_unidade)), false) then
    raise exception 'Sem permissão para ver clientes nesta loja' using errcode = '42501';
  end if;
  select u.organizacao_id into v_organizacao from public.unidades u where u.id = v_unidade;
  if not exists (select 1 from public.clientes c where c.id = p_cliente and c.organizacao_id = v_organizacao) then
    raise exception 'Cliente não encontrado nesta rede' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'ligado', privado.caixa_cartao_ligado(),
    'pode_criar', coalesce((select public.tem_permissao('venda.registrar', v_unidade)), false),
    'assinaturas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'numero', a.numero, 'descricao', a.descricao, 'valor_centavos', a.valor_centavos, 'ciclo', a.ciclo, 'linha', a.linha,
        'situacao', a.situacao, 'link_url', case when a.situacao = 'aguardando_cartao' then a.link_url end, 'link_expira_em', a.link_expira_em,
        'cartao_final', a.cartao_final, 'cartao_bandeira', a.cartao_bandeira, 'proxima_cobranca', a.proxima_cobranca,
        'ultima_falha', a.ultima_falha, 'divergencia', a.divergencia, 'criado_em', a.criado_em, 'cancelada_em', a.cancelada_em,
        'pode_cancelar', a.unidade_id = v_unidade and a.situacao in ('criando', 'aguardando_cartao', 'ativa', 'pausada')
                         and ((a.criada_por = v_usuario and coalesce((select public.tem_permissao('venda.registrar', a.unidade_id)), false))
                              or coalesce((select public.tem_permissao('venda.cancelar', a.unidade_id)), false)),
        'cobrancas', (select coalesce(jsonb_agg(jsonb_build_object('valor_centavos', c.valor_centavos, 'situacao', c.situacao,
                                                                   'vencimento', c.vencimento, 'pago_em', c.pago_em)
                                                order by c.vencimento desc nulls last), '[]'::jsonb)
                      from (select c.* from public.assinatura_cobrancas c where c.assinatura_id = a.id
                            order by c.vencimento desc nulls last limit 6) c))
        order by a.numero desc), '[]'::jsonb)
      from public.assinaturas a where a.cliente_id = p_cliente and a.organizacao_id = v_organizacao));
end;
$$;
revoke all on function public.assinaturas_do_cliente(uuid) from public, anon;
grant execute on function public.assinaturas_do_cliente(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- O worker (service_role)
-- -----------------------------------------------------------------------------
-- As assinaturas a criar (reservadas por 1 minuto; até 10 tentativas), com o que o link recorrente precisa.
create or replace function public.assinaturas_a_criar(p_limite int default 10)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  lote jsonb;
begin
  with escolhidas as (
    select a.id from public.assinaturas a
    where a.situacao = 'criando' and (a.reservado_ate is null or a.reservado_ate < now()) and a.tentativas < 10
    order by a.criado_em, a.id
    limit least(greatest(coalesce(p_limite, 10), 1), 50)
    for update of a skip locked
  ), reservadas as (
    update public.assinaturas a
    set reservado_ate = now() + interval '1 minute', tentativas = a.tentativas + 1, atualizado_em = now()
    from escolhidas e where a.id = e.id
    returning a.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'numero', r.numero, 'descricao', r.descricao, 'valor_centavos', r.valor_centavos, 'ciclo', r.ciclo, 'tentativa', r.tentativas,
      'validade_segundos', (select extract(epoch from c.assinatura_validade)::int from privado.pagamento_pelo_site c where c.provedor = 'asaas'))
      order by r.criado_em, r.id), '[]'::jsonb)
  into lote
  from reservadas r;
  return lote;
end;
$$;

-- O link recorrente criado na Asaas: a assinatura espera o cartão. Se a loja desistiu enquanto ele era criado (cancelando),
-- o link fica anotado só para o worker desativar.
create or replace function public.assinatura_link_registrar(p_assinatura uuid, p_link_id text, p_link_url text, p_expira_em timestamptz)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a public.assinaturas;
begin
  if coalesce(p_link_id, '') !~ '^[A-Za-z0-9_-]{1,80}$' or length(coalesce(p_link_url, '')) not between 12 and 500
     or p_link_url !~ '^https://[^[:space:]]+$' or p_expira_em is null or p_expira_em <= now() - interval '1 minute' then
    raise exception 'Link inválido' using errcode = '22023';
  end if;
  select a.* into v_a from public.assinaturas a where a.id = p_assinatura for update;
  if not found then
    raise exception 'Assinatura não encontrada' using errcode = 'P0002';
  end if;
  if v_a.link_id = p_link_id then
    return 'repetido';
  end if;
  if v_a.link_id is not null or v_a.situacao not in ('criando', 'cancelando') then
    raise exception 'Esta assinatura não espera um link' using errcode = 'P0002';
  end if;
  perform set_config('ora.motivo', 'Link da assinatura no cartão criado (PAY-015c)', true);
  update public.assinaturas a
  set link_id = p_link_id, link_url = p_link_url, link_expira_em = p_expira_em, reservado_ate = null, ultima_falha = null,
      situacao = case when a.situacao = 'criando' then 'aguardando_cartao' else a.situacao end, atualizado_em = now()
  where a.id = v_a.id
  returning a.* into v_a;
  return case when v_a.situacao = 'aguardando_cartao' then 'registrado' else 'cancelar' end;
end;
$$;

-- A criação que falhou: volta para a fila ou para de vez (a recusa da Asaas ou 10 tentativas). A desistência que esperava
-- a criação (cancelando, sem link) termina aqui.
create or replace function public.assinatura_criacao_falhou(p_assinatura uuid, p_motivo text, p_definitiva boolean)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := left(btrim(coalesce(p_motivo, '')), 120);
  v_a public.assinaturas;
begin
  if v_motivo = '' then
    raise exception 'O motivo da falha é obrigatório' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', 'A criação do link da assinatura falhou (PAY-015c)', true);
  update public.assinaturas a
  set ultima_falha = v_motivo, reservado_ate = null, atualizado_em = now(),
      situacao = case when a.situacao = 'cancelando' then 'cancelada'
                      when coalesce(p_definitiva, false) or a.tentativas >= 10 then 'falhou' else a.situacao end
  where a.id = p_assinatura and a.link_id is null and a.situacao in ('criando', 'cancelando')
  returning a.* into v_a;
  if not found then
    raise exception 'Esta assinatura não está sendo criada' using errcode = 'P0002';
  end if;
  return v_a.situacao;
end;
$$;

-- As assinaturas a conferir na Asaas (reservadas por 1 minuto): a que espera o cartão (a cada 10 segundos na primeira meia
-- hora, depois a cada 10 minutos, até o link vencer), a ativa ou pausada (a cada 30 minutos) e a que a loja desistiu antes
-- de ter a assinatura na Asaas (para ver se o cartão não foi cadastrado nesse meio tempo). Junto, o dia (em Brasília) do
-- link: o worker lê as cobranças de cartão desde esse dia para achar a primeira, a que traz o id da assinatura.
create or replace function public.assinaturas_a_conferir(p_limite int default 20)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  lote jsonb;
begin
  with escolhidas as (
    select a.id from public.assinaturas a
    where a.link_id is not null and (a.reservado_ate is null or a.reservado_ate < now())
      and ((a.situacao = 'aguardando_cartao' and (a.conferido_em is null
             or a.conferido_em < now() - case when a.criado_em > now() - interval '30 minutes' then interval '10 seconds' else interval '10 minutes' end))
           or (a.situacao in ('ativa', 'pausada') and (a.conferido_em is null or a.conferido_em < now() - interval '30 minutes'))
           or (a.situacao = 'cancelando' and a.assinatura_id is null and (a.conferido_em is null or a.conferido_em < now() - interval '10 seconds')))
    order by a.conferido_em nulls first, a.id
    limit least(greatest(coalesce(p_limite, 20), 1), 50)
    for update of a skip locked
  ), reservadas as (
    update public.assinaturas a set reservado_ate = now() + interval '1 minute'
    from escolhidas e where a.id = e.id
    returning a.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'link_id', r.link_id, 'assinatura_id', r.assinatura_id, 'situacao', r.situacao,
                                               'valor_centavos', r.valor_centavos, 'ciclo', r.ciclo,
                                               'desde', to_char(r.criado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'))
                            order by r.conferido_em nulls first, r.id), '[]'::jsonb)
  into lote
  from reservadas r;
  return lote;
end;
$$;

-- A consulta aplicada (a única que confirma). p_consulta é o que a Asaas respondeu, no formato comum:
--   {"link_id", "situacao": sem_cadastro | assinatura | removida | desconhecida, "assinatura_id", "link_da_assinatura",
--    "status": ACTIVE | INACTIVE | EXPIRED, "valor_centavos", "ciclo", "proxima_cobranca" (AAAA-MM-DD), "cartao_final",
--    "cartao_bandeira", "cobrancas": [{"id", "situacao": pago | pendente | vencido | estornado | desconhecida, "valor_centavos",
--    "vencimento", "pago_em"}]}.
-- O banco confere de novo: o link é o da assinatura, a assinatura da Asaas veio deste link, o valor e o ciclo são os
-- pedidos. O que não fecha vira divergência, sem mudar a situação. Devolve: ativada, atualizada, pausada, encerrada,
-- removida, pode_desativar, sem_cartao, pendente, divergencia, situacao_desconhecida ou link_desconhecido.
create or replace function public.assinatura_consulta_aplicar(p_assinatura uuid, p_consulta jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a public.assinaturas;
  v_situacao text := p_consulta ->> 'situacao';
  v_sub text := p_consulta ->> 'assinatura_id';
  v_status text := p_consulta ->> 'status';
  v_final text := nullif(p_consulta ->> 'cartao_final', '');
  v_bandeira text := nullif(p_consulta ->> 'cartao_bandeira', '');
  v_proxima date;
  v_valor bigint;
  v_cobranca jsonb;
  v_resultado text;
  v_divergencia text;
  v_nova_situacao text;
begin
  if p_consulta is null or jsonb_typeof(p_consulta) <> 'object'
     or coalesce(v_situacao, '') not in ('sem_cadastro', 'assinatura', 'removida', 'desconhecida')
     or coalesce(p_consulta ->> 'link_id', '') !~ '^[A-Za-z0-9_-]{1,80}$'
     or (v_situacao in ('assinatura', 'removida') and coalesce(v_sub, '') !~ '^[A-Za-z0-9_-]{1,80}$')
     or (v_situacao = 'assinatura' and (coalesce(v_status, '') not in ('ACTIVE', 'INACTIVE', 'EXPIRED')
                                        or coalesce(jsonb_typeof(p_consulta -> 'valor_centavos'), '') <> 'number'
                                        or coalesce(jsonb_typeof(p_consulta -> 'cobrancas'), '') <> 'array'
                                        or jsonb_array_length(p_consulta -> 'cobrancas') > 24))
     or (v_final is not null and v_final !~ '^[0-9]{4}$') or (v_bandeira is not null and v_bandeira !~ '^[A-Z]{2,20}$')
     or (p_consulta ->> 'proxima_cobranca' is not null and p_consulta ->> 'proxima_cobranca' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
    raise exception 'Consulta inválida' using errcode = '22023';
  end if;
  if v_situacao = 'assinatura' then
    begin
      v_valor := (p_consulta ->> 'valor_centavos')::bigint;
      v_proxima := (p_consulta ->> 'proxima_cobranca')::date;
    exception when others then
      raise exception 'Consulta inválida' using errcode = '22023';
    end;
  end if;
  select a.* into v_a from public.assinaturas a where a.id = p_assinatura for update;
  if not found then
    raise exception 'Assinatura não encontrada' using errcode = 'P0002';
  end if;
  perform set_config('ora.motivo', 'Consulta da assinatura no cartão (PAY-015c)', true);
  if v_a.link_id is distinct from p_consulta ->> 'link_id' then
    v_resultado := 'link_desconhecido';
  elsif v_situacao = 'desconhecida' then
    v_resultado := 'situacao_desconhecida';
    v_divergencia := 'a Asaas respondeu uma situação que o sistema não conhece';
  elsif v_situacao = 'sem_cadastro' then
    if v_a.assinatura_id is not null then
      v_resultado := 'divergencia';
      v_divergencia := 'a assinatura sumiu da Asaas sem ser removida';
    elsif v_a.situacao = 'cancelando' then
      v_resultado := 'pode_desativar';
    elsif v_a.situacao = 'aguardando_cartao' and v_a.link_expira_em < now() then
      update public.assinaturas a set situacao = 'sem_cartao', atualizado_em = now() where a.id = v_a.id;
      v_resultado := 'sem_cartao';
    else
      v_resultado := 'pendente';
    end if;
  elsif v_situacao = 'removida' then
    if v_a.assinatura_id is distinct from v_sub then
      v_resultado := 'divergencia';
      v_divergencia := 'a Asaas removeu outra assinatura';
    elsif v_a.situacao in ('ativa', 'pausada', 'cancelando') then
      update public.assinaturas a set situacao = 'cancelada', atualizado_em = now(),
        cancelada_em = coalesce(a.cancelada_em, now()), motivo_cancelamento = coalesce(a.motivo_cancelamento, 'Removida no painel da Asaas')
      where a.id = v_a.id;
      v_resultado := 'removida';
    else
      v_resultado := 'pendente';
    end if;
  elsif (v_a.assinatura_id is not null and v_a.assinatura_id <> v_sub)
        or (p_consulta ->> 'link_da_assinatura' is not null and p_consulta ->> 'link_da_assinatura' <> v_a.link_id) then
    v_resultado := 'divergencia';
    v_divergencia := 'a assinatura da Asaas é de outro link';
  elsif v_valor <> v_a.valor_centavos or coalesce(p_consulta ->> 'ciclo', '') <> v_a.ciclo then
    v_resultado := 'divergencia';
    v_divergencia := 'o valor ou o ciclo da assinatura na Asaas é outro';
  elsif v_a.situacao not in ('aguardando_cartao', 'ativa', 'pausada', 'cancelando') then
    v_resultado := 'divergencia';
    v_divergencia := 'a assinatura apareceu na Asaas depois de encerrada aqui';
  else
    -- A assinatura da Asaas é esta: o id, o cartão, a próxima cobrança e a situação (a desistida antes de ter o id vai ser
    -- removida pelo worker; a encerrada fica encerrada).
    v_nova_situacao := case
      when v_a.situacao = 'cancelando' then 'cancelando'
      when v_status = 'ACTIVE' then 'ativa' when v_status = 'INACTIVE' then 'pausada' else 'encerrada' end;
    update public.assinaturas a
    set assinatura_id = v_sub, situacao = v_nova_situacao, proxima_cobranca = v_proxima,
        cartao_final = coalesce(v_final, a.cartao_final), cartao_bandeira = coalesce(v_bandeira, a.cartao_bandeira), atualizado_em = now()
    where a.id = v_a.id;
    for v_cobranca in select value from jsonb_array_elements(p_consulta -> 'cobrancas') loop
      if coalesce(v_cobranca ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,80}$'
         or coalesce(v_cobranca ->> 'situacao', '') not in ('pago', 'pendente', 'vencido', 'estornado', 'desconhecida')
         or coalesce(jsonb_typeof(v_cobranca -> 'valor_centavos'), '') <> 'number'
         or (v_cobranca ->> 'vencimento' is not null and v_cobranca ->> 'vencimento' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
         or (v_cobranca ->> 'pago_em' is not null and v_cobranca ->> 'pago_em' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
        raise exception 'Consulta inválida' using errcode = '22023';
      end if;
      insert into public.assinatura_cobrancas (organizacao_id, assinatura_id, id_no_provedor, valor_centavos, situacao, vencimento, pago_em)
      values (v_a.organizacao_id, v_a.id, v_cobranca ->> 'id', (v_cobranca ->> 'valor_centavos')::bigint, v_cobranca ->> 'situacao',
              (v_cobranca ->> 'vencimento')::date, (v_cobranca ->> 'pago_em')::date)
      on conflict (id_no_provedor) do update
        set situacao = excluded.situacao, valor_centavos = excluded.valor_centavos, vencimento = excluded.vencimento,
            pago_em = excluded.pago_em, atualizado_em = now()
        where public.assinatura_cobrancas.assinatura_id = v_a.id
          and (public.assinatura_cobrancas.situacao, public.assinatura_cobrancas.valor_centavos, public.assinatura_cobrancas.vencimento,
               public.assinatura_cobrancas.pago_em) is distinct from (excluded.situacao, excluded.valor_centavos, excluded.vencimento, excluded.pago_em);
    end loop;
    v_resultado := case
      when v_a.situacao = 'aguardando_cartao' and v_nova_situacao = 'ativa' then 'ativada'
      when v_nova_situacao = 'pausada' then 'pausada' when v_nova_situacao = 'encerrada' then 'encerrada' else 'atualizada' end;
  end if;
  update public.assinaturas a
  set conferido_em = now(), reservado_ate = null, divergencia = coalesce(v_divergencia, a.divergencia)
  where a.id = v_a.id;
  return v_resultado;
end;
$$;

-- As assinaturas a cancelar na Asaas: a desistida que já tem a assinatura lá (remover) e a cancelada ou sem cartão com o
-- link ainda ativo (desativar).
create or replace function public.assinaturas_a_cancelar(p_limite int default 20)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'assinatura_id', a.assinatura_id, 'link_id', a.link_id) order by a.atualizado_em, a.id), '[]'::jsonb)
  from (select a.id, a.assinatura_id, a.link_id, a.atualizado_em from public.assinaturas a
        where (a.situacao = 'cancelando' and a.assinatura_id is not null)
           or (a.situacao in ('cancelada', 'sem_cartao') and a.link_id is not null and a.link_desativado_em is null and a.assinatura_id is null)
        order by a.atualizado_em, a.id
        limit least(greatest(coalesce(p_limite, 20), 1), 50)) a;
$$;

-- O que o worker fez na Asaas: a assinatura removida (as cobranças futuras param) ou o link desativado.
create or replace function public.assinatura_cancelada_na_asaas(p_assinatura uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a public.assinaturas;
begin
  perform set_config('ora.motivo', 'Assinatura no cartão cancelada na Asaas (PAY-015c)', true);
  update public.assinaturas a
  set situacao = case when a.situacao = 'cancelando' then 'cancelada' else a.situacao end,
      link_desativado_em = coalesce(a.link_desativado_em, now()), reservado_ate = null, atualizado_em = now()
  where a.id = p_assinatura
    and ((a.situacao = 'cancelando' and a.assinatura_id is not null)
         or (a.situacao in ('cancelando', 'cancelada', 'sem_cartao') and a.link_id is not null and a.link_desativado_em is null))
  returning a.* into v_a;
  if not found then
    raise exception 'Esta assinatura não está para cancelar' using errcode = 'P0002';
  end if;
  return v_a.situacao;
end;
$$;

revoke all on function public.assinaturas_a_criar(int) from public, anon, authenticated;
revoke all on function public.assinatura_link_registrar(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.assinatura_criacao_falhou(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.assinaturas_a_conferir(int) from public, anon, authenticated;
revoke all on function public.assinatura_consulta_aplicar(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.assinaturas_a_cancelar(int) from public, anon, authenticated;
revoke all on function public.assinatura_cancelada_na_asaas(uuid) from public, anon, authenticated;
grant execute on function public.assinaturas_a_criar(int) to service_role;
grant execute on function public.assinatura_link_registrar(uuid, text, text, timestamptz) to service_role;
grant execute on function public.assinatura_criacao_falhou(uuid, text, boolean) to service_role;
grant execute on function public.assinaturas_a_conferir(int) to service_role;
grant execute on function public.assinatura_consulta_aplicar(uuid, jsonb) to service_role;
grant execute on function public.assinaturas_a_cancelar(int) to service_role;
grant execute on function public.assinatura_cancelada_na_asaas(uuid) to service_role;
