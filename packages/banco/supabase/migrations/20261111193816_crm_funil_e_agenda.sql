-- =============================================================================
-- Funil de oportunidades e agenda de atividades (lote L5b: ORA-CRM-004, ORA-CRM-005)
--
-- Lead e oportunidade são a mesma coisa em etapas diferentes. A pessoa entra no cadastro da rede (cliente,
-- L5a, com o mínimo: nome e telefone ou CPF) e a oportunidade guarda de onde veio (origem e campanha), quem
-- atendeu primeiro, o vendedor responsável, a etapa e o próximo passo com data:
--   * etapas abertas: novo → contato → proposta → negociação; fechadas: ganha (com a venda, quando houver)
--     ou perdida (com o motivo do catálogo). Reabrir é da gerência (crm.gerir), com motivo;
--   * cada mudança vira um evento com autor e hora, num histórico que só cresce;
--   * quem atende (crm.atender: dono, gerente, vendedor) registra e move as próprias na loja do turno; a
--     gerência (crm.gerir: dono, gerente) vê a loja inteira e troca o responsável, com motivo;
--   * atividades (ligação, mensagem, visita, tarefa) com vencimento, responsável e resultado; podem ser de
--     uma oportunidade, só do cliente ou da própria rotina. Concluir e cancelar ficam registrados.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

