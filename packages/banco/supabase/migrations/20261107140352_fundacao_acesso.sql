-- =============================================================================
-- ORA-004 / ORA-005 — Fundação do acesso (ADR-002, aceito em 07/11/2026)
-- Organização, empresas, unidades, perfis, papéis, permissões, vínculos,
-- contexto da sessão e auditoria, com RLS negando tudo por padrão.
--
-- Regras do ADR-002 garantidas aqui:
--   * isolamento por unidade no BANCO (RLS), não só na tela;
--   * unidade da sessão escolhida no servidor (selecionar_unidade), nunca
--     enviada pelo celular a cada requisição;
--   * usuário bloqueado perde acesso mesmo com sessão aberta;
--   * auditoria só de inserção; nada é apagado (desativação por status/fim).
-- Reversão: supabase/reversao/20261107120000_fundacao_acesso.sql (só em banco sem dados reais).
-- =============================================================================

create schema if not exists privado;
revoke all on schema privado from public;
grant usage on schema privado to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Validação de CNPJ (dígitos verificadores)
-- -----------------------------------------------------------------------------
create or replace function privado.cnpj_valido(p_cnpj text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  pesos1 constant int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  pesos2 constant int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  soma int;
  resto int;
  dv1 int;
  dv2 int;
begin
  if p_cnpj is null or p_cnpj !~ '^[0-9]{14}$' or p_cnpj ~ '^(.)\1{13}$' then
    return false;
  end if;
  soma := 0;
  for i in 1..12 loop
    soma := soma + substr(p_cnpj, i, 1)::int * pesos1[i];
  end loop;
  resto := soma % 11;
  dv1 := case when resto < 2 then 0 else 11 - resto end;
  soma := 0;
  for i in 1..13 loop
    soma := soma + substr(p_cnpj, i, 1)::int * pesos2[i];
  end loop;
  resto := soma % 11;
  dv2 := case when resto < 2 then 0 else 11 - resto end;
  return substr(p_cnpj, 13, 1)::int = dv1 and substr(p_cnpj, 14, 1)::int = dv2;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------
create table public.organizacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  status text not null default 'ativa' check (status in ('ativa', 'inativa')),
  criado_em timestamptz not null default now()
);

create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id),
  razao_social text not null check (length(trim(razao_social)) > 0),
  nome_fantasia text,
  cnpj_raiz text not null check (cnpj_raiz ~ '^[0-9]{8}$'),
  status text not null default 'ativa' check (status in ('ativa', 'inativa')),
  criado_em timestamptz not null default now(),
  unique (organizacao_id, cnpj_raiz),
  unique (id, organizacao_id)
);

create table public.unidades (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  empresa_id uuid not null,
  codigo text not null check (codigo ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  nome text not null check (length(trim(nome)) > 0),
  tipo text not null check (tipo in ('loja_fisica', 'online', 'assistencia', 'deposito')),
  cnpj text unique check (cnpj is null or privado.cnpj_valido(cnpj)),
  unidade_emissora_id uuid references public.unidades (id),
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  cidade text,
  endereco text,
  fuso text not null default 'America/Sao_Paulo',
  status text not null default 'ativa' check (status in ('ativa', 'inativa')),
  criado_em timestamptz not null default now(),
  foreign key (empresa_id, organizacao_id) references public.empresas (id, organizacao_id),
  unique (organizacao_id, codigo),
  constraint loja_fisica_exige_cnpj check (tipo <> 'loja_fisica' or cnpj is not null),
  constraint online_exige_emissor check (tipo <> 'online' or cnpj is not null or unidade_emissora_id is not null),
  constraint emissora_nao_e_ela_mesma check (unidade_emissora_id is null or unidade_emissora_id <> id)
);

create table public.perfis_usuario (
  id uuid primary key references auth.users (id) on delete restrict,
  nome text not null check (length(trim(nome)) > 0),
  email text not null unique check (email = lower(email)),
  status text not null default 'ativo' check (status in ('ativo', 'bloqueado')),
  ultimo_acesso_em timestamptz,
  criado_em timestamptz not null default now()
);

create table public.papeis (
  codigo text primary key,
  nome text not null,
  escopo_padrao text not null check (escopo_padrao in ('organizacao', 'unidade')),
  ativo boolean not null default true
);

create table public.permissoes (
  codigo text primary key check (codigo ~ '^[a-z_]+\.[a-z_]+$'),
  descricao text not null,
  modulo text not null
);

create table public.papel_permissoes (
  papel text not null references public.papeis (codigo),
  permissao text not null references public.permissoes (codigo),
  primary key (papel, permissao)
);

create table public.vinculos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfis_usuario (id),
  organizacao_id uuid not null references public.organizacoes (id),
  papel text not null references public.papeis (codigo),
  escopo text not null check (escopo in ('organizacao', 'unidade')),
  unidade_id uuid references public.unidades (id),
  inicio timestamptz not null default now(),
  fim timestamptz,
  criado_por uuid references public.perfis_usuario (id),
  motivo text,
  criado_em timestamptz not null default now(),
  constraint unidade_conforme_escopo check ((escopo = 'unidade') = (unidade_id is not null)),
  constraint fim_depois_do_inicio check (fim is null or fim > inicio)
);

