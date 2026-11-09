-- =============================================================================
-- Correções de acesso e custo apontadas pelo Codex (revisões de 08 e 09/11/2026)
--   #27 (REV-026) bloquear/desbloquear o perfil exige gerir todas as organizações da pessoa.
--   #28 (REV-027) autoconcessão conferida pela identidade (Auth), também na conclusão do convite.
--   #29 (REV-028) último dono ativo protegido por trava da organização (encerrar e bloquear).
--   #30 (REV-029) convite de quem perdeu a autorização é cancelado antes do e-mail e na conclusão.
--   #45 (REV-043) quem pediu a aprovação só a lê com vínculo, sessão e turno vigentes.
--   #56 (REV-053) débito da carteira Nogle é custo: tabela própria lida com custo.ver; fora da
--       operação, da evidência e dos eventos.
-- Funções recriadas a partir do texto aplicado, com as mudanças marcadas. Reversão em
-- supabase/reversao/<mesmo nome>.sql (só em banco sem dados reais).
-- =============================================================================

-- Autoridade de uma pessoa sobre a equipe, sem depender de sessão (o worker não tem sessão de usuário):
-- perfil ativo, vínculo vigente da organização com usuarios.gerir e, para dono/administrador, ser dono.
create or replace function privado.pessoa_gere_equipe(p_usuario uuid, p_organizacao uuid, p_papel text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.perfis_usuario p
      join public.vinculos v on v.usuario_id = p.id
      join public.papel_permissoes pp on pp.papel = v.papel and pp.permissao = 'usuarios.gerir'
      where p.id = p_usuario and p.status = 'ativo' and v.organizacao_id = p_organizacao and v.escopo = 'organizacao'
        and v.inicio <= now() and (v.fim is null or v.fim > now()))
    and (not privado.papel_de_direcao(p_papel) or exists (
      select 1 from public.vinculos d
      where d.usuario_id = p_usuario and d.organizacao_id = p_organizacao and d.papel = 'dono'
        and d.inicio <= now() and (d.fim is null or d.fim > now())));
$$;
revoke all on function privado.pessoa_gere_equipe(uuid, uuid, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- #56: custo da operação Ora Connect (débito da carteira) só para quem tem custo.ver
-- -----------------------------------------------------------------------------
create table public.connect_operacoes_custos (
  operacao_id uuid primary key references public.connect_operacoes (id),
  organizacao_id uuid not null,
  unidade_id uuid not null,
  valor_debitado_centavos bigint not null check (valor_debitado_centavos >= 0),
  atualizado_em timestamptz not null default now(),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id)
);
create index connect_operacoes_custos_unidade_organizacao on public.connect_operacoes_custos (unidade_id, organizacao_id);
alter table public.connect_operacoes_custos enable row level security;
revoke all on public.connect_operacoes_custos from anon, authenticated;
grant select on public.connect_operacoes_custos to authenticated;
create policy connect_operacoes_custos_ler on public.connect_operacoes_custos for select to authenticated
  using ((select public.tem_permissao('custo.ver', unidade_id)));
insert into public.connect_operacoes_custos (operacao_id, organizacao_id, unidade_id, valor_debitado_centavos)
select o.id, o.organizacao_id, o.unidade_id, o.valor_debitado_centavos from public.connect_operacoes o
where o.valor_debitado_centavos is not null;
update public.connect_operacoes set evidencia = evidencia - 'valor_debitado_centavos' where evidencia ? 'valor_debitado_centavos';
alter table public.connect_operacoes drop column valor_debitado_centavos;

-- #45: quem pediu só lê o próprio pedido com acesso vigente (perfil, vínculo, sessão e turno)
drop policy aprovacoes_ler on public.aprovacoes_desconto;
create policy aprovacoes_ler on public.aprovacoes_desconto for select to authenticated
  using ((solicitado_por = (select auth.uid()) and unidade_id in (select privado.unidades_visiveis()))
         or (select public.tem_permissao('desconto.aprovar', unidade_id)));