do $$
begin
  perform set_config('ora.motivo', 'Funil de oportunidades e agenda (ORA-CRM-004, ORA-CRM-005)', true);
  insert into public.permissoes (codigo, descricao, modulo) values
    ('crm.atender', 'Registrar e conduzir as próprias oportunidades e atividades na loja', 'crm'),
    ('crm.gerir', 'Ver o funil e a agenda da loja inteira e trocar o responsável', 'crm');
  insert into public.papel_permissoes (papel, permissao) values
    ('dono', 'crm.atender'), ('gerente', 'crm.atender'), ('vendedor', 'crm.atender'),
    ('dono', 'crm.gerir'), ('gerente', 'crm.gerir');
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Tabelas
-- -----------------------------------------------------------------------------
create table public.oportunidades (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null,
  unidade_id uuid not null,
  cliente_id uuid not null,
  origem text not null check (origem in ('loja', 'whatsapp', 'instagram', 'facebook', 'google', 'site', 'indicacao', 'telefone', 'outro')),
  campanha text check (campanha is null or length(campanha) between 2 and 120),
  interesse text not null check (length(trim(interesse)) between 3 and 200),
  valor_estimado_centavos bigint check (valor_estimado_centavos is null or valor_estimado_centavos between 0 and 100000000),
  etapa text not null default 'novo' check (etapa in ('novo', 'contato', 'proposta', 'negociacao', 'ganha', 'perdida')),
  atendente_id uuid not null references public.perfis_usuario (id),
  responsavel_id uuid not null references public.perfis_usuario (id),
  proximo_passo text check (proximo_passo is null or length(trim(proximo_passo)) between 3 and 200),
  proximo_passo_em timestamptz,
  motivo_perda text check (motivo_perda is null or motivo_perda in ('preco', 'sem_estoque', 'concorrencia', 'credito_negado', 'sem_resposta', 'desistiu', 'outro')),
  observacao_encerramento text check (observacao_encerramento is null or length(observacao_encerramento) <= 300),
  venda_id uuid references public.vendas (id),
  chave text not null check (length(trim(chave)) between 8 and 80),
  conteudo text not null,
  criado_por uuid not null references public.perfis_usuario (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  encerrado_em timestamptz,
  unique (organizacao_id, chave),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  foreign key (cliente_id, organizacao_id) references public.clientes (id, organizacao_id),
  check ((etapa in ('ganha', 'perdida')) = (encerrado_em is not null)),
  check ((etapa = 'perdida') = (motivo_perda is not null)),
  check (venda_id is null or etapa = 'ganha'),
  check ((proximo_passo is null) = (proximo_passo_em is null)),
  check (etapa not in ('ganha', 'perdida') or proximo_passo is null)
);
create index oportunidades_unidade on public.oportunidades (unidade_id, organizacao_id);
create index oportunidades_funil on public.oportunidades (unidade_id, etapa, proximo_passo_em);
create index oportunidades_responsavel on public.oportunidades (responsavel_id, etapa);
create index oportunidades_cliente on public.oportunidades (cliente_id, organizacao_id);
create index oportunidades_atendente on public.oportunidades (atendente_id);
create index oportunidades_criado_por on public.oportunidades (criado_por);
create index oportunidades_venda on public.oportunidades (venda_id);
create trigger oportunidades_auditar after insert or update on public.oportunidades
  for each row execute function privado.auditar_mudanca();

create table public.oportunidade_eventos (
  id bigint generated always as identity primary key,
  oportunidade_id uuid not null references public.oportunidades (id),
  organizacao_id uuid not null,
  tipo text not null check (tipo in ('criada', 'etapa', 'responsavel', 'proximo_passo', 'nota', 'reaberta', 'atividade')),
  de text,
  para text,
  texto text check (texto is null or length(texto) <= 500),
  usuario_id uuid not null references public.perfis_usuario (id),
  em timestamptz not null default now()
);
create index oportunidade_eventos_oportunidade on public.oportunidade_eventos (oportunidade_id, id);
create index oportunidade_eventos_usuario on public.oportunidade_eventos (usuario_id);

create table public.atividades (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  unidade_id uuid not null,
  oportunidade_id uuid references public.oportunidades (id),
  cliente_id uuid,
  tipo text not null check (tipo in ('ligacao', 'mensagem', 'visita', 'tarefa')),
  descricao text not null check (length(trim(descricao)) between 3 and 200),
  vence_em timestamptz not null,
  responsavel_id uuid not null references public.perfis_usuario (id),
  situacao text not null default 'aberta' check (situacao in ('aberta', 'feita', 'cancelada')),
  resultado text check (resultado is null or length(resultado) <= 300),
  encerrada_em timestamptz,
  encerrada_por uuid references public.perfis_usuario (id),
  chave text not null check (length(trim(chave)) between 8 and 80),
  conteudo text not null,
  criado_por uuid not null references public.perfis_usuario (id),
  criado_em timestamptz not null default now(),
  unique (organizacao_id, chave),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  foreign key (cliente_id, organizacao_id) references public.clientes (id, organizacao_id),
  check ((situacao = 'aberta') = (encerrada_em is null)),
  check (situacao = 'aberta' or length(trim(coalesce(resultado, ''))) >= 3)
);
create index atividades_unidade on public.atividades (unidade_id, organizacao_id);
create index atividades_agenda on public.atividades (responsavel_id, situacao, vence_em);
create index atividades_oportunidade on public.atividades (oportunidade_id);
create index atividades_cliente on public.atividades (cliente_id, organizacao_id);
create index atividades_criado_por on public.atividades (criado_por);
create index atividades_encerrada_por on public.atividades (encerrada_por);
create trigger atividades_auditar after insert or update on public.atividades
  for each row execute function privado.auditar_mudanca();

-- Leitura: a gerência vê a loja; quem atende, o que é seu (na loja do turno). Escrita só pelas funções.
alter table public.oportunidades enable row level security;
alter table public.oportunidade_eventos enable row level security;
alter table public.atividades enable row level security;
revoke all on public.oportunidades, public.oportunidade_eventos, public.atividades from anon, authenticated;
revoke all on sequence public.oportunidades_numero_seq, public.oportunidade_eventos_id_seq from anon, authenticated;
grant select on public.oportunidades, public.oportunidade_eventos, public.atividades to authenticated;
create policy oportunidades_ler on public.oportunidades for select to authenticated
  using (unidade_id in (select privado.unidades_com_permissao('crm.gerir'))
         or (responsavel_id = (select auth.uid()) and unidade_id in (select privado.unidades_com_permissao('crm.atender'))));
create policy oportunidade_eventos_ler on public.oportunidade_eventos for select to authenticated
  using (oportunidade_id in (select o.id from public.oportunidades o));
create policy atividades_ler on public.atividades for select to authenticated
  using (unidade_id in (select privado.unidades_com_permissao('crm.gerir'))
         or (responsavel_id = (select auth.uid()) and unidade_id in (select privado.unidades_com_permissao('crm.atender'))));

-- -----------------------------------------------------------------------------
-- 2. Auxiliares
-- -----------------------------------------------------------------------------
-- Pode conduzir esta oportunidade? O responsável (com crm.atender na loja do turno) ou a gerência da loja.
create or replace function privado.crm_pode_conduzir(p_unidade uuid, p_responsavel uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (p_responsavel = (select auth.uid()) and public.tem_permissao('crm.atender', p_unidade))
      or public.tem_permissao('crm.gerir', p_unidade);
$$;

-- A pessoa atende nesta loja hoje (vínculo vigente, perfil ativo, papel com crm.atender)?
create or replace function privado.crm_atende_na_loja(p_usuario uuid, p_unidade uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.vinculos v
    join public.papel_permissoes pp on pp.papel = v.papel and pp.permissao = 'crm.atender'
    join public.perfis_usuario p on p.id = v.usuario_id and p.status = 'ativo'
    join public.unidades u on u.id = p_unidade and u.organizacao_id = v.organizacao_id
    where v.usuario_id = p_usuario and (v.escopo = 'organizacao' or v.unidade_id = p_unidade)
      and v.inicio <= now() and (v.fim is null or v.fim > now()));
$$;

create or replace function privado.crm_evento(p_oportunidade uuid, p_organizacao uuid, p_tipo text, p_de text, p_para text, p_texto text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.oportunidade_eventos (oportunidade_id, organizacao_id, tipo, de, para, texto, usuario_id)
  values (p_oportunidade, p_organizacao, p_tipo, p_de, p_para, p_texto, (select auth.uid()));
$$;

-- Próximo passo informado em p_dados (texto e quando, os dois ou nenhum). A data vai de hoje até um ano;
-- manter a data que já estava (p_atual), mesmo atrasada, não exige trocá-la.
create or replace function privado.crm_proximo_passo(p_dados jsonb, p_atual timestamptz default null)
returns table (texto text, quando timestamptz)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_texto text := nullif(regexp_replace(trim(coalesce(p_dados ->> 'proximo_passo', '')), '\s+', ' ', 'g'), '');
  v_quando timestamptz;
begin
  if nullif(trim(coalesce(p_dados ->> 'proximo_passo_em', '')), '') is not null then
    begin
      v_quando := (p_dados ->> 'proximo_passo_em')::timestamptz;
    exception when others then
      raise exception 'Data do próximo passo inválida' using errcode = '22023';
    end;
  end if;
  if (v_texto is null) <> (v_quando is null) then
    raise exception 'Informe o próximo passo e quando (os dois)' using errcode = '22023';
  end if;
  if v_texto is not null and length(v_texto) not between 3 and 200 then
    raise exception 'Descreva o próximo passo (de 3 a 200 letras)' using errcode = '22023';
  end if;
  if v_quando is not null and v_quando is distinct from p_atual and (v_quando < now() - interval '1 day' or v_quando > now() + interval '1 year') then
    raise exception 'O próximo passo vai de hoje até um ano' using errcode = '22023';
  end if;
  return query select v_texto, v_quando;
end;
$$;

revoke all on function privado.crm_pode_conduzir(uuid, uuid), privado.crm_atende_na_loja(uuid, uuid),
  privado.crm_evento(uuid, uuid, text, text, text, text), privado.crm_proximo_passo(jsonb, timestamptz) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Oportunidades
-- -----------------------------------------------------------------------------
-- p_dados: {origem, campanha?, interesse, valor_estimado? (centavos), proximo_passo?, proximo_passo_em?, responsavel?}
create or replace function public.oportunidade_registrar(p_cliente uuid, p_dados jsonb, p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  v_organizacao uuid;
  v_conteudo text := md5(concat_ws('|', p_cliente, coalesce(p_dados, '{}'::jsonb)::text));
  v_existente public.oportunidades;
  v_origem text := nullif(trim(coalesce(p_dados ->> 'origem', '')), '');
  v_campanha text := nullif(regexp_replace(trim(coalesce(p_dados ->> 'campanha', '')), '\s+', ' ', 'g'), '');
  v_interesse text := regexp_replace(trim(coalesce(p_dados ->> 'interesse', '')), '\s+', ' ', 'g');
  v_valor bigint;
  v_passo record;
  v_responsavel uuid;
  v_id uuid;
  v_numero bigint;
begin
  if v_unidade is null or not public.tem_permissao('crm.atender', v_unidade) then
    raise exception 'Sem permissão para registrar oportunidades nesta loja' using errcode = '42501';
  end if;
  select u.organizacao_id into v_organizacao from public.unidades u where u.id = v_unidade;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Dados da oportunidade inválidos' using errcode = '22023';
  end if;
  if p_chave is null or length(trim(p_chave)) not between 8 and 80 then
    raise exception 'Chave do formulário obrigatória' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('oportunidades', v_organizacao, trim(p_chave)));
  select * into v_existente from public.oportunidades o where o.organizacao_id = v_organizacao and o.chave = trim(p_chave);
  if found then
    if v_existente.conteudo <> v_conteudo then
      raise exception 'Chave de idempotência já usada em outra oportunidade' using errcode = 'OR004';
    end if;
    return jsonb_build_object('id', v_existente.id, 'numero', v_existente.numero, 'repetida', true);
  end if;
  if not exists (select 1 from public.clientes c where c.id = p_cliente and c.organizacao_id = v_organizacao and c.situacao = 'ativo') then
    raise exception 'Cliente não encontrado' using errcode = 'P0002';
  end if;
  if v_origem is null or v_origem not in ('loja', 'whatsapp', 'instagram', 'facebook', 'google', 'site', 'indicacao', 'telefone', 'outro') then
    raise exception 'Informe a origem do contato' using errcode = '22023';
  end if;
  if v_campanha is not null and length(v_campanha) not between 2 and 120 then
    raise exception 'Campanha: de 2 a 120 letras' using errcode = '22023';
  end if;
  if length(v_interesse) not between 3 and 200 then
    raise exception 'Descreva o interesse (de 3 a 200 letras), por exemplo "Galaxy A15 e chip"' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_dados ->> 'valor_estimado', '')), '') is not null then
    begin
      v_valor := (p_dados ->> 'valor_estimado')::bigint;
    exception when others then
      raise exception 'Valor estimado inválido' using errcode = '22023';
    end;
    if v_valor not between 0 and 100000000 then
      raise exception 'Valor estimado inválido' using errcode = '22023';
    end if;
  end if;
  select * into v_passo from privado.crm_proximo_passo(p_dados);
  v_responsavel := coalesce(nullif(p_dados ->> 'responsavel', '')::uuid, (select auth.uid()));
  if v_responsavel <> (select auth.uid()) then
    if not public.tem_permissao('crm.gerir', v_unidade) then
      raise exception 'Só a gerência registra oportunidade para outra pessoa' using errcode = '42501';
    end if;
    if not privado.crm_atende_na_loja(v_responsavel, v_unidade) then
      raise exception 'O responsável precisa atender nesta loja' using errcode = '22023';
    end if;
  end if;

  insert into public.oportunidades (organizacao_id, unidade_id, cliente_id, origem, campanha, interesse, valor_estimado_centavos, atendente_id, responsavel_id,
                                    proximo_passo, proximo_passo_em, chave, conteudo, criado_por)
  values (v_organizacao, v_unidade, p_cliente, v_origem, v_campanha, v_interesse, v_valor, (select auth.uid()), v_responsavel,
          v_passo.texto, v_passo.quando, trim(p_chave), v_conteudo, (select auth.uid()))
  returning id, numero into v_id, v_numero;
  perform privado.crm_evento(v_id, v_organizacao, 'criada', null, 'novo', v_interesse);
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'repetida', false);
end;
$$;