-- Um vínculo em aberto por (usuário, papel, unidade). Encerrar = preencher "fim".
create unique index vinculos_um_aberto
  on public.vinculos (usuario_id, papel, coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where fim is null;
create index vinculos_usuario on public.vinculos (usuario_id);
create index vinculos_unidade on public.vinculos (unidade_id);

create table public.contexto_sessao (
  sessao_id uuid primary key,
  usuario_id uuid not null references public.perfis_usuario (id),
  unidade_atual_id uuid not null references public.unidades (id),
  iniciado_em timestamptz not null default now(),
  trocado_em timestamptz not null default now()
);
create index contexto_sessao_usuario on public.contexto_sessao (usuario_id);

create table public.auditoria (
  id bigint generated always as identity primary key,
  ocorrido_em timestamptz not null default now(),
  usuario_id uuid,
  unidade_id uuid,
  acao text not null,
  alvo_tipo text,
  alvo_id text,
  antes jsonb,
  depois jsonb,
  motivo text,
  origem text not null default 'banco'
);
create index auditoria_unidade_data on public.auditoria (unidade_id, ocorrido_em desc);
create index auditoria_usuario_data on public.auditoria (usuario_id, ocorrido_em desc);

-- -----------------------------------------------------------------------------
-- Regras que dependem de outras tabelas (gatilhos)
-- -----------------------------------------------------------------------------
create or replace function privado.validar_unidade()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  raiz text;
  emissora record;
begin
  select e.cnpj_raiz into raiz from public.empresas e where e.id = new.empresa_id;
  if new.cnpj is not null and left(new.cnpj, 8) <> raiz then
    raise exception 'CNPJ da unidade não pertence ao CNPJ raiz da empresa' using errcode = '23514';
  end if;
  if new.unidade_emissora_id is not null then
    select u.organizacao_id, u.cnpj into emissora from public.unidades u where u.id = new.unidade_emissora_id;
    if emissora.organizacao_id <> new.organizacao_id or emissora.cnpj is null then
      raise exception 'Unidade emissora precisa ser da mesma organização e ter CNPJ' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger unidades_validar
  before insert or update on public.unidades
  for each row execute function privado.validar_unidade();

create or replace function privado.validar_vinculo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  papel_escopo text;
  unidade record;
begin
  select p.escopo_padrao into papel_escopo from public.papeis p where p.codigo = new.papel and p.ativo;
  if papel_escopo is null then
    raise exception 'Papel inexistente ou inativo' using errcode = '23514';
  end if;
  if new.escopo <> papel_escopo then
    raise exception 'O papel % só pode ter escopo %', new.papel, papel_escopo using errcode = '23514';
  end if;
  if new.unidade_id is not null then
    select u.organizacao_id, u.tipo into unidade from public.unidades u where u.id = new.unidade_id;
    if unidade.organizacao_id <> new.organizacao_id then
      raise exception 'Unidade de outra organização' using errcode = '23514';
    end if;
    if new.papel = 'tecnico' and unidade.tipo <> 'assistencia' then
      raise exception 'Técnico só pode ser vinculado a unidade de assistência' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger vinculos_validar
  before insert or update on public.vinculos
  for each row execute function privado.validar_vinculo();

-- Auditoria: ninguém altera nem apaga, nem o dono do banco.
create or replace function privado.auditoria_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'A auditoria só aceita inserção' using errcode = '42501';
end;
$$;

create trigger auditoria_sem_alteracao
  before update or delete on public.auditoria
  for each row execute function privado.auditoria_imutavel();
create trigger auditoria_sem_truncate
  before truncate on public.auditoria
  for each statement execute function privado.auditoria_imutavel();

-- -----------------------------------------------------------------------------
-- Funções de acesso (SECURITY DEFINER, search_path vazio)
-- -----------------------------------------------------------------------------
create or replace function privado.usuario_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfis_usuario p
    where p.id = (select auth.uid()) and p.status = 'ativo'
  );
