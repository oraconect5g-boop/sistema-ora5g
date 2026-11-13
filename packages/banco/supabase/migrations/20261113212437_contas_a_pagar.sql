-- =============================================================================
-- Contas a pagar da empresa (lote L8a: ORA-FIN-004; decisões do proprietário de 13/11/2026)
--
-- Decisões do proprietário:
--   1) o DONO lança e marca como paga qualquer conta, da rede (central, sem loja) ou de uma loja; o
--      GERENTE, só as contas da loja dele (a do turno);
--   2) as despesas se separam por CATEGORIA, com uma lista inicial que o dono ajusta (criar, renomear,
--      desativar): Mercadoria (fornecedor), Aluguel e condomínio, Água, luz e internet, Salários e
--      encargos, Impostos e taxas, Marketing, Manutenção e Outras;
--   3) conta PARCELADA (o valor total dividido em parcelas, mês a mês) e conta que se REPETE todo mês
--      (o mesmo valor por vários meses, como o aluguel).
-- O sistema REGISTRA a conta e o pagamento feito fora (banco, boleto, Pix); não paga nada sozinho.
--
-- 1) Permissão conta_pagar.gerir (dono e gerente). Na rede (conta sem loja) e nas categorias, só papel
--    de organização (o dono): privado.pode_gerir_conta_pagar.
-- 2) public.contas_pagar_categorias: a lista da organização; toda organização nasce com a lista
--    inicial (gatilho), e as que já existem a recebem agora.
-- 3) public.contas_a_pagar: uma linha por conta, parcela ou mês, ligadas pelo grupo (o lançamento):
--    loja ou rede, categoria, fornecedor (opcional), descrição, documento, valor e vencimento; situação
--    aberta, paga ou cancelada; o pagamento (data, valor pago, referência, quem registrou) e o
--    cancelamento (motivo). Nada se apaga.
-- 4) Funções (definer): conta_pagar_lancar, conta_pagar_corrigir, conta_pagar_pagar,
--    conta_pagar_desfazer_pagamento, conta_pagar_cancelar e conta_pagar_categoria_salvar. Leitura
--    (invoker, com o RLS de quem pede): contas_a_pagar_resumo.
-- Tudo auditado (gatilho, com o motivo). Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

do $$
begin
  perform set_config('ora.motivo', 'Contas a pagar: o dono em todas e o gerente na loja dele (decisão do proprietário, 13/11/2026)', true);
  insert into public.permissoes (codigo, descricao, modulo) values
    ('conta_pagar.gerir', 'Lançar, corrigir, pagar e cancelar as contas a pagar da loja (o dono também as da rede e as categorias)', 'financeiro');
  insert into public.papel_permissoes (papel, permissao) values ('dono', 'conta_pagar.gerir'), ('gerente', 'conta_pagar.gerir');
end;
$$;

