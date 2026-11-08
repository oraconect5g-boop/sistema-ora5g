-- Reversão de acesso_sessao_e_equipe. SOMENTE em banco sem dados reais: apaga convites e as
-- funções de equipe; a sessão volta a valer sem a regra do turno. Vínculos e perfis criados
-- pelas funções ficam (são dados), e a auditoria só aceita inserção.
drop function if exists public.identidade_convites_a_processar(int), public.identidade_concluir_convite(uuid, uuid, boolean),
  public.identidade_falha_convite(uuid, text), public.identidade_usuario_por_email(text), public.identidade_bloqueios_a_aplicar(),
  public.convidar_pessoa(uuid, text, text, text, uuid[], text), public.cancelar_convite(uuid, text),
  public.repetir_convite(uuid), public.vincular_pessoa(uuid, uuid, text, uuid, text), public.encerrar_vinculo(uuid, text),
  public.alterar_situacao_pessoa(uuid, text, text), public.situacao_da_sessao();
drop table if exists public.convites;

-- Funções como estavam em 20261107140352_fundacao_acesso.sql
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

drop function if exists privado.sessao_no_turno(), privado.turno_valido(timestamptz, timestamptz),
  privado.fim_do_turno(timestamptz), privado.gere_organizacao(uuid), privado.dono_da_organizacao(uuid),
  privado.papel_de_direcao(text), privado.exigir_motivo(text);
