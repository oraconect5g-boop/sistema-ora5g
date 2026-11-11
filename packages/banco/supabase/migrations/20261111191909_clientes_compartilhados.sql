-- =============================================================================
-- Cliente compartilhado da rede (lote L5a: ORA-CRM-001, ORA-CRM-003, ORA-CRM-007; base de ORA-CRM-002)
--
-- O cliente é da empresa, não da loja (ADR-002 §2.4): o mesmo cadastro serve à venda em qualquer loja,
-- à nota, à Ora Connect, ao financiamento, à assistência e à entrega. Regras:
--   * dados mínimos por finalidade: nome e um identificador de busca (CPF/CNPJ ou telefone) sempre;
--     cada finalidade a mais pede o que precisa (nota: documento; Ora Connect: documento, telefone e,
--     para pessoa física, nascimento; financiamento: CPF, telefone, e-mail e nascimento; assistência:
--     telefone; entrega: endereço). Nascimento e endereço só ficam guardados quando uma finalidade os
--     justifica (minimização, LGPD); telefone e e-mail servem ao próprio atendimento;
--   * CPF/CNPJ, telefone, e-mail, nascimento e endereço ficam em privado.cliente_dados, que ninguém lê
--     pela API. A tabela pública guarda o nome, máscaras e um resumo com segredo da rede, que permite a
--     busca exata e impede o mesmo CPF/CNPJ duas vezes (telefone repetido pede confirmação: família);
--   * busca só exata (CPF/CNPJ ou telefone completos) para quem tem cliente.buscar; o dono
--     (cliente.exportar) também busca por código e por nome e lista os clientes. Cada busca, ficha aberta
--     e dado revelado fica na auditoria, sem o valor procurado; mais de 30 buscas ou revelações em 10
--     minutos pela mesma pessoa são barradas (OR028);
--   * consentimento de contato por canal e finalidade (ofertas, pós-venda) num histórico que só cresce;
--     privado.cliente_pode_contatar responde às automações futuras (WhatsApp, campanhas). Avisos do
--     próprio serviço (nota, OS pronta) não dependem dele: são execução do contrato;
--   * a venda guarda o cliente (vendas.cliente_id) sem apagar o nome e o e-mail digitados na hora
--     (origem); venda_vincular_cliente corrige depois, com motivo e auditoria.
-- Códigos: OR026 CPF/CNPJ já cadastrado; OR027 telefone já no cadastro de outra pessoa (confirme);
--          OR028 muitas consultas seguidas.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

do $$
begin
  perform set_config('ora.motivo', 'Cadastro de clientes pela tela (ORA-CRM-001): quem atende cadastra', true);
  insert into public.permissoes (codigo, descricao, modulo)
  values ('cliente.cadastrar', 'Cadastrar e corrigir cliente (dados mínimos por finalidade) e registrar consentimento de contato', 'crm');
  insert into public.papel_permissoes (papel, permissao)
  values ('dono', 'cliente.cadastrar'), ('gerente', 'cliente.cadastrar'), ('vendedor', 'cliente.cadastrar');
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Tabelas
-- -----------------------------------------------------------------------------
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null references public.organizacoes (id),
  tipo text not null check (tipo in ('pessoa_fisica', 'pessoa_juridica')),
  nome text not null check (length(trim(nome)) between 2 and 120),
  finalidades text[] not null default '{}'
    check (finalidades <@ array['nota_fiscal', 'ora_connect', 'financiamento', 'assistencia', 'entrega']::text[]),
  documento_resumo text,
  documento_mascara text,
  telefone_resumo text,
  telefone_mascara text,
  email_mascara text,
  nascimento_informado boolean not null default false,
  endereco_informado boolean not null default false,
  situacao text not null default 'ativo' check (situacao in ('ativo', 'inativo')),
  origem text not null default 'loja' check (origem in ('loja', 'online', 'whatsapp', 'telefone', 'connect', 'importacao')),
  unidade_origem_id uuid,
  chave_criacao text not null check (length(trim(chave_criacao)) between 8 and 80),
  conteudo_criacao text not null,
  criado_por uuid not null references public.perfis_usuario (id),
  criado_em timestamptz not null default now(),
  atualizado_por uuid references public.perfis_usuario (id),
  atualizado_em timestamptz,
  unique (id, organizacao_id),
  unique (organizacao_id, chave_criacao),
  foreign key (unidade_origem_id, organizacao_id) references public.unidades (id, organizacao_id),
  check (documento_resumo is not null or telefone_resumo is not null)
);
create unique index clientes_documento_unico on public.clientes (organizacao_id, documento_resumo) where documento_resumo is not null;
create index clientes_telefone on public.clientes (organizacao_id, telefone_resumo) where telefone_resumo is not null;
create index clientes_unidade_origem on public.clientes (unidade_origem_id, organizacao_id);
create index clientes_criado_por on public.clientes (criado_por);
create index clientes_atualizado_por on public.clientes (atualizado_por);

-- Os dados que identificam a pessoa. Fora da API: só as funções abaixo leem, cada leitura registrada.
create table privado.cliente_dados (
  cliente_id uuid primary key references public.clientes (id),
  documento text check (documento is null or documento ~ '^([0-9]{11}|[0-9]{14})$'),
  telefone text check (telefone is null or telefone ~ '^[1-9]{2}9?[0-9]{8}$'),
  email text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  nascimento date,
  endereco jsonb check (endereco is null or jsonb_typeof(endereco) = 'object')
);
alter table privado.cliente_dados enable row level security;
revoke all on privado.cliente_dados from public, anon, authenticated, service_role;

