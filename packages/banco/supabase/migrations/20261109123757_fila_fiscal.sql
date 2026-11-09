-- =============================================================================
-- ADR-006 — Fila fiscal interna (ORA-FISC-001, 002, 005 e 006 em parte)
-- Proposto em 08/11/2026; aplicado só no desenvolvimento.
--
--   * A nota é pedida a partir da venda CONCLUÍDA (nota.solicitar), com CPF/CNPJ na nota se o
--     cliente quiser. O documento fica guardado à parte só até a emissão; no pedido, mascarado.
--   * Quem aprova: nota.aprovar (dono e gerente, DEC-U20 e DEC-U42). Aprovar ou pedir correção.
--   * A APROVAÇÃO NUNCA IMPEDE A EMISSÃO: registrar a emissão de um pedido ainda não aprovado vale
--     como aprovação, com evento próprio (a obrigação legal não espera a fila).
--   * Sem emissor contratado (A4), nada é emitido pelo sistema: o dono/gerente registra a nota que
--     emitiu no portal com a chave de acesso de 44 dígitos; o banco confere o dígito verificador e
--     o CNPJ do emitente (o da loja da venda). Uma chave vale para um pedido só.
--   * Tipo de documento, tributação, prazo legal e certificado ficam com o contador (D-006, D-007,
--     P7): o alerta de atraso usa o prazo que a organização registrar, com a fonte.
--   * Venda cancelada cancela o pedido ainda não emitido; venda com nota emitida só é cancelada
--     depois do tratamento fiscal (OR015).
-- Códigos: OR014 a venda já tem pedido de nota em aberto ou emitido; OR015 venda com nota emitida.
-- Reversão: supabase/reversao/<mesmo nome>.sql (só em banco sem dados reais).
-- =============================================================================

-- Chave de acesso (padrão nacional de 44 dígitos): dígito verificador módulo 11 com pesos 2 a 9.
create or replace function privado.chave_de_acesso_valida(p_chave text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  soma int := 0;
  peso int := 2;
  resto int;
begin
  if p_chave is null or p_chave !~ '^[0-9]{44}$' then
    return false;
  end if;
  for i in reverse 43..1 loop
    soma := soma + substr(p_chave, i, 1)::int * peso;
    peso := case when peso = 9 then 2 else peso + 1 end;
  end loop;
  resto := soma % 11;
  return substr(p_chave, 44, 1)::int = case when resto < 2 then 0 else 11 - resto end;
end;
$$;

create table public.fiscal_politicas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null unique references public.organizacoes (id),
  alerta_minutos int check (alerta_minutos between 1 and 10080),
  fonte text not null check (length(trim(fonte)) >= 10),
  alterado_por uuid references public.perfis_usuario (id),
  alterado_em timestamptz not null default now()
);
create trigger fiscal_politicas_auditar after insert or update or delete on public.fiscal_politicas
  for each row execute function privado.auditar_mudanca();
create index fiscal_politicas_alterado_por on public.fiscal_politicas (alterado_por);

create table public.notas_pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null,
  unidade_id uuid not null,
  venda_id uuid not null references public.vendas (id),
  venda_concluida_em timestamptz not null,
  solicitado_por uuid not null references public.perfis_usuario (id),
  chave text not null check (length(trim(chave)) > 0),
  situacao text not null default 'aguardando_aprovacao'
    check (situacao in ('aguardando_aprovacao', 'correcao_solicitada', 'aprovada', 'emitida', 'cancelada')),
  destinatario_nome text check (destinatario_nome is null or length(trim(destinatario_nome)) between 3 and 120),
  destinatario_mascarado text,
  observacao text,
  aprovado_por uuid references public.perfis_usuario (id),
  aprovado_em timestamptz,
  emitida_por uuid references public.perfis_usuario (id),
  emitida_em timestamptz,
  origem_emissao text check (origem_emissao in ('manual_portal', 'emissor')),
  chave_acesso text unique check (chave_acesso is null or privado.chave_de_acesso_valida(chave_acesso)),
  modelo text,
  serie int,
  numero_documento bigint,
  motivo_cancelamento text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  unique (organizacao_id, chave),
  constraint emitida_tem_chave check (situacao <> 'emitida' or (chave_acesso is not null and emitida_em is not null and origem_emissao is not null))
);
create unique index notas_um_pedido_vivo_por_venda on public.notas_pedidos (venda_id) where situacao <> 'cancelada';
create index notas_pedidos_fila on public.notas_pedidos (unidade_id, situacao, venda_concluida_em);
create index notas_pedidos_unidade_organizacao on public.notas_pedidos (unidade_id, organizacao_id);
create index notas_pedidos_solicitado_por on public.notas_pedidos (solicitado_por);
create index notas_pedidos_aprovado_por on public.notas_pedidos (aprovado_por);
create index notas_pedidos_emitida_por on public.notas_pedidos (emitida_por);

