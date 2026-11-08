-- =============================================================================
-- ORA-007 / ORA-010 — Catálogo, preço, custo e estoque com IMEI/ICCID
-- ADR-003 (proposto em 08/11/2026; aplicado só no desenvolvimento a pedido do proprietário).
--
-- Garantias no banco:
--   * SKU e código de barras únicos na organização; IMEI/ICCID com dígito verificador e únicos;
--   * preço e custo com histórico (nada é sobrescrito); a venda guardará o valor do momento;
--   * livro de estoque só de inserção; saldo mantido pelo próprio livro e nunca negativo;
--   * uma reserva ativa por IMEI/ICCID, com trava de linha (duas vendas simultâneas não pegam
--     o mesmo aparelho) e chave de idempotência (repetir o pedido não reserva duas vezes);
--   * leitura por RLS: estoque só da unidade permitida; custo só com custo.ver;
--   * nenhuma escrita direta do usuário logado: só pelas funções abaixo.
-- Códigos de erro para a aplicação: OR001 estoque insuficiente, OR002 item indisponível,
-- OR003 IMEI/ICCID em outra loja, OR004 chave de idempotência já usada em outra operação.
-- Reversão: supabase/reversao/<mesmo nome>.sql (só em banco sem dados reais).
-- =============================================================================

alter table public.unidades add constraint unidades_id_organizacao unique (id, organizacao_id);

-- -----------------------------------------------------------------------------
-- IMEI e ICCID (mesma regra de packages/dominio/src/identificadores.ts)
-- -----------------------------------------------------------------------------
create or replace function privado.luhn_valido(p_digitos text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  soma int := 0;
  d int;
  n int := length(p_digitos);
begin
  if p_digitos is null or p_digitos !~ '^[0-9]+$' then
    return false;
  end if;
  for i in 0..n - 1 loop
    d := substr(p_digitos, n - i, 1)::int;
    if i % 2 = 1 then
      d := d * 2;
      if d > 9 then
        d := d - 9;
      end if;
    end if;
    soma := soma + d;
  end loop;
  return soma % 10 = 0;
end;
$$;

create or replace function privado.imei_valido(p_imei text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_imei ~ '^[0-9]{15}$' and p_imei !~ '^(.)\1{14}$' and privado.luhn_valido(p_imei);
$$;

create or replace function privado.iccid_valido(p_iccid text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_iccid ~ '^89[0-9]{17,18}$' and privado.luhn_valido(p_iccid);
$$;

-- -----------------------------------------------------------------------------
-- Catálogo
-- -----------------------------------------------------------------------------
create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id),
  nome text not null check (length(trim(nome)) > 0),
  -- Política de desconto por margem (DEC-U41, P14), em pontos-base (1000 = 10%).
  -- Nula = o proprietário ainda não definiu: o desconto real fica desligado.
  desconto_teto_pb int check (desconto_teto_pb between 0 and 10000),
  margem_minima_pb int check (margem_minima_pb between 0 and 10000),
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (organizacao_id, nome),
  unique (id, organizacao_id)
);

create table public.marcas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id),
  nome text not null check (length(trim(nome)) > 0),
  criado_em timestamptz not null default now(),
  unique (organizacao_id, nome),
  unique (id, organizacao_id)
);

create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id),
  tipo text not null check (tipo in ('aparelho', 'acessorio', 'chip', 'ativacao', 'portabilidade', 'recarga', 'servico')),
  nome text not null check (length(trim(nome)) > 0),
  categoria_id uuid not null,
  marca_id uuid,
  modelo text,
  descricao text,
  publicar_online boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  foreign key (categoria_id, organizacao_id) references public.categorias (id, organizacao_id),
  foreign key (marca_id, organizacao_id) references public.marcas (id, organizacao_id),
  unique (id, organizacao_id)
);
create index produtos_categoria on public.produtos (categoria_id, organizacao_id);
create index produtos_marca on public.produtos (marca_id, organizacao_id);