-- Segredo por organização para o resumo do documento e do telefone. Ninguém de fora lê.
create table privado.crm_segredos (
  organizacao_id uuid primary key references public.organizacoes (id),
  segredo text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  criado_em timestamptz not null default now()
);
alter table privado.crm_segredos enable row level security;
revoke all on privado.crm_segredos from public, anon, authenticated, service_role;
insert into privado.crm_segredos (organizacao_id) select o.id from public.organizacoes o;

create or replace function privado.crm_criar_segredo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into privado.crm_segredos (organizacao_id) values (new.id) on conflict (organizacao_id) do nothing;
  return null;
end;
$$;
revoke all on function privado.crm_criar_segredo() from public, anon, authenticated;
create trigger organizacoes_segredo_crm after insert on public.organizacoes
  for each row execute function privado.crm_criar_segredo();

create table public.cliente_consentimentos (
  id bigint generated always as identity primary key,
  organizacao_id uuid not null,
  cliente_id uuid not null,
  canal text not null check (canal in ('whatsapp', 'sms', 'email', 'ligacao')),
  finalidade text not null check (finalidade in ('ofertas', 'pos_venda')),
  situacao text not null check (situacao in ('concedido', 'retirado')),
  fonte text not null check (fonte in ('loja', 'whatsapp', 'online', 'telefone')),
  unidade_id uuid references public.unidades (id),
  registrado_por uuid not null references public.perfis_usuario (id),
  registrado_em timestamptz not null default now(),
  foreign key (cliente_id, organizacao_id) references public.clientes (id, organizacao_id)
);
create index cliente_consentimentos_cliente on public.cliente_consentimentos (cliente_id, organizacao_id);
create index cliente_consentimentos_atual on public.cliente_consentimentos (cliente_id, canal, finalidade, id desc);
create index cliente_consentimentos_unidade on public.cliente_consentimentos (unidade_id);
create index cliente_consentimentos_registrado_por on public.cliente_consentimentos (registrado_por);
create trigger cliente_consentimentos_auditar after insert on public.cliente_consentimentos
  for each row execute function privado.auditar_mudanca();

-- A venda passa a apontar o cliente (o nome e o e-mail digitados na hora continuam como origem).
alter table public.vendas add column cliente_id uuid;
alter table public.vendas add constraint vendas_cliente_fk foreign key (cliente_id, organizacao_id) references public.clientes (id, organizacao_id);
create index vendas_cliente on public.vendas (cliente_id, organizacao_id);

-- Leitura direta só para quem lista os clientes da rede (dono: cliente.exportar). Os demais usam as
-- funções (busca exata e ficha), que registram cada consulta (ADR-002, teste T11).
alter table public.clientes enable row level security;
alter table public.cliente_consentimentos enable row level security;
revoke all on public.clientes, public.cliente_consentimentos from anon, authenticated;
revoke all on sequence public.clientes_numero_seq, public.cliente_consentimentos_id_seq from anon, authenticated;
grant select on public.clientes, public.cliente_consentimentos to authenticated;
create policy clientes_ler on public.clientes for select to authenticated
  using (organizacao_id in (select privado.organizacoes_com_permissao('cliente.exportar')));
create policy cliente_consentimentos_ler on public.cliente_consentimentos for select to authenticated
  using (organizacao_id in (select privado.organizacoes_com_permissao('cliente.exportar')));