-- CPF/CNPJ na nota: só para a emissão; apagado quando a nota é registrada ou o pedido cancelado.
create table privado.notas_destinatarios (
  pedido_id uuid primary key references public.notas_pedidos (id) on delete cascade,
  documento text not null check (documento ~ '^([0-9]{11}|[0-9]{14})$')
);

create table public.notas_eventos (
  id bigint generated always as identity primary key,
  organizacao_id uuid not null,
  pedido_id uuid not null references public.notas_pedidos (id),
  tipo text not null check (tipo in ('pedida', 'aprovada', 'correcao_solicitada', 'corrigida', 'emitida',
                                     'emitida_sem_aprovacao_previa', 'cancelada')),
  observacao text,
  usuario_id uuid references public.perfis_usuario (id),
  ocorrido_em timestamptz not null default now()
);
create index notas_eventos_pedido on public.notas_eventos (pedido_id, ocorrido_em);
create index notas_eventos_usuario on public.notas_eventos (usuario_id);
create trigger notas_eventos_sem_alteracao before update or delete on public.notas_eventos
  for each row execute function privado.so_insercao();
create trigger notas_eventos_sem_truncate before truncate on public.notas_eventos
  for each statement execute function privado.so_insercao();

alter table public.fiscal_politicas enable row level security;
alter table public.notas_pedidos enable row level security;
alter table public.notas_eventos enable row level security;
alter table privado.notas_destinatarios enable row level security;
revoke all on public.fiscal_politicas, public.notas_pedidos, public.notas_eventos from anon, authenticated;
revoke all on privado.notas_destinatarios from public, anon, authenticated;
revoke all on sequence public.notas_pedidos_numero_seq, public.notas_eventos_id_seq from anon, authenticated;
grant select on public.fiscal_politicas, public.notas_pedidos, public.notas_eventos to authenticated;

create policy fiscal_politicas_ler on public.fiscal_politicas for select to authenticated
  using (organizacao_id in (select privado.organizacoes_do_catalogo()));
create policy notas_pedidos_ler on public.notas_pedidos for select to authenticated
  using ((solicitado_por = (select auth.uid()) and unidade_id in (select privado.unidades_visiveis()))
         or venda_id in (select v.id from public.vendas v)
         or (select public.tem_permissao('nota.aprovar', unidade_id)));
create policy notas_eventos_ler on public.notas_eventos for select to authenticated
  using (pedido_id in (select p.id from public.notas_pedidos p));

-- -----------------------------------------------------------------------------
-- Funções da loja
-- -----------------------------------------------------------------------------
create or replace function privado.nota_evento(p_pedido public.notas_pedidos, p_tipo text, p_observacao text default null)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.notas_eventos (organizacao_id, pedido_id, tipo, observacao, usuario_id)
  values (p_pedido.organizacao_id, p_pedido.id, p_tipo, left(p_observacao, 500), (select auth.uid()));
$$;