$$;

-- Vínculos em vigor agora do usuário logado (perfil ativo, unidade e organização ativas).
create or replace function privado.vinculos_vigentes()
returns table (papel text, escopo text, organizacao_id uuid, unidade_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select v.papel, v.escopo, v.organizacao_id, v.unidade_id
  from public.vinculos v
  join public.papeis pa on pa.codigo = v.papel and pa.ativo
  join public.organizacoes o on o.id = v.organizacao_id and o.status = 'ativa'
  left join public.unidades u on u.id = v.unidade_id
  where v.usuario_id = (select auth.uid())
    and (select privado.usuario_ativo())
    and v.inicio <= now()
    and (v.fim is null or v.fim > now())
    and (v.unidade_id is null or u.status = 'ativa');
$$;

-- Unidades que o usuário pode ver: todas da organização (escopo organização)
-- ou só as vinculadas (escopo unidade).
create or replace function privado.unidades_visiveis()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from public.unidades u
  join privado.vinculos_vigentes() v on v.escopo = 'organizacao' and v.organizacao_id = u.organizacao_id
  where u.status = 'ativa'
  union
  select v.unidade_id from privado.vinculos_vigentes() v where v.escopo = 'unidade';
$$;

create or replace function privado.sessao_atual()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif((select auth.jwt()) ->> 'session_id', '')::uuid;
$$;

-- Unidade escolhida na sessão, desde que o vínculo continue valendo.
create or replace function public.unidade_atual()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.unidade_atual_id
  from public.contexto_sessao c
  where c.sessao_id = (select privado.sessao_atual())
    and c.usuario_id = (select auth.uid())
    and c.unidade_atual_id in (select privado.unidades_visiveis());
$$;

-- tem_permissao(permissão, unidade): papéis de escopo unidade só valem na
-- unidade ATUAL da sessão; papéis de organização valem em qualquer unidade dela.
create or replace function public.tem_permissao(p_permissao text, p_unidade uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from privado.vinculos_vigentes() v
    join public.papel_permissoes pp on pp.papel = v.papel and pp.permissao = p_permissao
    where (
      v.escopo = 'organizacao'
      and (p_unidade is null
           or exists (select 1 from public.unidades u
                      where u.id = p_unidade and u.organizacao_id = v.organizacao_id))
    ) or (
      v.escopo = 'unidade'
      and v.unidade_id = (select public.unidade_atual())
      and (p_unidade is null or p_unidade = v.unidade_id)
    )
  );
$$;

-- Escolha da unidade ao entrar (ou troca durante o turno). Registra na auditoria.
-- Devolve true quando aceita e false quando recusa. A recusa NÃO lança erro de
-- propósito: um erro desfaria também o registro da tentativa na auditoria.
create or replace function public.selecionar_unidade(p_unidade uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  sessao uuid := (select privado.sessao_atual());
  anterior uuid;
begin
  if usuario is null or sessao is null then
    raise exception 'Sessão não identificada' using errcode = '42501';
  end if;
  if p_unidade is null or p_unidade not in (select privado.unidades_visiveis()) then
    insert into public.auditoria (usuario_id, unidade_id, acao, alvo_tipo, alvo_id, origem)
    values (usuario, p_unidade, 'sessao.unidade_negada', 'unidade', p_unidade::text, 'selecionar_unidade');
    return false;
  end if;

  select c.unidade_atual_id into anterior from public.contexto_sessao c where c.sessao_id = sessao;

  insert into public.contexto_sessao as c (sessao_id, usuario_id, unidade_atual_id)
  values (sessao, usuario, p_unidade)
  on conflict (sessao_id) do update
    set unidade_atual_id = excluded.unidade_atual_id, trocado_em = now()
    where c.usuario_id = excluded.usuario_id;
  if not found then
    insert into public.auditoria (usuario_id, unidade_id, acao, alvo_tipo, alvo_id, origem)
    values (usuario, p_unidade, 'sessao.de_outro_usuario', 'sessao', sessao::text, 'selecionar_unidade');
    return false;
  end if;

  update public.perfis_usuario set ultimo_acesso_em = now() where id = usuario;

  insert into public.auditoria (usuario_id, unidade_id, acao, alvo_tipo, alvo_id, antes, depois, origem)
  values (usuario, p_unidade, 'sessao.unidade_selecionada', 'unidade', p_unidade::text,
          case when anterior is null then null else jsonb_build_object('unidade_id', anterior) end,
          jsonb_build_object('unidade_id', p_unidade), 'selecionar_unidade');
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilégios: nada para anon; leitura para authenticated, filtrada por RLS.
-- Escritas acontecem só por funções do banco (ADR-002 §2.5, camada 3).
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema privado from public, anon;
revoke all on function public.unidade_atual() from public, anon;
revoke all on function public.tem_permissao(text, uuid) from public, anon;
revoke all on function public.selecionar_unidade(uuid) from public, anon;

grant select on public.organizacoes, public.empresas, public.unidades, public.perfis_usuario,
  public.papeis, public.permissoes, public.papel_permissoes, public.vinculos,
  public.contexto_sessao, public.auditoria to authenticated;
grant execute on all functions in schema privado to authenticated;
grant execute on function public.unidade_atual(), public.tem_permissao(text, uuid),
  public.selecionar_unidade(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.organizacoes enable row level security;
alter table public.empresas enable row level security;
alter table public.unidades enable row level security;
alter table public.perfis_usuario enable row level security;
alter table public.papeis enable row level security;
alter table public.permissoes enable row level security;
alter table public.papel_permissoes enable row level security;
alter table public.vinculos enable row level security;
alter table public.contexto_sessao enable row level security;
alter table public.auditoria enable row level security;

create policy organizacoes_ler on public.organizacoes for select to authenticated
  using (id in (select v.organizacao_id from privado.vinculos_vigentes() v));

create policy empresas_ler on public.empresas for select to authenticated
  using (organizacao_id in (select v.organizacao_id from privado.vinculos_vigentes() v));

create policy unidades_ler on public.unidades for select to authenticated
  using (id in (select privado.unidades_visiveis()));

create policy perfis_ler on public.perfis_usuario for select to authenticated
  using (
    (id = (select auth.uid()) and (select privado.usuario_ativo()))
    or (select public.tem_permissao('usuarios.gerir'))
  );

create policy papeis_ler on public.papeis for select to authenticated
  using ((select privado.usuario_ativo()));
create policy permissoes_ler on public.permissoes for select to authenticated
  using ((select privado.usuario_ativo()));
create policy papel_permissoes_ler on public.papel_permissoes for select to authenticated
  using ((select privado.usuario_ativo()));

create policy vinculos_ler on public.vinculos for select to authenticated
  using (
    (usuario_id = (select auth.uid()) and (select privado.usuario_ativo()))
    or organizacao_id in (
      select v.organizacao_id from privado.vinculos_vigentes() v
      join public.papel_permissoes pp on pp.papel = v.papel and pp.permissao = 'usuarios.gerir'
      where v.escopo = 'organizacao'
    )
  );

create policy contexto_ler on public.contexto_sessao for select to authenticated
  using (usuario_id = (select auth.uid()) and (select privado.usuario_ativo()));

create policy auditoria_ler on public.auditoria for select to authenticated
  using (
    (unidade_id is not null and (select public.tem_permissao('auditoria.ver', unidade_id)))
    or (unidade_id is null and exists (
      select 1 from privado.vinculos_vigentes() v
      join public.papel_permissoes pp on pp.papel = v.papel and pp.permissao = 'auditoria.ver'
      where v.escopo = 'organizacao'
    ))
  );

-- -----------------------------------------------------------------------------
-- Catálogo fixo de papéis e permissões (ADR-002 §2.3 e §2.4)
-- Mudanças só por nova migration revisada.
-- -----------------------------------------------------------------------------
insert into public.papeis (codigo, nome, escopo_padrao) values
  ('dono', 'Dono', 'organizacao'),
  ('administrador', 'Administrador do sistema', 'organizacao'),
  ('gerente', 'Gerente', 'unidade'),
  ('vendedor', 'Vendedor', 'unidade'),
  ('tecnico', 'Técnico de assistência', 'unidade');

insert into public.permissoes (codigo, descricao, modulo) values
  ('unidade.entrar', 'Entrar e escolher a unidade', 'acesso'),
  ('venda.registrar', 'Registrar venda e pagamento', 'vendas'),
  ('venda.ver_todas', 'Ver vendas de todas as unidades', 'vendas'),
  ('venda.ver_unidade', 'Ver vendas da unidade', 'vendas'),
  ('venda.ver_propria', 'Ver as próprias vendas e o resumo da unidade', 'vendas'),
  ('ranking.ver', 'Ver ranking de vendedores', 'metas'),
  ('custo.ver', 'Ver custo e margem', 'catalogo'),
  ('desconto.dar', 'Dar desconto dentro do limite', 'vendas'),
  ('desconto.aprovar', 'Aprovar desconto acima do limite', 'vendas'),
  ('nota.solicitar', 'Solicitar nota fiscal', 'fiscal'),
  ('nota.aprovar', 'Aprovar e emitir nota fiscal', 'fiscal'),
  ('caixa.abrir', 'Abrir e fechar o próprio caixa', 'caixa'),
  ('caixa.conferir', 'Conferir caixa', 'caixa'),
  ('estoque.consultar', 'Consultar estoque', 'estoque'),
  ('estoque.conferir', 'Conferir estoque (contagem)', 'estoque'),
  ('estoque.solicitar_ajuste', 'Solicitar ajuste ou registro de perda', 'estoque'),
  ('estoque.ajustar', 'Ajustar estoque e registrar perda', 'estoque'),
  ('importacao.executar', 'Executar importação do CSV da Rein', 'catalogo'),
  ('importacao.aprovar', 'Aprovar importação do CSV da Rein', 'catalogo'),
  ('preco.alterar', 'Alterar preço', 'catalogo'),
  ('metas.gerir', 'Definir metas e comissões', 'metas'),
  ('metas.ver_unidade', 'Consultar metas da unidade', 'metas'),
  ('metas.ver_propria', 'Consultar a própria meta', 'metas'),
  ('cliente.buscar', 'Buscar cliente por CPF ou telefone (busca exata)', 'crm'),
  ('cliente.exportar', 'Exportar lista de clientes', 'crm'),
  ('os.abrir', 'Abrir ordem de serviço', 'assistencia'),
  ('os.orcar', 'Orçar e concluir a própria ordem de serviço', 'assistencia'),
  ('usuarios.gerir', 'Gerir usuários e vínculos', 'acesso'),
  ('unidades.gerir', 'Gerir unidades e configurações', 'acesso'),
  ('integracoes.gerir', 'Gerir integrações e credenciais', 'integracoes'),
  ('auditoria.ver', 'Ver auditoria', 'acesso');

insert into public.papel_permissoes (papel, permissao)
select 'dono', codigo from public.permissoes
where codigo not in ('integracoes.gerir', 'os.orcar', 'importacao.executar', 'estoque.solicitar_ajuste');

insert into public.papel_permissoes (papel, permissao) values
  ('administrador', 'unidade.entrar'),
  ('administrador', 'venda.ver_todas'),
  ('administrador', 'ranking.ver'),
  ('administrador', 'custo.ver'),
  ('administrador', 'estoque.consultar'),
  ('administrador', 'importacao.executar'),
  ('administrador', 'usuarios.gerir'),
  ('administrador', 'unidades.gerir'),
  ('administrador', 'integracoes.gerir'),
  ('administrador', 'auditoria.ver'),
  ('gerente', 'unidade.entrar'),
  ('gerente', 'venda.registrar'),
  ('gerente', 'venda.ver_unidade'),
  ('gerente', 'ranking.ver'),
  ('gerente', 'custo.ver'),
  ('gerente', 'desconto.dar'),
  ('gerente', 'desconto.aprovar'),
  ('gerente', 'nota.solicitar'),
  ('gerente', 'nota.aprovar'),
  ('gerente', 'caixa.abrir'),
  ('gerente', 'caixa.conferir'),
  ('gerente', 'estoque.consultar'),
  ('gerente', 'estoque.conferir'),
  ('gerente', 'estoque.solicitar_ajuste'),
  ('gerente', 'metas.ver_unidade'),
  ('gerente', 'cliente.buscar'),
  ('gerente', 'os.abrir'),
  ('gerente', 'auditoria.ver'),
  ('vendedor', 'unidade.entrar'),
  ('vendedor', 'venda.registrar'),
  ('vendedor', 'venda.ver_propria'),
  ('vendedor', 'desconto.dar'),
  ('vendedor', 'nota.solicitar'),
  ('vendedor', 'caixa.abrir'),
  ('vendedor', 'estoque.consultar'),
  ('vendedor', 'estoque.conferir'),
  ('vendedor', 'estoque.solicitar_ajuste'),
  ('vendedor', 'metas.ver_propria'),
  ('vendedor', 'cliente.buscar'),
  ('vendedor', 'os.abrir'),
  ('tecnico', 'unidade.entrar'),
  ('tecnico', 'os.orcar');
-- Ranking para vendedor fica de fora até a decisão P3 (nomes dos colegas ou só a própria posição).
