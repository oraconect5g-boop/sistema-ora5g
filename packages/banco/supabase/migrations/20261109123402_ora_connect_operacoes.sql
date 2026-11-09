-- =============================================================================
-- ADR-005 — Ora Connect: operações telecom persistentes (ORA-CONNECT-001 a 010)
-- Proposto em 08/11/2026; aplicado só no desenvolvimento (prioridade do proprietário de 08/11).
--
--   * A loja só REGISTRA a operação, como a pessoa logada. Quem fala com a Contel é o worker do
--     servidor (credenciais da Nogle só lá), pelas funções connect_worker_* (service_role).
--   * Fatos separados: venda do chip (venda), pedido de ativação/recarga/portabilidade
--     (operação), respostas e consultas da operadora (eventos) e produção do vendedor (uma por
--     operação confirmada; a chave única impede a segunda).
--   * Só a evidência da operadora confirma. Resultado desconhecido (sem resposta, resposta
--     ambígua, worker parou no meio do envio) nunca vira sucesso sozinho e nunca é reenviado:
--     a gerência decide vendo a evidência das consultas, e não resolve a própria operação.
--   * Cada tipo só funciona habilitado na organização (integracoes.gerir, com a evidência da
--     homologação) e no worker (NOGLE_OPERACOES_HABILITADAS).
--   * SALDO (carteira pré-paga da Ora na Contel) só com o serviço já pago na loja: exige o item
--     de uma venda concluída. LINK: o cliente paga direto à Contel; a loja não recebe nada.
--   * Plano, valor de face, DDD, cidade e operadora vêm das listas oficiais sincronizadas pelo
--     worker, nunca digitados na tela.
--   * Dados pessoais do pedido de ativação ficam em privado.connect_dados_envio só até o envio;
--     na operação fica o documento mascarado.
--   * Chip vendido com ativação viva não volta ao estoque, e venda com operação viva não é
--     cancelada pelo PDV: primeiro resolve-se a operação.
-- Ordem das travas: chave → venda (do serviço) → item serializado (chip) → operação.
-- Códigos: OR011 chip do estoque ainda não vendido, OR012 operação não habilitada,
--          OR013 operação em andamento (ou feita) para o mesmo chip, linha ou venda.
-- Reversão: supabase/reversao/<mesmo nome>.sql (só em banco sem dados reais).
-- =============================================================================

do $$
begin
  perform set_config('ora.motivo', 'ADR-005: operações da Ora Connect', true);
  insert into public.permissoes (codigo, descricao, modulo) values
    ('connect.operar', 'Registrar ativação, recarga e portabilidade da Ora Connect', 'telecom'),
    ('connect.gerir', 'Ver as operações da loja e decidir resultado desconhecido da Ora Connect', 'telecom');
  insert into public.papel_permissoes (papel, permissao) values
    ('dono', 'connect.operar'), ('dono', 'connect.gerir'),
    ('gerente', 'connect.operar'), ('gerente', 'connect.gerir'),
    ('vendedor', 'connect.operar');
end;
$$;

create or replace function privado.cpf_valido(p_cpf text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  soma int;
  d1 int;
  d2 int;
begin
  if p_cpf is null or p_cpf !~ '^[0-9]{11}$' or p_cpf ~ '^(.)\1{10}$' then
    return false;
  end if;
  soma := 0;
  for i in 1..9 loop soma := soma + substr(p_cpf, i, 1)::int * (11 - i); end loop;
  d1 := (soma * 10) % 11;
  if d1 = 10 then d1 := 0; end if;
  soma := 0;
  for i in 1..10 loop soma := soma + substr(p_cpf, i, 1)::int * (12 - i); end loop;
  d2 := (soma * 10) % 11;
  if d2 = 10 then d2 := 0; end if;
  return d1 = substr(p_cpf, 10, 1)::int and d2 = substr(p_cpf, 11, 1)::int;
end;
$$;

-- Linha da Contel: 11 dígitos (DDD + número de celular), como na documentação.
create or replace function privado.linha_valida(p_linha text)
returns boolean language sql immutable set search_path = ''
as $$ select coalesce(p_linha ~ '^[1-9]{2}9[0-9]{8}$', false); $$;

-- -----------------------------------------------------------------------------
-- 1. Habilitação por tipo e listas oficiais
-- -----------------------------------------------------------------------------
create table public.connect_habilitacoes (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id),
  tipo text not null check (tipo in ('ativacao', 'recarga', 'portabilidade')),
  habilitada boolean not null,
  evidencia text not null check (length(trim(evidencia)) >= 10),
  alterado_por uuid references public.perfis_usuario (id),
  alterado_em timestamptz not null default now(),
  unique (organizacao_id, tipo)
);
create trigger connect_habilitacoes_auditar after insert or update or delete on public.connect_habilitacoes
  for each row execute function privado.auditar_mudanca();

-- Planos, cidades, DDDs e operadoras doadoras, como a Contel devolve (GET /planos, /cidades/UF,
-- /ddds, /portabilidade/operadorasDisponiveis). Item que some da lista fica inativo.
create table public.connect_referencias (
  organizacao_id uuid not null references public.organizacoes (id),
  tipo text not null check (tipo in ('plano', 'cidade', 'ddd', 'operadora')),
  codigo text not null check (
    (tipo = 'ddd' and codigo ~ '^[1-9]{2}$') or (tipo <> 'ddd' and codigo ~ '^[0-9]{1,9}$')),
  nome text not null check (length(trim(nome)) > 0),
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  valor_centavos bigint check (valor_centavos >= 0),
  dados jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  primary key (organizacao_id, tipo, codigo),
  constraint plano_tem_valor check (tipo <> 'plano' or valor_centavos is not null),
  constraint cidade_tem_uf check (tipo <> 'cidade' or uf is not null)
);

