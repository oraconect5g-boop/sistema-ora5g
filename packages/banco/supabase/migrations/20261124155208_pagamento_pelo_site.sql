-- =============================================================================
-- Lote PAY-014a (24/11/2026; ORA-PAY-014, ORA-ONLINE-002 e a parte do provedor do ORA-PAY-008; ADR-025): o pagamento pelo
-- site pela Asaas, com o Pix pelo link de pagamento, confirmado pela reconsulta. A Asaas é a escolha do proprietário de
-- 24/11 (a pendência E1).
--
--   * privado.pagamento_pelo_site: ligado ou não (o worker liga depois de registrar o aviso na Asaas), o ambiente, o
--     webhook e por quanto tempo o pedido pago fica guardado para a retirada (7 dias; muda com um update);
--   * public.loja_pagamentos: o pagamento de um pedido do site (um por pedido): a situação, o link da Asaas e o pagamento
--     dela; quem vende na loja do pedido lê;
--   * privado.pagamento_avisos: os avisos da Asaas, um por evento (o id do evento), só com os campos que o worker usa;
--   * o visitante: public.loja_pagamento_pedir (pedir para pagar, com o código e o WhatsApp do pedido, como na consulta) e
--     a visão do pedido com o pagamento (privado.pedido_do_site_em_json, refeita: só ganha a chave "pagamento");
--   * o site: public.pagamento_aviso_receber (o aviso, com o token que a Asaas manda; o banco confere a impressão);
--   * o worker (só a chave secreta do servidor): a configuração e o ligar (a impressão do token do aviso), os pagamentos a
--     criar, o link criado, a falha, os avisos a processar, a reconsulta aplicada (o pago estende o pedido e as reservas),
--     o aviso concluído e os links a desativar;
--   * public.loja_pedido_cancelar (refeita): o pedido pago pelo site não se cancela enquanto o dinheiro não voltar (OR048).
-- O aviso nunca confirma (PAY-b): quem confirma é a reconsulta que o worker faz na Asaas, e o banco confere de novo o link,
-- o valor e a passagem da situação. Desligado até a chave da Asaas, o worker agendado e o aviso registrado.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

-- 1) A configuração do pagamento pelo site.
create table privado.pagamento_pelo_site (
  provedor text primary key check (provedor = 'asaas'),
  ligado boolean not null default false,
  ambiente text check (ambiente is null or ambiente in ('sandbox', 'producao')),
  webhook_id text check (webhook_id is null or webhook_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  ligado_em timestamptz,
  guardar_pago_por interval not null default interval '7 days' check (guardar_pago_por between interval '1 day' and interval '30 days'),
  constraint pagamento_ligado_coerente check (not ligado or (ambiente is not null and webhook_id is not null and ligado_em is not null))
);
alter table privado.pagamento_pelo_site enable row level security;
comment on table privado.pagamento_pelo_site is
  'PAY-014a: o pagamento pelo site (a Asaas): ligado depois de o worker registrar o aviso, o ambiente, o webhook e por quanto tempo o pedido pago fica guardado. Acesso só pelas funções do pagamento pelo site (RLS ligado, sem política).';
revoke all on privado.pagamento_pelo_site from public, anon, authenticated;
insert into privado.pagamento_pelo_site (provedor) values ('asaas');

-- 2) O pagamento de um pedido do site (um por pedido).
create table public.loja_pagamentos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  unidade_id uuid not null,
  pedido_id uuid not null unique references public.loja_pedidos (id),
  provedor text not null default 'asaas' check (provedor = 'asaas'),
  valor_centavos bigint not null check (valor_centavos > 0),
  situacao text not null default 'criando' check (situacao in ('criando', 'aguardando', 'pago', 'cancelado', 'estornado', 'falhou')),
  link_id text unique check (link_id is null or link_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  link_url text check (link_url is null or (link_url ~ '^https://[^[:space:]]+$' and length(link_url) <= 500)),
  link_desativado_em timestamptz,
  id_no_provedor text unique check (id_no_provedor is null or id_no_provedor ~ '^[A-Za-z0-9_-]{1,80}$'),
  pago_em timestamptz,
  estornado_em timestamptz,
  tentativas int not null default 0 check (tentativas between 0 and 10),
  reservado_ate timestamptz,
  ultima_falha text check (ultima_falha is null or length(ultima_falha) between 1 and 120),
  divergencia text check (divergencia is null or length(divergencia) between 1 and 120),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  constraint loja_pagamento_link_coerente check ((link_id is null) = (link_url is null)),
  constraint loja_pagamento_com_link check (situacao not in ('aguardando', 'pago', 'estornado') or link_id is not null),
  constraint loja_pagamento_pago_coerente check (
    (pago_em is not null) = (situacao in ('pago', 'estornado')) and (estornado_em is not null) = (situacao = 'estornado')
    and (situacao not in ('pago', 'estornado') or id_no_provedor is not null))
);
create index loja_pagamentos_a_criar on public.loja_pagamentos (criado_em) where situacao = 'criando';
create index loja_pagamentos_da_loja on public.loja_pagamentos (unidade_id, organizacao_id);
alter table public.loja_pagamentos enable row level security;
revoke all on public.loja_pagamentos from anon, authenticated;
grant select on public.loja_pagamentos to authenticated;
-- Quem vende na loja do pedido vê o pagamento dele (a mesma regra dos pedidos do site).
create policy loja_pagamentos_ler on public.loja_pagamentos for select to authenticated
  using (unidade_id in (select privado.unidades_com_permissao('venda.registrar')));