create table public.variantes (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  produto_id uuid not null,
  sku text not null check (sku = trim(sku) and length(sku) between 1 and 60),
  nome text not null check (length(trim(nome)) > 0),
  cor text,
  capacidade text,
  codigo_barras text check (codigo_barras is null or codigo_barras ~ '^[0-9]{8,14}$'),
  estoque_minimo int not null default 0 check (estoque_minimo >= 0),
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  foreign key (produto_id, organizacao_id) references public.produtos (id, organizacao_id),
  unique (organizacao_id, sku),
  unique (id, organizacao_id)
);
create unique index variantes_codigo_barras on public.variantes (organizacao_id, codigo_barras) where codigo_barras is not null;
create index variantes_produto on public.variantes (produto_id, organizacao_id);

create table public.precos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  variante_id uuid not null,
  unidade_id uuid,
  canal text not null default 'loja' check (canal in ('loja', 'online')),
  valor_centavos bigint not null check (valor_centavos >= 0),
  inicio timestamptz not null default now(),
  fim timestamptz,
  origem text not null check (origem in ('importacao', 'manual', 'campanha')),
  criado_por uuid references public.perfis_usuario (id),
  motivo text,
  criado_em timestamptz not null default now(),
  foreign key (variante_id, organizacao_id) references public.variantes (id, organizacao_id),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  constraint preco_fim_depois_do_inicio check (fim is null or fim > inicio),
  constraint campanha_tem_fim check (origem <> 'campanha' or fim is not null)
);
-- Um preço "aberto" (sem fim) por variação + loja + canal; o preço novo fecha o anterior.
create unique index precos_um_aberto
  on public.precos (variante_id, coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid), canal)
  where fim is null;
create index precos_variante_vigencia on public.precos (variante_id, inicio desc);
create index precos_unidade on public.precos (unidade_id, organizacao_id);
create index precos_criado_por on public.precos (criado_por);

create table public.custos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  variante_id uuid not null,
  valor_centavos bigint not null check (valor_centavos >= 0),
  inicio timestamptz not null default now(),
  origem text not null check (origem in ('importacao', 'entrada', 'manual')),
  referencia text,
  criado_por uuid references public.perfis_usuario (id),
  criado_em timestamptz not null default now(),
  foreign key (variante_id, organizacao_id) references public.variantes (id, organizacao_id)
);
create index custos_variante_vigencia on public.custos (variante_id, inicio desc);
create index custos_criado_por on public.custos (criado_por);

-- -----------------------------------------------------------------------------
-- Estoque
-- -----------------------------------------------------------------------------
create table public.itens_serializados (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  variante_id uuid not null,
  unidade_id uuid not null,
  imei text check (imei is null or privado.imei_valido(imei)),
  imei2 text check (imei2 is null or privado.imei_valido(imei2)),
  iccid text check (iccid is null or privado.iccid_valido(iccid)),
  numero_serie text check (numero_serie is null or length(trim(numero_serie)) > 0),
  situacao text not null default 'disponivel'
    check (situacao in ('disponivel', 'reservado', 'vendido', 'em_transito', 'em_assistencia', 'baixado')),
  condicao text not null default 'novo' check (condicao in ('novo', 'seminovo', 'avariado')),
  conferido_em timestamptz,
  conferido_por uuid references public.perfis_usuario (id),
  criado_em timestamptz not null default now(),
  foreign key (variante_id, organizacao_id) references public.variantes (id, organizacao_id),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  constraint item_tem_identificador check (imei is not null or iccid is not null),
  constraint imei2_diferente check (imei2 is null or imei2 <> imei),
  unique (id, organizacao_id)
);
create unique index itens_imei on public.itens_serializados (organizacao_id, imei) where imei is not null;
create unique index itens_imei2 on public.itens_serializados (organizacao_id, imei2) where imei2 is not null;
create unique index itens_iccid on public.itens_serializados (organizacao_id, iccid) where iccid is not null;
create index itens_unidade_variante on public.itens_serializados (unidade_id, variante_id, situacao);
create index itens_variante on public.itens_serializados (variante_id, organizacao_id);
create index itens_conferido_por on public.itens_serializados (conferido_por);