-- -----------------------------------------------------------------------------
-- 2. Operações, dados de envio, eventos e produção
-- -----------------------------------------------------------------------------
create table public.connect_operacoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null,
  unidade_id uuid not null,
  vendedor_id uuid not null references public.perfis_usuario (id),
  tipo text not null check (tipo in ('ativacao', 'recarga', 'portabilidade')),
  chave text not null check (length(trim(chave)) > 0),
  conteudo text not null,
  situacao text not null default 'registrada' check (situacao in (
    'registrada', 'enviando', 'aguardando_operadora', 'resultado_desconhecido',
    'confirmada', 'recusada', 'negada', 'erro_operadora', 'nao_recebida', 'cancelada')),
  metodo_pagamento text check (metodo_pagamento in ('LINK', 'SALDO')),
  iccid text check (iccid is null or privado.iccid_valido(iccid)),
  esim boolean not null default false,
  ddd smallint check (ddd between 11 and 99),
  linha text check (linha is null or privado.linha_valida(linha)),
  linha_doadora text check (linha_doadora is null or privado.linha_valida(linha_doadora)),
  operadora_doadora_id int,
  plano_id int,
  plano_nome text,
  valor_face_centavos bigint check (valor_face_centavos >= 0),
  item_serializado_id uuid references public.itens_serializados (id),
  venda_chip_id uuid references public.vendas (id),
  venda_item_id uuid references public.venda_itens (id),
  recebido_na_loja_centavos bigint check (recebido_na_loja_centavos >= 0),
  cliente_nome text check (cliente_nome is null or length(trim(cliente_nome)) between 3 and 120),
  documento_mascarado text,
  id_externo text,
  data_cadastro_externa text,
  link_pagamento text,
  link_esim text,
  numero_ativado text,
  valor_debitado_centavos bigint check (valor_debitado_centavos >= 0),
  evidencia jsonb,
  mensagem_operadora text,
  tentativas_consulta int not null default 0,
  proxima_consulta_em timestamptz,
  enviando_desde timestamptz,
  enviado_em timestamptz,
  concluida_em timestamptz,
  resolvida_por uuid references public.perfis_usuario (id),
  motivo_resolucao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  unique (organizacao_id, chave),
  constraint ativacao_completa check (tipo <> 'ativacao' or (
    metodo_pagamento is not null and ddd is not null and plano_id is not null
    and (esim or iccid is not null) and linha is null and linha_doadora is null)),
  constraint recarga_completa check (tipo <> 'recarga' or (
    metodo_pagamento is not null and linha is not null and plano_id is not null and valor_face_centavos is not null
    and iccid is null and not esim and linha_doadora is null)),
  constraint portabilidade_completa check (tipo <> 'portabilidade' or (
    linha is not null and linha_doadora is not null and linha <> linha_doadora and operadora_doadora_id is not null
    and metodo_pagamento is null and iccid is null and not esim)),
  constraint saldo_pago_na_loja check (metodo_pagamento is distinct from 'SALDO' or venda_item_id is not null)
);
-- Um chip, uma ativação viva (inclusive confirmada: chip ativo não se ativa de novo).
create unique index connect_uma_ativacao_por_chip on public.connect_operacoes (organizacao_id, iccid)
  where tipo = 'ativacao' and iccid is not null and situacao not in ('recusada', 'negada', 'nao_recebida', 'cancelada');
-- Recarga em envio ou de resultado desconhecido bloqueia outra na mesma linha (cobrança dupla).
create unique index connect_uma_recarga_em_curso on public.connect_operacoes (organizacao_id, linha)
  where tipo = 'recarga' and situacao in ('registrada', 'enviando', 'resultado_desconhecido');
create unique index connect_uma_portabilidade_em_curso on public.connect_operacoes (organizacao_id, linha_doadora)
  where tipo = 'portabilidade' and situacao not in ('recusada', 'negada', 'nao_recebida', 'cancelada', 'confirmada');
-- O serviço pago na loja vale para uma operação viva só.
create unique index connect_item_de_venda_uma_vez on public.connect_operacoes (venda_item_id)
  where venda_item_id is not null and situacao not in ('recusada', 'negada', 'nao_recebida', 'cancelada');
create index connect_operacoes_unidade on public.connect_operacoes (unidade_id, criado_em desc);
create index connect_operacoes_fila on public.connect_operacoes (organizacao_id, situacao, proxima_consulta_em);
create index connect_operacoes_vendedor on public.connect_operacoes (vendedor_id);
create index connect_operacoes_item on public.connect_operacoes (item_serializado_id);
create index connect_operacoes_venda_chip on public.connect_operacoes (venda_chip_id);
create index connect_operacoes_resolvida_por on public.connect_operacoes (resolvida_por);
create index connect_operacoes_iccid on public.connect_operacoes (organizacao_id, iccid) where iccid is not null;

create table privado.connect_dados_envio (
  operacao_id uuid primary key references public.connect_operacoes (id) on delete cascade,
  dados jsonb not null,
  criado_em timestamptz not null default now()
);

create table public.connect_eventos (
  id bigint generated always as identity primary key,
  organizacao_id uuid not null,
  operacao_id uuid not null references public.connect_operacoes (id),
  tipo text not null check (tipo in (
    'registrada', 'envio_iniciado', 'sem_conexao', 'resposta', 'sem_resposta', 'envio_expirado',
    'consulta', 'confirmada', 'negada', 'erro_operadora', 'resolvida', 'cancelada')),
  situacao_anterior text,
  situacao_nova text,
  status_http int,
  mensagem text,
  dados jsonb,
  usuario_id uuid references public.perfis_usuario (id),
  ocorrido_em timestamptz not null default now()
);
create index connect_eventos_operacao on public.connect_eventos (operacao_id, ocorrido_em);
create index connect_eventos_usuario on public.connect_eventos (usuario_id);
create trigger connect_eventos_sem_alteracao before update or delete on public.connect_eventos
  for each row execute function privado.so_insercao();
create trigger connect_eventos_sem_truncate before truncate on public.connect_eventos
  for each statement execute function privado.so_insercao();

-- Produção do vendedor (DEC-U07): uma linha por operação confirmada, do vendedor e da loja de
-- origem; a chave única impede contar duas vezes.
create table public.connect_producao (
  id bigint generated always as identity primary key,
  organizacao_id uuid not null,
  unidade_id uuid not null,
  vendedor_id uuid not null references public.perfis_usuario (id),
  operacao_id uuid not null unique references public.connect_operacoes (id),
  tipo text not null check (tipo in ('ativacao', 'recarga', 'portabilidade')),
  valor_face_centavos bigint,
  origem text not null check (origem in ('evidencia_da_operadora', 'revisao_da_gerencia')),
  confirmado_em timestamptz not null default now(),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id)
);
create index connect_producao_vendedor on public.connect_producao (vendedor_id, confirmado_em);
create index connect_producao_unidade on public.connect_producao (unidade_id, confirmado_em);
create trigger connect_producao_sem_alteracao before update or delete on public.connect_producao
  for each row execute function privado.so_insercao();