comment on table public.loja_pagamentos is
  'PAY-014a: o pagamento pelo site de um pedido (a Asaas, pelo link de pagamento). Escrita só pelas funções do pagamento pelo site; quem vende na loja do pedido lê.';

-- 3) Os avisos da Asaas: um por evento, só os campos que o worker usa.
-- O id do evento é o da Asaas: a documentação não dá o formato, e o exemplo dela traz "&" (evt_...&368604920). Vale
-- qualquer caractere visível sem espaço (ASCII), até 200.
create table privado.pagamento_avisos (
  id text primary key check (id ~ '^[!-~]{1,200}$'),
  evento text not null check (evento ~ '^[A-Z_]{3,60}$'),
  id_no_provedor text check (id_no_provedor is null or id_no_provedor ~ '^[A-Za-z0-9_-]{1,80}$'),
  link_id text check (link_id is null or link_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  valor_centavos bigint check (valor_centavos is null or valor_centavos >= 0),
  situacao_informada text check (situacao_informada is null or situacao_informada ~ '^[A-Z_]{3,40}$'),
  recebido_em timestamptz not null default now(),
  tentativas int not null default 0 check (tentativas between 0 and 20),
  reservado_ate timestamptz,
  processado_em timestamptz,
  resultado text check (resultado is null or resultado ~ '^[a-z_]{3,40}$'),
  constraint pagamento_aviso_processado_coerente check ((processado_em is null) = (resultado is null))
);
create index pagamento_avisos_a_processar on privado.pagamento_avisos (recebido_em) where processado_em is null;
alter table privado.pagamento_avisos enable row level security;
comment on table privado.pagamento_avisos is
  'PAY-014a: os avisos da Asaas (webhook), um por evento, só com os campos que o worker usa. O aviso nunca confirma: o worker pergunta de novo à Asaas. Acesso só pelas funções do pagamento pelo site (RLS ligado, sem política).';
revoke all on privado.pagamento_avisos from public, anon, authenticated;

-- 4) O que o visitante vê do pagamento do pedido (na visão do pedido).
create or replace function privado.pagamento_do_pedido_em_json(p_pedido public.loja_pedidos)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'disponivel', coalesce((select c.ligado from privado.pagamento_pelo_site c where c.provedor = 'asaas'), false),
    'situacao', pg.situacao,
    'link', case when pg.situacao = 'aguardando' and pg.link_desativado_em is null then pg.link_url end,
    'valor_centavos', pg.valor_centavos,
    'pago_em', pg.pago_em)
  from (select 1) as x
  left join public.loja_pagamentos pg on pg.pedido_id = p_pedido.id;
$$;
revoke all on function privado.pagamento_do_pedido_em_json(public.loja_pedidos) from public, anon, authenticated;