-- Quem gere as contas de uma loja (nula: a conta é da rede). Mesma regra de tem_permissao: papel de
-- organização vale na rede e em todas as lojas dela; papel de loja, só na loja do turno.
create or replace function privado.pode_gerir_conta_pagar(p_organizacao uuid, p_unidade uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_organizacao is null then false
    when p_unidade is null then p_organizacao in (select privado.organizacoes_com_permissao('conta_pagar.gerir'))
    else exists (select 1 from public.unidades u where u.id = p_unidade and u.organizacao_id = p_organizacao)
         and p_unidade in (select privado.unidades_com_permissao('conta_pagar.gerir'))
  end;
$$;
revoke all on function privado.pode_gerir_conta_pagar(uuid, uuid) from public, anon;
grant execute on function privado.pode_gerir_conta_pagar(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 1. Categorias
-- -----------------------------------------------------------------------------
create table public.contas_pagar_categorias (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id),
  nome text not null check (length(nome) between 2 and 60 and nome = btrim(nome)),
  ativa boolean not null default true,
  ordem smallint not null default 100,
  criada_por uuid references public.perfis_usuario (id),
  criada_em timestamptz not null default now(),
  unique (id, organizacao_id)
);
create unique index contas_pagar_categorias_nome on public.contas_pagar_categorias (organizacao_id, lower(nome));
create index contas_pagar_categorias_criada_por on public.contas_pagar_categorias (criada_por);
create trigger contas_pagar_categorias_auditar after insert or update on public.contas_pagar_categorias
  for each row execute function privado.auditar_mudanca();

alter table public.contas_pagar_categorias enable row level security;
revoke all on public.contas_pagar_categorias from anon, authenticated;
grant select on public.contas_pagar_categorias to authenticated;
-- Quem gere contas a pagar em alguma loja da organização (ou na rede) lê as categorias dela.
create policy contas_pagar_categorias_ler on public.contas_pagar_categorias for select to authenticated
  using (organizacao_id in (
    select v.organizacao_id from privado.vinculos_vigentes() v
    join public.papel_permissoes pp on pp.papel = v.papel and pp.permissao = 'conta_pagar.gerir'));

-- A lista inicial (decisão do proprietário); o dono ajusta depois.
create or replace function privado.contas_pagar_semear_categorias(p_organizacao uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := current_setting('ora.motivo', true);
begin
  perform set_config('ora.motivo', 'Lista inicial de categorias das contas a pagar (decisão do proprietário, 13/11/2026)', true);
  insert into public.contas_pagar_categorias (organizacao_id, nome, ordem)
  select p_organizacao, c.nome, c.ordem
  from (values ('Mercadoria (fornecedor)', 10), ('Aluguel e condomínio', 20), ('Água, luz e internet', 30), ('Salários e encargos', 40),
               ('Impostos e taxas', 50), ('Marketing', 60), ('Manutenção', 70), ('Outras', 80)) as c (nome, ordem)
  on conflict do nothing;
  perform set_config('ora.motivo', coalesce(v_motivo, ''), true);
end;
$$;
revoke all on function privado.contas_pagar_semear_categorias(uuid) from public, anon, authenticated;

create or replace function privado.contas_pagar_categorias_da_organizacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.contas_pagar_semear_categorias(new.id);
  return null;
end;
$$;
revoke all on function privado.contas_pagar_categorias_da_organizacao() from public, anon, authenticated;
create trigger organizacoes_categorias_contas_pagar after insert on public.organizacoes
  for each row execute function privado.contas_pagar_categorias_da_organizacao();

do $$
declare
  v_org uuid;
begin
  for v_org in select o.id from public.organizacoes o loop
    perform privado.contas_pagar_semear_categorias(v_org);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Contas
-- -----------------------------------------------------------------------------
create table public.contas_a_pagar (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id),
  unidade_id uuid,
  categoria_id uuid not null,
  fornecedor_id uuid,
  descricao text not null check (length(descricao) between 3 and 120),
  documento text check (documento is null or length(documento) between 1 and 60),
  valor_centavos bigint not null check (valor_centavos between 1 and 100000000000),
  vencimento date not null,
  grupo_id uuid not null,
  forma text not null check (forma in ('unica', 'parcelada', 'mensal')),
  parcela smallint not null default 1,
  parcelas smallint not null default 1,
  chave text not null check (length(trim(chave)) > 0),
  situacao text not null default 'aberta' check (situacao in ('aberta', 'paga', 'cancelada')),
  paga_em date,
  valor_pago_centavos bigint check (valor_pago_centavos is null or valor_pago_centavos between 1 and 200000000000),
  referencia_pagamento text check (referencia_pagamento is null or length(referencia_pagamento) between 3 and 80),
  paga_por uuid references public.perfis_usuario (id),
  cancelada_em timestamptz,
  cancelada_por uuid references public.perfis_usuario (id),
  motivo_cancelamento text check (motivo_cancelamento is null or length(motivo_cancelamento) between 3 and 300),
  criada_por uuid not null references public.perfis_usuario (id),
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  foreign key (categoria_id, organizacao_id) references public.contas_pagar_categorias (id, organizacao_id),
  foreign key (fornecedor_id, organizacao_id) references public.fornecedores (id, organizacao_id),
  unique (organizacao_id, chave, parcela),
  constraint conta_parcela_valida check (parcelas between 1 and 36 and parcela between 1 and parcelas and (forma = 'unica') = (parcelas = 1)),
  constraint conta_pagamento_completo check (
    (situacao = 'paga') = (paga_em is not null)
    and (paga_em is null) = (valor_pago_centavos is null)
    and (paga_em is null) = (referencia_pagamento is null)
    and (paga_em is null) = (paga_por is null)),
  constraint conta_cancelamento_completo check (
    (situacao = 'cancelada') = (cancelada_em is not null)
    and (cancelada_em is null) = (cancelada_por is null)
    and (cancelada_em is null) = (motivo_cancelamento is null))
);
create index contas_a_pagar_abertas on public.contas_a_pagar (organizacao_id, vencimento) where situacao = 'aberta';
create index contas_a_pagar_unidade on public.contas_a_pagar (unidade_id, organizacao_id);
create index contas_a_pagar_categoria on public.contas_a_pagar (categoria_id, organizacao_id);
create index contas_a_pagar_fornecedor on public.contas_a_pagar (fornecedor_id, organizacao_id);
create index contas_a_pagar_grupo on public.contas_a_pagar (grupo_id, parcela);
create index contas_a_pagar_paga_em on public.contas_a_pagar (organizacao_id, paga_em) where situacao = 'paga';
create index contas_a_pagar_criada_por on public.contas_a_pagar (criada_por);
create index contas_a_pagar_paga_por on public.contas_a_pagar (paga_por);
create index contas_a_pagar_cancelada_por on public.contas_a_pagar (cancelada_por);
create trigger contas_a_pagar_auditar after insert or update on public.contas_a_pagar
  for each row execute function privado.auditar_mudanca();

alter table public.contas_a_pagar enable row level security;
revoke all on public.contas_a_pagar from anon, authenticated;
grant select on public.contas_a_pagar to authenticated;
-- O gerente lê as contas da loja do turno; o dono, as da rede e as de todas as lojas.
create policy contas_a_pagar_ler on public.contas_a_pagar for select to authenticated
  using (
    unidade_id in (select privado.unidades_com_permissao('conta_pagar.gerir'))
    or (unidade_id is null and organizacao_id in (select privado.organizacoes_com_permissao('conta_pagar.gerir'))));

-- -----------------------------------------------------------------------------
-- 3. Lançar: uma conta, as parcelas de um valor total ou o mesmo valor por vários meses
-- -----------------------------------------------------------------------------
create or replace function public.conta_pagar_lancar(p_dados jsonb, p_chave text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_unidade uuid;
  v_org uuid;
  v_categoria uuid;
  v_fornecedor uuid;
  v_descricao text;
  v_documento text;
  v_valor bigint;
  v_vencimento date;
  v_forma text;
  v_vezes int;
  v_existente public.contas_a_pagar;
  v_total_existente bigint;
  v_grupo uuid := gen_random_uuid();
  v_base bigint := 0;
  v_resto bigint := 0;
begin
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Dados da conta inválidos' using errcode = '22023';
  end if;
  -- Primeiro onde a conta fica (a loja ou a rede): sem permissão ali, nada mais é conferido.
  begin
    v_unidade := nullif(p_dados ->> 'unidade', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Loja inválida' using errcode = '22023';
  end;
  if v_unidade is null then
    select u.organizacao_id into v_org from public.unidades u where u.id = (select public.unidade_atual());
  else
    select u.organizacao_id into v_org from public.unidades u where u.id = v_unidade and u.status = 'ativa';
  end if;
  if v_org is null or not privado.pode_gerir_conta_pagar(v_org, v_unidade) then
    raise exception 'Sem permissão para lançar contas a pagar aqui' using errcode = '42501';
  end if;

  begin
    v_valor := (p_dados ->> 'valor')::bigint;
    v_vencimento := (p_dados ->> 'vencimento')::date;
    v_vezes := coalesce((p_dados ->> 'vezes')::int, 1);
    v_categoria := (p_dados ->> 'categoria')::uuid;
    v_fornecedor := nullif(p_dados ->> 'fornecedor', '')::uuid;
  exception when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow then
    raise exception 'Dados da conta inválidos' using errcode = '22023';
  end;
  v_descricao := regexp_replace(trim(coalesce(p_dados ->> 'descricao', '')), '\s+', ' ', 'g');
  v_documento := nullif(regexp_replace(trim(coalesce(p_dados ->> 'documento', '')), '\s+', ' ', 'g'), '');
  v_forma := coalesce(p_dados ->> 'forma', 'unica');
  if length(v_descricao) not between 3 and 120 then
    raise exception 'Descreva a conta (de 3 a 120 letras)' using errcode = '22023';
  end if;
  if v_documento is not null and length(v_documento) > 60 then
    raise exception 'O documento tem até 60 letras' using errcode = '22023';
  end if;
  if v_valor is null or v_valor not between 1 and 100000000000 then
    raise exception 'Valor inválido' using errcode = '22023';
  end if;
  if v_vencimento is null or v_vencimento not between v_hoje - 366 and v_hoje + 1830 then
    raise exception 'O vencimento vai de um ano atrás até cinco anos à frente' using errcode = '22023';
  end if;
  if v_forma not in ('unica', 'parcelada', 'mensal') then
    raise exception 'Forma da conta inválida' using errcode = '22023';
  end if;
  if (v_forma = 'unica' and v_vezes <> 1) or (v_forma <> 'unica' and v_vezes not between 2 and 36) then
    raise exception 'Parcelas ou meses: de 2 a 36' using errcode = '22023';
  end if;
  if v_forma = 'parcelada' and v_valor < v_vezes then
    raise exception 'Valor pequeno demais para tantas parcelas' using errcode = '22023';
  end if;
  if not exists (select 1 from public.contas_pagar_categorias c where c.id = v_categoria and c.organizacao_id = v_org and c.ativa) then
    raise exception 'Escolha uma categoria ativa' using errcode = '22023';
  end if;
  if v_fornecedor is not null
     and not exists (select 1 from public.fornecedores f where f.id = v_fornecedor and f.organizacao_id = v_org and f.ativo) then
    raise exception 'Fornecedor inválido ou inativo' using errcode = '22023';
  end if;
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;

  -- A mesma chave devolve o mesmo lançamento; com outros dados, é recusada.
  perform pg_advisory_xact_lock(privado.trava_da_chave('contas_a_pagar', v_org, p_chave));
  select * into v_existente from public.contas_a_pagar c where c.organizacao_id = v_org and c.chave = p_chave and c.parcela = 1;
  if found then
    select sum(c.valor_centavos) into v_total_existente from public.contas_a_pagar c where c.grupo_id = v_existente.grupo_id;
    if v_existente.unidade_id is distinct from v_unidade or v_existente.categoria_id <> v_categoria
       or v_existente.fornecedor_id is distinct from v_fornecedor or v_existente.descricao <> v_descricao
       or v_existente.documento is distinct from v_documento or v_existente.forma <> v_forma or v_existente.parcelas <> v_vezes
       or v_existente.vencimento <> v_vencimento
       or v_total_existente <> (case when v_forma = 'mensal' then v_valor * v_vezes else v_valor end) then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return v_existente.grupo_id;
  end if;

  -- Parcelada: o valor total dividido; os centavos que sobram vão na primeira parcela.
  if v_forma = 'parcelada' then
    v_base := v_valor / v_vezes;
    v_resto := v_valor - v_base * v_vezes;
  end if;
  perform set_config('ora.motivo', 'Conta a pagar lançada: ' || v_descricao, true);
  insert into public.contas_a_pagar (organizacao_id, unidade_id, categoria_id, fornecedor_id, descricao, documento, valor_centavos,
                                     vencimento, grupo_id, forma, parcela, parcelas, chave, criada_por)
  select v_org, v_unidade, v_categoria, v_fornecedor, v_descricao, v_documento,
         case when v_forma = 'parcelada' then v_base + case when i = 1 then v_resto else 0 end else v_valor end,
         (v_vencimento + make_interval(months => i - 1))::date,
         v_grupo, v_forma, i, v_vezes, p_chave, (select auth.uid())
  from generate_series(1, v_vezes) as i;
  return v_grupo;
end;
$$;
revoke all on function public.conta_pagar_lancar(jsonb, text) from public, anon;
grant execute on function public.conta_pagar_lancar(jsonb, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Corrigir a conta aberta (descrição, documento, valor, vencimento ou categoria), com motivo
-- -----------------------------------------------------------------------------
create or replace function public.conta_pagar_corrigir(p_conta uuid, p_dados jsonb, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_c public.contas_a_pagar;
  v_descricao text;
  v_documento text;
  v_valor bigint;
  v_vencimento date;
  v_categoria uuid;
begin
  select * into v_c from public.contas_a_pagar c where c.id = p_conta for update;
  if v_c.id is null or not privado.pode_gerir_conta_pagar(v_c.organizacao_id, v_c.unidade_id) then
    raise exception 'Conta a pagar não encontrada para você' using errcode = 'P0002';
  end if;
  if v_c.situacao <> 'aberta' then
    raise exception 'Só a conta em aberto pode ser corrigida' using errcode = '22023';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Dados da conta inválidos' using errcode = '22023';
  end if;
  if length(v_motivo) > 300 then
    raise exception 'O motivo tem até 300 letras' using errcode = '22023';
  end if;
  begin
    v_valor := coalesce((p_dados ->> 'valor')::bigint, v_c.valor_centavos);
    v_vencimento := coalesce((p_dados ->> 'vencimento')::date, v_c.vencimento);
    v_categoria := coalesce((p_dados ->> 'categoria')::uuid, v_c.categoria_id);
  exception when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow then
    raise exception 'Dados da conta inválidos' using errcode = '22023';
  end;
  v_descricao := case when p_dados ? 'descricao' then regexp_replace(trim(coalesce(p_dados ->> 'descricao', '')), '\s+', ' ', 'g') else v_c.descricao end;
  v_documento := case when p_dados ? 'documento' then nullif(regexp_replace(trim(coalesce(p_dados ->> 'documento', '')), '\s+', ' ', 'g'), '') else v_c.documento end;
  if length(v_descricao) not between 3 and 120 then
    raise exception 'Descreva a conta (de 3 a 120 letras)' using errcode = '22023';
  end if;
  if v_documento is not null and length(v_documento) > 60 then
    raise exception 'O documento tem até 60 letras' using errcode = '22023';
  end if;
  if v_valor not between 1 and 100000000000 then
    raise exception 'Valor inválido' using errcode = '22023';
  end if;
  if v_vencimento <> v_c.vencimento and v_vencimento not between v_hoje - 366 and v_hoje + 1830 then
    raise exception 'O vencimento vai de um ano atrás até cinco anos à frente' using errcode = '22023';
  end if;
  if v_categoria <> v_c.categoria_id
     and not exists (select 1 from public.contas_pagar_categorias c where c.id = v_categoria and c.organizacao_id = v_c.organizacao_id and c.ativa) then
    raise exception 'Escolha uma categoria ativa' using errcode = '22023';
  end if;
  if v_descricao = v_c.descricao and v_documento is not distinct from v_c.documento and v_valor = v_c.valor_centavos
     and v_vencimento = v_c.vencimento and v_categoria = v_c.categoria_id then
    return false;
  end if;
  perform set_config('ora.motivo', 'Conta a pagar corrigida: ' || v_motivo, true);
  update public.contas_a_pagar c
  set descricao = v_descricao, documento = v_documento, valor_centavos = v_valor, vencimento = v_vencimento, categoria_id = v_categoria, atualizada_em = now()
  where c.id = v_c.id;
  return true;
end;
$$;
revoke all on function public.conta_pagar_corrigir(uuid, jsonb, text) from public, anon;
grant execute on function public.conta_pagar_corrigir(uuid, jsonb, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Registrar o pagamento feito fora (data, valor pago e referência) e desfazer, com motivo
-- -----------------------------------------------------------------------------
create or replace function public.conta_pagar_pagar(p_conta uuid, p_pago_em date, p_valor_pago bigint, p_referencia text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_c public.contas_a_pagar;
  v_referencia text := regexp_replace(trim(coalesce(p_referencia, '')), '\s+', ' ', 'g');
begin
  select * into v_c from public.contas_a_pagar c where c.id = p_conta for update;
  if v_c.id is null or not privado.pode_gerir_conta_pagar(v_c.organizacao_id, v_c.unidade_id) then
    raise exception 'Conta a pagar não encontrada para você' using errcode = 'P0002';
  end if;
  if v_c.situacao = 'cancelada' then
    raise exception 'Conta cancelada: não há o que pagar' using errcode = '22023';
  end if;
  if length(v_referencia) not between 3 and 80 then
    raise exception 'Informe a referência do pagamento (de 3 a 80 letras): comprovante, autenticação ou linha do extrato' using errcode = '22023';
  end if;
  -- Juros ou desconto mudam o valor pago; mais que o dobro da conta é engano de digitação.
  if p_valor_pago is null or p_valor_pago < 1 or p_valor_pago > v_c.valor_centavos * 2 then
    raise exception 'O valor pago vai de R$ 0,01 até o dobro do valor da conta' using errcode = '22023';
  end if;
  if p_pago_em is null or p_pago_em > v_hoje or p_pago_em < v_hoje - 366 then
    raise exception 'A data do pagamento vai de um ano atrás até hoje' using errcode = '22023';
  end if;
  if v_c.situacao = 'paga' then
    if v_c.paga_em = p_pago_em and v_c.valor_pago_centavos = p_valor_pago and v_c.referencia_pagamento = v_referencia then
      return false;
    end if;
    raise exception 'Pagamento já registrado: desfaça antes de mudar' using errcode = 'OR030';
  end if;
  perform set_config('ora.motivo', 'Conta paga: ' || v_referencia, true);
  update public.contas_a_pagar c
  set situacao = 'paga', paga_em = p_pago_em, valor_pago_centavos = p_valor_pago, referencia_pagamento = v_referencia,
      paga_por = (select auth.uid()), atualizada_em = now()
  where c.id = v_c.id;
  return true;
end;
$$;
revoke all on function public.conta_pagar_pagar(uuid, date, bigint, text) from public, anon;
grant execute on function public.conta_pagar_pagar(uuid, date, bigint, text) to authenticated;

create or replace function public.conta_pagar_desfazer_pagamento(p_conta uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_c public.contas_a_pagar;
begin
  select * into v_c from public.contas_a_pagar c where c.id = p_conta for update;
  if v_c.id is null or not privado.pode_gerir_conta_pagar(v_c.organizacao_id, v_c.unidade_id) then
    raise exception 'Conta a pagar não encontrada para você' using errcode = 'P0002';
  end if;
  if v_c.situacao <> 'paga' then
    return false;
  end if;
  perform set_config('ora.motivo', 'Pagamento da conta desfeito: ' || v_motivo, true);
  update public.contas_a_pagar c
  set situacao = 'aberta', paga_em = null, valor_pago_centavos = null, referencia_pagamento = null, paga_por = null, atualizada_em = now()
  where c.id = v_c.id;
  return true;
end;
$$;
revoke all on function public.conta_pagar_desfazer_pagamento(uuid, text) from public, anon;
grant execute on function public.conta_pagar_desfazer_pagamento(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Cancelar a conta aberta (e, se pedido, as parcelas ou os meses seguintes do mesmo lançamento)
-- -----------------------------------------------------------------------------
create or replace function public.conta_pagar_cancelar(p_conta uuid, p_motivo text, p_e_seguintes boolean)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_c public.contas_a_pagar;
  v_quantas integer;
begin
  select * into v_c from public.contas_a_pagar c where c.id = p_conta for update;
  if v_c.id is null or not privado.pode_gerir_conta_pagar(v_c.organizacao_id, v_c.unidade_id) then
    raise exception 'Conta a pagar não encontrada para você' using errcode = 'P0002';
  end if;
  if length(v_motivo) > 300 then
    raise exception 'O motivo tem até 300 letras' using errcode = '22023';
  end if;
  if v_c.situacao = 'paga' then
    raise exception 'Conta paga: desfaça o pagamento antes de cancelar' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', 'Conta a pagar cancelada: ' || v_motivo, true);
  update public.contas_a_pagar c
  set situacao = 'cancelada', cancelada_em = now(), cancelada_por = (select auth.uid()), motivo_cancelamento = v_motivo, atualizada_em = now()
  where c.situacao = 'aberta'
    and (c.id = v_c.id or (coalesce(p_e_seguintes, false) and c.grupo_id = v_c.grupo_id and c.parcela > v_c.parcela));
  get diagnostics v_quantas = row_count;
  return v_quantas;
end;
$$;
revoke all on function public.conta_pagar_cancelar(uuid, text, boolean) from public, anon;
grant execute on function public.conta_pagar_cancelar(uuid, text, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Categorias: só o dono cria, renomeia, desativa e reativa (nada se apaga)
-- -----------------------------------------------------------------------------
create or replace function public.conta_pagar_categoria_salvar(p_categoria uuid, p_nome text, p_ativa boolean)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nome text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_cat public.contas_pagar_categorias;
  v_org uuid;
  v_id uuid;
begin
  if p_categoria is null then
    select u.organizacao_id into v_org from public.unidades u where u.id = (select public.unidade_atual());
    if v_org is null or v_org not in (select privado.organizacoes_com_permissao('conta_pagar.gerir')) then
      raise exception 'Só o dono ajusta as categorias das contas a pagar' using errcode = '42501';
    end if;
  else
    select * into v_cat from public.contas_pagar_categorias c where c.id = p_categoria for update;
    if v_cat.id is null or v_cat.organizacao_id not in (select privado.organizacoes_com_permissao('conta_pagar.gerir')) then
      raise exception 'Categoria não encontrada para você' using errcode = 'P0002';
    end if;
    v_org := v_cat.organizacao_id;
  end if;
  if length(v_nome) not between 2 and 60 then
    raise exception 'O nome da categoria tem de 2 a 60 letras' using errcode = '22023';
  end if;
  if exists (select 1 from public.contas_pagar_categorias c
             where c.organizacao_id = v_org and lower(c.nome) = lower(v_nome) and c.id is distinct from p_categoria) then
    raise exception 'Já existe uma categoria com esse nome' using errcode = '22023';
  end if;
  if p_categoria is null then
    perform set_config('ora.motivo', 'Categoria das contas a pagar criada: ' || v_nome, true);
    insert into public.contas_pagar_categorias (organizacao_id, nome, ativa, criada_por)
    values (v_org, v_nome, coalesce(p_ativa, true), (select auth.uid()))
    returning id into v_id;
    return v_id;
  end if;
  if v_nome = v_cat.nome and coalesce(p_ativa, v_cat.ativa) = v_cat.ativa then
    return v_cat.id;
  end if;
  perform set_config('ora.motivo', 'Categoria das contas a pagar alterada: ' || v_nome
    || case when coalesce(p_ativa, v_cat.ativa) = v_cat.ativa then '' when v_cat.ativa then ' (desativada)' else ' (reativada)' end, true);
  update public.contas_pagar_categorias c set nome = v_nome, ativa = coalesce(p_ativa, v_cat.ativa) where c.id = v_cat.id;
  return v_cat.id;
end;
$$;
revoke all on function public.conta_pagar_categoria_salvar(uuid, text, boolean) from public, anon;
grant execute on function public.conta_pagar_categoria_salvar(uuid, text, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Resumo para a tela (security invoker: soma só o que o RLS deixa quem pede ler)
--   vencidas      abertas com vencimento antes de hoje (São Paulo), com a mais antiga em dias;
--   hoje          abertas que vencem hoje;  proximos_7 / proximos_30: abertas de amanhã até +7 / +30 dias;
--   pagas_no_mes  pagas com data de pagamento neste mês: o valor pago e o valor das contas;
--   por_categoria o aberto e o pago no mês de cada categoria;  por_loja: o aberto e o vencido por loja
--                 (nula: a rede);  por_semana: o aberto que vence em cada uma das próximas 8 semanas,
--                 a contar de hoje (as vencidas ficam à parte, em vencidas).
--   escopo        onde quem pede lança: a rede (só o dono) e as lojas ativas.
-- Filtro: p_rede (só as contas da rede) ou p_unidade (só as de uma loja); sem nenhum, tudo o que lê.
-- -----------------------------------------------------------------------------
create or replace function public.contas_a_pagar_resumo(p_unidade uuid default null, p_rede boolean default false)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_org_do_turno uuid := (select u.organizacao_id from public.unidades u where u.id = (select public.unidade_atual()));
  v_pode_rede boolean;
begin
  v_pode_rede := v_org_do_turno is not null and v_org_do_turno in (select privado.organizacoes_com_permissao('conta_pagar.gerir'));
  if not v_pode_rede and not exists (select 1 from privado.unidades_com_permissao('conta_pagar.gerir')) then
    raise exception 'Sem permissão para ver as contas a pagar' using errcode = '42501';
  end if;
  if (coalesce(p_rede, false) and not v_pode_rede)
     or (p_unidade is not null and p_unidade not in (select privado.unidades_com_permissao('conta_pagar.gerir'))) then
    raise exception 'Sem permissão para ver as contas a pagar desta loja' using errcode = '42501';
  end if;
  return (
    with contas as (
      select c.* from public.contas_a_pagar c
      where (not coalesce(p_rede, false) or c.unidade_id is null)
        and (p_unidade is null or c.unidade_id = p_unidade)
    ),
    abertas as (select c.* from contas c where c.situacao = 'aberta')
    select jsonb_build_object(
      'hoje', v_hoje,
      'abertas', (select jsonb_build_object('quantidade', count(*), 'valor', coalesce(sum(a.valor_centavos), 0)) from abertas a),
      'vencidas', (select jsonb_build_object('quantidade', count(*), 'valor', coalesce(sum(a.valor_centavos), 0), 'mais_antiga_dias', coalesce(max(v_hoje - a.vencimento), 0))
                   from abertas a where a.vencimento < v_hoje),
      'hoje_vencem', (select jsonb_build_object('quantidade', count(*), 'valor', coalesce(sum(a.valor_centavos), 0)) from abertas a where a.vencimento = v_hoje),
      'proximos_7', (select jsonb_build_object('quantidade', count(*), 'valor', coalesce(sum(a.valor_centavos), 0))
                     from abertas a where a.vencimento > v_hoje and a.vencimento <= v_hoje + 7),
      'proximos_30', (select jsonb_build_object('quantidade', count(*), 'valor', coalesce(sum(a.valor_centavos), 0))
                      from abertas a where a.vencimento > v_hoje and a.vencimento <= v_hoje + 30),
      'pagas_no_mes', (select jsonb_build_object('quantidade', count(*), 'valor_pago', coalesce(sum(c.valor_pago_centavos), 0), 'valor', coalesce(sum(c.valor_centavos), 0))
                       from contas c where c.situacao = 'paga' and c.paga_em >= v_mes),
      'por_categoria', coalesce((
        select jsonb_agg(jsonb_build_object('categoria', x.categoria_id, 'aberto', x.aberto, 'pago_no_mes', x.pago) order by x.aberto + x.pago desc, x.categoria_id)
        from (
          select c.categoria_id,
            coalesce(sum(c.valor_centavos) filter (where c.situacao = 'aberta'), 0) as aberto,
            coalesce(sum(c.valor_pago_centavos) filter (where c.situacao = 'paga' and c.paga_em >= v_mes), 0) as pago
          from contas c group by c.categoria_id
        ) x where x.aberto + x.pago > 0), '[]'::jsonb),
      'por_loja', coalesce((
        select jsonb_agg(jsonb_build_object('unidade', x.unidade_id, 'aberto', x.aberto, 'vencido', x.vencido) order by x.aberto desc, x.unidade_id nulls first)
        from (
          select a.unidade_id, sum(a.valor_centavos) as aberto, coalesce(sum(a.valor_centavos) filter (where a.vencimento < v_hoje), 0) as vencido
          from abertas a group by a.unidade_id
        ) x), '[]'::jsonb),
      'por_semana', (
        select jsonb_agg(jsonb_build_object('inicio', v_hoje + 7 * s.i,
          'valor', coalesce((select sum(a.valor_centavos) from abertas a where a.vencimento between v_hoje + 7 * s.i and v_hoje + 7 * s.i + 6), 0)) order by s.i)
        from generate_series(0, 7) as s (i)),
      'escopo', jsonb_build_object(
        'rede', v_pode_rede,
        'lojas', coalesce((
          select jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome) order by u.nome)
          from public.unidades u
          where u.status = 'ativa' and u.id in (select privado.unidades_com_permissao('conta_pagar.gerir'))), '[]'::jsonb))
    )
  );
end;
$$;
revoke all on function public.contas_a_pagar_resumo(uuid, boolean) from public, anon;
grant execute on function public.contas_a_pagar_resumo(uuid, boolean) to authenticated;