create table public.estoque_movimentos (
  id bigint generated always as identity primary key,
  organizacao_id uuid not null,
  unidade_id uuid not null,
  variante_id uuid not null,
  item_serializado_id uuid references public.itens_serializados (id),
  quantidade int not null check (quantidade <> 0),
  tipo text not null check (tipo in (
    'entrada_importacao', 'entrada_compra', 'ajuste_conciliacao', 'ajuste', 'perda',
    'venda', 'devolucao', 'transferencia_saida', 'transferencia_entrada'
  )),
  motivo text,
  referencia_tipo text,
  referencia_id text,
  chave_idempotencia text check (chave_idempotencia is null or length(trim(chave_idempotencia)) > 0),
  usuario_id uuid references public.perfis_usuario (id),
  ocorrido_em timestamptz not null default now(),
  foreign key (variante_id, organizacao_id) references public.variantes (id, organizacao_id),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  constraint item_movimenta_um check (item_serializado_id is null or quantidade in (-1, 1))
);
create unique index estoque_movimentos_idempotencia
  on public.estoque_movimentos (organizacao_id, chave_idempotencia) where chave_idempotencia is not null;
create index estoque_movimentos_unidade_data on public.estoque_movimentos (unidade_id, ocorrido_em desc);
create index estoque_movimentos_variante on public.estoque_movimentos (variante_id, organizacao_id);
create index estoque_movimentos_item on public.estoque_movimentos (item_serializado_id);
create index estoque_movimentos_usuario on public.estoque_movimentos (usuario_id);

create table public.estoque_saldos (
  organizacao_id uuid not null,
  unidade_id uuid not null,
  variante_id uuid not null,
  quantidade int not null default 0,
  reservado int not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (unidade_id, variante_id),
  foreign key (variante_id, organizacao_id) references public.variantes (id, organizacao_id),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  constraint estoque_nao_fica_negativo check (quantidade >= 0),
  constraint reservado_dentro_do_saldo check (reservado >= 0 and reservado <= quantidade)
);
create index estoque_saldos_variante on public.estoque_saldos (variante_id, organizacao_id);
create index estoque_saldos_unidade_org on public.estoque_saldos (unidade_id, organizacao_id);

create table public.estoque_reservas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  unidade_id uuid not null,
  variante_id uuid not null,
  item_serializado_id uuid references public.itens_serializados (id),
  quantidade int not null check (quantidade > 0),
  situacao text not null default 'ativa' check (situacao in ('ativa', 'consumida', 'liberada', 'expirada')),
  origem text not null check (origem in ('pdv', 'online')),
  chave_idempotencia text not null check (length(trim(chave_idempotencia)) > 0),
  expira_em timestamptz not null,
  criado_por uuid references public.perfis_usuario (id),
  criado_em timestamptz not null default now(),
  encerrada_em timestamptz,
  foreign key (variante_id, organizacao_id) references public.variantes (id, organizacao_id),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  constraint item_reserva_um check (item_serializado_id is null or quantidade = 1),
  unique (organizacao_id, chave_idempotencia)
);
-- Duas reservas ativas do mesmo IMEI/ICCID são impossíveis, mesmo em transações simultâneas.
create unique index estoque_reservas_item_ativa
  on public.estoque_reservas (item_serializado_id) where situacao = 'ativa' and item_serializado_id is not null;
create index estoque_reservas_vencimento on public.estoque_reservas (unidade_id, variante_id, expira_em) where situacao = 'ativa';
create index estoque_reservas_variante on public.estoque_reservas (variante_id, organizacao_id);
create index estoque_reservas_unidade_org on public.estoque_reservas (unidade_id, organizacao_id);
create index estoque_reservas_criado_por on public.estoque_reservas (criado_por);