-- Muda a etapa e/ou o próximo passo. p_dados: {proximo_passo?, proximo_passo_em?, motivo_perda?, observacao?, venda?, motivo?}
-- Perdida pede o motivo do catálogo ("outro" pede a observação); ganha pode apontar a venda do cliente;
-- reabrir (de ganha/perdida para uma etapa aberta) é da gerência, com motivo.
create or replace function public.oportunidade_mover(p_oportunidade uuid, p_etapa text, p_dados jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_o public.oportunidades;
  v_dados jsonb := coalesce(p_dados, '{}'::jsonb);
  v_passo record;
  v_motivo_perda text := nullif(trim(coalesce(v_dados ->> 'motivo_perda', '')), '');
  v_observacao text := nullif(regexp_replace(trim(coalesce(v_dados ->> 'observacao', '')), '\s+', ' ', 'g'), '');
  v_venda uuid;
  v_fechada boolean;
begin
  select * into v_o from public.oportunidades o where o.id = p_oportunidade for no key update;
  if not found or not privado.crm_pode_conduzir(v_o.unidade_id, v_o.responsavel_id) then
    raise exception 'Oportunidade não encontrada para você' using errcode = 'P0002';
  end if;
  if p_etapa is null or p_etapa not in ('novo', 'contato', 'proposta', 'negociacao', 'ganha', 'perdida') then
    raise exception 'Etapa desconhecida' using errcode = '22023';
  end if;
  if jsonb_typeof(v_dados) <> 'object' then
    raise exception 'Dados inválidos' using errcode = '22023';
  end if;
  if v_observacao is not null and length(v_observacao) > 300 then
    raise exception 'Observação: até 300 letras' using errcode = '22023';
  end if;
  v_fechada := v_o.etapa in ('ganha', 'perdida');

  -- Reabrir: só a gerência, com motivo.
  if v_fechada and p_etapa not in ('ganha', 'perdida') then
    if not public.tem_permissao('crm.gerir', v_o.unidade_id) then
      raise exception 'Reabrir oportunidade é da gerência' using errcode = '42501';
    end if;
    perform privado.exigir_motivo(v_dados ->> 'motivo');
    select * into v_passo from privado.crm_proximo_passo(v_dados);
    update public.oportunidades o set etapa = p_etapa, encerrado_em = null, motivo_perda = null, observacao_encerramento = null, venda_id = null,
      proximo_passo = v_passo.texto, proximo_passo_em = v_passo.quando, atualizado_em = now()
    where o.id = v_o.id;
    perform privado.crm_evento(v_o.id, v_o.organizacao_id, 'reaberta', v_o.etapa, p_etapa, trim(v_dados ->> 'motivo'));
    return true;
  end if;
  if v_fechada then
    if p_etapa = v_o.etapa then
      return false;
    end if;
    raise exception 'Oportunidade encerrada: reabra antes de mudar' using errcode = '22023';
  end if;

  if p_etapa = 'perdida' then
    if v_motivo_perda is null or v_motivo_perda not in ('preco', 'sem_estoque', 'concorrencia', 'credito_negado', 'sem_resposta', 'desistiu', 'outro') then
      raise exception 'Escolha o motivo da perda' using errcode = '22023';
    end if;
    if v_motivo_perda = 'outro' and length(coalesce(v_observacao, '')) < 5 then
      raise exception 'Motivo "outro": explique na observação' using errcode = '22023';
    end if;
    update public.oportunidades o set etapa = 'perdida', motivo_perda = v_motivo_perda, observacao_encerramento = v_observacao,
      proximo_passo = null, proximo_passo_em = null, encerrado_em = now(), atualizado_em = now()
    where o.id = v_o.id;
    perform privado.crm_evento(v_o.id, v_o.organizacao_id, 'etapa', v_o.etapa, 'perdida', concat_ws(': ', v_motivo_perda, v_observacao));
    return true;
  end if;

  if p_etapa = 'ganha' then
    if nullif(trim(coalesce(v_dados ->> 'venda', '')), '') is not null then
      begin
        v_venda := (v_dados ->> 'venda')::uuid;
      exception when others then
        raise exception 'Venda inválida' using errcode = '22023';
      end;
      if not exists (select 1 from public.vendas v where v.id = v_venda and v.organizacao_id = v_o.organizacao_id and v.situacao = 'concluida'
                     and v.cliente_id = v_o.cliente_id) then
        raise exception 'A venda precisa estar concluída e ligada ao mesmo cliente' using errcode = '22023';
      end if;
    end if;
    update public.oportunidades o set etapa = 'ganha', venda_id = v_venda, observacao_encerramento = v_observacao,
      proximo_passo = null, proximo_passo_em = null, encerrado_em = now(), atualizado_em = now()
    where o.id = v_o.id;
    perform privado.crm_evento(v_o.id, v_o.organizacao_id, 'etapa', v_o.etapa, 'ganha', v_observacao);
    return true;
  end if;

  -- Etapa aberta: muda a etapa e/ou o próximo passo (o que vier).
  select * into v_passo from privado.crm_proximo_passo(v_dados, v_o.proximo_passo_em);
  if p_etapa = v_o.etapa and v_passo.texto is not distinct from v_o.proximo_passo and v_passo.quando is not distinct from v_o.proximo_passo_em then
    return false;
  end if;
  update public.oportunidades o set etapa = p_etapa, proximo_passo = v_passo.texto, proximo_passo_em = v_passo.quando, atualizado_em = now()
  where o.id = v_o.id;
  if p_etapa <> v_o.etapa then
    perform privado.crm_evento(v_o.id, v_o.organizacao_id, 'etapa', v_o.etapa, p_etapa, v_observacao);
  end if;
  if v_passo.texto is distinct from v_o.proximo_passo or v_passo.quando is distinct from v_o.proximo_passo_em then
    perform privado.crm_evento(v_o.id, v_o.organizacao_id, 'proximo_passo', v_o.proximo_passo, v_passo.texto,
      case when v_passo.quando is not null then to_char(v_passo.quando at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') end);
  end if;
  return true;
end;
$$;

-- Troca o responsável (gerência da loja), com motivo. Quem recebe precisa atender nesta loja.
create or replace function public.oportunidade_atribuir(p_oportunidade uuid, p_responsavel uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_o public.oportunidades;
begin
  select * into v_o from public.oportunidades o where o.id = p_oportunidade for no key update;
  if not found or not public.tem_permissao('crm.gerir', v_o.unidade_id) then
    raise exception 'Oportunidade não encontrada para você' using errcode = 'P0002';
  end if;
  if v_o.etapa in ('ganha', 'perdida') then
    raise exception 'Oportunidade encerrada não muda de responsável' using errcode = '22023';
  end if;
  if p_responsavel is null or not privado.crm_atende_na_loja(p_responsavel, v_o.unidade_id) then
    raise exception 'O responsável precisa atender nesta loja' using errcode = '22023';
  end if;
  if p_responsavel = v_o.responsavel_id then
    return false;
  end if;
  perform set_config('ora.motivo', 'Responsável da oportunidade: ' || v_motivo, true);
  update public.oportunidades o set responsavel_id = p_responsavel, atualizado_em = now() where o.id = v_o.id;
  perform privado.crm_evento(v_o.id, v_o.organizacao_id, 'responsavel', v_o.responsavel_id::text, p_responsavel::text, v_motivo);
  return true;
end;
$$;

create or replace function public.oportunidade_anotar(p_oportunidade uuid, p_texto text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_o public.oportunidades;
  v_texto text := regexp_replace(trim(coalesce(p_texto, '')), '\s+', ' ', 'g');
begin
  select * into v_o from public.oportunidades o where o.id = p_oportunidade;
  if not found or not privado.crm_pode_conduzir(v_o.unidade_id, v_o.responsavel_id) then
    raise exception 'Oportunidade não encontrada para você' using errcode = 'P0002';
  end if;
  if length(v_texto) not between 3 and 500 then
    raise exception 'Escreva a anotação (de 3 a 500 letras)' using errcode = '22023';
  end if;
  perform privado.crm_evento(v_o.id, v_o.organizacao_id, 'nota', null, null, v_texto);
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Atividades
-- -----------------------------------------------------------------------------
-- p_dados: {tipo, descricao, vence_em, oportunidade?, cliente?, responsavel?}
create or replace function public.atividade_criar(p_dados jsonb, p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  v_organizacao uuid;
  v_conteudo text := md5(coalesce(p_dados, '{}'::jsonb)::text);
  v_existente public.atividades;
  v_tipo text := nullif(trim(coalesce(p_dados ->> 'tipo', '')), '');
  v_descricao text := regexp_replace(trim(coalesce(p_dados ->> 'descricao', '')), '\s+', ' ', 'g');
  v_vence timestamptz;
  v_o public.oportunidades;
  v_cliente uuid;
  v_responsavel uuid;
  v_id uuid;
begin
  if v_unidade is null or not public.tem_permissao('crm.atender', v_unidade) then
    raise exception 'Sem permissão para a agenda desta loja' using errcode = '42501';
  end if;
  select u.organizacao_id into v_organizacao from public.unidades u where u.id = v_unidade;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Dados da atividade inválidos' using errcode = '22023';
  end if;
  if p_chave is null or length(trim(p_chave)) not between 8 and 80 then
    raise exception 'Chave do formulário obrigatória' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('atividades', v_organizacao, trim(p_chave)));
  select * into v_existente from public.atividades a where a.organizacao_id = v_organizacao and a.chave = trim(p_chave);
  if found then
    if v_existente.conteudo <> v_conteudo then
      raise exception 'Chave de idempotência já usada em outra atividade' using errcode = 'OR004';
    end if;
    return jsonb_build_object('id', v_existente.id, 'repetida', true);
  end if;
  if v_tipo is null or v_tipo not in ('ligacao', 'mensagem', 'visita', 'tarefa') then
    raise exception 'Escolha o tipo da atividade' using errcode = '22023';
  end if;
  if length(v_descricao) not between 3 and 200 then
    raise exception 'Descreva a atividade (de 3 a 200 letras)' using errcode = '22023';
  end if;
  begin
    v_vence := (p_dados ->> 'vence_em')::timestamptz;
  exception when others then
    raise exception 'Data de vencimento inválida' using errcode = '22023';
  end;
  if v_vence is null or v_vence < now() - interval '1 day' or v_vence > now() + interval '1 year' then
    raise exception 'O vencimento vai de hoje até um ano' using errcode = '22023';
  end if;
  if nullif(p_dados ->> 'oportunidade', '') is not null then
    begin
      select * into v_o from public.oportunidades o where o.id = (p_dados ->> 'oportunidade')::uuid;
    exception when invalid_text_representation then
      raise exception 'Oportunidade inválida' using errcode = '22023';
    end;
    if v_o.id is null or v_o.unidade_id <> v_unidade or not privado.crm_pode_conduzir(v_o.unidade_id, v_o.responsavel_id) then
      raise exception 'Oportunidade não encontrada para você' using errcode = 'P0002';
    end if;
    if v_o.etapa in ('ganha', 'perdida') then
      raise exception 'Oportunidade encerrada não recebe atividade' using errcode = '22023';
    end if;
    v_cliente := v_o.cliente_id;
  elsif nullif(p_dados ->> 'cliente', '') is not null then
    begin
      v_cliente := (p_dados ->> 'cliente')::uuid;
    exception when invalid_text_representation then
      raise exception 'Cliente inválido' using errcode = '22023';
    end;
    if not exists (select 1 from public.clientes c where c.id = v_cliente and c.organizacao_id = v_organizacao and c.situacao = 'ativo') then
      raise exception 'Cliente não encontrado' using errcode = 'P0002';
    end if;
  end if;
  begin
    v_responsavel := coalesce(nullif(p_dados ->> 'responsavel', '')::uuid, (select auth.uid()));
  exception when invalid_text_representation then
    raise exception 'Responsável inválido' using errcode = '22023';
  end;
  if v_responsavel <> (select auth.uid()) then
    if not public.tem_permissao('crm.gerir', v_unidade) then
      raise exception 'Só a gerência agenda atividade para outra pessoa' using errcode = '42501';
    end if;
    if not privado.crm_atende_na_loja(v_responsavel, v_unidade) then
      raise exception 'O responsável precisa atender nesta loja' using errcode = '22023';
    end if;
  end if;
  insert into public.atividades (organizacao_id, unidade_id, oportunidade_id, cliente_id, tipo, descricao, vence_em, responsavel_id, chave, conteudo, criado_por)
  values (v_organizacao, v_unidade, v_o.id, v_cliente, v_tipo, v_descricao, v_vence, v_responsavel, trim(p_chave), v_conteudo, (select auth.uid()))
  returning id into v_id;
  if v_o.id is not null then
    perform privado.crm_evento(v_o.id, v_o.organizacao_id, 'atividade', null, 'aberta', v_descricao);
  end if;
  return jsonb_build_object('id', v_id, 'repetida', false);
end;
$$;

-- Conclui (feita) ou cancela, sempre com o resultado (ou o motivo). Repetir o mesmo encerramento não muda nada.
create or replace function public.atividade_encerrar(p_atividade uuid, p_feita boolean, p_resultado text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a public.atividades;
  v_resultado text := regexp_replace(trim(coalesce(p_resultado, '')), '\s+', ' ', 'g');
  v_situacao text := case when p_feita then 'feita' else 'cancelada' end;
begin
  select * into v_a from public.atividades a where a.id = p_atividade for no key update;
  if not found or not privado.crm_pode_conduzir(v_a.unidade_id, v_a.responsavel_id) then
    raise exception 'Atividade não encontrada para você' using errcode = 'P0002';
  end if;
  if p_feita is null then
    raise exception 'Diga se foi feita ou cancelada' using errcode = '22023';
  end if;
  if v_a.situacao <> 'aberta' then
    if v_a.situacao = v_situacao then
      return false;
    end if;
    raise exception 'Atividade já encerrada' using errcode = '22023';
  end if;
  if length(v_resultado) not between 3 and 300 then
    raise exception 'Conte o resultado (de 3 a 300 letras)' using errcode = '22023';
  end if;
  update public.atividades a set situacao = v_situacao, resultado = v_resultado, encerrada_em = now(), encerrada_por = (select auth.uid())
  where a.id = v_a.id;
  if v_a.oportunidade_id is not null then
    perform privado.crm_evento(v_a.oportunidade_id, v_a.organizacao_id, 'atividade', 'aberta', v_situacao, left(v_a.descricao || ': ' || v_resultado, 500));
  end if;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Leitura com o nome do cliente (o vendedor não lê a tabela de clientes: L5a, T11)
-- -----------------------------------------------------------------------------
-- Funil da loja do turno: as abertas e as encerradas nos últimos 30 dias; a gerência vê todas, quem atende as suas.
create or replace function public.crm_funil()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  v_gerencia boolean;
begin
  if v_unidade is null or not public.tem_permissao('crm.atender', v_unidade) then
    raise exception 'Sem permissão para o funil desta loja' using errcode = '42501';
  end if;
  v_gerencia := public.tem_permissao('crm.gerir', v_unidade);
  return jsonb_build_object('gerencia', v_gerencia, 'oportunidades', coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'numero', x.numero, 'cliente', x.cliente, 'cliente_id', x.cliente_id, 'interesse', x.interesse,
      'origem', x.origem, 'etapa', x.etapa, 'responsavel', x.responsavel, 'responsavel_id', x.responsavel_id, 'proximo_passo', x.proximo_passo,
      'proximo_passo_em', x.proximo_passo_em, 'atrasada', coalesce(x.proximo_passo_em < now(), false), 'valor_estimado', x.valor_estimado_centavos,
      'motivo_perda', x.motivo_perda, 'criado_em', x.criado_em, 'encerrado_em', x.encerrado_em) order by x.proximo_passo_em nulls last, x.criado_em)
    from (select o.*, c.nome as cliente, p.nome as responsavel
          from public.oportunidades o join public.clientes c on c.id = o.cliente_id join public.perfis_usuario p on p.id = o.responsavel_id
          where o.unidade_id = v_unidade and (v_gerencia or o.responsavel_id = (select auth.uid()))
            and (o.etapa not in ('ganha', 'perdida') or o.encerrado_em > now() - interval '30 days')
          order by o.proximo_passo_em nulls last, o.criado_em limit 500) x), '[]'::jsonb));
end;
$$;

-- Agenda da loja do turno: atividades abertas, da mais antiga para a mais nova (gerência: todas; quem atende: as suas).
create or replace function public.crm_agenda()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  v_gerencia boolean;
begin
  if v_unidade is null or not public.tem_permissao('crm.atender', v_unidade) then
    raise exception 'Sem permissão para a agenda desta loja' using errcode = '42501';
  end if;
  v_gerencia := public.tem_permissao('crm.gerir', v_unidade);
  return jsonb_build_object('gerencia', v_gerencia, 'atividades', coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'tipo', x.tipo, 'descricao', x.descricao, 'vence_em', x.vence_em, 'atrasada', x.vence_em < now(),
      'responsavel', x.responsavel, 'responsavel_id', x.responsavel_id, 'cliente', x.cliente, 'cliente_id', x.cliente_id,
      'oportunidade_id', x.oportunidade_id, 'oportunidade_numero', x.oportunidade_numero) order by x.vence_em)
    from (select a.*, p.nome as responsavel, c.nome as cliente, o.numero as oportunidade_numero
          from public.atividades a join public.perfis_usuario p on p.id = a.responsavel_id
          left join public.clientes c on c.id = a.cliente_id left join public.oportunidades o on o.id = a.oportunidade_id
          where a.unidade_id = v_unidade and a.situacao = 'aberta' and (v_gerencia or a.responsavel_id = (select auth.uid()))
          order by a.vence_em limit 300) x), '[]'::jsonb));
