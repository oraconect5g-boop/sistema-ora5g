-- =============================================================================
-- ORA-006 — Acesso real: sessão por turno, revogação imediata e gestão da equipe
-- ADR-002 §2.6 (sessão por turno, bloqueio imediato), §2.5 (chave secreta só no worker) e
-- pedido do proprietário de 08/11/2026 (cadastro de usuários e gestão da equipe).
--
-- Regras novas:
--   * Toda permissão exige a sessão viva no Supabase Auth (auth.sessions), começada há menos
--     de 12 horas e no mesmo dia (America/Sao_Paulo). Sair, revogar a sessão ou virar o dia
--     corta o acesso na hora, mesmo com o token ainda válido.
--   * Equipe: quem tem usuarios.gerir na organização (dono e administrador) convida pessoas,
--     dá e encerra vínculos e bloqueia/desbloqueia. Dono e administrador só o dono concede,
--     retira ou bloqueia. Ninguém mexe no próprio acesso. A organização nunca fica sem dono.
--   * Convite: a aplicação só grava o pedido. O worker (chave secreta, fora das requisições
--     de usuário) cria a pessoa no Auth, manda o e-mail e conclui pelas funções identidade_*,
--     que só o service_role executa.
--   * Tudo vai para a auditoria com o motivo.
-- Códigos novos: OR006 pessoa já está na equipe.
-- Reversão: supabase/reversao/<mesmo nome>.sql (só em banco sem dados reais).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Sessão por turno e revogação imediata
-- -----------------------------------------------------------------------------
-- O turno começa no login e termina 12 horas depois ou à meia-noite de São Paulo, o que vier antes.
create or replace function privado.fim_do_turno(p_inicio timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select least(p_inicio + interval '12 hours',
               ((p_inicio at time zone 'America/Sao_Paulo')::date + 1)::timestamp at time zone 'America/Sao_Paulo');
$$;

create or replace function privado.turno_valido(p_inicio timestamptz, p_agora timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  -- 5 minutos de folga: o Auth grava o início pelo relógio dele, que pode estar um pouco adiantado.
  select p_inicio is not null and p_inicio <= p_agora + interval '5 minutes' and p_agora < privado.fim_do_turno(p_inicio);
$$;

create or replace function privado.sessao_no_turno()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.sessions s
    where s.id = (select privado.sessao_atual())
      and s.user_id = (select auth.uid())
      and privado.turno_valido(s.created_at, now())
      and (s.not_after is null or s.not_after > now())
  );
$$;

-- Igual à versão da fundação, mais a sessão no turno (todas as permissões passam por aqui).
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
    and (select privado.sessao_no_turno())
    and v.inicio <= now()
    and (v.fim is null or v.fim > now())
    and (v.unidade_id is null or u.status = 'ativa');
$$;

-- A escolha da loja diz por que recusou: sessão de outra pessoa ou turno encerrado.
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
  if not (select privado.sessao_no_turno()) then
    insert into public.auditoria (usuario_id, unidade_id, acao, alvo_tipo, alvo_id, origem)
    values (usuario, p_unidade,
            case when exists (select 1 from auth.sessions s where s.id = sessao and s.user_id <> usuario)
                 then 'sessao.de_outro_usuario' else 'sessao.fora_do_turno' end,
            'sessao', sessao::text, 'selecionar_unidade');
    return false;
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

-- Para a aplicação decidir a tela: pessoa ativa, turno valendo, loja atual e fim do turno.
create or replace function public.situacao_da_sessao()
returns table (usuario_ativo boolean, sessao_no_turno boolean, unidade_id uuid, unidade_nome text, turno_termina_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select (select privado.usuario_ativo()),
         (select privado.sessao_no_turno()),
         u.id,
         u.nome,
         (select privado.fim_do_turno(s.created_at)
          from auth.sessions s
          where s.id = (select privado.sessao_atual()) and s.user_id = (select auth.uid()))
  from (select (select public.unidade_atual()) as atual) a
  left join public.unidades u on u.id = a.atual;
$$;

-- -----------------------------------------------------------------------------
-- 2. Quem gere a equipe
-- -----------------------------------------------------------------------------
create or replace function privado.gere_organizacao(p_organizacao uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_organizacao in (select privado.organizacoes_com_permissao('usuarios.gerir'));
$$;

create or replace function privado.dono_da_organizacao(p_organizacao uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.vinculos_vigentes() v where v.papel = 'dono' and v.organizacao_id = p_organizacao);
$$;

create or replace function privado.papel_de_direcao(p_papel text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_papel in ('dono', 'administrador');
$$;

create or replace function privado.exigir_motivo(p_motivo text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Informe o motivo' using errcode = '22023';
  end if;
  return trim(p_motivo);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Vínculos e situação da pessoa
-- -----------------------------------------------------------------------------
-- Mais um vínculo para quem já é (ou foi) da equipe desta organização. Gente nova entra por convite.
create or replace function public.vincular_pessoa(p_usuario uuid, p_organizacao uuid, p_papel text, p_unidade uuid, p_motivo text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  motivo text;
  escopo text;
  existente uuid;
  novo uuid;
begin
  if ator is null or not (select privado.gere_organizacao(p_organizacao)) then
    raise exception 'Sem permissão para gerir a equipe desta organização' using errcode = '42501';
  end if;
  motivo := privado.exigir_motivo(p_motivo);
  if p_usuario = ator then
    raise exception 'Ninguém altera o próprio acesso' using errcode = '42501';
  end if;
  select pa.escopo_padrao into escopo from public.papeis pa where pa.codigo = p_papel and pa.ativo;
  if escopo is null then
    raise exception 'Papel inexistente ou inativo' using errcode = '22023';
  end if;
  if privado.papel_de_direcao(p_papel) and not (select privado.dono_da_organizacao(p_organizacao)) then
    raise exception 'Só o dono concede o papel %', p_papel using errcode = '42501';
  end if;
  if escopo = 'organizacao' and p_unidade is not null then
    raise exception 'Este papel vale para a organização inteira, sem loja' using errcode = '22023';
  end if;
  if escopo = 'unidade' and not exists (
       select 1 from public.unidades u where u.id = p_unidade and u.organizacao_id = p_organizacao and u.status = 'ativa') then
    raise exception 'Escolha uma loja ativa desta organização' using errcode = '22023';
  end if;
  if not exists (select 1 from public.vinculos v where v.usuario_id = p_usuario and v.organizacao_id = p_organizacao) then
    raise exception 'Pessoa não encontrada nesta equipe: convide antes' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.perfis_usuario p where p.id = p_usuario and p.status = 'ativo') then
    raise exception 'Pessoa bloqueada: desbloqueie antes' using errcode = '22023';
  end if;
  select v.id into existente from public.vinculos v
  where v.usuario_id = p_usuario and v.organizacao_id = p_organizacao and v.papel = p_papel
    and v.unidade_id is not distinct from p_unidade and v.fim is null;
  if found then
    return existente;
  end if;
  begin
    insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, unidade_id, criado_por, motivo)
    values (p_usuario, p_organizacao, p_papel, escopo, p_unidade, ator, motivo)
    returning id into novo;
  exception when unique_violation then
    select v.id into novo from public.vinculos v
    where v.usuario_id = p_usuario and v.organizacao_id = p_organizacao and v.papel = p_papel
      and v.unidade_id is not distinct from p_unidade and v.fim is null;
  end;
  return novo;
end;
$$;

create or replace function public.encerrar_vinculo(p_vinculo uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  motivo text;
  v public.vinculos;
begin
  select * into v from public.vinculos x where x.id = p_vinculo for update;
  if not found or ator is null or not (select privado.gere_organizacao(v.organizacao_id)) then
    raise exception 'Vínculo não encontrado' using errcode = 'P0002';
  end if;
  motivo := privado.exigir_motivo(p_motivo);
  if v.usuario_id = ator then
    raise exception 'Ninguém altera o próprio acesso' using errcode = '42501';
  end if;
  if privado.papel_de_direcao(v.papel) and not (select privado.dono_da_organizacao(v.organizacao_id)) then
    raise exception 'Só o dono retira o papel %', v.papel using errcode = '42501';
  end if;
  if v.fim is not null and v.fim <= now() then
    return false;
  end if;
  if v.papel = 'dono' and not exists (
       select 1 from public.vinculos o
       where o.organizacao_id = v.organizacao_id and o.papel = 'dono' and o.id <> v.id
         and o.inicio <= now() and (o.fim is null or o.fim > now())) then
    raise exception 'A organização precisa continuar com pelo menos um dono' using errcode = '23514';
  end if;
  perform set_config('ora.motivo', motivo, true);
  update public.vinculos set fim = now() where id = v.id;
  return true;
end;
$$;

-- Bloquear vale na hora em todas as lojas (o banco já recusa pessoa bloqueada); o worker
-- também bloqueia o login no Auth (identidade_bloqueios_a_aplicar).
create or replace function public.alterar_situacao_pessoa(p_usuario uuid, p_situacao text, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  motivo text;
  atual text;
begin
  if ator is null or p_usuario not in (select privado.perfis_que_gero()) then
    raise exception 'Pessoa não encontrada' using errcode = 'P0002';
  end if;
  if p_situacao is null or p_situacao not in ('ativo', 'bloqueado') then
    raise exception 'Situação inválida' using errcode = '22023';
  end if;
  motivo := privado.exigir_motivo(p_motivo);
  if p_usuario = ator then
    raise exception 'Ninguém altera o próprio acesso' using errcode = '42501';
  end if;
  if exists (
       select 1 from public.vinculos v
       where v.usuario_id = p_usuario and privado.papel_de_direcao(v.papel) and v.fim is null
         and not (select privado.dono_da_organizacao(v.organizacao_id))) then
    raise exception 'Só o dono bloqueia ou desbloqueia dono e administrador' using errcode = '42501';
  end if;
  select p.status into atual from public.perfis_usuario p where p.id = p_usuario for update;
  if atual = p_situacao then
    return false;
  end if;
  perform set_config('ora.motivo', motivo, true);
  update public.perfis_usuario set status = p_situacao where id = p_usuario;
  if p_situacao = 'bloqueado' then
    delete from public.contexto_sessao where usuario_id = p_usuario;
  end if;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Convites
-- -----------------------------------------------------------------------------
create table public.convites (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id),
  nome text not null check (length(trim(nome)) between 2 and 120),
  email text not null check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  papel text not null references public.papeis (codigo),
  unidades uuid[] not null default '{}',
  motivo text not null check (length(trim(motivo)) >= 3),
  situacao text not null default 'pendente'
    check (situacao in ('pendente', 'processando', 'enviado', 'vinculado', 'erro', 'cancelado')),
  erro text,
  tentativas int not null default 0,
  usuario_id uuid references public.perfis_usuario (id),
  criado_por uuid not null references public.perfis_usuario (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
-- Um convite em aberto por e-mail em cada organização.
create unique index convites_um_aberto on public.convites (organizacao_id, email)
  where situacao in ('pendente', 'processando', 'erro');
create index convites_organizacao on public.convites (organizacao_id, criado_em desc);
create index convites_fila on public.convites (situacao, atualizado_em) where situacao in ('pendente', 'processando');
create index convites_criado_por on public.convites (criado_por);
create index convites_usuario on public.convites (usuario_id);
create index convites_papel on public.convites (papel);

create trigger convites_auditar after insert or update on public.convites
  for each row execute function privado.auditar_mudanca();

alter table public.convites enable row level security;
revoke all on public.convites from anon, authenticated;
grant select on public.convites to authenticated;
create policy convites_ler on public.convites for select to authenticated
  using (organizacao_id in (select privado.organizacoes_com_permissao('usuarios.gerir')));

create or replace function public.convidar_pessoa(
  p_organizacao uuid, p_nome text, p_email text, p_papel text, p_unidades uuid[], p_motivo text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  motivo text;
  endereco text := lower(trim(coalesce(p_email, '')));
  lojas uuid[] := coalesce((select array_agg(distinct x) from unnest(coalesce(p_unidades, '{}')) as x where x is not null), '{}');
  escopo text;
  pessoa uuid;
  novo uuid;
begin
  if ator is null or not (select privado.gere_organizacao(p_organizacao)) then
    raise exception 'Sem permissão para gerir a equipe desta organização' using errcode = '42501';
  end if;
  motivo := privado.exigir_motivo(p_motivo);
  if p_nome is null or length(trim(p_nome)) not between 2 and 120 then
    raise exception 'Informe o nome da pessoa' using errcode = '22023';
  end if;
  if endereco !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-mail inválido' using errcode = '22023';
  end if;
  select pa.escopo_padrao into escopo from public.papeis pa where pa.codigo = p_papel and pa.ativo;
  if escopo is null then
    raise exception 'Papel inexistente ou inativo' using errcode = '22023';
  end if;
  if privado.papel_de_direcao(p_papel) and not (select privado.dono_da_organizacao(p_organizacao)) then
    raise exception 'Só o dono convida para o papel %', p_papel using errcode = '42501';
  end if;
  if escopo = 'organizacao' and cardinality(lojas) > 0 then
    raise exception 'Este papel vale para a organização inteira, sem loja' using errcode = '22023';
  end if;
  if escopo = 'unidade' and (cardinality(lojas) = 0 or exists (
       select 1 from unnest(lojas) as x (id)
       where not exists (select 1 from public.unidades u where u.id = x.id and u.organizacao_id = p_organizacao and u.status = 'ativa'))) then
    raise exception 'Escolha ao menos uma loja ativa desta organização' using errcode = '22023';
  end if;
  if p_papel = 'tecnico' and exists (
       select 1 from unnest(lojas) as x (id) join public.unidades u on u.id = x.id where u.tipo <> 'assistencia') then
    raise exception 'Técnico só em unidade de assistência' using errcode = '22023';
  end if;
  if exists (select 1 from public.perfis_usuario p where p.id = ator and p.email = endereco) then
    raise exception 'Ninguém altera o próprio acesso' using errcode = '42501';
  end if;
  select p.id into pessoa from public.perfis_usuario p where p.email = endereco;
  if pessoa is not null and exists (
       select 1 from public.vinculos v where v.usuario_id = pessoa and v.organizacao_id = p_organizacao and v.fim is null) then
    raise exception 'Esta pessoa já está na equipe: dê mais um vínculo a ela' using errcode = 'OR006';
  end if;
  perform set_config('ora.motivo', motivo, true);
  begin
    insert into public.convites (organizacao_id, nome, email, papel, unidades, motivo, criado_por)
    values (p_organizacao, trim(p_nome), endereco, p_papel, lojas, motivo, ator)
    returning id into novo;
  exception when unique_violation then
    raise exception 'Já existe um convite em aberto para este e-mail' using errcode = '23505';
  end;
  return novo;
end;
$$;

create or replace function public.cancelar_convite(p_convite uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.convites;
  motivo text;
begin
  select * into c from public.convites x where x.id = p_convite for update;
  if not found or not (select privado.gere_organizacao(c.organizacao_id)) then
    raise exception 'Convite não encontrado' using errcode = 'P0002';
  end if;
  motivo := privado.exigir_motivo(p_motivo);
  if privado.papel_de_direcao(c.papel) and not (select privado.dono_da_organizacao(c.organizacao_id)) then
    raise exception 'Só o dono cancela convite de %', c.papel using errcode = '42501';
  end if;
  if c.situacao not in ('pendente', 'erro') then
    return false;
  end if;
  perform set_config('ora.motivo', motivo, true);
  update public.convites set situacao = 'cancelado', atualizado_em = now() where id = c.id;
  return true;
end;
$$;

create or replace function public.repetir_convite(p_convite uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.convites;
begin
  select * into c from public.convites x where x.id = p_convite for update;
  if not found or not (select privado.gere_organizacao(c.organizacao_id)) then
    raise exception 'Convite não encontrado' using errcode = 'P0002';
  end if;
  if c.situacao <> 'erro' then
    return false;
  end if;
  perform set_config('ora.motivo', 'Convite enviado de novo depois de erro', true);
  update public.convites set situacao = 'pendente', erro = null, atualizado_em = now() where id = c.id;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Funções do worker (só service_role): a chave secreta nunca passa pela requisição do usuário
-- -----------------------------------------------------------------------------
-- Entrega convites ao worker marcando "processando"; o que ficou preso mais de 10 minutos volta.
create or replace function public.identidade_convites_a_processar(p_limite int default 10)
returns setof public.convites
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform set_config('ora.motivo', 'Worker de identidade', true);
  return query
  update public.convites c
  set situacao = 'processando', tentativas = c.tentativas + 1, atualizado_em = now()
  where c.id in (
    select x.id from public.convites x
    where x.situacao = 'pendente' or (x.situacao = 'processando' and x.atualizado_em < now() - interval '10 minutes')
    order by x.criado_em
    limit greatest(1, least(coalesce(p_limite, 10), 50))
    for update skip locked)
  returning c.*;
end;
$$;

-- A pessoa existe no Auth (criada agora ou já existente): grava perfil e vínculos pedidos.
create or replace function public.identidade_concluir_convite(p_convite uuid, p_usuario uuid, p_ja_existia boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.convites;
  escopo text;
  loja uuid;
begin
  select * into c from public.convites x where x.id = p_convite for update;
  if not found or c.situacao <> 'processando' then
    raise exception 'Convite não está em processamento' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users a where a.id = p_usuario and lower(a.email) = c.email) then
    raise exception 'A pessoa do Auth não corresponde ao e-mail do convite' using errcode = '22023';
  end if;
  select pa.escopo_padrao into escopo from public.papeis pa where pa.codigo = c.papel and pa.ativo;
  if escopo is null then
    raise exception 'Papel inexistente ou inativo' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', c.motivo, true);
  insert into public.perfis_usuario (id, nome, email) values (p_usuario, c.nome, c.email)
  on conflict (id) do nothing;
  if escopo = 'organizacao' then
    insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, unidade_id, criado_por, motivo)
    values (p_usuario, c.organizacao_id, c.papel, 'organizacao', null, c.criado_por, c.motivo)
    on conflict do nothing;
  else
    foreach loja in array c.unidades loop
      if exists (select 1 from public.unidades u where u.id = loja and u.organizacao_id = c.organizacao_id and u.status = 'ativa') then
        insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, unidade_id, criado_por, motivo)
        values (p_usuario, c.organizacao_id, c.papel, 'unidade', loja, c.criado_por, c.motivo)
        on conflict do nothing;
      end if;
    end loop;
  end if;
  update public.convites
  set situacao = case when p_ja_existia then 'vinculado' else 'enviado' end, usuario_id = p_usuario, erro = null, atualizado_em = now()
  where id = c.id;
end;
$$;

create or replace function public.identidade_falha_convite(p_convite uuid, p_erro text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform set_config('ora.motivo', 'Worker de identidade: falha', true);
  update public.convites
  set situacao = 'erro', erro = left(coalesce(nullif(trim(p_erro), ''), 'erro sem detalhe'), 300), atualizado_em = now()
  where id = p_convite and situacao = 'processando';
end;
$$;

-- Quem já tem conta no Auth com este e-mail (convite para pessoa que já existe).
create or replace function public.identidade_usuario_por_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.id from auth.users a where lower(a.email) = lower(trim(p_email)) limit 1;
$$;

-- Pessoas cujo bloqueio no banco ainda não foi refletido no login do Auth.
create or replace function public.identidade_bloqueios_a_aplicar()
returns table (usuario_id uuid, bloquear boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.status = 'bloqueado'
  from public.perfis_usuario p
  join auth.users a on a.id = p.id
  where (p.status = 'bloqueado' and (a.banned_until is null or a.banned_until <= now()))
     or (p.status = 'ativo' and a.banned_until > now());
$$;

-- -----------------------------------------------------------------------------
-- 6. Privilégios
-- -----------------------------------------------------------------------------
revoke all on function privado.fim_do_turno(timestamptz), privado.turno_valido(timestamptz, timestamptz),
  privado.sessao_no_turno(), privado.gere_organizacao(uuid), privado.dono_da_organizacao(uuid),
  privado.papel_de_direcao(text), privado.exigir_motivo(text) from public, anon, authenticated;

revoke all on function public.situacao_da_sessao(), public.vincular_pessoa(uuid, uuid, text, uuid, text),
  public.encerrar_vinculo(uuid, text), public.alterar_situacao_pessoa(uuid, text, text),
  public.convidar_pessoa(uuid, text, text, text, uuid[], text), public.cancelar_convite(uuid, text),
  public.repetir_convite(uuid) from public, anon;
grant execute on function public.situacao_da_sessao(), public.vincular_pessoa(uuid, uuid, text, uuid, text),
  public.encerrar_vinculo(uuid, text), public.alterar_situacao_pessoa(uuid, text, text),
  public.convidar_pessoa(uuid, text, text, text, uuid[], text), public.cancelar_convite(uuid, text),
  public.repetir_convite(uuid) to authenticated;

revoke all on function public.identidade_convites_a_processar(int), public.identidade_concluir_convite(uuid, uuid, boolean),
  public.identidade_falha_convite(uuid, text), public.identidade_usuario_por_email(text),
  public.identidade_bloqueios_a_aplicar() from public, anon, authenticated;
grant execute on function public.identidade_convites_a_processar(int), public.identidade_concluir_convite(uuid, uuid, boolean),
  public.identidade_falha_convite(uuid, text), public.identidade_usuario_por_email(text),
  public.identidade_bloqueios_a_aplicar() to service_role;