-- -----------------------------------------------------------------------------
-- Regras que dependem de outras tabelas
-- -----------------------------------------------------------------------------
create or replace function privado.tipo_da_variante(p_variante uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.tipo from public.variantes v join public.produtos p on p.id = v.produto_id where v.id = p_variante;
$$;

-- Aparelho tem IMEI e não tem ICCID; chip tem ICCID e não tem IMEI; os outros tipos não têm item.
create or replace function privado.validar_item_serializado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tipo text := privado.tipo_da_variante(new.variante_id);
begin
  if tipo = 'aparelho' and (new.imei is null or new.iccid is not null) then
    raise exception 'Aparelho precisa de IMEI (e não de ICCID)' using errcode = '23514';
  elsif tipo = 'chip' and (new.iccid is null or new.imei is not null or new.imei2 is not null) then
    raise exception 'Chip precisa de ICCID (e não de IMEI)' using errcode = '23514';
  elsif tipo is distinct from 'aparelho' and tipo is distinct from 'chip' then
    raise exception 'Só aparelho e chip são controlados um a um' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger itens_serializados_validar
  before insert or update on public.itens_serializados
  for each row execute function privado.validar_item_serializado();

-- Livro: aparelho e chip movimentam o próprio item (na loja em que ele está); acessório, quantidade;
-- serviços não têm estoque.
create or replace function privado.validar_movimento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tipo text := privado.tipo_da_variante(new.variante_id);
  item record;
begin
  if tipo in ('aparelho', 'chip') then
    if new.item_serializado_id is null then
      raise exception 'Aparelho e chip movimentam pelo IMEI/ICCID' using errcode = '23514';
    end if;
    select i.variante_id, i.unidade_id into item from public.itens_serializados i where i.id = new.item_serializado_id;
    if item.variante_id is distinct from new.variante_id or item.unidade_id is distinct from new.unidade_id then
      raise exception 'O item não é desta variação ou não está nesta loja' using errcode = '23514';
    end if;
  elsif tipo = 'acessorio' then
    if new.item_serializado_id is not null then
      raise exception 'Acessório movimenta por quantidade' using errcode = '23514';
    end if;
  else
    raise exception 'Este tipo de item não tem estoque' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger estoque_movimentos_validar
  before insert on public.estoque_movimentos
  for each row execute function privado.validar_movimento();

create or replace function privado.livro_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'O livro de estoque só aceita inserção: corrija com um novo lançamento' using errcode = '42501';
end;
$$;

create trigger estoque_movimentos_sem_alteracao
  before update or delete on public.estoque_movimentos
  for each row execute function privado.livro_imutavel();
create trigger estoque_movimentos_sem_truncate
  before truncate on public.estoque_movimentos
  for each statement execute function privado.livro_imutavel();

-- O saldo acompanha o livro na mesma transação; o check do saldo recusa estoque negativo.
create or replace function privado.atualizar_saldo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.estoque_saldos as s (organizacao_id, unidade_id, variante_id, quantidade)
  values (new.organizacao_id, new.unidade_id, new.variante_id, new.quantidade)
  on conflict (unidade_id, variante_id)
  do update set quantidade = s.quantidade + excluded.quantidade, atualizado_em = now();
  return null;
end;
$$;

create trigger estoque_movimentos_saldo
  after insert on public.estoque_movimentos
  for each row execute function privado.atualizar_saldo();

-- Categoria guarda a política de desconto: mudança é configuração e vai para a auditoria (ORA-ORG-005).
create trigger categorias_auditar after insert or update or delete on public.categorias
  for each row execute function privado.auditar_mudanca();

-- -----------------------------------------------------------------------------
-- Funções internas (importação, venda e rotina usam; o usuário logado não chama)
-- -----------------------------------------------------------------------------
create or replace function privado.lancar_movimento(
  p_unidade uuid, p_variante uuid, p_quantidade int, p_tipo text, p_item uuid default null,
  p_motivo text default null, p_referencia_tipo text default null, p_referencia_id text default null,
  p_chave text default null, p_usuario uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  organizacao uuid;
  lancamento bigint;
begin
  select u.organizacao_id into organizacao from public.unidades u where u.id = p_unidade;
  insert into public.estoque_movimentos (organizacao_id, unidade_id, variante_id, item_serializado_id, quantidade, tipo,
    motivo, referencia_tipo, referencia_id, chave_idempotencia, usuario_id)
  values (organizacao, p_unidade, p_variante, p_item, p_quantidade, p_tipo,
    p_motivo, p_referencia_tipo, p_referencia_id, p_chave, p_usuario)
  on conflict (organizacao_id, chave_idempotencia) where chave_idempotencia is not null do nothing
  returning id into lancamento;
  if lancamento is null then
    select m.id into lancamento from public.estoque_movimentos m
    where m.organizacao_id = organizacao and m.chave_idempotencia = p_chave;
  end if;
  return lancamento;
end;
$$;

-- Entrada de um aparelho ou chip: cria o item disponível e lança +1 no livro. A mesma chave
-- devolve o item já criado (importação reprocessada não duplica).
create or replace function privado.registrar_item_serializado(
  p_unidade uuid, p_variante uuid, p_imei text, p_imei2 text, p_iccid text, p_tipo text,
  p_chave text, p_usuario uuid default null, p_condicao text default 'novo', p_numero_serie text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  organizacao uuid;
  item uuid;
begin
  if p_tipo not in ('entrada_importacao', 'entrada_compra', 'ajuste_conciliacao', 'ajuste', 'devolucao') then
    raise exception 'Tipo de entrada inválido: %', p_tipo using errcode = '22023';
  end if;
  select u.organizacao_id into organizacao from public.unidades u where u.id = p_unidade;
  select m.item_serializado_id into item from public.estoque_movimentos m
  where m.organizacao_id = organizacao and m.chave_idempotencia = p_chave;
  if item is not null then
    return item;
  end if;
  insert into public.itens_serializados (organizacao_id, variante_id, unidade_id, imei, imei2, iccid, numero_serie, condicao)
  values (organizacao, p_variante, p_unidade, p_imei, p_imei2, p_iccid, p_numero_serie, p_condicao)
  returning id into item;
  perform privado.lancar_movimento(p_unidade, p_variante, 1, p_tipo, item, null, null, null, p_chave, p_usuario);
  return item;
end;
$$;

create or replace function privado.encerrar_reserva(p_reserva uuid, p_situacao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.estoque_reservas;
begin
  update public.estoque_reservas
  set situacao = p_situacao, encerrada_em = now()
  where id = p_reserva and situacao = 'ativa'
  returning * into r;
  if not found then
    return;
  end if;
  update public.estoque_saldos
  set reservado = reservado - r.quantidade, atualizado_em = now()
  where unidade_id = r.unidade_id and variante_id = r.variante_id;
  if r.item_serializado_id is not null and p_situacao in ('liberada', 'expirada') then
    update public.itens_serializados set situacao = 'disponivel'
    where id = r.item_serializado_id and situacao = 'reservado';
  end if;
end;
$$;

-- Vence as reservas passadas do prazo (a rotina chama sem filtro; a reserva chama por loja + variação).
create or replace function privado.expirar_reservas(p_unidade uuid default null, p_variante uuid default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  vencida uuid;
  total int := 0;
begin
  for vencida in
    select r.id from public.estoque_reservas r
    where r.situacao = 'ativa' and r.expira_em <= now()
      and (p_unidade is null or r.unidade_id = p_unidade)
      and (p_variante is null or r.variante_id = p_variante)
    for update skip locked
  loop
    perform privado.encerrar_reserva(vencida, 'expirada');
    total := total + 1;
  end loop;
  return total;
end;
$$;

-- Unidades em que o usuário logado tem a permissão (mesma regra de tem_permissao):
-- papel de organização vale em todas as unidades dela; papel de unidade, só na unidade da sessão.
create or replace function privado.unidades_com_permissao(p_permissao text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from public.unidades u
  join privado.vinculos_vigentes() v on v.escopo = 'organizacao' and v.organizacao_id = u.organizacao_id
  join public.papel_permissoes pp on pp.papel = v.papel and pp.permissao = p_permissao
  union
  select v.unidade_id
  from privado.vinculos_vigentes() v
  join public.papel_permissoes pp on pp.papel = v.papel and pp.permissao = p_permissao
  where v.escopo = 'unidade' and v.unidade_id = (select public.unidade_atual());
$$;

-- -----------------------------------------------------------------------------
-- Funções para a aplicação (o banco confere a permissão e a unidade da sessão)
-- -----------------------------------------------------------------------------
-- Preço vigente: campanha > preço da loja > preço geral. Com p_momento no passado, reconstrói
-- o preço que valia naquela hora.
create or replace function public.preco_vigente(
  p_variante uuid, p_unidade uuid, p_canal text default 'loja', p_momento timestamptz default now()
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select p.valor_centavos
  from public.precos p
  join public.unidades u on u.id = p_unidade and u.organizacao_id = p.organizacao_id
  where p.variante_id = p_variante
    and p.canal = p_canal
    and (p.unidade_id is null or p.unidade_id = p_unidade)
    and p.inicio <= p_momento and (p.fim is null or p.fim > p_momento)
    and p_unidade in (select privado.unidades_visiveis())
  order by (p.origem = 'campanha') desc, (p.unidade_id is null), p.inicio desc
  limit 1;
$$;

-- Quantas unidades disponíveis há em cada loja da organização (sem IMEI), para o vendedor
-- indicar outra loja ao cliente.
create or replace function public.disponibilidade_na_rede(p_variante uuid)
returns table (unidade_id uuid, unidade text, disponivel int)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.nome, coalesce(s.quantidade - s.reservado, 0)
  from public.unidades u
  left join public.estoque_saldos s on s.unidade_id = u.id and s.variante_id = p_variante
  where u.status = 'ativa'
    and u.tipo in ('loja_fisica', 'deposito')
    and u.organizacao_id in (
      select x.organizacao_id from public.unidades x
      where x.id in (select privado.unidades_com_permissao('estoque.consultar'))
    )
  order by u.nome;
$$;

create or replace function public.reservar_estoque(
  p_variante uuid, p_quantidade int, p_item uuid, p_chave text, p_origem text default 'pdv', p_minutos int default 15
)
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
  tipo text;
  qtd int;
  existente public.estoque_reservas;
  item public.itens_serializados;
  nova uuid;
begin
  if unidade is null or not (select public.tem_permissao('venda.registrar', unidade)) then
    raise exception 'Sem permissão para vender nesta unidade' using errcode = '42501';
  end if;
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  if p_origem is null or p_origem not in ('pdv', 'online') then
    raise exception 'Origem inválida' using errcode = '22023';
  end if;
  if p_minutos is null or p_minutos not between 1 and 120 then
    raise exception 'Prazo da reserva entre 1 e 120 minutos' using errcode = '22023';
  end if;
  select u.organizacao_id into organizacao from public.unidades u where u.id = unidade;

  -- Repetir o mesmo pedido devolve a mesma reserva; a chave nunca serve para outra operação.
  select * into existente from public.estoque_reservas r
  where r.organizacao_id = organizacao and r.chave_idempotencia = p_chave;
  if found then
    if existente.criado_por is distinct from usuario or existente.variante_id <> p_variante
       or existente.item_serializado_id is distinct from p_item or existente.unidade_id <> unidade then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return existente.id;
  end if;

  select p.tipo into tipo
  from public.variantes v join public.produtos p on p.id = v.produto_id
  where v.id = p_variante and v.organizacao_id = organizacao and v.ativa and p.ativo;
  if tipo is null then
    raise exception 'Produto não encontrado' using errcode = 'P0002';
  end if;
  if tipo not in ('aparelho', 'chip', 'acessorio') then
    raise exception 'Este item não tem estoque para reservar' using errcode = '22023';
  end if;

  perform privado.expirar_reservas(unidade, p_variante);

  if tipo in ('aparelho', 'chip') then
    if p_item is null or coalesce(p_quantidade, 1) <> 1 then
      raise exception 'Aparelho e chip são reservados um a um, pelo IMEI/ICCID' using errcode = '22023';
    end if;
    select * into item from public.itens_serializados i where i.id = p_item for update;
    if not found or item.variante_id <> p_variante or item.unidade_id <> unidade then
      raise exception 'Este IMEI/ICCID não está nesta loja' using errcode = 'OR003';
    end if;
    if item.situacao <> 'disponivel' then
      raise exception 'Este IMEI/ICCID não está disponível (%)', item.situacao using errcode = 'OR002';
    end if;
    update public.itens_serializados set situacao = 'reservado' where id = p_item;
    qtd := 1;
  else
    if p_item is not null then
      raise exception 'Acessório é reservado por quantidade' using errcode = '22023';
    end if;
    if p_quantidade is null or p_quantidade < 1 then
      raise exception 'Quantidade inválida' using errcode = '22023';
    end if;
    qtd := p_quantidade;
  end if;

  update public.estoque_saldos s
  set reservado = s.reservado + qtd, atualizado_em = now()
  where s.unidade_id = unidade and s.variante_id = p_variante and s.quantidade - s.reservado >= qtd;
  if not found then
    raise exception 'Estoque insuficiente nesta loja' using errcode = 'OR001';
  end if;

  insert into public.estoque_reservas (organizacao_id, unidade_id, variante_id, item_serializado_id, quantidade,
    origem, chave_idempotencia, expira_em, criado_por)
  values (organizacao, unidade, p_variante, p_item, qtd,
    p_origem, p_chave, now() + make_interval(mins => p_minutos), usuario)
  returning id into nova;
  return nova;
end;
$$;

create or replace function public.liberar_reserva(p_reserva uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.estoque_reservas;
begin
  select * into r from public.estoque_reservas where id = p_reserva for update;
  if not found or not (select public.tem_permissao('venda.registrar', r.unidade_id)) then
    raise exception 'Reserva não encontrada' using errcode = 'P0002';
  end if;
  if r.situacao <> 'ativa' then
    return false;
  end if;
  perform privado.encerrar_reserva(r.id, 'liberada');
  return true;
end;
$$;

-- Conferência física (ORA-011): o vendedor confirma que o IMEI/ICCID está na loja.
create or replace function public.conferir_item(p_item uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  unidade uuid;
begin
  select i.unidade_id into unidade from public.itens_serializados i where i.id = p_item;
  if unidade is null or not (select public.tem_permissao('estoque.conferir', unidade)) then
    raise exception 'Item não encontrado nesta loja' using errcode = 'P0002';
  end if;
  update public.itens_serializados set conferido_em = now(), conferido_por = usuario where id = p_item;
  insert into public.auditoria (usuario_id, unidade_id, acao, alvo_tipo, alvo_id, origem)
  values (usuario, unidade, 'estoque.item_conferido', 'itens_serializados', p_item::text, 'conferir_item');
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilégios: leitura filtrada por RLS; escrita só pelas funções acima
-- -----------------------------------------------------------------------------
revoke all on public.categorias, public.marcas, public.produtos, public.variantes, public.precos, public.custos,
  public.itens_serializados, public.estoque_movimentos, public.estoque_saldos, public.estoque_reservas
  from anon, authenticated;
revoke all on sequence public.estoque_movimentos_id_seq from anon, authenticated;
grant select on public.categorias, public.marcas, public.produtos, public.variantes, public.precos, public.custos,
  public.itens_serializados, public.estoque_movimentos, public.estoque_saldos, public.estoque_reservas
  to authenticated;

revoke all on function privado.luhn_valido(text), privado.imei_valido(text), privado.iccid_valido(text),
  privado.tipo_da_variante(uuid), privado.validar_item_serializado(), privado.validar_movimento(),
  privado.livro_imutavel(), privado.atualizar_saldo(),
  privado.lancar_movimento(uuid, uuid, int, text, uuid, text, text, text, text, uuid),
  privado.registrar_item_serializado(uuid, uuid, text, text, text, text, text, uuid, text, text),
  privado.encerrar_reserva(uuid, text), privado.expirar_reservas(uuid, uuid)
  from public, anon, authenticated;
revoke all on function privado.unidades_com_permissao(text) from public, anon;
grant execute on function privado.unidades_com_permissao(text) to authenticated;

revoke all on function public.preco_vigente(uuid, uuid, text, timestamptz), public.disponibilidade_na_rede(uuid),
  public.reservar_estoque(uuid, int, uuid, text, text, int), public.liberar_reserva(uuid), public.conferir_item(uuid)
  from public, anon;
grant execute on function public.preco_vigente(uuid, uuid, text, timestamptz), public.disponibilidade_na_rede(uuid),
  public.reservar_estoque(uuid, int, uuid, text, text, int), public.liberar_reserva(uuid), public.conferir_item(uuid)
  to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.categorias enable row level security;
alter table public.marcas enable row level security;
alter table public.produtos enable row level security;
alter table public.variantes enable row level security;
alter table public.precos enable row level security;
alter table public.custos enable row level security;
alter table public.itens_serializados enable row level security;
alter table public.estoque_movimentos enable row level security;
alter table public.estoque_saldos enable row level security;
alter table public.estoque_reservas enable row level security;

create policy categorias_ler on public.categorias for select to authenticated
  using (organizacao_id in (select v.organizacao_id from privado.vinculos_vigentes() v));
create policy marcas_ler on public.marcas for select to authenticated
  using (organizacao_id in (select v.organizacao_id from privado.vinculos_vigentes() v));
create policy produtos_ler on public.produtos for select to authenticated
  using (organizacao_id in (select v.organizacao_id from privado.vinculos_vigentes() v));
create policy variantes_ler on public.variantes for select to authenticated
  using (organizacao_id in (select v.organizacao_id from privado.vinculos_vigentes() v));
create policy precos_ler on public.precos for select to authenticated
  using (organizacao_id in (select v.organizacao_id from privado.vinculos_vigentes() v));

-- Custo: papel de organização com custo.ver, ou papel de unidade com custo.ver na unidade da sessão.
create policy custos_ler on public.custos for select to authenticated
  using (
    organizacao_id in (select privado.organizacoes_com_permissao('custo.ver'))
    or organizacao_id in (
      select u.organizacao_id from public.unidades u
      where u.id in (select privado.unidades_com_permissao('custo.ver'))
    )
  );

create policy itens_ler on public.itens_serializados for select to authenticated
  using (unidade_id in (select privado.unidades_com_permissao('estoque.consultar')));
create policy movimentos_ler on public.estoque_movimentos for select to authenticated
  using (unidade_id in (select privado.unidades_com_permissao('estoque.consultar')));
create policy saldos_ler on public.estoque_saldos for select to authenticated
  using (unidade_id in (select privado.unidades_com_permissao('estoque.consultar')));
create policy reservas_ler on public.estoque_reservas for select to authenticated
  using (unidade_id in (select privado.unidades_com_permissao('estoque.consultar')));