-- Destinatário opcional: {nome?, documento?} (CPF ou CNPJ válidos). Devolve o documento só com dígitos.
create or replace function privado.nota_documento(p_destinatario jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  documento text := nullif(regexp_replace(coalesce(p_destinatario ->> 'documento', ''), '[^0-9]', '', 'g'), '');
begin
  if documento is not null and not (privado.cpf_valido(documento) or privado.cnpj_valido(documento)) then
    raise exception 'CPF ou CNPJ inválido' using errcode = '22023';
  end if;
  return documento;
end;
$$;

create or replace function privado.mascarar_documento(p_documento text)
returns text language sql immutable set search_path = ''
as $$
  select case when p_documento is null then null
              when length(p_documento) = 11 then '•••.•••.' || substr(p_documento, 7, 3) || '-' || right(p_documento, 2)
              else '••.•••.•••/' || substr(p_documento, 9, 4) || '-' || right(p_documento, 2) end;
$$;

create or replace function public.notas_solicitar(p_venda uuid, p_destinatario jsonb, p_chave text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  venda public.vendas;
  existente public.notas_pedidos;
  documento text;
  nome text := nullif(trim(coalesce(p_destinatario ->> 'nome', '')), '');
  novo public.notas_pedidos;
begin
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  select * into venda from public.vendas v where v.id = p_venda for share;
  if not found or venda.unidade_id is distinct from (select public.unidade_atual())
     or not (select public.tem_permissao('nota.solicitar', venda.unidade_id))
     or not (venda.vendedor_id = usuario or (select public.tem_permissao('nota.aprovar', venda.unidade_id))) then
    raise exception 'Venda não encontrada' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('notas', venda.organizacao_id, p_chave));
  select * into existente from public.notas_pedidos p where p.organizacao_id = venda.organizacao_id and p.chave = p_chave;
  if found then
    if existente.venda_id <> venda.id or existente.solicitado_por <> usuario then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return existente.id;
  end if;
  if venda.situacao <> 'concluida' then
    raise exception 'A nota é pedida depois de a venda ser concluída' using errcode = '22023';
  end if;
  if nome is not null and length(nome) not between 3 and 120 then
    raise exception 'Nome do destinatário inválido' using errcode = '22023';
  end if;
  documento := privado.nota_documento(p_destinatario);
  begin
    insert into public.notas_pedidos (organizacao_id, unidade_id, venda_id, venda_concluida_em, solicitado_por, chave,
                                      destinatario_nome, destinatario_mascarado)
    values (venda.organizacao_id, venda.unidade_id, venda.id, venda.concluida_em, usuario, p_chave, nome,
            privado.mascarar_documento(documento))
    returning * into novo;
  exception when unique_violation then
    raise exception 'Esta venda já tem pedido de nota em aberto ou nota emitida' using errcode = 'OR014';
  end;
  if documento is not null then
    insert into privado.notas_destinatarios (pedido_id, documento) values (novo.id, documento);
  end if;
  perform privado.nota_evento(novo, 'pedida');
  return novo.id;
end;
$$;

-- Pedido travado, visível para quem aprova nota na loja da sessão.
create or replace function privado.nota_para_aprovar(p_pedido uuid)
returns public.notas_pedidos
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pedido public.notas_pedidos;
begin
  select * into pedido from public.notas_pedidos p where p.id = p_pedido for update;
  if not found or pedido.unidade_id is distinct from (select public.unidade_atual())
     or not (select public.tem_permissao('nota.aprovar', pedido.unidade_id)) then
    raise exception 'Pedido de nota não encontrado' using errcode = 'P0002';
  end if;
  return pedido;
end;
$$;

create or replace function public.notas_decidir(p_pedido uuid, p_aprovar boolean, p_observacao text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pedido public.notas_pedidos := privado.nota_para_aprovar(p_pedido);
  texto_observacao text := nullif(trim(coalesce(p_observacao, '')), '');
begin
  if p_aprovar is null then
    raise exception 'Diga se aprova ou pede correção' using errcode = '22023';
  end if;
  if pedido.situacao <> 'aguardando_aprovacao' then
    raise exception 'Este pedido não está aguardando aprovação (%)', pedido.situacao using errcode = '22023';
  end if;
  if not p_aprovar and (texto_observacao is null or length(texto_observacao) < 3) then
    raise exception 'Diga o que corrigir' using errcode = '22023';
  end if;
  update public.notas_pedidos p
  set situacao = case when p_aprovar then 'aprovada' else 'correcao_solicitada' end,
      aprovado_por = case when p_aprovar then (select auth.uid()) end,
      aprovado_em = case when p_aprovar then now() end,
      observacao = coalesce(texto_observacao, p.observacao), atualizado_em = now()
  where p.id = pedido.id;
  perform privado.nota_evento(pedido, case when p_aprovar then 'aprovada' else 'correcao_solicitada' end, texto_observacao);
  return case when p_aprovar then 'aprovada' else 'correcao_solicitada' end;
end;
$$;

-- Quem pediu (ou quem aprova) corrige o destinatário e devolve o pedido à fila.
create or replace function public.notas_corrigir(p_pedido uuid, p_destinatario jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pedido public.notas_pedidos;
  documento text;
  nome text := nullif(trim(coalesce(p_destinatario ->> 'nome', '')), '');
begin
  select * into pedido from public.notas_pedidos p where p.id = p_pedido for update;
  if not found or pedido.unidade_id is distinct from (select public.unidade_atual())
     or not (pedido.solicitado_por = (select auth.uid()) or (select public.tem_permissao('nota.aprovar', pedido.unidade_id))) then
    raise exception 'Pedido de nota não encontrado' using errcode = 'P0002';
  end if;
  if pedido.situacao <> 'correcao_solicitada' then
    raise exception 'Este pedido não está em correção (%)', pedido.situacao using errcode = '22023';
  end if;
  if nome is not null and length(nome) not between 3 and 120 then
    raise exception 'Nome do destinatário inválido' using errcode = '22023';
  end if;
  documento := privado.nota_documento(p_destinatario);
  update public.notas_pedidos p
  set situacao = 'aguardando_aprovacao', destinatario_nome = nome, destinatario_mascarado = privado.mascarar_documento(documento), atualizado_em = now()
  where p.id = pedido.id;
  delete from privado.notas_destinatarios d where d.pedido_id = pedido.id;
  if documento is not null then
    insert into privado.notas_destinatarios (pedido_id, documento) values (pedido.id, documento);
  end if;
  perform privado.nota_evento(pedido, 'corrigida');
  return true;
end;
$$;

-- Sem emissor contratado: registra a nota emitida no portal pela chave de acesso. A chave precisa
-- ter o CNPJ da loja da venda (ou da unidade emissora, na loja online). Vale como aprovação.
create or replace function public.notas_registrar_emissao(p_pedido uuid, p_chave_acesso text, p_observacao text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pedido public.notas_pedidos := privado.nota_para_aprovar(p_pedido);
  chave_digitos text := regexp_replace(coalesce(p_chave_acesso, ''), '[^0-9]', '', 'g');
  cnpj_da_loja text;
  usuario uuid := (select auth.uid());
begin
  if pedido.situacao not in ('aguardando_aprovacao', 'correcao_solicitada', 'aprovada') then
    raise exception 'Este pedido não aguarda emissão (%)', pedido.situacao using errcode = '22023';
  end if;
  if not privado.chave_de_acesso_valida(chave_digitos) then
    raise exception 'Chave de acesso inválida: confira os 44 dígitos' using errcode = '22023';
  end if;
  select coalesce(u.cnpj, e.cnpj) into cnpj_da_loja
  from public.unidades u left join public.unidades e on e.id = u.unidade_emissora_id
  where u.id = pedido.unidade_id;
  if cnpj_da_loja is null or substr(chave_digitos, 7, 14) <> cnpj_da_loja then
    raise exception 'A chave de acesso não é do CNPJ desta loja' using errcode = '22023';
  end if;
  begin
    update public.notas_pedidos p
    set situacao = 'emitida', origem_emissao = 'manual_portal', chave_acesso = chave_digitos,
        modelo = substr(chave_digitos, 21, 2), serie = substr(chave_digitos, 23, 3)::int, numero_documento = substr(chave_digitos, 26, 9)::bigint,
        emitida_por = usuario, emitida_em = now(),
        aprovado_por = coalesce(p.aprovado_por, usuario), aprovado_em = coalesce(p.aprovado_em, now()),
        observacao = coalesce(nullif(trim(coalesce(p_observacao, '')), ''), p.observacao), atualizado_em = now()
    where p.id = pedido.id;
  exception when unique_violation then
    raise exception 'Esta chave de acesso já está registrada em outro pedido' using errcode = '22023';
  end;
  delete from privado.notas_destinatarios d where d.pedido_id = pedido.id;
  if pedido.situacao <> 'aprovada' then
    perform privado.nota_evento(pedido, 'emitida_sem_aprovacao_previa', 'A emissão não esperou a aprovação: registrada como aprovada por quem emitiu.');
  end if;
  perform privado.nota_evento(pedido, 'emitida', nullif(trim(coalesce(p_observacao, '')), ''));
  return 'emitida';
end;
$$;

create or replace function public.notas_cancelar(p_pedido uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pedido public.notas_pedidos;
begin
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Informe o motivo' using errcode = '22023';
  end if;
  select * into pedido from public.notas_pedidos p where p.id = p_pedido for update;
  if not found or pedido.unidade_id is distinct from (select public.unidade_atual())
     or not (pedido.solicitado_por = (select auth.uid()) or (select public.tem_permissao('nota.aprovar', pedido.unidade_id))) then
    raise exception 'Pedido de nota não encontrado' using errcode = 'P0002';
  end if;
  if pedido.situacao = 'cancelada' then
    return false;
  end if;
  if pedido.situacao = 'emitida' then
    raise exception 'Nota já emitida: o cancelamento é fiscal (no emissor), com o contador' using errcode = 'OR015';
  end if;
  update public.notas_pedidos p set situacao = 'cancelada', motivo_cancelamento = trim(p_motivo), atualizado_em = now() where p.id = pedido.id;
  delete from privado.notas_destinatarios d where d.pedido_id = pedido.id;
  perform privado.nota_evento(pedido, 'cancelada', trim(p_motivo));
  return true;
end;
$$;

-- Prazo de alerta da fila (minutos desde a venda), com a fonte (contador ou decisão registrada).
create or replace function public.fiscal_definir_politica(p_alerta_minutos int, p_fonte text)
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
  if unidade is null or not (select public.tem_permissao('unidades.gerir', unidade)) then
    raise exception 'Só quem gere as lojas define o prazo da fila de notas' using errcode = '42501';
  end if;
  if p_alerta_minutos is not null and p_alerta_minutos not between 1 and 10080 then
    raise exception 'Prazo entre 1 minuto e 7 dias' using errcode = '22023';
  end if;
  if p_fonte is null or length(trim(p_fonte)) < 10 then
    raise exception 'Registre a fonte do prazo (orientação do contador)' using errcode = '22023';
  end if;
  select u.organizacao_id into organizacao from public.unidades u where u.id = unidade;
  perform set_config('ora.motivo', trim(p_fonte), true);
  insert into public.fiscal_politicas (organizacao_id, alerta_minutos, fonte, alterado_por)
  values (organizacao, p_alerta_minutos, trim(p_fonte), (select auth.uid()))
  on conflict (organizacao_id) do update
    set alerta_minutos = excluded.alerta_minutos, fonte = excluded.fonte, alterado_por = excluded.alterado_por, alterado_em = now();
  return true;
end;
$$;

-- Venda cancelada: pedido sem nota cai junto; com nota emitida, o cancelamento espera o fiscal.
create or replace function privado.notas_da_venda_cancelada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pedido public.notas_pedidos;
begin
  if old.situacao = 'concluida' and new.situacao = 'cancelada' then
    if exists (select 1 from public.notas_pedidos p where p.venda_id = old.id and p.situacao = 'emitida') then
      raise exception 'Venda com nota emitida: faça antes o cancelamento ou a devolução fiscal' using errcode = 'OR015';
    end if;
    for pedido in select * from public.notas_pedidos p where p.venda_id = old.id and p.situacao <> 'cancelada' for update loop
      update public.notas_pedidos p set situacao = 'cancelada', motivo_cancelamento = 'Venda cancelada', atualizado_em = now() where p.id = pedido.id;
      delete from privado.notas_destinatarios d where d.pedido_id = pedido.id;
      perform privado.nota_evento(pedido, 'cancelada', 'Venda cancelada');
    end loop;
  end if;
  return new;
end;
$$;
create trigger vendas_notas before update of situacao on public.vendas
  for each row execute function privado.notas_da_venda_cancelada();

revoke all on function privado.chave_de_acesso_valida(text), privado.nota_evento(public.notas_pedidos, text, text),
  privado.nota_documento(jsonb), privado.mascarar_documento(text), privado.nota_para_aprovar(uuid),
  privado.notas_da_venda_cancelada() from public, anon, authenticated;
revoke all on function public.notas_solicitar(uuid, jsonb, text), public.notas_decidir(uuid, boolean, text),
  public.notas_corrigir(uuid, jsonb), public.notas_registrar_emissao(uuid, text, text), public.notas_cancelar(uuid, text),
  public.fiscal_definir_politica(int, text) from public, anon;
grant execute on function public.notas_solicitar(uuid, jsonb, text), public.notas_decidir(uuid, boolean, text),
  public.notas_corrigir(uuid, jsonb), public.notas_registrar_emissao(uuid, text, text), public.notas_cancelar(uuid, text),
  public.fiscal_definir_politica(int, text) to authenticated;