-- A visão do pedido para o visitante (a do ONLINE-d), com o pagamento pelo site.
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
    'loja', (select jsonb_build_object('nome', u.nome, 'endereco', u.endereco, 'cidade', u.cidade) from public.unidades u where u.id = p_pedido.unidade_id),
    'pagamento', privado.pagamento_do_pedido_em_json(p_pedido));
$$;
revoke all on function privado.pedido_do_site_em_json(public.loja_pedidos) from public, anon, authenticated;

-- 5) O visitante pede para pagar o pedido pelo site: com o código e o WhatsApp dele, como na consulta. Repetir não cria
--    outro pagamento: o do pedido é um só. Devolve a visão do pedido (com o pagamento), ou nulo se o pedido não existe.
create or replace function public.loja_pagamento_pedir(p_organizacao uuid, p_codigo text, p_whatsapp text)
returns jsonb
language plpgsql
volatile
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
  where p.organizacao_id = p_organizacao and p.codigo = upper(btrim(coalesce(p_codigo, ''))) and c.whatsapp = v_whatsapp
  for update of p;
  if not found then
    return null;
  end if;
  if exists (select 1 from public.loja_pagamentos pg where pg.pedido_id = v_pedido.id) then
    return privado.pedido_do_site_em_json(v_pedido);
  end if;
  if not coalesce((select c.ligado from privado.pagamento_pelo_site c where c.provedor = 'asaas'), false) then
    raise exception 'O pagamento pelo site ainda não está disponível' using errcode = 'OR049';
  end if;
  if v_pedido.situacao <> 'reservado' or v_pedido.expira_em <= now() or v_pedido.total_centavos <= 0 then
    raise exception 'Este pedido não pode mais ser pago pelo site (vencido, cancelado ou atendido)' using errcode = 'OR050';
  end if;
  insert into public.loja_pagamentos (organizacao_id, unidade_id, pedido_id, valor_centavos)
  values (v_pedido.organizacao_id, v_pedido.unidade_id, v_pedido.id, v_pedido.total_centavos);
  return privado.pedido_do_site_em_json(v_pedido);
end;
$$;

-- 6) O aviso da Asaas, repassado pelo site: o token que a Asaas manda no cabeçalho asaas-access-token e os campos do
--    aviso. O banco confere o token pela impressão digital e guarda o aviso uma vez só. Devolve "guardado" ou "repetido".
--    p_aviso: {"id": evento, "evento": nome, "pagamento": id ou nulo, "link": id ou nulo, "valor": reais ou nulo,
--              "situacao": situação informada ou nula}
create or replace function public.pagamento_aviso_receber(p_token text, p_aviso jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_valor numeric;
  v_centavos bigint;
begin
  if not privado.segredo_confere('asaas_aviso', p_token) then
    raise exception 'Token do aviso não confere' using errcode = '42501';
  end if;
  if p_aviso is null or jsonb_typeof(p_aviso) <> 'object'
     or coalesce(p_aviso ->> 'id', '') !~ '^[!-~]{1,200}$' or coalesce(p_aviso ->> 'evento', '') !~ '^[A-Z_]{3,60}$'
     or coalesce(jsonb_typeof(p_aviso -> 'pagamento'), 'null') not in ('string', 'null')
     or coalesce(jsonb_typeof(p_aviso -> 'link'), 'null') not in ('string', 'null')
     or coalesce(jsonb_typeof(p_aviso -> 'valor'), 'null') not in ('number', 'null')
     or coalesce(jsonb_typeof(p_aviso -> 'situacao'), 'null') not in ('string', 'null') then
    raise exception 'Aviso inválido' using errcode = '22023';
  end if;
  if jsonb_typeof(p_aviso -> 'valor') = 'number' then
    v_valor := (p_aviso ->> 'valor')::numeric * 100;
    if v_valor < 0 or v_valor <> trunc(v_valor) or v_valor > 100000000000 then
      raise exception 'Aviso inválido' using errcode = '22023';
    end if;
    v_centavos := v_valor::bigint;
  end if;
  begin
    insert into privado.pagamento_avisos (id, evento, id_no_provedor, link_id, valor_centavos, situacao_informada)
    values (p_aviso ->> 'id', p_aviso ->> 'evento', p_aviso ->> 'pagamento', p_aviso ->> 'link', v_centavos, p_aviso ->> 'situacao')
    on conflict (id) do nothing;
  exception when check_violation then
    raise exception 'Aviso inválido' using errcode = '22023';
  end;
  return case when found then 'guardado' else 'repetido' end;
end;
$$;

-- 7) O worker: a configuração (para saber se precisa registrar o aviso na Asaas) e o ligar, com a impressão digital
--    (SHA-256, em hexadecimal) do token que ele gerou e mandou à Asaas. O token não fica guardado em lugar nenhum daqui.
create or replace function public.pagamento_configuracao()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('ligado', c.ligado, 'ambiente', c.ambiente, 'webhook_id', c.webhook_id)
  from privado.pagamento_pelo_site c where c.provedor = 'asaas';
