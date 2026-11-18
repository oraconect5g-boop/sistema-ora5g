-- =============================================================================
-- Lote CONTAS-a (ORA-FIN-006, a parte multiempresa que o EXT-a deixou; o pedido do proprietário de 18/11/2026: "feche
-- todas as outras pendências dos outros setores"): as contas bancárias de cada empresa, com o saldo pelo extrato.
--
--   * public.contas_bancarias: a conta de uma empresa da rede (o apelido, o banco, a agência e a conta, se quiser), com o
--     saldo inicial numa data: o saldo no fim daquele dia, como o banco mostra;
--   * cada extrato do banco (public.extratos, tipo 'banco') pode ser ligado a uma conta. Dois extratos da mesma conta não
--     podem ter períodos que se cruzam: a mesma linha contaria duas vezes (OR044);
--   * public.conta_bancaria_criar e public.conta_bancaria_atualizar: quem concilia pela rede inteira (o dono) cria e muda
--     a conta, com o motivo na mudança; public.extrato_da_conta liga ou desliga o extrato (com o motivo ao desligar ou
--     trocar);
--   * public.contas_bancarias_saldos: cada conta com o saldo = o saldo inicial + as linhas dos extratos dela depois da data
--     do saldo inicial (créditos e débitos, conciliadas ou não: o saldo é o do banco, não o das vendas), até o último dia
--     coberto por um extrato; e o que entrou e saiu nesse período.
-- O saldo é o do extrato: o que entra na conta e não tem extrato ainda não aparece. A tela diz até que dia ele vale.
-- Códigos: OR044 o período do extrato cruza com o de outro extrato da mesma conta.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create table public.contas_bancarias (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null references public.organizacoes (id),
  empresa_id uuid not null,
  apelido text not null check (length(apelido) between 2 and 60 and apelido = btrim(apelido)),
  banco text not null check (length(banco) between 2 and 60 and banco = btrim(banco)),
  agencia text check (agencia is null or agencia ~ '^[0-9]{1,6}(-[0-9Xx])?$'),
  conta text check (conta is null or conta ~ '^[0-9]{1,15}(-[0-9Xx])?$'),
  saldo_inicial_centavos bigint not null check (abs(saldo_inicial_centavos) <= 100000000000),
  saldo_inicial_em date not null,
  ativa boolean not null default true,
  criada_por uuid not null references public.perfis_usuario (id),
  criada_em timestamptz not null default now(),
  foreign key (empresa_id, organizacao_id) references public.empresas (id, organizacao_id),
  unique (organizacao_id, apelido),
  unique (id, organizacao_id)
);
comment on table public.contas_bancarias is
  'CONTAS-a: as contas bancárias de cada empresa da rede, com o saldo inicial numa data; o saldo segue pelos extratos do banco ligados a ela.';
create index contas_bancarias_empresa_idx on public.contas_bancarias (empresa_id, organizacao_id);
create index contas_bancarias_criada_por_idx on public.contas_bancarias (criada_por);
create trigger contas_bancarias_auditar after insert or update on public.contas_bancarias
  for each row execute function privado.auditar_mudanca();

alter table public.contas_bancarias enable row level security;
revoke all on public.contas_bancarias from anon, authenticated;
revoke all on sequence public.contas_bancarias_numero_seq from anon, authenticated;
grant select on public.contas_bancarias to authenticated;
-- Quem concilia pela rede inteira lê as contas da organização (o extrato do banco é da rede, ADR-016).
create policy contas_bancarias_ler on public.contas_bancarias for select to authenticated
  using (organizacao_id in (select privado.organizacoes_com_permissao('pagamento.conciliar')));

-- O extrato do banco ligado à conta. Só o do banco; a maquininha concilia venda, não saldo.
alter table public.extratos add column conta_id uuid;
alter table public.extratos add constraint extratos_conta_fk foreign key (conta_id, organizacao_id)
  references public.contas_bancarias (id, organizacao_id);
alter table public.extratos add constraint extrato_da_conta_e_do_banco check (conta_id is null or tipo = 'banco');
create index extratos_conta_idx on public.extratos (conta_id, organizacao_id);
create trigger extratos_auditar_conta after update of conta_id on public.extratos
  for each row execute function privado.auditar_mudanca();

-- -----------------------------------------------------------------------------
-- Criar e mudar a conta
-- -----------------------------------------------------------------------------
create or replace function privado.conta_bancaria_conferir(p_apelido text, p_banco text, p_agencia text, p_conta text, p_saldo bigint, p_saldo_em date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_apelido is null or length(p_apelido) not between 2 and 60 then
    raise exception 'O apelido da conta tem de 2 a 60 letras' using errcode = '22023';
  end if;
  if p_banco is null or length(p_banco) not between 2 and 60 then
    raise exception 'O banco tem de 2 a 60 letras' using errcode = '22023';
  end if;
  if p_agencia is not null and p_agencia !~ '^[0-9]{1,6}(-[0-9Xx])?$' then
    raise exception 'A agência é só número, com o dígito depois do traço' using errcode = '22023';
  end if;
  if p_conta is not null and p_conta !~ '^[0-9]{1,15}(-[0-9Xx])?$' then
    raise exception 'A conta é só número, com o dígito depois do traço' using errcode = '22023';
  end if;
  if p_saldo is null or abs(p_saldo) > 100000000000 or p_saldo_em is null then
    raise exception 'Informe o saldo inicial e a data dele' using errcode = '22023';
  end if;
end;
$$;
revoke all on function privado.conta_bancaria_conferir(text, text, text, text, bigint, date) from public, anon, authenticated;

create or replace function public.conta_bancaria_criar(
  p_empresa uuid, p_apelido text, p_banco text, p_agencia text, p_conta text, p_saldo_inicial bigint, p_saldo_em date
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_apelido text := nullif(regexp_replace(btrim(coalesce(p_apelido, '')), '\s+', ' ', 'g'), '');
  v_banco text := nullif(regexp_replace(btrim(coalesce(p_banco, '')), '\s+', ' ', 'g'), '');
  v_agencia text := nullif(btrim(coalesce(p_agencia, '')), '');
  v_conta text := nullif(btrim(coalesce(p_conta, '')), '');
  v_id uuid;
begin
  select e.organizacao_id into v_org from public.empresas e where e.id = p_empresa and e.status = 'ativa';
  if v_org is null or v_org not in (select privado.organizacoes_com_permissao('pagamento.conciliar')) then
    raise exception 'Só quem concilia pela rede inteira cadastra a conta bancária' using errcode = '42501';
  end if;
  perform privado.conta_bancaria_conferir(v_apelido, v_banco, v_agencia, v_conta, p_saldo_inicial, p_saldo_em);
  if p_saldo_em > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'O saldo inicial é de um dia que já passou ou de hoje' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', 'Conta bancária cadastrada: ' || v_apelido, true);
  insert into public.contas_bancarias (organizacao_id, empresa_id, apelido, banco, agencia, conta, saldo_inicial_centavos, saldo_inicial_em, criada_por)
  values (v_org, p_empresa, v_apelido, v_banco, v_agencia, v_conta, p_saldo_inicial, p_saldo_em, (select auth.uid()))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Já existe uma conta com este apelido' using errcode = '23505';
end;
$$;
revoke all on function public.conta_bancaria_criar(uuid, text, text, text, text, bigint, date) from public, anon;
grant execute on function public.conta_bancaria_criar(uuid, text, text, text, text, bigint, date) to authenticated;

create or replace function public.conta_bancaria_atualizar(
  p_conta_bancaria uuid, p_apelido text, p_banco text, p_agencia text, p_conta text, p_saldo_inicial bigint, p_saldo_em date,
  p_ativa boolean, p_motivo text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_atual public.contas_bancarias;
  v_apelido text := nullif(regexp_replace(btrim(coalesce(p_apelido, '')), '\s+', ' ', 'g'), '');
  v_banco text := nullif(regexp_replace(btrim(coalesce(p_banco, '')), '\s+', ' ', 'g'), '');
  v_agencia text := nullif(btrim(coalesce(p_agencia, '')), '');
  v_conta text := nullif(btrim(coalesce(p_conta, '')), '');
  v_motivo text := nullif(regexp_replace(btrim(coalesce(p_motivo, '')), '\s+', ' ', 'g'), '');
begin
  select * into v_atual from public.contas_bancarias c where c.id = p_conta_bancaria for update;
  if v_atual.id is null or v_atual.organizacao_id not in (select privado.organizacoes_com_permissao('pagamento.conciliar')) then
    raise exception 'Só quem concilia pela rede inteira muda a conta bancária' using errcode = '42501';
  end if;
  perform privado.conta_bancaria_conferir(v_apelido, v_banco, v_agencia, v_conta, p_saldo_inicial, p_saldo_em);
  if p_ativa is null then
    raise exception 'Diga se a conta continua ativa' using errcode = '22023';
  end if;
  if p_saldo_em > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'O saldo inicial é de um dia que já passou ou de hoje' using errcode = '22023';
  end if;
  if v_motivo is null or length(v_motivo) not between 3 and 200 then
    raise exception 'Informe o motivo da mudança (de 3 a 200 letras)' using errcode = '22023';
  end if;
  if (v_atual.apelido, v_atual.banco, v_atual.agencia, v_atual.conta, v_atual.saldo_inicial_centavos, v_atual.saldo_inicial_em, v_atual.ativa)
     is not distinct from (v_apelido, v_banco, v_agencia, v_conta, p_saldo_inicial, p_saldo_em, p_ativa) then
    return false;
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  update public.contas_bancarias
  set apelido = v_apelido, banco = v_banco, agencia = v_agencia, conta = v_conta, saldo_inicial_centavos = p_saldo_inicial,
      saldo_inicial_em = p_saldo_em, ativa = p_ativa
  where id = v_atual.id;
  return true;
exception when unique_violation then
  raise exception 'Já existe uma conta com este apelido' using errcode = '23505';
end;
$$;
revoke all on function public.conta_bancaria_atualizar(uuid, text, text, text, text, bigint, date, boolean, text) from public, anon;
grant execute on function public.conta_bancaria_atualizar(uuid, text, text, text, text, bigint, date, boolean, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Ligar o extrato do banco à conta
-- -----------------------------------------------------------------------------
create or replace function public.extrato_da_conta(p_extrato uuid, p_conta_bancaria uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_extrato public.extratos;
  v_conta public.contas_bancarias;
  v_motivo text := nullif(regexp_replace(btrim(coalesce(p_motivo, '')), '\s+', ' ', 'g'), '');
begin
  select * into v_extrato from public.extratos e where e.id = p_extrato;
  if v_extrato.id is null or v_extrato.organizacao_id not in (select privado.organizacoes_com_permissao('pagamento.conciliar')) then
    raise exception 'Só quem concilia pela rede inteira liga o extrato à conta' using errcode = '42501';
  end if;
  if v_extrato.tipo <> 'banco' then
    raise exception 'Só o extrato do banco vai para uma conta bancária' using errcode = '22023';
  end if;
  if v_extrato.conta_id is not distinct from p_conta_bancaria then
    return false;
  end if;
  -- Desligar ou trocar de conta muda o saldo que já se viu: pede o motivo.
  if v_extrato.conta_id is not null and (v_motivo is null or length(v_motivo) not between 3 and 200) then
    raise exception 'Informe o motivo de tirar o extrato da conta (de 3 a 200 letras)' using errcode = '22023';
  end if;
  if p_conta_bancaria is not null then
    select * into v_conta from public.contas_bancarias c where c.id = p_conta_bancaria;
    if v_conta.id is null or v_conta.organizacao_id <> v_extrato.organizacao_id then
      raise exception 'Conta bancária não encontrada' using errcode = 'P0002';
    end if;
    if not v_conta.ativa then
      raise exception 'A conta bancária está inativa' using errcode = '22023';
    end if;
    -- Um extrato por vez na mesma conta: a conferência do período e a gravação, sem corrida.
    perform pg_advisory_xact_lock(hashtextextended('conta_bancaria:' || v_conta.id::text, 0));
    if exists (
      select 1 from public.extratos e
      where e.conta_id = v_conta.id and e.id <> v_extrato.id
        and daterange(e.periodo_inicio, e.periodo_fim, '[]') && daterange(v_extrato.periodo_inicio, v_extrato.periodo_fim, '[]')
    ) then
      raise exception 'O período deste extrato cruza com o de outro extrato da mesma conta: as linhas contariam duas vezes no saldo' using errcode = 'OR044';
    end if;
  end if;
  perform set_config('ora.motivo', coalesce(v_motivo, 'Extrato ligado à conta bancária'), true);
  update public.extratos set conta_id = p_conta_bancaria where id = v_extrato.id;
  return true;
end;
$$;
revoke all on function public.extrato_da_conta(uuid, uuid, text) from public, anon;
grant execute on function public.extrato_da_conta(uuid, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- O saldo de cada conta
-- -----------------------------------------------------------------------------
-- Com as regras de leitura de quem chama (security invoker): só as contas e os extratos que a pessoa lê.
create or replace function public.contas_bancarias_saldos()
returns table (
  id uuid, numero bigint, empresa_id uuid, empresa text, apelido text, banco text, agencia text, conta text, ativa boolean,
  saldo_inicial_centavos bigint, saldo_inicial_em date, extratos bigint, entradas_centavos bigint, saidas_centavos bigint,
  saldo_centavos bigint, saldo_em date
)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.numero, c.empresa_id, coalesce(em.nome_fantasia, em.razao_social), c.apelido, c.banco, c.agencia, c.conta, c.ativa,
    c.saldo_inicial_centavos, c.saldo_inicial_em,
    (select count(*) from public.extratos e where e.conta_id = c.id),
    coalesce(m.entradas, 0)::bigint, coalesce(m.saidas, 0)::bigint,
    (c.saldo_inicial_centavos + coalesce(m.entradas, 0) - coalesce(m.saidas, 0))::bigint,
    greatest(c.saldo_inicial_em, coalesce((select max(e.periodo_fim) from public.extratos e where e.conta_id = c.id), c.saldo_inicial_em))
  from public.contas_bancarias c
  join public.empresas em on em.id = c.empresa_id
  left join lateral (
    select sum(l.valor_centavos) filter (where l.valor_centavos > 0) as entradas,
           sum(-l.valor_centavos) filter (where l.valor_centavos < 0) as saidas
    from public.extratos e
    join public.extrato_linhas l on l.extrato_id = e.id
    where e.conta_id = c.id and l.data > c.saldo_inicial_em
  ) m on true
  order by c.ativa desc, coalesce(em.nome_fantasia, em.razao_social), c.apelido;
$$;
comment on function public.contas_bancarias_saldos() is
  'CONTAS-a: cada conta bancária com o saldo pelo extrato (o saldo inicial + as linhas dos extratos ligados depois da data dele), com as regras de leitura de quem chama (security invoker).';
revoke all on function public.contas_bancarias_saldos() from public, anon;
grant execute on function public.contas_bancarias_saldos() to authenticated;
