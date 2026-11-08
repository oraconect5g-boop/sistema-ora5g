-- =============================================================================
-- Correções da revisão do Codex de 07/11/2026 (docs/alinhamento/REVISOES_CODEX.md)
--   REV-001 (issue 2): perfis visíveis fora da organização do gestor
--   REV-002 (issue 3): auditoria sem unidade visível fora da organização do evento
--   REV-005 (issue 6): papel desativado impedia encerrar vínculo existente
--   REV-006 (issue 7): mesmo usuário não podia ser dono em duas organizações
-- Não altera nem apaga dados; a auditoria continua só de inserção.
-- Reversão: supabase/reversao/20261107140000_correcoes_revisao_codex.sql
-- =============================================================================

-- Organizações em que o usuário logado tem a permissão com escopo de organização.
create or replace function privado.organizacoes_com_permissao(p_permissao text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct v.organizacao_id
  from privado.vinculos_vigentes() v
  join public.papel_permissoes pp on pp.papel = v.papel and pp.permissao = p_permissao
  where v.escopo = 'organizacao';
$$;

-- REV-001: perfis que o usuário logado pode gerir = pessoas com vínculo (atual ou passado)
-- numa organização em que ele tem 'usuarios.gerir'. Perfil sem vínculo não aparece.
create or replace function privado.perfis_que_gero()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct alvo.usuario_id
  from public.vinculos alvo
  where alvo.organizacao_id in (select privado.organizacoes_com_permissao('usuarios.gerir'));
$$;

revoke all on function privado.organizacoes_com_permissao(text), privado.perfis_que_gero() from public, anon;
grant execute on function privado.organizacoes_com_permissao(text), privado.perfis_que_gero() to authenticated;

drop policy perfis_ler on public.perfis_usuario;
create policy perfis_ler on public.perfis_usuario for select to authenticated
  using (
    (id = (select auth.uid()) and (select privado.usuario_ativo()))
    or id in (select privado.perfis_que_gero())
  );

-- REV-002: todo evento passa a ter a organização dona. Vem da unidade quando houver;
-- evento sem organização só é visível para o serviço do sistema (nunca entre organizações).
alter table public.auditoria add column organizacao_id uuid references public.organizacoes (id);
create index auditoria_organizacao_data on public.auditoria (organizacao_id, ocorrido_em desc);

create or replace function privado.auditoria_completar_organizacao()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  organizacao_da_unidade uuid;
begin
  if new.unidade_id is not null then
    select u.organizacao_id into organizacao_da_unidade from public.unidades u where u.id = new.unidade_id;
    if new.organizacao_id is null then
      new.organizacao_id := organizacao_da_unidade;
    elsif organizacao_da_unidade is not null and new.organizacao_id <> organizacao_da_unidade then
      raise exception 'Organização do evento diferente da organização da unidade' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger auditoria_organizacao
  before insert on public.auditoria
  for each row execute function privado.auditoria_completar_organizacao();

drop policy auditoria_ler on public.auditoria;
create policy auditoria_ler on public.auditoria for select to authenticated
  using (
    (unidade_id is not null and (select public.tem_permissao('auditoria.ver', unidade_id)))
    or (
      unidade_id is null
      and organizacao_id is not null
      and organizacao_id in (select privado.organizacoes_com_permissao('auditoria.ver'))
    )
  );

-- REV-005: encerrar um vínculo (só preencher "fim") é sempre permitido, mesmo com o papel
-- desativado. Criar, reabrir ou mudar o vínculo continua exigindo papel ativo e escopo certo.
create or replace function privado.validar_vinculo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  papel_escopo text;
  unidade record;
begin
  if tg_op = 'UPDATE'
     and old.fim is null and new.fim is not null
     and (new.usuario_id, new.organizacao_id, new.papel, new.escopo, new.unidade_id, new.inicio)
         is not distinct from (old.usuario_id, old.organizacao_id, old.papel, old.escopo, old.unidade_id, old.inicio) then
    return new;
  end if;

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

-- REV-006: a unicidade do vínculo em aberto passa a considerar a organização.
drop index public.vinculos_um_aberto;
create unique index vinculos_um_aberto
  on public.vinculos (usuario_id, organizacao_id, papel, coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where fim is null;
