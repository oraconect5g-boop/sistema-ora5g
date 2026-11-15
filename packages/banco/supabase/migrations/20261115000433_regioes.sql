-- =============================================================================
-- Regiões da rede (lote ORG-009: ORA-ORG-009; ORA-FIN-008 e ORA-PERF-009 em parte)
--
-- A rede agrupa as lojas em regiões (por exemplo, "Curitiba Norte"), para ver vendas e metas por região.
-- Regras:
--   * quem gere as lojas da organização (unidades.gerir: dono e administrador) cria, renomeia, inativa e
--     reativa a região e escolhe a região de cada loja, sempre com motivo e auditoria; criar de novo o mesmo
--     nome devolve a mesma região (sem diferença de maiúscula e minúscula);
--   * uma loja fica em uma região ou em nenhuma; região inativa não recebe loja e só inativa sem loja nela;
--   * a região NÃO dá acesso a nada: quem vê cada loja continua decidido pelo vínculo da pessoa (o "gerente
--     regional" é um gerente com vínculo nas lojas da região); as telas só somam o que a pessoa já vê;
--   * nada se apaga.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create table public.regioes (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id),
  nome text not null check (length(nome) between 2 and 60 and nome = btrim(nome) and nome !~ '\s{2}'),
  ativa boolean not null default true,
  criado_por uuid not null references public.perfis_usuario (id),
  criado_em timestamptz not null default now(),
  unique (id, organizacao_id)
);
comment on table public.regioes is
  'Regiões da rede (ORG-009): agrupam lojas para ver vendas e metas por região. Não dão acesso: o vínculo de cada pessoa decide o que ela vê.';
create unique index regioes_nome on public.regioes (organizacao_id, lower(nome));
create index regioes_criado_por on public.regioes (criado_por);
create trigger regioes_auditar after insert or update on public.regioes
  for each row execute function privado.auditar_mudanca();
create trigger regioes_sem_apagar before delete on public.regioes
  for each row execute function privado.so_insercao();
create trigger regioes_sem_truncate before truncate on public.regioes
  for each statement execute function privado.so_insercao();

alter table public.regioes enable row level security;
revoke all on public.regioes from anon, authenticated;
grant select on public.regioes to authenticated;
create policy regioes_ler on public.regioes for select to authenticated
  using (organizacao_id in (select v.organizacao_id from privado.vinculos_vigentes() v));

alter table public.unidades add column regiao_id uuid;
alter table public.unidades add constraint unidades_regiao_fkey
  foreign key (regiao_id, organizacao_id) references public.regioes (id, organizacao_id);
create index unidades_regiao on public.unidades (regiao_id, organizacao_id) where regiao_id is not null;

-- -----------------------------------------------------------------------------
-- Cadastro da região e a região de cada loja (quem gere as lojas)
-- -----------------------------------------------------------------------------
create or replace function public.regiao_salvar(p_organizacao uuid, p_id uuid, p_nome text, p_ativa boolean, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_nome text := regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_atual public.regioes;
  v_mesmo_nome public.regioes;
  v_nova uuid;
begin
  if not privado.gere_lojas_da_organizacao(p_organizacao) then
    raise exception 'Sem permissão para as regiões desta rede' using errcode = '42501';
  end if;
  if length(v_nome) not between 2 and 60 then
    raise exception 'Informe o nome da região (de 2 a 60 letras)' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('regioes', p_organizacao, lower(v_nome)));
  select * into v_mesmo_nome from public.regioes r where r.organizacao_id = p_organizacao and lower(r.nome) = lower(v_nome);

  if p_id is null then
    if v_mesmo_nome.id is not null then
      return jsonb_build_object('id', v_mesmo_nome.id, 'repetida', true);
    end if;
    perform set_config('ora.motivo', v_motivo, true);
    insert into public.regioes (organizacao_id, nome, criado_por) values (p_organizacao, v_nome, (select auth.uid()))
    returning id into v_nova;
    return jsonb_build_object('id', v_nova, 'repetida', false);
  end if;

  select * into v_atual from public.regioes r where r.id = p_id and r.organizacao_id = p_organizacao for update;
  if not found then
    raise exception 'Região não encontrada' using errcode = 'P0002';
  end if;
  if v_mesmo_nome.id is not null and v_mesmo_nome.id <> v_atual.id then
    raise exception 'Já existe outra região com este nome' using errcode = '23505';
  end if;
  if coalesce(p_ativa, v_atual.ativa) = false and v_atual.ativa
     and exists (select 1 from public.unidades u where u.regiao_id = v_atual.id and u.status = 'ativa') then
    raise exception 'A região ainda tem loja ativa: mude a região das lojas antes de inativar' using errcode = 'OR020';
  end if;
  if v_atual.nome = v_nome and v_atual.ativa = coalesce(p_ativa, v_atual.ativa) then
    return jsonb_build_object('id', v_atual.id, 'repetida', true);
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  update public.regioes r set nome = v_nome, ativa = coalesce(p_ativa, v_atual.ativa) where r.id = v_atual.id;
  return jsonb_build_object('id', v_atual.id, 'repetida', false);
end;
$$;

-- p_regiao nulo tira a loja da região.
create or replace function public.loja_definir_regiao(p_unidade uuid, p_regiao uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_loja public.unidades;
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_regiao public.regioes;
begin
  select * into v_loja from public.unidades u where u.id = p_unidade for no key update;
  if not found or not privado.gere_lojas_da_organizacao(v_loja.organizacao_id) then
    raise exception 'Loja não encontrada para você' using errcode = 'P0002';
  end if;
  if p_regiao is not null then
    select * into v_regiao from public.regioes r where r.id = p_regiao and r.organizacao_id = v_loja.organizacao_id for key share;
    if not found then
      raise exception 'Região não encontrada nesta rede' using errcode = 'P0002';
    end if;
    if not v_regiao.ativa then
      raise exception 'Região inativa: reative antes de pôr loja nela' using errcode = '22023';
    end if;
  end if;
  if v_loja.regiao_id is not distinct from p_regiao then
    return false;
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  update public.unidades u set regiao_id = p_regiao where u.id = v_loja.id;
  return true;
end;
$$;

revoke all on function public.regiao_salvar(uuid, uuid, text, boolean, text), public.loja_definir_regiao(uuid, uuid, text) from public, anon;
grant execute on function public.regiao_salvar(uuid, uuid, text, boolean, text), public.loja_definir_regiao(uuid, uuid, text) to authenticated;