create trigger connect_producao_sem_truncate before truncate on public.connect_producao
  for each statement execute function privado.so_insercao();

-- -----------------------------------------------------------------------------
-- 3. Leitura (RLS)
-- -----------------------------------------------------------------------------
alter table public.connect_habilitacoes enable row level security;
alter table public.connect_referencias enable row level security;
alter table public.connect_operacoes enable row level security;
alter table public.connect_eventos enable row level security;
alter table public.connect_producao enable row level security;
alter table privado.connect_dados_envio enable row level security;
revoke all on public.connect_habilitacoes, public.connect_referencias, public.connect_operacoes, public.connect_eventos,
  public.connect_producao from anon, authenticated;
revoke all on privado.connect_dados_envio from public, anon, authenticated;
revoke all on sequence public.connect_operacoes_numero_seq, public.connect_eventos_id_seq, public.connect_producao_id_seq
  from anon, authenticated;
grant select on public.connect_habilitacoes, public.connect_referencias, public.connect_operacoes, public.connect_eventos,
  public.connect_producao to authenticated;

create policy connect_habilitacoes_ler on public.connect_habilitacoes for select to authenticated
  using (organizacao_id in (select privado.organizacoes_do_catalogo()));
create policy connect_referencias_ler on public.connect_referencias for select to authenticated
  using (organizacao_id in (select privado.organizacoes_do_catalogo()));
create policy connect_operacoes_ler on public.connect_operacoes for select to authenticated
  using ((vendedor_id = (select auth.uid()) and unidade_id in (select privado.unidades_visiveis()))
         or (select public.tem_permissao('connect.gerir', unidade_id)));
create policy connect_eventos_ler on public.connect_eventos for select to authenticated
  using (operacao_id in (select o.id from public.connect_operacoes o));
create policy connect_producao_ler on public.connect_producao for select to authenticated
  using ((vendedor_id = (select auth.uid()) and unidade_id in (select privado.unidades_visiveis()))
         or (select public.tem_permissao('connect.gerir', unidade_id)));

-- -----------------------------------------------------------------------------
-- 4. Proteções: chip ativado e venda com operação viva
-- -----------------------------------------------------------------------------
create or replace function privado.proteger_chip_com_ativacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.iccid is not null and old.situacao = 'vendido' and new.situacao is distinct from 'vendido'
     and exists (select 1 from public.connect_operacoes o
                 where o.organizacao_id = old.organizacao_id and o.tipo = 'ativacao' and o.iccid = old.iccid
                   and o.situacao not in ('recusada', 'negada', 'nao_recebida', 'cancelada')) then
    raise exception 'Chip com ativação na Ora Connect: resolva a operação antes de devolver o chip' using errcode = 'OR013';
  end if;
  return new;
end;
$$;
create trigger itens_serializados_chip_com_ativacao before update of situacao on public.itens_serializados
  for each row execute function privado.proteger_chip_com_ativacao();

create or replace function privado.proteger_venda_com_connect()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.situacao = 'concluida' and new.situacao = 'cancelada'
     and exists (select 1 from public.connect_operacoes o join public.venda_itens i on i.id = o.venda_item_id
                 where i.venda_id = old.id and o.situacao not in ('recusada', 'negada', 'nao_recebida', 'cancelada')) then
    raise exception 'Venda com operação da Ora Connect em andamento ou feita: resolva a operação antes de cancelar' using errcode = 'OR013';
  end if;
  return new;
end;
$$;
create trigger vendas_com_connect before update of situacao on public.vendas
  for each row execute function privado.proteger_venda_com_connect();

-- -----------------------------------------------------------------------------
-- 5. Loja: registrar, cancelar antes do envio, resolver; habilitar (integrações)
-- -----------------------------------------------------------------------------
create or replace function privado.connect_evento(
  p_operacao public.connect_operacoes, p_tipo text, p_anterior text, p_nova text,
  p_status int default null, p_mensagem text default null, p_dados jsonb default null)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.connect_eventos (organizacao_id, operacao_id, tipo, situacao_anterior, situacao_nova, status_http, mensagem, dados, usuario_id)
  values (p_operacao.organizacao_id, p_operacao.id, p_tipo, p_anterior, p_nova, p_status, left(p_mensagem, 500), p_dados, (select auth.uid()));
$$;

-- Texto obrigatório de um JSON do pedido (sem espaços nas pontas), com limite de tamanho.
create or replace function privado.connect_texto(p_dados jsonb, p_campo text, p_rotulo text, p_maximo int, p_obrigatorio boolean default true)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  valor text := nullif(trim(p_dados ->> p_campo), '');
begin
  if valor is null then
    if p_obrigatorio then
      raise exception 'Informe %', p_rotulo using errcode = '22023';
    end if;
    return null;
  end if;
  if length(valor) > p_maximo then
    raise exception '% muito longo', p_rotulo using errcode = '22023';
  end if;
  return valor;
end;
$$;

create or replace function public.connect_registrar(p_tipo text, p_pedido jsonb, p_chave text)
returns uuid
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
  existente public.connect_operacoes;
  metodo text := upper(nullif(trim(p_pedido ->> 'metodo'), ''));
  texto_item text := nullif(trim(p_pedido ->> 'venda_item'), '');
  item public.venda_itens;
  venda public.vendas;
  plano public.connect_referencias;
  numero_iccid text := nullif(regexp_replace(coalesce(p_pedido ->> 'iccid', ''), '[^0-9]', '', 'g'), '');
  eh_esim boolean := coalesce(p_pedido ->> 'esim', 'false') = 'true';
  numero_ddd int;
  numero_linha text := nullif(regexp_replace(coalesce(p_pedido ->> 'linha', ''), '[^0-9]', '', 'g'), '');
  doadora text := nullif(regexp_replace(coalesce(p_pedido ->> 'linha_doadora', ''), '[^0-9]', '', 'g'), '');
  operadora int;
  cliente jsonb := p_pedido -> 'cliente';
  endereco jsonb;
  cpf text;
  cnpj text;
  nascimento date;
  email text;
  telefone text;
  dados jsonb;
  mascara text;
  chip public.itens_serializados;
  venda_do_chip uuid;
  recebido bigint;
  nova public.connect_operacoes;