-- #27 e #29
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
  organizacao uuid;
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
  -- O perfil vale para todas as organizações (REV-026, #27): bloquear ou desbloquear exige gerir
  -- TODAS as organizações em que a pessoa tem vínculo vigente; senão, encerre o vínculo na sua equipe.
  if exists (
       select 1 from public.vinculos v
       where v.usuario_id = p_usuario and v.inicio <= now() and (v.fim is null or v.fim > now())
         and not (select privado.gere_organizacao(v.organizacao_id))) then
    raise exception 'Esta pessoa também tem acesso em outra organização: encerre o vínculo dela na sua equipe' using errcode = '42501';
  end if;
  -- Último dono ativo (REV-028, #29): uma trava por organização, em ordem, e a conferência depois dela.
  if p_situacao = 'bloqueado' then
    for organizacao in
      select distinct v.organizacao_id from public.vinculos v
      where v.usuario_id = p_usuario and v.papel = 'dono' and v.inicio <= now() and (v.fim is null or v.fim > now())
      order by 1
    loop
      perform pg_advisory_xact_lock(privado.trava_da_chave('equipe_donos', organizacao, 'donos'));
      if not exists (
           select 1 from public.vinculos o join public.perfis_usuario p on p.id = o.usuario_id and p.status = 'ativo'
           where o.organizacao_id = organizacao and o.papel = 'dono' and o.usuario_id <> p_usuario
             and o.inicio <= now() and (o.fim is null or o.fim > now())) then
        raise exception 'A organização precisa continuar com pelo menos um dono ativo' using errcode = '23514';
      end if;
    end loop;
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

-- #29
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
  -- Último dono ativo (REV-028, #29): trava por organização e conferência depois da espera.
  if v.papel = 'dono' then
    perform pg_advisory_xact_lock(privado.trava_da_chave('equipe_donos', v.organizacao_id, 'donos'));
  end if;
  if v.papel = 'dono' and not exists (
       select 1 from public.vinculos o join public.perfis_usuario p on p.id = o.usuario_id and p.status = 'ativo'
       where o.organizacao_id = v.organizacao_id and o.papel = 'dono' and o.id <> v.id
         and o.inicio <= now() and (o.fim is null or o.fim > now())) then
    raise exception 'A organização precisa continuar com pelo menos um dono' using errcode = '23514';
  end if;
  perform set_config('ora.motivo', motivo, true);
  update public.vinculos set fim = now() where id = v.id;
  return true;
end;
$$;

-- #28
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
  if exists (select 1 from public.perfis_usuario p where p.id = ator and p.email = endereco)
     or exists (select 1 from auth.users a where a.id = ator and lower(a.email) = endereco) then
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

-- #30
create or replace function public.identidade_convites_a_processar(p_limite int default 10)
returns setof public.convites
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform set_config('ora.motivo', 'Worker de identidade', true);
  -- Quem convidou precisa continuar autorizado (REV-029, #30): senão o convite é cancelado antes do e-mail.
  update public.convites c
  set situacao = 'cancelado', erro = 'Quem convidou não tem mais autorização: peça um convite novo', atualizado_em = now()
  where (c.situacao = 'pendente' or (c.situacao = 'processando' and c.atualizado_em < now() - interval '10 minutes'))
    and not privado.pessoa_gere_equipe(c.criado_por, c.organizacao_id, c.papel);
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

-- #28 e #30: devolve o desfecho (enviado, vinculado ou recusado) para o worker contar certo
drop function public.identidade_concluir_convite(uuid, uuid, boolean);
create function public.identidade_concluir_convite(p_convite uuid, p_usuario uuid, p_ja_existia boolean)
returns text
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
  -- Autoconcessão pela identidade, não pelo e-mail (REV-027, #28); autoridade de quem convidou
  -- conferida na conclusão (REV-029, #30). Recusa encerra o convite, sem vínculo.
  if p_usuario = c.criado_por or not privado.pessoa_gere_equipe(c.criado_por, c.organizacao_id, c.papel) then
    perform set_config('ora.motivo', 'Convite recusado na conclusão', true);
    update public.convites
    set situacao = 'cancelado', atualizado_em = now(),
        erro = case when p_usuario = c.criado_por then 'Autoconcessão recusada: ninguém se convida'
                    else 'Quem convidou não tem mais autorização: peça um convite novo' end
    where id = c.id;
    return 'recusado';
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
  return case when p_ja_existia then 'vinculado' else 'enviado' end;
end;
$$;
revoke all on function public.identidade_concluir_convite(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.identidade_concluir_convite(uuid, uuid, boolean) to service_role;

-- #56
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
      evidencia = p_evidencia - 'dados' - 'valor_debitado_centavos' || jsonb_build_object('consultado_em', now()),
      numero_ativado = case when novo = 'confirmada' and o.tipo = 'ativacao' then coalesce(numero_evidencia, o.numero_ativado) else o.numero_ativado end,
      tentativas_consulta = tentativas,
      proxima_consulta_em = case when novo in ('confirmada', 'negada', 'erro_operadora') then null else now() + espera end,
      concluida_em = case when novo in ('confirmada', 'negada') then now() else o.concluida_em end,
      atualizado_em = now()
  where o.id = op.id;
  -- Débito da carteira é custo (REV-053, #56): só na tabela lida com custo.ver.
  if novo = 'confirmada' and debitado is not null then
    insert into public.connect_operacoes_custos (operacao_id, organizacao_id, unidade_id, valor_debitado_centavos)
    values (op.id, op.organizacao_id, op.unidade_id, debitado)
    on conflict (operacao_id) do update set valor_debitado_centavos = excluded.valor_debitado_centavos, atualizado_em = now();
  end if;
  if novo = 'confirmada' then
    insert into public.connect_producao (organizacao_id, unidade_id, vendedor_id, operacao_id, tipo, valor_face_centavos, origem)
    values (op.organizacao_id, op.unidade_id, op.vendedor_id, op.id, op.tipo, op.valor_face_centavos, 'evidencia_da_operadora')
    on conflict (operacao_id) do nothing;
  end if;
  perform privado.connect_evento(op, case when novo <> op.situacao then novo else 'consulta' end, op.situacao, novo, null,
    p_evidencia ->> 'mensagem', p_evidencia - 'mensagem' - 'valor_debitado_centavos');
  return novo;
end;
$$;
