-- Reversão de correcoes_acesso_lote1. SOMENTE em banco sem dados reais: volta as funções e a
-- política ao texto anterior e devolve o débito da carteira à operação.
alter table public.connect_operacoes add column valor_debitado_centavos bigint check (valor_debitado_centavos >= 0);
update public.connect_operacoes o set valor_debitado_centavos = c.valor_debitado_centavos
from public.connect_operacoes_custos c where c.operacao_id = o.id;
drop table if exists public.connect_operacoes_custos;
drop policy if exists aprovacoes_ler on public.aprovacoes_desconto;
create policy aprovacoes_ler on public.aprovacoes_desconto for select to authenticated
  using (solicitado_por = (select auth.uid()) or (select public.tem_permissao('desconto.aprovar', unidade_id)));
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
drop function if exists public.identidade_concluir_convite(uuid, uuid, boolean);
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
revoke all on function public.identidade_concluir_convite(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.identidade_concluir_convite(uuid, uuid, boolean) to service_role;
drop function if exists privado.pessoa_gere_equipe(uuid, uuid, text);