$$;

create or replace function public.pagamento_ligar(p_ambiente text, p_webhook_id text, p_impressao text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce(p_ambiente, '') not in ('sandbox', 'producao') or coalesce(p_webhook_id, '') !~ '^[A-Za-z0-9_-]{1,80}$'
     or coalesce(p_impressao, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Dados para ligar o pagamento inválidos' using errcode = '22023';
  end if;
  insert into privado.segredos_de_rotina (nome, impressao) values ('asaas_aviso', decode(p_impressao, 'hex'))
  on conflict (nome) do update set impressao = excluded.impressao, definido_em = now();
  update privado.pagamento_pelo_site
  set ligado = true, ambiente = p_ambiente, webhook_id = p_webhook_id, ligado_em = now()
  where provedor = 'asaas';
  return true;
end;
$$;

-- 8) O worker: os pagamentos a criar (reservados por 2 minutos; até 10 tentativas), com o que o link precisa.
create or replace function public.pagamentos_a_criar(p_limite int default 10)
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
    select pg.id from public.loja_pagamentos pg
    join public.loja_pedidos p on p.id = pg.pedido_id
    where pg.situacao = 'criando' and (pg.reservado_ate is null or pg.reservado_ate < now()) and pg.tentativas < 10
      and p.situacao = 'reservado' and p.expira_em > now()
    order by pg.criado_em, pg.id
    limit least(greatest(coalesce(p_limite, 10), 1), 50)
    for update of pg skip locked
  ), reservados as (
    update public.loja_pagamentos pg
    set reservado_ate = now() + interval '2 minutes', tentativas = pg.tentativas + 1, atualizado_em = now()
    from escolhidos e where pg.id = e.id
    returning pg.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'valor_centavos', r.valor_centavos, 'tentativa', r.tentativas, 'codigo', p.codigo,
      'vence_em', to_char((p.expira_em at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD')) order by r.criado_em, r.id), '[]'::jsonb)
  into lote
  from reservados r join public.loja_pedidos p on p.id = r.pedido_id;
  return lote;
end;
$$;

-- O link criado (ou achado de novo pelo identificador, depois de um resultado desconhecido): o pagamento passa a aguardar.
create or replace function public.pagamento_link_registrar(p_pagamento uuid, p_link_id text, p_link_url text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce(p_link_id, '') !~ '^[A-Za-z0-9_-]{1,80}$' or coalesce(p_link_url, '') !~ '^https://[^[:space:]]+$' or length(p_link_url) > 500 then
    raise exception 'Link inválido' using errcode = '22023';
  end if;
  update public.loja_pagamentos pg
  set situacao = 'aguardando', link_id = p_link_id, link_url = p_link_url, reservado_ate = null, ultima_falha = null, atualizado_em = now()
  where pg.id = p_pagamento and pg.situacao = 'criando';
  if found then
    return 'registrado';
  end if;
  if exists (select 1 from public.loja_pagamentos pg where pg.id = p_pagamento and pg.link_id = p_link_id) then
    return 'repetido';
  end if;
  raise exception 'Este pagamento não espera um link' using errcode = 'P0002';
end;
$$;

-- A criação que falhou: volta para a fila (com o motivo curto), ou para de vez (a recusa da Asaas ou 10 tentativas).
create or replace function public.pagamento_criacao_falhou(p_pagamento uuid, p_motivo text, p_definitiva boolean)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := left(btrim(coalesce(p_motivo, '')), 120);
begin
  if v_motivo = '' then
    raise exception 'O motivo da falha é obrigatório' using errcode = '22023';
  end if;
  update public.loja_pagamentos pg
  set ultima_falha = v_motivo, reservado_ate = null, atualizado_em = now(),
      situacao = case when coalesce(p_definitiva, false) or pg.tentativas >= 10 then 'falhou' else pg.situacao end
  where pg.id = p_pagamento and pg.situacao = 'criando';
  if not found then
    raise exception 'Este pagamento não está sendo criado' using errcode = 'P0002';
  end if;
  return (select pg.situacao from public.loja_pagamentos pg where pg.id = p_pagamento);
end;
$$;

-- 9) O worker: os avisos a processar, com o pagamento do link (se ele é nosso). O aviso de um link que ainda não
--    conhecemos espera uma hora (o link pode estar sendo registrado depois de um resultado desconhecido); depois disso,
--    volta sem pagamento, para o worker concluir como "link desconhecido".
create or replace function public.pagamento_avisos_a_processar(p_limite int default 20)
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
    select a.id from privado.pagamento_avisos a
    left join public.loja_pagamentos pg on pg.link_id = a.link_id
    where a.processado_em is null and (a.reservado_ate is null or a.reservado_ate < now()) and a.tentativas < 20
      and (pg.id is not null or a.recebido_em < now() - interval '1 hour')
    order by a.recebido_em, a.id
    limit least(greatest(coalesce(p_limite, 20), 1), 50)
    for update of a skip locked
  ), reservados as (
    update privado.pagamento_avisos a
    set reservado_ate = now() + interval '2 minutes', tentativas = a.tentativas + 1
    from escolhidos e where a.id = e.id
    returning a.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'aviso', r.id, 'evento', r.evento, 'id_no_provedor', r.id_no_provedor, 'link', r.link_id, 'valor_centavos', r.valor_centavos,
      'pagamento', case when pg.id is null then null else jsonb_build_object(
        'id', pg.id, 'valor_centavos', pg.valor_centavos, 'situacao', pg.situacao, 'link', pg.link_id) end) order by r.recebido_em, r.id), '[]'::jsonb)
  into lote
  from reservados r left join public.loja_pagamentos pg on pg.link_id = r.link_id;
  return lote;