-- -----------------------------------------------------------------------------
-- 2. Auxiliares (sem acesso pela API)
-- -----------------------------------------------------------------------------
-- Telefone com DDD, só dígitos; tira o 55 do país. A mesma regra de normalizarTelefone (packages/dominio).
create or replace function privado.telefone_normalizado(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when x.d ~ '^[1-9]{2}9?[0-9]{8}$' then x.d end
  from (select regexp_replace(regexp_replace(coalesce(p_texto, ''), '[^0-9]', '', 'g'), '^55([0-9]{10,11})$', '\1') as d) x;
$$;

create or replace function privado.mascara_documento(p_documento text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case length(p_documento)
    when 11 then '•••.•••.' || substr(p_documento, 7, 3) || '-' || right(p_documento, 2)
    when 14 then '••.•••.•••/' || substr(p_documento, 9, 4) || '-' || right(p_documento, 2)
  end;
$$;

create or replace function privado.mascara_telefone(p_telefone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_telefone is null then null
    when length(p_telefone) = 11 then '(' || left(p_telefone, 2) || ') •••••-' || right(p_telefone, 4)
    else '(' || left(p_telefone, 2) || ') ••••-' || right(p_telefone, 4)
  end;
$$;

create or replace function privado.mascara_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_email is null then null else left(p_email, 1) || '•••@' || split_part(p_email, '@', 2) end;
$$;

-- Resumo com o segredo da rede: o mesmo documento (ou telefone) dá sempre o mesmo resumo nesta rede.
create or replace function privado.cliente_resumo(p_organizacao uuid, p_tipo text, p_valor text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_segredo text;
begin
  if p_valor is null or p_valor = '' then
    return null;
  end if;
  select s.segredo into v_segredo from privado.crm_segredos s where s.organizacao_id = p_organizacao;
  if v_segredo is null then
    raise exception 'Segredo da rede ausente' using errcode = '55000';
  end if;
  return encode(sha256(convert_to(v_segredo || '|' || p_tipo || '|' || p_valor, 'UTF8')), 'hex');
end;
$$;

-- Registro de acesso a dados de cliente na auditoria (sem o valor procurado nem o dado revelado).
create or replace function privado.cliente_registrar_acesso(p_acao text, p_cliente uuid, p_unidade uuid, p_organizacao uuid, p_detalhe jsonb)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.auditoria (usuario_id, unidade_id, organizacao_id, acao, alvo_tipo, alvo_id, depois, origem)
  values ((select auth.uid()), p_unidade, p_organizacao, p_acao, 'cliente', p_cliente::text, p_detalhe, 'aplicacao');
$$;

-- Limite de consultas: buscas e revelações da pessoa nos últimos 10 minutos.
create or replace function privado.cliente_consultas_recentes()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.auditoria a
  where a.usuario_id = (select auth.uid()) and a.acao in ('cliente.busca', 'cliente.revelado')
    and a.ocorrido_em > now() - interval '10 minutes';
$$;

-- Pode mandar mensagem desta finalidade por este canal? Só com o último registro "concedido" e o cliente ativo.
create or replace function privado.cliente_pode_contatar(p_cliente uuid, p_canal text, p_finalidade text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.situacao = 'concedido' from public.cliente_consentimentos c
    where c.cliente_id = p_cliente and c.canal = p_canal and c.finalidade = p_finalidade
    order by c.id desc limit 1), false)
    and exists (select 1 from public.clientes x where x.id = p_cliente and x.situacao = 'ativo');
$$;

revoke all on function privado.telefone_normalizado(text), privado.mascara_documento(text), privado.mascara_telefone(text),
  privado.mascara_email(text), privado.cliente_resumo(uuid, text, text), privado.cliente_registrar_acesso(text, uuid, uuid, uuid, jsonb),
  privado.cliente_consultas_recentes(), privado.cliente_pode_contatar(uuid, text, text) from public, anon, authenticated;

-- Organização da loja do turno de quem tem a permissão (ou erro de acesso).
create or replace function privado.cliente_contexto(p_permissao text)
returns table (unidade_id uuid, organizacao_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
begin
  if v_unidade is null or not public.tem_permissao(p_permissao, v_unidade) then
    raise exception 'Sem permissão para esta consulta de clientes na loja do turno' using errcode = '42501';
  end if;
  return query select u.id, u.organizacao_id from public.unidades u where u.id = v_unidade;
end;
$$;
revoke all on function privado.cliente_contexto(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Busca exata, ficha e revelação (cada uma registrada)
-- -----------------------------------------------------------------------------
create or replace function public.cliente_buscar(p_criterio text, p_valor text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid;
  v_organizacao uuid;
  v_valor text;
  v_resumo text;
  v_ids uuid[];
begin
  select c.unidade_id, c.organizacao_id into v_unidade, v_organizacao from privado.cliente_contexto('cliente.buscar') c;
  if p_criterio in ('codigo', 'nome') and not public.tem_permissao('cliente.exportar', v_unidade) then
    raise exception 'Busca por código ou nome é de quem lista os clientes da rede: use o CPF/CNPJ ou o telefone completos' using errcode = '42501';
  end if;
  if p_criterio = 'documento' then
    v_valor := regexp_replace(coalesce(p_valor, ''), '[^0-9]', '', 'g');
    if not ((length(v_valor) = 11 and privado.cpf_valido(v_valor)) or (length(v_valor) = 14 and privado.cnpj_valido(v_valor))) then
      raise exception 'Digite o CPF ou o CNPJ completo e válido: a busca nunca é parcial' using errcode = '22023';
    end if;
  elsif p_criterio = 'telefone' then
    v_valor := privado.telefone_normalizado(p_valor);
    if v_valor is null then
      raise exception 'Digite o telefone completo com DDD: a busca nunca é parcial' using errcode = '22023';
    end if;
  elsif p_criterio = 'codigo' then
    v_valor := trim(coalesce(p_valor, ''));
    if v_valor !~ '^[0-9]{1,12}$' then
      raise exception 'Código do cliente inválido' using errcode = '22023';
    end if;
  elsif p_criterio = 'nome' then
    v_valor := lower(regexp_replace(trim(coalesce(p_valor, '')), '\s+', ' ', 'g'));
    if length(v_valor) < 3 then
      raise exception 'Digite ao menos 3 letras do nome' using errcode = '22023';
    end if;
  else
    raise exception 'Busque por CPF/CNPJ ou telefone' using errcode = '22023';
  end if;

  if privado.cliente_consultas_recentes() >= 30 then
    perform privado.cliente_registrar_acesso('cliente.busca_barrada', null, v_unidade, v_organizacao, jsonb_build_object('criterio', p_criterio));
    return jsonb_build_object('situacao', 'limite', 'clientes', '[]'::jsonb);
  end if;

  if p_criterio in ('documento', 'telefone') then
    v_resumo := privado.cliente_resumo(v_organizacao, p_criterio, v_valor);
  end if;
  if p_criterio = 'documento' then
    select coalesce(array_agg(c.id order by c.nome, c.numero), '{}') into v_ids from public.clientes c
    where c.organizacao_id = v_organizacao and c.documento_resumo = v_resumo;
  elsif p_criterio = 'telefone' then
    select coalesce(array_agg(x.id order by x.nome, x.numero), '{}') into v_ids from (
      select c.id, c.nome, c.numero from public.clientes c
      where c.organizacao_id = v_organizacao and c.telefone_resumo = v_resumo order by c.nome, c.numero limit 20) x;
  elsif p_criterio = 'codigo' then
    select coalesce(array_agg(c.id), '{}') into v_ids from public.clientes c
    where c.organizacao_id = v_organizacao and c.numero = v_valor::bigint;
  else
    select coalesce(array_agg(x.id order by x.nome, x.numero), '{}') into v_ids from (
      select c.id, c.nome, c.numero from public.clientes c
      where c.organizacao_id = v_organizacao and strpos(lower(c.nome), v_valor) > 0 order by c.nome, c.numero limit 20) x;
  end if;

  perform privado.cliente_registrar_acesso('cliente.busca', v_ids[1], v_unidade, v_organizacao,
    jsonb_build_object('criterio', p_criterio, 'encontrados', cardinality(v_ids), 'clientes', to_jsonb(v_ids)));
  return jsonb_build_object('situacao', 'ok', 'clientes', coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'numero', c.numero, 'nome', c.nome, 'tipo', c.tipo, 'documento', c.documento_mascara,
                                        'telefone', c.telefone_mascara, 'situacao', c.situacao) order by x.ordem)
    from unnest(v_ids) with ordinality x(id, ordem) join public.clientes c on c.id = x.id), '[]'::jsonb));
end;
$$;

create or replace function public.cliente_ficha(p_cliente uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid;
  v_organizacao uuid;
  v_cliente public.clientes;
begin
  select c.unidade_id, c.organizacao_id into v_unidade, v_organizacao from privado.cliente_contexto('cliente.buscar') c;
  select * into v_cliente from public.clientes c where c.id = p_cliente and c.organizacao_id = v_organizacao;
  if not found then
    raise exception 'Cliente não encontrado' using errcode = 'P0002';
  end if;
  perform privado.cliente_registrar_acesso('cliente.ficha', v_cliente.id, v_unidade, v_organizacao, '{}'::jsonb);
  return jsonb_build_object(
    'id', v_cliente.id, 'numero', v_cliente.numero, 'nome', v_cliente.nome, 'tipo', v_cliente.tipo, 'situacao', v_cliente.situacao,
    'finalidades', to_jsonb(v_cliente.finalidades), 'documento', v_cliente.documento_mascara, 'telefone', v_cliente.telefone_mascara,
    'email', v_cliente.email_mascara, 'nascimento_informado', v_cliente.nascimento_informado, 'endereco_informado', v_cliente.endereco_informado,
    'origem', v_cliente.origem, 'criado_em', v_cliente.criado_em, 'atualizado_em', v_cliente.atualizado_em,
    'loja_de_origem', (select u.nome from public.unidades u where u.id = v_cliente.unidade_origem_id),
    'consentimentos', coalesce((
      select jsonb_agg(jsonb_build_object('canal', x.canal, 'finalidade', x.finalidade, 'situacao', x.situacao, 'fonte', x.fonte,
                                          'registrado_em', x.registrado_em) order by x.canal, x.finalidade)
      from (select distinct on (k.canal, k.finalidade) k.* from public.cliente_consentimentos k
            where k.cliente_id = v_cliente.id order by k.canal, k.finalidade, k.id desc) x), '[]'::jsonb),
    'compras', (select jsonb_build_object('total', count(*), 'ultima', max(v.concluida_em)) from public.vendas v
                where v.cliente_id = v_cliente.id and v.situacao = 'concluida'));
end;
$$;

create or replace function public.cliente_revelar(p_cliente uuid, p_campo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid;
  v_organizacao uuid;
  v_dados privado.cliente_dados;
  v_valor jsonb;
begin
  select c.unidade_id, c.organizacao_id into v_unidade, v_organizacao from privado.cliente_contexto('cliente.buscar') c;
  if p_campo is null or p_campo not in ('documento', 'telefone', 'email', 'nascimento', 'endereco') then
    raise exception 'Dado desconhecido' using errcode = '22023';
  end if;
  select d.* into v_dados from privado.cliente_dados d join public.clientes c on c.id = d.cliente_id
  where d.cliente_id = p_cliente and c.organizacao_id = v_organizacao;
  if not found then
    raise exception 'Cliente não encontrado' using errcode = 'P0002';
  end if;
  if privado.cliente_consultas_recentes() >= 30 then
    raise exception 'Muitas consultas seguidas: aguarde alguns minutos' using errcode = 'OR028';
  end if;
  v_valor := case p_campo
    when 'documento' then to_jsonb(v_dados.documento) when 'telefone' then to_jsonb(v_dados.telefone)
    when 'email' then to_jsonb(v_dados.email) when 'nascimento' then to_jsonb(v_dados.nascimento) else v_dados.endereco end;
  perform privado.cliente_registrar_acesso('cliente.revelado', p_cliente, v_unidade, v_organizacao, jsonb_build_object('campo', p_campo));
  return jsonb_build_object('campo', p_campo, 'valor', v_valor);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Cadastro e correção
-- -----------------------------------------------------------------------------
-- p_dados: {tipo, nome, documento?, telefone?, email?, nascimento? (AAAA-MM-DD), endereco? {cep, logradouro,
-- numero, complemento?, bairro, cidade, uf}, finalidades: [...], telefone_compartilhado?: true, origem?,
-- remover?: [campos]}. Na correção, campo ausente fica como está; "remover" apaga (se nenhuma finalidade o exige).
create or replace function public.cliente_salvar(p_cliente uuid, p_dados jsonb, p_motivo text, p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid;
  v_organizacao uuid;
  v_atual public.clientes;
  v_antes privado.cliente_dados;
  v_motivo text;
  v_conteudo text := md5(coalesce(p_dados, '{}'::jsonb)::text);
  v_remover text[];
  v_tipo text;
  v_nome text;
  v_documento text;
  v_telefone text;
  v_email text;
  v_nascimento date;
  v_endereco jsonb;
  v_finalidades text[];
  v_documento_resumo text;
  v_telefone_resumo text;
  v_campos text[] := '{}';
  v_id uuid;
  v_numero bigint;
  v_texto text;
begin
  select c.unidade_id, c.organizacao_id into v_unidade, v_organizacao from privado.cliente_contexto('cliente.cadastrar') c;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Dados do cliente inválidos' using errcode = '22023';
  end if;
  v_remover := coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(p_dados -> 'remover') = 'array' then p_dados -> 'remover' end)), '{}');

  if p_cliente is null then
    if p_chave is null or length(trim(p_chave)) not between 8 and 80 then
      raise exception 'Chave do formulário obrigatória' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(privado.trava_da_chave('clientes', v_organizacao, trim(p_chave)));
    select * into v_atual from public.clientes c where c.organizacao_id = v_organizacao and c.chave_criacao = trim(p_chave);
    if found then
      if v_atual.conteudo_criacao <> v_conteudo then
        raise exception 'Chave de idempotência já usada em outro cadastro' using errcode = 'OR004';
      end if;
      return jsonb_build_object('id', v_atual.id, 'numero', v_atual.numero, 'repetida', true, 'alterado', false);
    end if;
    v_atual := null;
  else
    select * into v_atual from public.clientes c where c.id = p_cliente and c.organizacao_id = v_organizacao for no key update;
    if not found then
      raise exception 'Cliente não encontrado' using errcode = 'P0002';
    end if;
    v_motivo := privado.exigir_motivo(p_motivo);
    select * into v_antes from privado.cliente_dados d where d.cliente_id = v_atual.id;
  end if;

  -- Valores: o enviado (não vazio), o removido ou o atual.
  v_tipo := coalesce(nullif(trim(coalesce(p_dados ->> 'tipo', '')), ''), v_atual.tipo);
  if v_tipo is null or v_tipo not in ('pessoa_fisica', 'pessoa_juridica') then
    raise exception 'Informe se é pessoa física ou empresa' using errcode = '22023';
  end if;
  v_nome := coalesce(nullif(regexp_replace(trim(coalesce(p_dados ->> 'nome', '')), '\s+', ' ', 'g'), ''), v_atual.nome);
  if v_nome is null or length(v_nome) not between 2 and 120 then
    raise exception 'Informe o nome (de 2 a 120 letras)' using errcode = '22023';
  end if;
  v_documento := case when 'documento' = any (v_remover) then null
    else coalesce(nullif(regexp_replace(coalesce(p_dados ->> 'documento', ''), '[^0-9]', '', 'g'), ''), v_antes.documento) end;
  if v_documento is not null and not (
       (v_tipo = 'pessoa_fisica' and length(v_documento) = 11 and privado.cpf_valido(v_documento))
       or (v_tipo = 'pessoa_juridica' and length(v_documento) = 14 and privado.cnpj_valido(v_documento))) then
    raise exception 'CPF (pessoa física) ou CNPJ (empresa) inválido' using errcode = '22023';
  end if;
  v_texto := nullif(trim(coalesce(p_dados ->> 'telefone', '')), '');
  if v_texto is not null then
    v_telefone := privado.telefone_normalizado(v_texto);
    if v_telefone is null then
      raise exception 'Telefone inválido: use o DDD e o número completo' using errcode = '22023';
    end if;
  elsif not ('telefone' = any (v_remover)) then
    v_telefone := v_antes.telefone;
  end if;
  v_texto := nullif(lower(trim(coalesce(p_dados ->> 'email', ''))), '');
  if v_texto is not null then
    if v_texto !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_texto) > 200 then
      raise exception 'E-mail inválido' using errcode = '22023';
    end if;
    v_email := v_texto;
  elsif not ('email' = any (v_remover)) then
    v_email := v_antes.email;
  end if;
  v_texto := nullif(trim(coalesce(p_dados ->> 'nascimento', '')), '');
  if v_texto is not null then
    begin
      v_nascimento := v_texto::date;
    exception when others then
      raise exception 'Data de nascimento inválida' using errcode = '22023';
    end;
    if v_texto !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v_nascimento < date '1900-01-01' or v_nascimento > current_date then
      raise exception 'Data de nascimento inválida' using errcode = '22023';
    end if;
  elsif not ('nascimento' = any (v_remover)) then
    v_nascimento := v_antes.nascimento;
  end if;
  if jsonb_typeof(p_dados -> 'endereco') = 'object' then
    v_endereco := jsonb_strip_nulls(jsonb_build_object(
      'cep', nullif(regexp_replace(coalesce(p_dados -> 'endereco' ->> 'cep', ''), '[^0-9]', '', 'g'), ''),
      'logradouro', nullif(regexp_replace(trim(coalesce(p_dados -> 'endereco' ->> 'logradouro', '')), '\s+', ' ', 'g'), ''),
      'numero', nullif(trim(coalesce(p_dados -> 'endereco' ->> 'numero', '')), ''),
      'complemento', nullif(regexp_replace(trim(coalesce(p_dados -> 'endereco' ->> 'complemento', '')), '\s+', ' ', 'g'), ''),
      'bairro', nullif(regexp_replace(trim(coalesce(p_dados -> 'endereco' ->> 'bairro', '')), '\s+', ' ', 'g'), ''),
      'cidade', nullif(regexp_replace(trim(coalesce(p_dados -> 'endereco' ->> 'cidade', '')), '\s+', ' ', 'g'), ''),
      'uf', nullif(upper(trim(coalesce(p_dados -> 'endereco' ->> 'uf', ''))), '')));
    if v_endereco = '{}'::jsonb then
      v_endereco := null;
    elsif coalesce(v_endereco ->> 'cep', '') !~ '^[0-9]{8}$'
       or length(coalesce(v_endereco ->> 'logradouro', '')) not between 3 and 120
       or length(coalesce(v_endereco ->> 'numero', '')) not between 1 and 10
       or length(coalesce(v_endereco ->> 'complemento', '')) > 60
       or length(coalesce(v_endereco ->> 'bairro', '')) not between 2 and 60
       or length(coalesce(v_endereco ->> 'cidade', '')) not between 2 and 60
       or coalesce(v_endereco ->> 'uf', '') not in ('AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB',
                                                   'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO') then
      raise exception 'Endereço incompleto: CEP, rua, número, bairro, cidade e UF' using errcode = '22023';
    end if;
  elsif 'endereco' = any (v_remover) then
    v_endereco := null;
  else
    v_endereco := v_antes.endereco;
  end if;
  if jsonb_typeof(p_dados -> 'finalidades') = 'array' then
    v_finalidades := array(select distinct x from jsonb_array_elements_text(p_dados -> 'finalidades') x order by x);
  else
    v_finalidades := coalesce(v_atual.finalidades, '{}');
  end if;
  if not (v_finalidades <@ array['nota_fiscal', 'ora_connect', 'financiamento', 'assistencia', 'entrega']) then
    raise exception 'Finalidade desconhecida' using errcode = '22023';
  end if;

  if p_cliente is null and coalesce(nullif(p_dados ->> 'origem', ''), 'loja') not in ('loja', 'online', 'whatsapp', 'telefone', 'connect', 'importacao') then
    raise exception 'Origem do cadastro inválida' using errcode = '22023';
  end if;

  -- Dados mínimos por finalidade (ORA-CRM-001) e minimização.
  if v_documento is null and v_telefone is null then
    raise exception 'Informe o CPF/CNPJ ou o telefone: é por eles que o cliente é encontrado' using errcode = '22023';
  end if;
  if 'nota_fiscal' = any (v_finalidades) and v_documento is null then
    raise exception 'Nota fiscal no nome do cliente pede o CPF ou o CNPJ' using errcode = '22023';
  end if;
  if 'ora_connect' = any (v_finalidades) and (v_documento is null or v_telefone is null or (v_tipo = 'pessoa_fisica' and v_nascimento is null)) then
    raise exception 'Ora Connect pede o documento, o telefone e, para pessoa física, a data de nascimento' using errcode = '22023';
  end if;
  if 'financiamento' = any (v_finalidades) and (v_tipo <> 'pessoa_fisica' or v_documento is null or v_telefone is null or v_email is null or v_nascimento is null) then
    raise exception 'Financiamento é de pessoa física e pede CPF, telefone, e-mail e data de nascimento' using errcode = '22023';
  end if;
  if 'assistencia' = any (v_finalidades) and v_telefone is null then
    raise exception 'Assistência pede o telefone para avisar o cliente' using errcode = '22023';
  end if;
  if 'entrega' = any (v_finalidades) and v_endereco is null then
    raise exception 'Entrega pede o endereço completo' using errcode = '22023';
  end if;
  if v_nascimento is not null and not (v_finalidades && array['ora_connect', 'financiamento']) then
    raise exception 'Data de nascimento só fica guardada para Ora Connect ou financiamento (dados mínimos)' using errcode = '22023';
  end if;
  if v_endereco is not null and not (v_finalidades && array['entrega', 'ora_connect', 'financiamento', 'nota_fiscal']) then
    raise exception 'Endereço só fica guardado para entrega, Ora Connect, financiamento ou nota fiscal (dados mínimos)' using errcode = '22023';
  end if;

  -- Mesmo CPF/CNPJ não entra duas vezes; telefone de outra pessoa pede confirmação (família).
  if v_documento is not null then
    v_documento_resumo := privado.cliente_resumo(v_organizacao, 'documento', v_documento);
    perform pg_advisory_xact_lock(privado.trava_da_chave('clientes:documento', v_organizacao, v_documento_resumo));
    if exists (select 1 from public.clientes c where c.organizacao_id = v_organizacao and c.documento_resumo = v_documento_resumo
               and c.id is distinct from v_atual.id) then
      raise exception 'Já existe cliente com este CPF/CNPJ: busque pelo documento' using errcode = 'OR026';
    end if;
  end if;
  if v_telefone is not null then
    v_telefone_resumo := privado.cliente_resumo(v_organizacao, 'telefone', v_telefone);
    if v_telefone is distinct from v_antes.telefone
       and exists (select 1 from public.clientes c where c.organizacao_id = v_organizacao and c.telefone_resumo = v_telefone_resumo
                   and c.id is distinct from v_atual.id and c.situacao = 'ativo')
       and coalesce(p_dados ->> 'telefone_compartilhado', '') <> 'true' then
      raise exception 'Este telefone já está no cadastro de outro cliente: confirme que é outra pessoa (telefone da família, por exemplo)' using errcode = 'OR027';
    end if;
  end if;

  -- O que mudou (só o nome dos campos vai para a auditoria).
  if v_atual.id is not null then
    if v_tipo is distinct from v_atual.tipo then v_campos := array_append(v_campos, 'tipo'); end if;
    if v_nome is distinct from v_atual.nome then v_campos := array_append(v_campos, 'nome'); end if;
    if v_documento is distinct from v_antes.documento then v_campos := array_append(v_campos, 'documento'); end if;
    if v_telefone is distinct from v_antes.telefone then v_campos := array_append(v_campos, 'telefone'); end if;
    if v_email is distinct from v_antes.email then v_campos := array_append(v_campos, 'email'); end if;
    if v_nascimento is distinct from v_antes.nascimento then v_campos := array_append(v_campos, 'nascimento'); end if;
    if v_endereco is distinct from v_antes.endereco then v_campos := array_append(v_campos, 'endereco'); end if;
    if v_finalidades is distinct from v_atual.finalidades then v_campos := array_append(v_campos, 'finalidades'); end if;
    if cardinality(v_campos) = 0 then
      return jsonb_build_object('id', v_atual.id, 'numero', v_atual.numero, 'repetida', false, 'alterado', false);
    end if;
    update public.clientes c set tipo = v_tipo, nome = v_nome, finalidades = v_finalidades,
      documento_resumo = v_documento_resumo, documento_mascara = privado.mascara_documento(v_documento),
      telefone_resumo = v_telefone_resumo, telefone_mascara = privado.mascara_telefone(v_telefone), email_mascara = privado.mascara_email(v_email),
      nascimento_informado = v_nascimento is not null, endereco_informado = v_endereco is not null,
      atualizado_por = (select auth.uid()), atualizado_em = now()
    where c.id = v_atual.id;
    update privado.cliente_dados d set documento = v_documento, telefone = v_telefone, email = v_email, nascimento = v_nascimento, endereco = v_endereco
    where d.cliente_id = v_atual.id;
    v_id := v_atual.id;
    v_numero := v_atual.numero;
  else
    insert into public.clientes (organizacao_id, tipo, nome, finalidades, documento_resumo, documento_mascara, telefone_resumo, telefone_mascara,
                                 email_mascara, nascimento_informado, endereco_informado, origem, unidade_origem_id, chave_criacao, conteudo_criacao, criado_por)
    values (v_organizacao, v_tipo, v_nome, v_finalidades, v_documento_resumo, privado.mascara_documento(v_documento), v_telefone_resumo,
            privado.mascara_telefone(v_telefone), privado.mascara_email(v_email), v_nascimento is not null, v_endereco is not null,
            coalesce(nullif(p_dados ->> 'origem', ''), 'loja'), v_unidade, trim(p_chave), v_conteudo, (select auth.uid()))
    returning id, numero into v_id, v_numero;
    insert into privado.cliente_dados (cliente_id, documento, telefone, email, nascimento, endereco)
    values (v_id, v_documento, v_telefone, v_email, v_nascimento, v_endereco);
    v_campos := array['tipo', 'nome'] || case when v_documento is not null then array['documento'] else '{}' end
      || case when v_telefone is not null then array['telefone'] else '{}' end || case when v_email is not null then array['email'] else '{}' end
      || case when v_nascimento is not null then array['nascimento'] else '{}' end || case when v_endereco is not null then array['endereco'] else '{}' end
      || case when cardinality(v_finalidades) > 0 then array['finalidades'] else '{}' end;
  end if;

  insert into public.auditoria (usuario_id, unidade_id, organizacao_id, acao, alvo_tipo, alvo_id, depois, motivo, origem)
  values ((select auth.uid()), v_unidade, v_organizacao, case when v_atual.id is null then 'cliente.criado' else 'cliente.alterado' end, 'cliente', v_id::text,
          jsonb_build_object('campos', to_jsonb(v_campos), 'finalidades', to_jsonb(v_finalidades)), v_motivo, 'aplicacao');
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'repetida', false, 'alterado', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Consentimento de contato (ORA-CRM-007)
-- -----------------------------------------------------------------------------
create or replace function public.cliente_consentir(p_cliente uuid, p_canal text, p_finalidade text, p_concedido boolean, p_fonte text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid;
  v_organizacao uuid;
  v_cliente public.clientes;
  v_situacao text := case when p_concedido then 'concedido' else 'retirado' end;
begin
  select c.unidade_id, c.organizacao_id into v_unidade, v_organizacao from privado.cliente_contexto('cliente.cadastrar') c;
  select * into v_cliente from public.clientes c where c.id = p_cliente and c.organizacao_id = v_organizacao for no key update;
  if not found then
    raise exception 'Cliente não encontrado' using errcode = 'P0002';
  end if;
  if p_concedido is null or p_canal is null or p_canal not in ('whatsapp', 'sms', 'email', 'ligacao')
     or p_finalidade is null or p_finalidade not in ('ofertas', 'pos_venda') or p_fonte is null or p_fonte not in ('loja', 'whatsapp', 'online', 'telefone') then
    raise exception 'Canal, finalidade ou origem do consentimento inválidos' using errcode = '22023';
  end if;
  if p_concedido and v_cliente.situacao <> 'ativo' then
    raise exception 'Cliente inativo não recebe mensagens' using errcode = '22023';
  end if;
  if p_concedido and ((p_canal = 'email' and v_cliente.email_mascara is null) or (p_canal <> 'email' and v_cliente.telefone_mascara is null)) then
    raise exception 'Cadastre o contato deste canal antes de registrar o consentimento' using errcode = '22023';
  end if;
  if coalesce((select k.situacao from public.cliente_consentimentos k where k.cliente_id = v_cliente.id and k.canal = p_canal
               and k.finalidade = p_finalidade order by k.id desc limit 1), 'retirado') = v_situacao then
    return false;
  end if;
  perform set_config('ora.motivo', format('Consentimento %s: %s por %s', v_situacao, p_finalidade, p_canal), true);
  insert into public.cliente_consentimentos (organizacao_id, cliente_id, canal, finalidade, situacao, fonte, unidade_id, registrado_por)
  values (v_organizacao, v_cliente.id, p_canal, p_finalidade, v_situacao, p_fonte, v_unidade, (select auth.uid()));
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Cliente na venda
-- -----------------------------------------------------------------------------
-- Corrige o cliente de uma venda concluída (ou tira, com p_cliente nulo): quem vendeu, na loja da venda,
-- ou quem vê as vendas da loja; sempre com motivo. O nome e o e-mail digitados na hora não mudam.
create or replace function public.venda_vincular_cliente(p_venda uuid, p_cliente uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_unidade uuid := (select public.unidade_atual());
  v_venda public.vendas;
begin
  select * into v_venda from public.vendas v where v.id = p_venda for no key update;
  if not found or v_unidade is null or not public.tem_permissao('cliente.buscar', v_unidade) or not (
       (v_venda.vendedor_id = (select auth.uid()) and v_venda.unidade_id = v_unidade and public.tem_permissao('venda.registrar', v_unidade))
       or public.tem_permissao('venda.ver_unidade', v_venda.unidade_id) or public.tem_permissao('venda.ver_todas', v_venda.unidade_id)) then
    raise exception 'Venda não encontrada para você' using errcode = 'P0002';
  end if;
  if v_venda.situacao <> 'concluida' then
    raise exception 'Só se liga cliente a venda concluída' using errcode = '22023';
  end if;
  if p_cliente is not null and not exists (select 1 from public.clientes c where c.id = p_cliente and c.organizacao_id = v_venda.organizacao_id
                                           and c.situacao = 'ativo') then
    raise exception 'Cliente não encontrado' using errcode = 'P0002';
  end if;
  if v_venda.cliente_id is not distinct from p_cliente then
    return false;
  end if;
  perform set_config('ora.motivo', 'Cliente da venda: ' || v_motivo, true);
  update public.vendas v set cliente_id = p_cliente where v.id = v_venda.id;
  return true;
end;
$$;

-- concluir_venda recriada a partir do texto aplicado em 20261109190240_integridade_vendas_lote2, com o
-- cliente da rede ({"id": ...} em p_cliente) marcado "L5a".
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
  pagamento_id uuid;
  reserva public.estoque_reservas;
begin
  if unidade is null or not (select public.tem_permissao('venda.registrar', unidade)) then
    raise exception 'Sem permissão para vender nesta loja' using errcode = '42501';
  end if;
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  if p_pagamentos is null or jsonb_typeof(p_pagamentos) <> 'array' or jsonb_array_length(p_pagamentos) = 0 then
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

  for item in select * from public.venda_itens i where i.venda_id = venda.id order by i.criado_em, i.id loop
    if public.preco_vigente(item.variante_id, venda.unidade_id, case venda.canal when 'online' then 'online' else 'loja' end)
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
  end loop;
  total := subtotal - descontos;

  -- Pagamentos: a mesma regra de packages/dominio/src/pagamento.ts
  for pagamento in select value from jsonb_array_elements(p_pagamentos) loop
    meio := pagamento ->> 'meio';
    if meio is null or not privado.meio_valido(meio) then
      raise exception 'Meio de pagamento desconhecido' using errcode = 'OR009';
    end if;
    if meio = 'link_pagamento' then
      raise exception 'Link de pagamento ainda não integrado: use outro meio' using errcode = 'OR009';
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
    if privado.meio_financeira(meio) then
      if meio = 'payjoy' and email is null then
        raise exception 'PayJoy exige o e-mail do cliente' using errcode = 'OR009';
      end if;
      meio_entrada := case when entrada > 0 then coalesce(pagamento ->> 'meio_entrada', 'dinheiro') end;
      if meio_entrada is not null and (not privado.meio_valido(meio_entrada) or privado.meio_financeira(meio_entrada)
                                       or meio_entrada in ('link_pagamento', 'vale_troca')) then
        raise exception 'Meio da entrada inválido' using errcode = 'OR009';
      end if;
      -- Entrada por Pix ou cartão também precisa do comprovante (REV-044, #46).
      if meio_entrada is not null and privado.meio_com_comprovante(meio_entrada)
         and length(trim(coalesce(pagamento ->> 'comprovante', ''))) < 4 then
        raise exception 'Informe o código do comprovante da entrada' using errcode = 'OR009';
      end if;
      recebido := recebido + entrada;
      a_receber := a_receber + valor - entrada;
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
  excedente := greatest(0, recebido + a_receber - total);
  troco := least(excedente, em_dinheiro);
  if excedente > troco then
    raise exception 'Pagamento maior que o total sem dinheiro para dar troco' using errcode = 'OR009';
  end if;
  if recebido + a_receber < total then
    raise exception 'Falta pagar %', total - recebido - a_receber using errcode = 'OR009';
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
  for pagamento in select value from jsonb_array_elements(p_pagamentos) loop
    ordem := ordem + 1;
    meio := pagamento ->> 'meio';
    valor := (pagamento ->> 'valor')::bigint;
    entrada := coalesce((pagamento ->> 'entrada')::bigint, 0);
    meio_entrada := case when privado.meio_financeira(meio) and entrada > 0 then coalesce(pagamento ->> 'meio_entrada', 'dinheiro') end;
    comprovante := nullif(trim(coalesce(pagamento ->> 'comprovante', '')), '');
    insert into public.venda_pagamentos (organizacao_id, venda_id, ordem, meio, valor_centavos, entrada_centavos, meio_entrada, comprovante, confirmacao, confirmado_por)
    values (venda.organizacao_id, venda.id, ordem, meio, valor, entrada, meio_entrada, comprovante,
            case when meio = 'dinheiro' then 'caixa' when privado.meio_financeira(meio) then 'financeira' else 'manual' end, usuario)
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
  return jsonb_build_object('venda', venda.id, 'numero', venda.numero, 'total', total, 'troco', troco,
                            'recebido', recebido - troco, 'a_receber', a_receber, 'repetida', false);
end;
$$;

revoke all on function public.cliente_buscar(text, text), public.cliente_ficha(uuid), public.cliente_revelar(uuid, text),
  public.cliente_salvar(uuid, jsonb, text, text), public.cliente_consentir(uuid, text, text, boolean, text),
  public.venda_vincular_cliente(uuid, uuid, text) from public, anon;
grant execute on function public.cliente_buscar(text, text), public.cliente_ficha(uuid), public.cliente_revelar(uuid, text),
  public.cliente_salvar(uuid, jsonb, text, text), public.cliente_consentir(uuid, text, text, boolean, text),
  public.venda_vincular_cliente(uuid, uuid, text) to authenticated;