begin
  if unidade is null or not (select public.tem_permissao('connect.operar', unidade)) then
    raise exception 'Sem permissão para operar a Ora Connect nesta loja' using errcode = '42501';
  end if;
  if p_tipo is null or p_tipo not in ('ativacao', 'recarga', 'portabilidade') then
    raise exception 'Tipo de operação inválido' using errcode = '22023';
  end if;
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  if p_pedido is null or jsonb_typeof(p_pedido) <> 'object' then
    raise exception 'Pedido inválido' using errcode = '22023';
  end if;
  select u.organizacao_id into organizacao from public.unidades u where u.id = unidade;
  -- Conteúdo para a chave: só os campos da operação (os dados pessoais não entram no resumo).
  conteudo := md5(p_tipo || ':' || (p_pedido - 'cliente')::text);
  perform pg_advisory_xact_lock(privado.trava_da_chave('connect', organizacao, p_chave));
  select * into existente from public.connect_operacoes o where o.organizacao_id = organizacao and o.chave = p_chave;
  if found then
    if existente.vendedor_id <> usuario or existente.unidade_id <> unidade or existente.conteudo <> conteudo then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return existente.id;
  end if;
  if not exists (select 1 from public.connect_habilitacoes h where h.organizacao_id = organizacao and h.tipo = p_tipo and h.habilitada) then
    raise exception 'Operação ainda não liberada: falta a homologação com a Contel' using errcode = 'OR012';
  end if;

  -- Forma de pagamento: LINK (cliente paga à Contel) ou SALDO (carteira da Ora; só com o serviço pago na loja).
  if p_tipo = 'portabilidade' then
    if metodo is not null then
      raise exception 'Portabilidade não tem forma de pagamento' using errcode = '22023';
    end if;
  elsif metodo is null or metodo not in ('LINK', 'SALDO') then
    raise exception 'Forma de pagamento: LINK ou SALDO' using errcode = '22023';
  end if;
  if metodo = 'SALDO' and texto_item is null then
    raise exception 'SALDO: venda e receba o serviço no caixa antes de pedir à Contel' using errcode = '22023';
  end if;
  if texto_item is not null then
    if texto_item !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Item de venda inválido' using errcode = '22023';
    end if;
    select * into item from public.venda_itens i where i.id = texto_item::uuid;
    if found then
      select * into venda from public.vendas v where v.id = item.venda_id for share;
    end if;
    if not found or venda.unidade_id <> unidade or venda.situacao <> 'concluida' or item.tipo <> p_tipo then
      raise exception 'O item informado não é um serviço pago desta loja para esta operação' using errcode = 'P0002';
    end if;
    recebido := item.preco_unitario_centavos * item.quantidade - item.desconto_centavos;
  end if;

  if p_tipo in ('ativacao', 'recarga') then
    select * into plano from public.connect_referencias r
    where r.organizacao_id = organizacao and r.tipo = 'plano' and r.codigo = trim(p_pedido ->> 'plano') and r.ativo;
    if not found then
      raise exception 'Plano não encontrado na lista da Contel' using errcode = 'P0002';
    end if;
  end if;

  if p_tipo = 'ativacao' then
    if eh_esim and numero_iccid is not null then
      raise exception 'eSIM não leva ICCID' using errcode = '22023';
    end if;
    if not eh_esim and (numero_iccid is null or not privado.iccid_valido(numero_iccid)) then
      raise exception 'ICCID inválido: confira os dígitos impressos no chip' using errcode = '22023';
    end if;
    if coalesce(p_pedido ->> 'ddd', '') !~ '^[1-9]{2}$'
       or not exists (select 1 from public.connect_referencias r
                      where r.organizacao_id = organizacao and r.tipo = 'ddd' and r.codigo = p_pedido ->> 'ddd' and r.ativo) then
      raise exception 'DDD fora da lista da Contel' using errcode = '22023';
    end if;
    numero_ddd := (p_pedido ->> 'ddd')::int;
    if cliente is null or jsonb_typeof(cliente) <> 'object' then
      raise exception 'Informe os dados do cliente' using errcode = '22023';
    end if;
    cpf := nullif(regexp_replace(coalesce(cliente ->> 'cpf', ''), '[^0-9]', '', 'g'), '');
    cnpj := nullif(regexp_replace(coalesce(cliente ->> 'cnpj', ''), '[^0-9]', '', 'g'), '');
    if (cpf is null) = (cnpj is null) then
      raise exception 'Informe o CPF (pessoa física) ou o CNPJ (empresa)' using errcode = '22023';
    end if;
    if cpf is not null and not privado.cpf_valido(cpf) then
      raise exception 'CPF inválido' using errcode = '22023';
    end if;
    if cnpj is not null and not privado.cnpj_valido(cnpj) then
      raise exception 'CNPJ inválido' using errcode = '22023';
    end if;
    if cpf is not null then
      if coalesce(cliente ->> 'data_nascimento', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'Data de nascimento obrigatória para pessoa física' using errcode = '22023';
      end if;
      begin
        nascimento := (cliente ->> 'data_nascimento')::date;
      exception when others then
        raise exception 'Data de nascimento inválida' using errcode = '22023';
      end;
      if nascimento < date '1900-01-01' or nascimento >= current_date then
        raise exception 'Data de nascimento inválida' using errcode = '22023';
      end if;
    end if;
    email := lower(nullif(trim(cliente ->> 'email'), ''));
    if email is not null and (length(email) > 200 or email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
      raise exception 'E-mail inválido' using errcode = '22023';
    end if;
    telefone := nullif(regexp_replace(coalesce(cliente ->> 'telefone', ''), '[^0-9]', '', 'g'), '');
    if telefone is not null and telefone !~ '^[1-9]{2}[0-9]{9}$' then
      raise exception 'Telefone com DDD: 11 dígitos' using errcode = '22023';
    end if;
    endereco := cliente -> 'endereco';
    if endereco is null or jsonb_typeof(endereco) <> 'object' then
      raise exception 'Informe o endereço do cliente' using errcode = '22023';
    end if;
    if coalesce(regexp_replace(endereco ->> 'cep', '[^0-9]', '', 'g'), '') !~ '^[0-9]{8}$' then
      raise exception 'CEP: 8 dígitos' using errcode = '22023';
    end if;
    if coalesce(endereco ->> 'id_cidade', '') !~ '^[0-9]{1,9}$'
       or not exists (select 1 from public.connect_referencias r
                      where r.organizacao_id = organizacao and r.tipo = 'cidade' and r.codigo = endereco ->> 'id_cidade' and r.ativo) then
      raise exception 'Cidade fora da lista da Contel' using errcode = '22023';
    end if;
    -- Só os campos documentados de POST /ativacao/solicitar.
    dados := jsonb_strip_nulls(jsonb_build_object(
      'nome', privado.connect_texto(cliente, 'nome', 'o nome do cliente', 120),
      'cpf', cpf,
      'cnpj', cnpj,
      'email', email,
      'telefone', telefone,
      'data_nascimento', to_char(nascimento, 'YYYY-MM-DD'),
      'endereco', jsonb_strip_nulls(jsonb_build_object(
        'rua', privado.connect_texto(endereco, 'rua', 'a rua', 120),
        'numero', privado.connect_texto(endereco, 'numero', 'o número do endereço', 20),
        'complemento', privado.connect_texto(endereco, 'complemento', 'o complemento', 120, false),
        'bairro', privado.connect_texto(endereco, 'bairro', 'o bairro', 120),
        'cep', regexp_replace(endereco ->> 'cep', '[^0-9]', '', 'g'),
        'id_cidade', (endereco ->> 'id_cidade')::int))));
    if length(dados ->> 'nome') < 3 then
      raise exception 'Informe o nome completo do cliente' using errcode = '22023';
    end if;
    mascara := case when cpf is not null then '•••.•••.' || substr(cpf, 7, 3) || '-' || right(cpf, 2)
                    else '••.•••.•••/' || substr(cnpj, 9, 4) || '-' || right(cnpj, 2) end;
    -- Chip do nosso estoque: só depois de vendido (a venda do chip é outro fato).
    if numero_iccid is not null then
      select * into chip from public.itens_serializados s
      where s.organizacao_id = organizacao and s.iccid = numero_iccid for update;
      if found then
        if chip.situacao <> 'vendido' then
          raise exception 'Este chip ainda está no estoque: venda o chip antes de ativar' using errcode = 'OR011';
        end if;
        select vi.venda_id into venda_do_chip
        from public.venda_itens vi join public.vendas v on v.id = vi.venda_id
        where vi.item_serializado_id = chip.id and v.situacao = 'concluida'
        order by v.concluida_em desc limit 1;
      end if;
    end if;
  elsif p_tipo = 'recarga' then
    if not privado.linha_valida(numero_linha) then
      raise exception 'Linha: 11 dígitos com DDD' using errcode = '22023';
    end if;
  else
    if not privado.linha_valida(numero_linha) or not privado.linha_valida(doadora) then
      raise exception 'Linhas: 11 dígitos com DDD' using errcode = '22023';
    end if;
    if numero_linha = doadora then
      raise exception 'A linha doadora é a da outra operadora: não pode ser a mesma da Contel' using errcode = '22023';
    end if;
    if coalesce(p_pedido ->> 'operadora', '') !~ '^[0-9]{1,9}$'
       or not exists (select 1 from public.connect_referencias r
                      where r.organizacao_id = organizacao and r.tipo = 'operadora' and r.codigo = p_pedido ->> 'operadora' and r.ativo) then
      raise exception 'Operadora doadora fora da lista da Contel' using errcode = '22023';
    end if;
    operadora := (p_pedido ->> 'operadora')::int;
  end if;

  begin
    insert into public.connect_operacoes (
      organizacao_id, unidade_id, vendedor_id, tipo, chave, conteudo, metodo_pagamento, iccid, esim, ddd, linha, linha_doadora,
      operadora_doadora_id, plano_id, plano_nome, valor_face_centavos, item_serializado_id, venda_chip_id, venda_item_id,
      recebido_na_loja_centavos, cliente_nome, documento_mascarado)
    values (
      organizacao, unidade, usuario, p_tipo, p_chave, conteudo, metodo, numero_iccid, eh_esim, numero_ddd,
      case when p_tipo <> 'ativacao' then numero_linha end, case when p_tipo = 'portabilidade' then doadora end,
      operadora, plano.codigo::int, plano.nome, plano.valor_centavos, chip.id, venda_do_chip, item.id,
      recebido, dados ->> 'nome', mascara)
    returning * into nova;
  exception when unique_violation then
    raise exception 'Já existe operação em andamento (ou feita) para este chip, linha ou serviço pago' using errcode = 'OR013';
  end;
  if dados is not null then
    insert into privado.connect_dados_envio (operacao_id, dados) values (nova.id, dados);
  end if;
  perform privado.connect_evento(nova, 'registrada', null, 'registrada');
  return nova.id;
end;
$$;

-- Operação visível e travada para quem a gere ou a registrou.
create or replace function privado.connect_operacao_travada(p_operacao uuid)
returns public.connect_operacoes
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op public.connect_operacoes;
begin
  select * into op from public.connect_operacoes o where o.id = p_operacao for update;
  if not found or op.unidade_id is distinct from (select public.unidade_atual())
     or not ((op.vendedor_id = (select auth.uid()) and (select public.tem_permissao('connect.operar', op.unidade_id)))
             or (select public.tem_permissao('connect.gerir', op.unidade_id))) then
    raise exception 'Operação não encontrada' using errcode = 'P0002';
  end if;
  return op;
end;
$$;

create or replace function public.connect_cancelar(p_operacao uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op public.connect_operacoes;
begin
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Informe o motivo' using errcode = '22023';
  end if;
  op := privado.connect_operacao_travada(p_operacao);
  if op.situacao = 'cancelada' then
    return false;
  end if;
  if op.situacao <> 'registrada' then
    raise exception 'Só dá para cancelar antes do envio à Contel (situação: %)', op.situacao using errcode = '22023';
  end if;
  update public.connect_operacoes o
  set situacao = 'cancelada', concluida_em = now(), resolvida_por = (select auth.uid()), motivo_resolucao = trim(p_motivo), atualizado_em = now()
  where o.id = op.id;
  delete from privado.connect_dados_envio d where d.operacao_id = op.id;
  perform privado.connect_evento(op, 'cancelada', op.situacao, 'cancelada', null, trim(p_motivo));
  return true;
end;
$$;

-- Resultado desconhecido ou erro da operadora: a gerência decide com a evidência (consultas,
-- suporte da Contel, ERP da Nogle) e nunca a própria operação. Confirmar gera a produção.
create or replace function public.connect_resolver(p_operacao uuid, p_resultado text, p_motivo text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op public.connect_operacoes;
begin
  if p_resultado is null or p_resultado not in ('confirmada', 'nao_recebida', 'recusada') then
    raise exception 'Resultado: confirmada, nao_recebida ou recusada' using errcode = '22023';
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 10 then
    raise exception 'Descreva a evidência (pelo menos 10 caracteres)' using errcode = '22023';
  end if;
  op := privado.connect_operacao_travada(p_operacao);
  if not (select public.tem_permissao('connect.gerir', op.unidade_id)) then
    raise exception 'Só a gerência resolve operação da Ora Connect' using errcode = '42501';
  end if;
  if op.vendedor_id = (select auth.uid()) then
    raise exception 'Quem registrou não resolve a própria operação' using errcode = '42501';
  end if;
  if op.situacao not in ('resultado_desconhecido', 'erro_operadora') then
    raise exception 'Só resultado desconhecido ou erro da operadora é resolvido à mão (situação: %)', op.situacao using errcode = '22023';
  end if;
  update public.connect_operacoes o
  set situacao = p_resultado, concluida_em = now(), resolvida_por = (select auth.uid()), motivo_resolucao = trim(p_motivo),
      proxima_consulta_em = null, atualizado_em = now()
  where o.id = op.id;
  delete from privado.connect_dados_envio d where d.operacao_id = op.id;
  if p_resultado = 'confirmada' then
    insert into public.connect_producao (organizacao_id, unidade_id, vendedor_id, operacao_id, tipo, valor_face_centavos, origem)
    values (op.organizacao_id, op.unidade_id, op.vendedor_id, op.id, op.tipo, op.valor_face_centavos, 'revisao_da_gerencia')
    on conflict (operacao_id) do nothing;
  end if;
  perform privado.connect_evento(op, 'resolvida', op.situacao, p_resultado, null, trim(p_motivo));
  return p_resultado;
end;
$$;

create or replace function public.connect_habilitar(p_tipo text, p_habilitar boolean, p_evidencia text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  unidade uuid := (select public.unidade_atual());
  organizacao uuid;
begin
  if unidade is null or not (select public.tem_permissao('integracoes.gerir', unidade)) then
    raise exception 'Só quem gere integrações habilita operações da Ora Connect' using errcode = '42501';
  end if;
  if p_tipo is null or p_tipo not in ('ativacao', 'recarga', 'portabilidade') or p_habilitar is null then
    raise exception 'Tipo de operação inválido' using errcode = '22023';
  end if;
  if p_evidencia is null or length(trim(p_evidencia)) < 10 then
    raise exception 'Registre a evidência da homologação (pelo menos 10 caracteres)' using errcode = '22023';
  end if;
  select u.organizacao_id into organizacao from public.unidades u where u.id = unidade;
  perform set_config('ora.motivo', trim(p_evidencia), true);
  insert into public.connect_habilitacoes (organizacao_id, tipo, habilitada, evidencia, alterado_por)
  values (organizacao, p_tipo, p_habilitar, trim(p_evidencia), (select auth.uid()))
  on conflict (organizacao_id, tipo) do update
    set habilitada = excluded.habilitada, evidencia = excluded.evidencia, alterado_por = excluded.alterado_por, alterado_em = now();
  return p_habilitar;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Worker (service_role): enviar, registrar resposta, consultar, listas oficiais
-- -----------------------------------------------------------------------------
create or replace function public.connect_worker_reivindicar_envios(p_organizacao uuid, p_tipos text[], p_limite int)
returns table (
  operacao_id uuid, tipo text, metodo_pagamento text, iccid text, esim boolean, ddd smallint, linha text,
  linha_doadora text, operadora_doadora_id int, plano_id int, dados jsonb)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op public.connect_operacoes;
begin
  -- Envio que não terminou (o worker parou entre pegar e registrar): a Contel pode ter recebido.
  for op in
    select * from public.connect_operacoes o
    where o.organizacao_id = p_organizacao and o.situacao = 'enviando' and o.enviando_desde < now() - interval '5 minutes'
    for update skip locked
  loop
    update public.connect_operacoes o
    set situacao = 'resultado_desconhecido', enviando_desde = null, proxima_consulta_em = now(), atualizado_em = now()
    where o.id = op.id;
    delete from privado.connect_dados_envio d where d.operacao_id = op.id;
    perform privado.connect_evento(op, 'envio_expirado', 'enviando', 'resultado_desconhecido', null,
      'O envio não terminou: a Contel pode ter recebido. Consultar antes de qualquer nova tentativa.');
  end loop;

  for op in
    select o.* from public.connect_operacoes o
    join public.connect_habilitacoes h on h.organizacao_id = o.organizacao_id and h.tipo = o.tipo and h.habilitada
    where o.organizacao_id = p_organizacao and o.situacao = 'registrada' and o.tipo = any (coalesce(p_tipos, '{}'))
    order by o.criado_em, o.id
    limit greatest(1, least(coalesce(p_limite, 5), 20))
    for update of o skip locked
  loop
    update public.connect_operacoes o set situacao = 'enviando', enviando_desde = now(), atualizado_em = now() where o.id = op.id;
    perform privado.connect_evento(op, 'envio_iniciado', 'registrada', 'enviando');
    operacao_id := op.id;
    tipo := op.tipo;
    metodo_pagamento := op.metodo_pagamento;
    iccid := op.iccid;
    esim := op.esim;
    ddd := op.ddd;
    linha := op.linha;
    linha_doadora := op.linha_doadora;
    operadora_doadora_id := op.operadora_doadora_id;
    plano_id := op.plano_id;
    dados := (select d.dados from privado.connect_dados_envio d where d.operacao_id = op.id);
    return next;
  end loop;
end;
$$;

-- p_resultado: {resultado: aceita | recusada | desconhecida | nao_enviada, status_http, mensagem,
-- id_externo, data_cadastro, link_pagamento, link_esim, iccid, dados}. "nao_enviada" = nada saiu
-- do servidor (sem conexão): volta para a fila sem risco de duplicar.
create or replace function public.connect_worker_registrar_envio(p_operacao uuid, p_resultado jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op public.connect_operacoes;
  resultado text := p_resultado ->> 'resultado';
  novo text;
  iccid_resposta text := nullif(regexp_replace(coalesce(p_resultado ->> 'iccid', ''), '[^0-9]', '', 'g'), '');
  status_http int := case when coalesce(p_resultado ->> 'status_http', '') ~ '^[0-9]{1,3}$' then (p_resultado ->> 'status_http')::int end;
begin
  select * into op from public.connect_operacoes o where o.id = p_operacao for update;
  if not found then
    raise exception 'Operação não encontrada' using errcode = 'P0002';
  end if;
  if resultado = 'nao_enviada' then
    if op.situacao <> 'enviando' then
      raise exception 'Operação não está em envio (situação: %)', op.situacao using errcode = '22023';
    end if;
    update public.connect_operacoes o set situacao = 'registrada', enviando_desde = null, atualizado_em = now() where o.id = op.id;
    perform privado.connect_evento(op, 'sem_conexao', 'enviando', 'registrada', null, left(p_resultado ->> 'mensagem', 300));
    return 'registrada';
  end if;
  -- Resposta que chega depois do prazo do envio (já marcado desconhecido) ainda vale como evidência.
  if op.situacao not in ('enviando', 'resultado_desconhecido') or (op.situacao = 'resultado_desconhecido' and op.enviado_em is not null) then
    raise exception 'Operação não está em envio (situação: %)', op.situacao using errcode = '22023';
  end if;
  novo := case resultado when 'aceita' then 'aguardando_operadora' when 'recusada' then 'recusada'
                         when 'desconhecida' then 'resultado_desconhecido' end;
  if novo is null then
    raise exception 'Resultado de envio inválido' using errcode = '22023';
  end if;
  if op.esim and op.iccid is null and iccid_resposta is not null and privado.iccid_valido(iccid_resposta)
     and not exists (select 1 from public.connect_operacoes o where o.organizacao_id = op.organizacao_id and o.tipo = 'ativacao'
                     and o.iccid = iccid_resposta and o.situacao not in ('recusada', 'negada', 'nao_recebida', 'cancelada')) then
    op.iccid := iccid_resposta;
  end if;
  update public.connect_operacoes o
  set situacao = novo,
      enviando_desde = null,
      enviado_em = now(),
      iccid = op.iccid,
      id_externo = coalesce(nullif(left(p_resultado ->> 'id_externo', 60), ''), o.id_externo),
      data_cadastro_externa = coalesce(nullif(left(p_resultado ->> 'data_cadastro', 40), ''), o.data_cadastro_externa),
      link_pagamento = coalesce(nullif(left(p_resultado ->> 'link_pagamento', 500), ''), o.link_pagamento),
      link_esim = coalesce(nullif(left(p_resultado ->> 'link_esim', 500), ''), o.link_esim),
      mensagem_operadora = nullif(left(p_resultado ->> 'mensagem', 300), ''),
      proxima_consulta_em = case novo when 'aguardando_operadora' then now() + interval '1 minute'
                                      when 'resultado_desconhecido' then now() + interval '2 minutes' end,
      concluida_em = case when novo = 'recusada' then now() end,
      atualizado_em = now()
  where o.id = op.id;
  delete from privado.connect_dados_envio d where d.operacao_id = op.id;
  perform privado.connect_evento(op, case when novo = 'resultado_desconhecido' then 'sem_resposta' else 'resposta' end,
    op.situacao, novo, status_http, p_resultado ->> 'mensagem', p_resultado -> 'dados');
  return novo;
end;
$$;

create or replace function public.connect_worker_operacoes_a_consultar(p_organizacao uuid, p_tipos text[], p_limite int)
returns table (
  operacao_id uuid, tipo text, situacao text, iccid text, linha text, linha_doadora text, id_externo text,
  data_cadastro_externa text, metodo_pagamento text, enviado_em timestamptz, tentativas_consulta int)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op public.connect_operacoes;
begin
  for op in
    select * from public.connect_operacoes o
    where o.organizacao_id = p_organizacao and o.situacao in ('aguardando_operadora', 'resultado_desconhecido')
      and o.tipo = any (coalesce(p_tipos, '{}')) and o.proxima_consulta_em <= now()
    order by o.proxima_consulta_em, o.id
    limit greatest(1, least(coalesce(p_limite, 10), 50))
    for update skip locked
  loop
    -- Reserva a consulta por 5 minutos (outro worker não pega a mesma).
    update public.connect_operacoes o set proxima_consulta_em = now() + interval '5 minutes' where o.id = op.id;
    operacao_id := op.id;
    tipo := op.tipo;
    situacao := op.situacao;
    iccid := op.iccid;
    linha := op.linha;
    linha_doadora := op.linha_doadora;
    id_externo := op.id_externo;
    data_cadastro_externa := op.data_cadastro_externa;
    metodo_pagamento := op.metodo_pagamento;
    enviado_em := op.enviado_em;
    tentativas_consulta := op.tentativas_consulta;
    return next;
  end loop;
end;
$$;

-- p_evidencia: {evidencia: confirmada | negada | em_andamento | erro_operadora | sem_evidencia |
-- consulta_bloqueada | falha_consulta, numero, valor_debitado_centavos, mensagem, dados}.
-- Só "aguardando_operadora" (a Contel aceitou o pedido) muda sozinha; desconhecido guarda a
-- evidência para a gerência decidir.
create or replace function public.connect_worker_registrar_consulta(p_operacao uuid, p_evidencia jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op public.connect_operacoes;
  tipo_evidencia text := p_evidencia ->> 'evidencia';
  novo text;
  tentativas int;
  espera interval;
  debitado bigint := case when coalesce(p_evidencia ->> 'valor_debitado_centavos', '') ~ '^[0-9]{1,12}$'
                          then (p_evidencia ->> 'valor_debitado_centavos')::bigint end;
  numero_evidencia text := nullif(regexp_replace(coalesce(p_evidencia ->> 'numero', ''), '[^0-9]', '', 'g'), '');
begin
  if tipo_evidencia is null or tipo_evidencia not in ('confirmada', 'negada', 'em_andamento', 'erro_operadora', 'sem_evidencia',
                                            'consulta_bloqueada', 'falha_consulta') then
    raise exception 'Evidência inválida' using errcode = '22023';
  end if;
  select * into op from public.connect_operacoes o where o.id = p_operacao for update;
  if not found then
    raise exception 'Operação não encontrada' using errcode = 'P0002';
  end if;
  if op.situacao not in ('aguardando_operadora', 'resultado_desconhecido') then
    return op.situacao;
  end if;
  tentativas := op.tentativas_consulta + 1;
  espera := case when tentativas <= 3 then interval '2 minutes' when tentativas <= 6 then interval '10 minutes'
                 when tentativas <= 12 then interval '1 hour' else interval '6 hours' end;
  novo := case when op.situacao = 'aguardando_operadora' and tipo_evidencia in ('confirmada', 'negada', 'erro_operadora')
               then tipo_evidencia else op.situacao end;
  if numero_evidencia is not null and not privado.linha_valida(numero_evidencia) then
    numero_evidencia := null;
  end if;
  update public.connect_operacoes o
  set situacao = novo,
      evidencia = p_evidencia - 'dados' || jsonb_build_object('consultado_em', now()),
      numero_ativado = case when novo = 'confirmada' and o.tipo = 'ativacao' then coalesce(numero_evidencia, o.numero_ativado) else o.numero_ativado end,
      valor_debitado_centavos = case when novo = 'confirmada' then coalesce(debitado, o.valor_debitado_centavos) else o.valor_debitado_centavos end,
      tentativas_consulta = tentativas,
      proxima_consulta_em = case when novo in ('confirmada', 'negada', 'erro_operadora') then null else now() + espera end,
      concluida_em = case when novo in ('confirmada', 'negada') then now() else o.concluida_em end,
      atualizado_em = now()
  where o.id = op.id;
  if novo = 'confirmada' then
    insert into public.connect_producao (organizacao_id, unidade_id, vendedor_id, operacao_id, tipo, valor_face_centavos, origem)
    values (op.organizacao_id, op.unidade_id, op.vendedor_id, op.id, op.tipo, op.valor_face_centavos, 'evidencia_da_operadora')
    on conflict (operacao_id) do nothing;
  end if;
  perform privado.connect_evento(op, case when novo <> op.situacao then novo else 'consulta' end, op.situacao, novo, null,
    p_evidencia ->> 'mensagem', p_evidencia - 'mensagem');
  return novo;
end;
$$;

-- p_itens: [{codigo, nome, uf?, valor_centavos?, dados?}]. Cidades são sincronizadas por UF.
create or replace function public.connect_worker_atualizar_referencias(p_organizacao uuid, p_tipo text, p_itens jsonb)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  total int;
begin
  if p_tipo is null or p_tipo not in ('plano', 'cidade', 'ddd', 'operadora') then
    raise exception 'Tipo de lista inválido' using errcode = '22023';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Lista vazia: nada a atualizar' using errcode = '22023';
  end if;
  insert into public.connect_referencias (organizacao_id, tipo, codigo, nome, uf, valor_centavos, dados, ativo, atualizado_em)
  select p_organizacao, p_tipo, i ->> 'codigo', trim(i ->> 'nome'), nullif(i ->> 'uf', ''),
         case when coalesce(i ->> 'valor_centavos', '') ~ '^[0-9]{1,12}$' then (i ->> 'valor_centavos')::bigint end,
         coalesce(i -> 'dados', '{}'::jsonb), true, now()
  from jsonb_array_elements(p_itens) i
  on conflict (organizacao_id, tipo, codigo) do update
    set nome = excluded.nome, uf = excluded.uf, valor_centavos = excluded.valor_centavos, dados = excluded.dados,
        ativo = true, atualizado_em = now();
  get diagnostics total = row_count;
  update public.connect_referencias r set ativo = false, atualizado_em = now()
  where r.organizacao_id = p_organizacao and r.tipo = p_tipo and r.ativo
    and r.codigo not in (select i ->> 'codigo' from jsonb_array_elements(p_itens) i)
    and (p_tipo <> 'cidade' or r.uf in (select i ->> 'uf' from jsonb_array_elements(p_itens) i));
  return total;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Privilégios
-- -----------------------------------------------------------------------------
revoke all on function privado.cpf_valido(text), privado.linha_valida(text), privado.proteger_chip_com_ativacao(),
  privado.proteger_venda_com_connect(),
  privado.connect_evento(public.connect_operacoes, text, text, text, int, text, jsonb),
  privado.connect_texto(jsonb, text, text, int, boolean), privado.connect_operacao_travada(uuid)
  from public, anon, authenticated;

revoke all on function public.connect_registrar(text, jsonb, text), public.connect_cancelar(uuid, text),
  public.connect_resolver(uuid, text, text), public.connect_habilitar(text, boolean, text) from public, anon;
grant execute on function public.connect_registrar(text, jsonb, text), public.connect_cancelar(uuid, text),
  public.connect_resolver(uuid, text, text), public.connect_habilitar(text, boolean, text) to authenticated;

revoke all on function public.connect_worker_reivindicar_envios(uuid, text[], int), public.connect_worker_registrar_envio(uuid, jsonb),
  public.connect_worker_operacoes_a_consultar(uuid, text[], int), public.connect_worker_registrar_consulta(uuid, jsonb),
  public.connect_worker_atualizar_referencias(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.connect_worker_reivindicar_envios(uuid, text[], int), public.connect_worker_registrar_envio(uuid, jsonb),
  public.connect_worker_operacoes_a_consultar(uuid, text[], int), public.connect_worker_registrar_consulta(uuid, jsonb),
  public.connect_worker_atualizar_referencias(uuid, text, jsonb) to service_role;