end;
$$;

-- Uma oportunidade com o histórico, as atividades e (para a gerência) quem pode assumir.
create or replace function public.oportunidade_detalhe(p_oportunidade uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_o public.oportunidades;
  v_gerencia boolean;
begin
  select * into v_o from public.oportunidades o where o.id = p_oportunidade;
  if not found or not privado.crm_pode_conduzir(v_o.unidade_id, v_o.responsavel_id) then
    raise exception 'Oportunidade não encontrada para você' using errcode = 'P0002';
  end if;
  v_gerencia := public.tem_permissao('crm.gerir', v_o.unidade_id);
  return jsonb_build_object(
    'id', v_o.id, 'numero', v_o.numero, 'origem', v_o.origem, 'campanha', v_o.campanha, 'interesse', v_o.interesse,
    'valor_estimado', v_o.valor_estimado_centavos, 'etapa', v_o.etapa, 'proximo_passo', v_o.proximo_passo, 'proximo_passo_em', v_o.proximo_passo_em,
    'motivo_perda', v_o.motivo_perda, 'observacao', v_o.observacao_encerramento, 'venda_id', v_o.venda_id, 'criado_em', v_o.criado_em,
    'encerrado_em', v_o.encerrado_em, 'responsavel_id', v_o.responsavel_id, 'gerencia', v_gerencia,
    'responsavel', (select p.nome from public.perfis_usuario p where p.id = v_o.responsavel_id),
    'atendente', (select p.nome from public.perfis_usuario p where p.id = v_o.atendente_id),
    'cliente', (select jsonb_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone_mascara) from public.clientes c where c.id = v_o.cliente_id),
    'eventos', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', e.tipo,
        'de', case when e.tipo = 'responsavel' then (select p.nome from public.perfis_usuario p where p.id::text = e.de) else e.de end,
        'para', case when e.tipo = 'responsavel' then (select p.nome from public.perfis_usuario p where p.id::text = e.para) else e.para end,
        'texto', e.texto, 'usuario', (select p.nome from public.perfis_usuario p where p.id = e.usuario_id), 'em', e.em) order by e.id desc)
      from public.oportunidade_eventos e where e.oportunidade_id = v_o.id), '[]'::jsonb),
    'atividades', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'tipo', a.tipo, 'descricao', a.descricao, 'vence_em', a.vence_em, 'situacao', a.situacao,
        'resultado', a.resultado, 'atrasada', a.situacao = 'aberta' and a.vence_em < now(),
        'responsavel', (select p.nome from public.perfis_usuario p where p.id = a.responsavel_id)) order by a.vence_em)
      from public.atividades a where a.oportunidade_id = v_o.id), '[]'::jsonb),
    'equipe', case when v_gerencia then coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome) order by p.nome)
      from public.perfis_usuario p
      where exists (select 1 from public.vinculos v where v.usuario_id = p.id and v.organizacao_id = v_o.organizacao_id)
        and privado.crm_atende_na_loja(p.id, v_o.unidade_id)), '[]'::jsonb) end);
end;
$$;

revoke all on function public.oportunidade_registrar(uuid, jsonb, text), public.oportunidade_mover(uuid, text, jsonb),
  public.oportunidade_atribuir(uuid, uuid, text), public.oportunidade_anotar(uuid, text), public.oportunidade_detalhe(uuid),
  public.atividade_criar(jsonb, text), public.atividade_encerrar(uuid, boolean, text), public.crm_funil(), public.crm_agenda() from public, anon;
grant execute on function public.oportunidade_registrar(uuid, jsonb, text), public.oportunidade_mover(uuid, text, jsonb),
  public.oportunidade_atribuir(uuid, uuid, text), public.oportunidade_anotar(uuid, text), public.oportunidade_detalhe(uuid),
  public.atividade_criar(jsonb, text), public.atividade_encerrar(uuid, boolean, text), public.crm_funil(), public.crm_agenda() to authenticated;