end;
$$;

-- O aviso que não leva a nenhuma mudança (de outro link, de outro evento, sem pagamento): concluído com o resultado.
create or replace function public.pagamento_aviso_concluir(p_aviso text, p_resultado text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce(p_resultado, '') !~ '^[a-z_]{3,40}$' then
    raise exception 'Resultado inválido' using errcode = '22023';
  end if;
  update privado.pagamento_avisos a set processado_em = now(), resultado = p_resultado, reservado_ate = null
  where a.id = p_aviso and a.processado_em is null;
  return found;
end;
$$;

-- 10) O worker: a reconsulta aplicada (a única que confirma; PAY-b). p_consulta é o que a Asaas respondeu sobre o pagamento
--     do aviso, no formato comum: {"id_no_provedor", "link", "valor_centavos", "situacao": pago | pendente | cancelado |
--     estornado | desconhecida}. O banco confere de novo: o link é o do pagamento, o valor é o do pedido e a passagem da
--     situação. O pago estende o pedido, as reservas do site e as de estoque (o que a configuração diz). O que não fecha
--     vira divergência, sem mudar a situação. Devolve o resultado (o mesmo gravado no aviso).
create or replace function public.pagamento_consulta_aplicar(p_aviso text, p_consulta jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_aviso privado.pagamento_avisos;
  v_pg public.loja_pagamentos;
  v_situacao text := p_consulta ->> 'situacao';
  v_valor bigint;
  v_id text := p_consulta ->> 'id_no_provedor';
  v_ate timestamptz;
  v_fora boolean;
  v_resultado text;
  v_divergencia text;
begin
  if p_consulta is null or jsonb_typeof(p_consulta) <> 'object' or coalesce(v_situacao, '') not in ('pago', 'pendente', 'cancelado', 'estornado', 'desconhecida')
     or coalesce(jsonb_typeof(p_consulta -> 'valor_centavos'), '') <> 'number' or coalesce(v_id, '') !~ '^[A-Za-z0-9_-]{1,80}$'
     or coalesce(p_consulta ->> 'link', '') !~ '^[A-Za-z0-9_-]{1,80}$' then
    raise exception 'Reconsulta inválida' using errcode = '22023';
  end if;
  begin
    v_valor := (p_consulta ->> 'valor_centavos')::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Reconsulta inválida' using errcode = '22023';
  end;
  select * into v_aviso from privado.pagamento_avisos a where a.id = p_aviso for update;
  if not found then
    raise exception 'Aviso não encontrado' using errcode = 'P0002';
  end if;
  if v_aviso.processado_em is not null then
    return v_aviso.resultado;
  end if;
  select * into v_pg from public.loja_pagamentos pg where pg.link_id = p_consulta ->> 'link' for update;
  if not found or v_aviso.link_id is distinct from v_pg.link_id then
    v_resultado := 'link_desconhecido';
  elsif v_situacao = 'desconhecida' then
    v_resultado := 'situacao_desconhecida';
    v_divergencia := 'a Asaas respondeu uma situação que o sistema não conhece';
  elsif v_valor <> v_pg.valor_centavos then
    v_resultado := 'divergencia';
    v_divergencia := 'o valor pago é outro';
  elsif v_situacao = 'pago' then
    if v_pg.situacao = 'aguardando' then
      -- O dinheiro veio: o pagamento fica pago de qualquer jeito. O pedido só se estende se ainda estava valendo (reservado,
      -- dentro do prazo e com todas as reservas ativas); senão, o pago vira divergência para a loja resolver.
      select (p.situacao <> 'reservado' or p.expira_em <= now() or exists (
                select 1 from public.loja_reservas r join public.estoque_reservas er on er.id = r.estoque_reserva_id
                where r.pedido_id = p.id and (r.situacao <> 'ativa' or er.situacao <> 'ativa')))
      into v_fora from public.loja_pedidos p where p.id = v_pg.pedido_id;
      update public.loja_pagamentos pg
      set situacao = 'pago', pago_em = now(), id_no_provedor = v_id, atualizado_em = now()
      where pg.id = v_pg.id;
      if v_fora then
        v_divergencia := 'pago depois de o pedido vencer ou ser cancelado';
      else
        -- O pedido pago fica guardado para a retirada: o pedido, as reservas do site e as de estoque dele.
        v_ate := now() + (select c.guardar_pago_por from privado.pagamento_pelo_site c where c.provedor = 'asaas');
        update public.loja_pedidos p set expira_em = greatest(p.expira_em, v_ate) where p.id = v_pg.pedido_id;
        update public.estoque_reservas er set expira_em = greatest(er.expira_em, v_ate)
        from public.loja_reservas r
        where r.pedido_id = v_pg.pedido_id and r.situacao = 'ativa' and er.id = r.estoque_reserva_id and er.situacao = 'ativa';
        update public.loja_reservas r set expira_em = greatest(r.expira_em, v_ate)
        where r.pedido_id = v_pg.pedido_id and r.situacao = 'ativa';
      end if;
      v_resultado := 'confirmado';
    elsif v_pg.situacao in ('pago', 'estornado') then
      v_resultado := 'ja_registrado';
    else
      v_resultado := 'divergencia';
      v_divergencia := 'pago depois de o pagamento ser cancelado';
    end if;
  elsif v_situacao = 'estornado' then
    if v_pg.situacao = 'pago' then
      update public.loja_pagamentos pg set situacao = 'estornado', estornado_em = now(), atualizado_em = now() where pg.id = v_pg.id;
      v_resultado := 'estorno_registrado';
    elsif v_pg.situacao = 'estornado' then
      v_resultado := 'ja_registrado';
    else
      v_resultado := 'divergencia';
      v_divergencia := 'estorno sem pagamento';
    end if;
  else
    v_resultado := case v_situacao when 'pendente' then 'pendente' else 'ignorado' end;
  end if;
  if v_divergencia is not null then
    update public.loja_pagamentos pg set divergencia = v_divergencia, atualizado_em = now() where pg.id = v_pg.id;
  end if;
  update privado.pagamento_avisos a set processado_em = now(), resultado = v_resultado, reservado_ate = null where a.id = p_aviso;
  return v_resultado;
end;
$$;

-- 11) O worker: os links a desativar (o pedido cancelado, atendido ou vencido sem pagamento). O pagamento que ainda não
--     tinha link é cancelado aqui mesmo.
create or replace function public.pagamentos_a_desativar(p_limite int default 20)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  lote jsonb;
begin
  update public.loja_pagamentos pg set situacao = 'cancelado', reservado_ate = null, atualizado_em = now()
  from public.loja_pedidos p
  where p.id = pg.pedido_id and pg.situacao in ('criando', 'falhou') and pg.link_id is null
    and (p.situacao <> 'reservado' or p.expira_em <= now());
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'link', x.link_id) order by x.atualizado_em, x.id), '[]'::jsonb) into lote
  from (
    select pg.id, pg.link_id, pg.atualizado_em from public.loja_pagamentos pg
    join public.loja_pedidos p on p.id = pg.pedido_id
    where pg.situacao = 'aguardando' and pg.link_desativado_em is null and (p.situacao <> 'reservado' or p.expira_em <= now())
    order by pg.atualizado_em, pg.id
    limit least(greatest(coalesce(p_limite, 20), 1), 50)
  ) x;
  return lote;
end;
$$;

create or replace function public.pagamento_link_desativado(p_pagamento uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.loja_pagamentos pg set link_desativado_em = now(), situacao = 'cancelado', atualizado_em = now()
  where pg.id = p_pagamento and pg.situacao = 'aguardando' and pg.link_desativado_em is null;
  return found;
end;
$$;

-- 12) Cancelar o pedido (a do ONLINE-d): o pedido pago pelo site não se cancela enquanto o dinheiro não voltar (OR048).
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
  if exists (select 1 from public.loja_pagamentos pg where pg.pedido_id = v_pedido.id and pg.situacao = 'pago') then
    raise exception 'Este pedido foi pago pelo site: devolva o dinheiro pela Asaas antes de cancelar' using errcode = 'OR048';
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

-- Se o pagamento pelo site está ligado: a tela do carrinho diz, antes do pedido, que dá para pagar com Pix depois de
-- reservar.
create or replace function public.loja_pagamento_disponivel()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.ligado from privado.pagamento_pelo_site c where c.provedor = 'asaas'), false);
$$;

revoke all on function public.loja_pagamento_disponivel(), public.loja_pagamento_pedir(uuid, text, text), public.pagamento_aviso_receber(text, jsonb),
  public.pagamento_configuracao(), public.pagamento_ligar(text, text, text), public.pagamentos_a_criar(int),
  public.pagamento_link_registrar(uuid, text, text), public.pagamento_criacao_falhou(uuid, text, boolean),
  public.pagamento_avisos_a_processar(int), public.pagamento_aviso_concluir(text, text), public.pagamento_consulta_aplicar(text, jsonb),
  public.pagamentos_a_desativar(int), public.pagamento_link_desativado(uuid) from public, anon, authenticated;
-- O visitante (sem login) vê se dá para pagar pelo site e pede para pagar, com o código e o WhatsApp do pedido; o site
-- repassa o aviso da Asaas, que só passa com o token conferido.
grant execute on function public.loja_pagamento_disponivel(), public.loja_pagamento_pedir(uuid, text, text), public.pagamento_aviso_receber(text, jsonb)
  to anon, authenticated;
-- O worker dos pagamentos (a chave secreta do servidor): o resto.
grant execute on function public.pagamento_configuracao(), public.pagamento_ligar(text, text, text), public.pagamentos_a_criar(int),
  public.pagamento_link_registrar(uuid, text, text), public.pagamento_criacao_falhou(uuid, text, boolean),
  public.pagamento_avisos_a_processar(int), public.pagamento_aviso_concluir(text, text), public.pagamento_consulta_aplicar(text, jsonb),
  public.pagamentos_a_desativar(int), public.pagamento_link_desativado(uuid) to service_role;
