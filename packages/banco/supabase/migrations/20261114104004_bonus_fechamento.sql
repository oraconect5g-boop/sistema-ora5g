-- =============================================================================
-- Fechamento do bônus por meta, lote L9b: ORA-PERF-002, 007 e 008 (decisão do proprietário de
-- 13/11/2026, D-014)
--
-- Decisões do proprietário: no fechamento do mês o GERENTE confere e pode contestar um item com motivo,
-- e o DONO aprova o pagamento; o mês aprovado não muda; devolução e cancelamento descontam no mês em
-- que acontecem (a regra de contagem 1: o que chega depois do fechamento cai no mês seguinte, nunca
-- no mês fechado, porque nenhum fato do sistema leva data passada).
--
-- Fluxo, por loja e mês (o mês tem de ter terminado):
--   1) quem confere o bônus da loja (bonus.conferir: o gerente, na loja dele, e o dono) envia o
--      fechamento: o banco apura de novo o mês (public.bonus_do_mes) e grava a apuração inteira (as
--      regras e, de cada vendedor, as metas, o realizado, a faixa e o bônus), uma linha por vendedor e
--      as contestações (motivo de 3 a 300 letras). Os totais que a tela mostrou vão junto: se o banco
--      apurar outro número, recusa (confira de novo). Um fechamento por loja e mês;
--   2) o dono (bonus.aprovar) decide cada contestação (manter o valor ou pagar outro) e pode ajustar
--      qualquer linha; pagar outro valor pede motivo, que o vendedor vê. Ao aprovar, o valor de cada
--      vendedor fica gravado e nada mais muda (gatilhos): o fechamento só muda uma vez, na aprovação;
--   3) public.bonus_fechamento_do_mes (security invoker): a gestão da loja vê a apuração, as linhas e
--      as contestações; o vendedor, só a própria linha (o valor aprovado e o motivo do ajuste), nunca a
--      contestação nem o bônus dos colegas.
-- Nada se apaga; tudo auditado (gatilho, com o motivo).
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

do $$
begin
  perform set_config('ora.motivo', 'Fechamento do bônus: o gerente confere e o dono aprova (decisão do proprietário, 13/11/2026)', true);
  insert into public.permissoes (codigo, descricao, modulo) values
    ('bonus.conferir', 'Conferir o fechamento do bônus da loja e contestar com motivo', 'metas'),
    ('bonus.aprovar', 'Aprovar o pagamento do bônus do mês, com os ajustes', 'metas');
  insert into public.papel_permissoes (papel, permissao) values
    ('gerente', 'bonus.conferir'), ('dono', 'bonus.conferir'), ('dono', 'bonus.aprovar');
end;
$$;

-- A gestão do bônus da loja: quem confere, aprova, define ou acompanha as metas dela.
create or replace function privado.gestao_do_bonus(p_unidade uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.tem_permissao('bonus.conferir', p_unidade) or public.tem_permissao('bonus.aprovar', p_unidade)
      or public.tem_permissao('metas.gerir', p_unidade) or public.tem_permissao('metas.ver_unidade', p_unidade);
$$;
revoke all on function privado.gestao_do_bonus(uuid) from public, anon;
grant execute on function privado.gestao_do_bonus(uuid) to authenticated;

-- O fechamento só muda uma vez, na aprovação. tg_argv[0]: a coluna que a aprovação preenche (vazia
-- antes, preenchida depois); tg_argv: as únicas colunas que podem mudar. O resto fica como o envio gravou.
create or replace function privado.bonus_so_aprovacao()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_antes jsonb := to_jsonb(old);
  v_depois jsonb := to_jsonb(new);
begin
  if v_antes ->> tg_argv[0] is not null or v_depois ->> tg_argv[0] is null
     or (v_antes - tg_argv) is distinct from (v_depois - tg_argv) then
    raise exception 'O fechamento do bônus só muda uma vez, na aprovação do dono' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function privado.bonus_so_aprovacao() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1. O fechamento de cada loja e mês, as linhas por vendedor e as contestações
-- -----------------------------------------------------------------------------
create table public.bonus_fechamentos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  unidade_id uuid not null,
  mes date not null check (extract(day from mes) = 1),
  situacao text not null default 'enviado' check (situacao in ('enviado', 'aprovado')),
  -- A resposta de public.bonus_do_mes no envio, inteira: regras, metas, realizado, faixas e bônus.
  apuracao jsonb not null check (jsonb_typeof(apuracao) = 'object'),
  total_calculado bigint not null check (total_calculado >= 0),
  total_aprovado bigint check (total_aprovado >= 0),
  enviado_por uuid not null references public.perfis_usuario (id),
  enviado_em timestamptz not null default now(),
  aprovado_por uuid references public.perfis_usuario (id),
  aprovado_em timestamptz,
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  -- Um fechamento por loja e mês (a loja já determina a organização; a chave começa pelas colunas da
  -- chave estrangeira, que fica coberta pelo mesmo índice).
  constraint bonus_fechamento_um_por_mes unique (unidade_id, organizacao_id, mes),
  constraint bonus_fechamento_aprovado check (
    (situacao = 'aprovado') = (aprovado_em is not null)
    and (aprovado_em is null) = (aprovado_por is null)
    and (aprovado_em is null) = (total_aprovado is null))
);
create index bonus_fechamentos_mes on public.bonus_fechamentos (organizacao_id, mes, situacao);
create index bonus_fechamentos_enviado_por on public.bonus_fechamentos (enviado_por);
create index bonus_fechamentos_aprovado_por on public.bonus_fechamentos (aprovado_por);
create trigger bonus_fechamentos_so_aprovacao before update on public.bonus_fechamentos
  for each row execute function privado.bonus_so_aprovacao('aprovado_em', 'situacao', 'total_aprovado', 'aprovado_por');
create trigger bonus_fechamentos_sem_remocao before delete on public.bonus_fechamentos
  for each row execute function privado.so_insercao();
create trigger bonus_fechamentos_sem_truncate before truncate on public.bonus_fechamentos
  for each statement execute function privado.so_insercao();
create trigger bonus_fechamentos_auditar after insert or update on public.bonus_fechamentos
  for each row execute function privado.auditar_mudanca();

-- Uma linha por vendedor da apuração. A loja e o mês repetem os do fechamento (o RLS do vendedor
-- confere a própria linha sem ler o fechamento, que é só da gestão).
create table public.bonus_fechamento_linhas (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references public.bonus_fechamentos (id),
  vendedor_id uuid not null references public.perfis_usuario (id),
  organizacao_id uuid not null,
  unidade_id uuid not null,
  mes date not null check (extract(day from mes) = 1),
  total_calculado bigint not null check (total_calculado >= 0),
  -- Até R$ 400.000,00: as quatro medidas na faixa mais alta permitida.
  total_aprovado bigint check (total_aprovado between 0 and 40000000),
  ajuste_motivo text check (ajuste_motivo is null or length(ajuste_motivo) between 3 and 300),
  aprovado_em timestamptz,
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  constraint bonus_linha_uma_por_vendedor unique (fechamento_id, vendedor_id),
  constraint bonus_linha_aprovada check ((total_aprovado is null) = (aprovado_em is null)),
  -- Pagar outro valor que não o calculado sempre tem motivo; pagar o calculado, nunca.
  constraint bonus_linha_ajuste check (
    (total_aprovado is null and ajuste_motivo is null)
    or (total_aprovado is not null and (total_aprovado = total_calculado) = (ajuste_motivo is null)))
);
create index bonus_fechamento_linhas_vendedor on public.bonus_fechamento_linhas (vendedor_id, mes);
create index bonus_fechamento_linhas_unidade on public.bonus_fechamento_linhas (unidade_id, organizacao_id, mes);
create trigger bonus_fechamento_linhas_so_aprovacao before update on public.bonus_fechamento_linhas
  for each row execute function privado.bonus_so_aprovacao('aprovado_em', 'total_aprovado', 'ajuste_motivo');
create trigger bonus_fechamento_linhas_sem_remocao before delete on public.bonus_fechamento_linhas
  for each row execute function privado.so_insercao();
create trigger bonus_fechamento_linhas_sem_truncate before truncate on public.bonus_fechamento_linhas
  for each statement execute function privado.so_insercao();
create trigger bonus_fechamento_linhas_auditar after insert or update on public.bonus_fechamento_linhas
  for each row execute function privado.auditar_mudanca();

-- A contestação de uma linha pela gerência e a decisão do dono. Só a gestão lê.
create table public.bonus_contestacoes (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null,
  vendedor_id uuid not null,
  organizacao_id uuid not null,
  unidade_id uuid not null,
  motivo text not null check (length(motivo) between 3 and 300),
  contestada_por uuid not null references public.perfis_usuario (id),
  contestada_em timestamptz not null default now(),
  decisao text check (decisao in ('mantido', 'ajustado')),
  resposta text check (resposta is null or length(resposta) between 3 and 300),
  decidida_por uuid references public.perfis_usuario (id),
  decidida_em timestamptz,
  foreign key (fechamento_id, vendedor_id) references public.bonus_fechamento_linhas (fechamento_id, vendedor_id),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  constraint bonus_contestacao_uma_por_linha unique (fechamento_id, vendedor_id),
  constraint bonus_contestacao_decidida check (
    (decisao is null) = (decidida_em is null) and (decidida_em is null) = (decidida_por is null)
    and (decisao is not null or resposta is null))
);
create index bonus_contestacoes_unidade on public.bonus_contestacoes (unidade_id, organizacao_id);
create index bonus_contestacoes_contestada_por on public.bonus_contestacoes (contestada_por);
create index bonus_contestacoes_decidida_por on public.bonus_contestacoes (decidida_por);
create trigger bonus_contestacoes_so_aprovacao before update on public.bonus_contestacoes
  for each row execute function privado.bonus_so_aprovacao('decidida_em', 'decisao', 'resposta', 'decidida_por');
create trigger bonus_contestacoes_sem_remocao before delete on public.bonus_contestacoes
  for each row execute function privado.so_insercao();
create trigger bonus_contestacoes_sem_truncate before truncate on public.bonus_contestacoes
  for each statement execute function privado.so_insercao();
create trigger bonus_contestacoes_auditar after insert or update on public.bonus_contestacoes
  for each row execute function privado.auditar_mudanca();

alter table public.bonus_fechamentos enable row level security;
alter table public.bonus_fechamento_linhas enable row level security;
alter table public.bonus_contestacoes enable row level security;
revoke all on public.bonus_fechamentos, public.bonus_fechamento_linhas, public.bonus_contestacoes from anon, authenticated;
grant select on public.bonus_fechamentos, public.bonus_fechamento_linhas, public.bonus_contestacoes to authenticated;
create policy bonus_fechamentos_ler on public.bonus_fechamentos for select to authenticated
  using ((select privado.gestao_do_bonus(unidade_id)));
-- O vendedor lê a própria linha (o valor aprovado e o motivo do ajuste); a gestão, todas.
create policy bonus_fechamento_linhas_ler on public.bonus_fechamento_linhas for select to authenticated
  using ((select privado.gestao_do_bonus(unidade_id))
         or (vendedor_id = (select auth.uid()) and (select public.tem_permissao('metas.ver_propria', unidade_id))));
create policy bonus_contestacoes_ler on public.bonus_contestacoes for select to authenticated
  using ((select privado.gestao_do_bonus(unidade_id)));

-- -----------------------------------------------------------------------------
-- 2. Enviar o fechamento (a gerência confere e contesta)
-- -----------------------------------------------------------------------------
-- p_totais: {"vendedor_id": total em centavos} de cada linha que a tela mostrou. p_contestacoes:
-- {"vendedor_id": "motivo"} ou null. Devolve o id do fechamento.
create or replace function public.bonus_fechamento_enviar(p_mes date, p_unidade uuid, p_totais jsonb, p_contestacoes jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_este_mes date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_contestacoes jsonb := coalesce(p_contestacoes, '{}'::jsonb);
  v_org uuid;
  v_apuracao jsonb;
  v_vendedores jsonb;
  v_item record;
  v_motivo text;
  v_id uuid;
begin
  if p_unidade is null or not public.tem_permissao('bonus.conferir', p_unidade) then
    raise exception 'Sem permissão para conferir o bônus desta loja' using errcode = '42501';
  end if;
  if p_mes is null or v_mes >= v_este_mes then
    raise exception 'O mês ainda não terminou: o fechamento abre no dia 1º do mês seguinte' using errcode = '22023';
  end if;
  if p_totais is null or jsonb_typeof(p_totais) <> 'object' or jsonb_typeof(v_contestacoes) <> 'object' then
    raise exception 'Envie os totais conferidos e as contestações' using errcode = '22023';
  end if;
  select u.organizacao_id into v_org from public.unidades u where u.id = p_unidade;

  -- Um envio por vez na loja e no mês.
  perform pg_advisory_xact_lock(hashtextextended('bonus_fechamento:' || p_unidade::text || ':' || v_mes::text, 0));
  if exists (select 1 from public.bonus_fechamentos f where f.unidade_id = p_unidade and f.mes = v_mes) then
    raise exception 'O fechamento deste mês já foi enviado' using errcode = '22023';
  end if;

  -- A apuração é a de sempre (public.bonus_do_mes), feita de novo agora, com a loja inteira.
  v_apuracao := public.bonus_do_mes(v_mes, p_unidade);
  v_vendedores := v_apuracao -> 'vendedores';
  if v_apuracao -> 'regras' = '{}'::jsonb then
    raise exception 'Nenhuma regra de bônus valia neste mês: não há o que fechar' using errcode = '22023';
  end if;
  if jsonb_array_length(v_vendedores) = 0 then
    raise exception 'Ninguém teve meta ou venda neste mês: não há o que fechar' using errcode = '22023';
  end if;
  -- O que a gerência conferiu na tela tem de ser o que o banco apurou agora.
  if (select jsonb_object_agg(x ->> 'vendedor_id', (x ->> 'total')::bigint) from jsonb_array_elements(v_vendedores) x) is distinct from p_totais then
    raise exception 'Os números do mês mudaram desde que a tela abriu: confira de novo' using errcode = '22023';
  end if;
  for v_item in select e.key, e.value from jsonb_each(v_contestacoes) e loop
    if not exists (select 1 from jsonb_array_elements(v_vendedores) x where x ->> 'vendedor_id' = v_item.key) then
      raise exception 'Contestação de quem não está no fechamento' using errcode = '22023';
    end if;
    v_motivo := case when jsonb_typeof(v_item.value) = 'string' then regexp_replace(trim(v_item.value #>> '{}'), '\s+', ' ', 'g') end;
    if v_motivo is null or length(v_motivo) not between 3 and 300 then
      raise exception 'Cada contestação tem um motivo de 3 a 300 letras' using errcode = '22023';
    end if;
  end loop;

  perform set_config('ora.motivo', 'Fechamento do bônus de ' || to_char(v_mes, 'MM/YYYY') || ' enviado para a aprovação do dono', true);
  insert into public.bonus_fechamentos (organizacao_id, unidade_id, mes, apuracao, total_calculado, enviado_por)
  values (v_org, p_unidade, v_mes, v_apuracao,
          (select coalesce(sum((x ->> 'total')::bigint), 0) from jsonb_array_elements(v_vendedores) x), (select auth.uid()))
  returning id into v_id;
  insert into public.bonus_fechamento_linhas (fechamento_id, vendedor_id, organizacao_id, unidade_id, mes, total_calculado)
  select v_id, (x ->> 'vendedor_id')::uuid, v_org, p_unidade, v_mes, (x ->> 'total')::bigint
  from jsonb_array_elements(v_vendedores) x;
  insert into public.bonus_contestacoes (fechamento_id, vendedor_id, organizacao_id, unidade_id, motivo, contestada_por)
  select v_id, e.key::uuid, v_org, p_unidade, regexp_replace(trim(e.value #>> '{}'), '\s+', ' ', 'g'), (select auth.uid())
  from jsonb_each(v_contestacoes) e;
  return v_id;
end;
$$;
revoke all on function public.bonus_fechamento_enviar(date, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.bonus_fechamento_enviar(date, uuid, jsonb, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Aprovar o pagamento (o dono decide as contestações e os ajustes)
-- -----------------------------------------------------------------------------
-- p_decisoes: {"vendedor_id": {"decisao": "manter", "motivo": opcional} ou {"decisao": "ajustar",
-- "valor": centavos, "motivo": "..."}}. Toda linha contestada precisa de decisão; as outras, só se o
-- dono quiser pagar outro valor. Devolve o total aprovado.
create or replace function public.bonus_fechamento_aprovar(p_fechamento uuid, p_decisoes jsonb)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_f public.bonus_fechamentos;
  v_decisoes jsonb := coalesce(p_decisoes, '{}'::jsonb);
  v_item record;
  v_calculado bigint;
  v_motivo text;
  v_total bigint;
begin
  select * into v_f from public.bonus_fechamentos f where f.id = p_fechamento for update;
  if v_f.id is null or not public.tem_permissao('bonus.aprovar', v_f.unidade_id) then
    raise exception 'Só o dono aprova o pagamento do bônus' using errcode = '42501';
  end if;
  if v_f.situacao = 'aprovado' then
    raise exception 'Este fechamento já foi aprovado' using errcode = '22023';
  end if;
  if jsonb_typeof(v_decisoes) <> 'object' then
    raise exception 'Cada decisão é manter o valor ou pagar outro' using errcode = '22023';
  end if;
  for v_item in select e.key, e.value from jsonb_each(v_decisoes) e loop
    select l.total_calculado into v_calculado from public.bonus_fechamento_linhas l
    where l.fechamento_id = v_f.id and l.vendedor_id::text = v_item.key;
    if not found then
      raise exception 'Decisão de quem não está no fechamento' using errcode = '22023';
    end if;
    if jsonb_typeof(v_item.value) <> 'object' or v_item.value ->> 'decisao' is null
       or v_item.value ->> 'decisao' not in ('manter', 'ajustar')
       or exists (select 1 from jsonb_object_keys(v_item.value) k where k not in ('decisao', 'valor', 'motivo')) then
      raise exception 'Cada decisão é manter o valor ou pagar outro' using errcode = '22023';
    end if;
    if v_item.value ? 'motivo' and jsonb_typeof(v_item.value -> 'motivo') <> 'string' then
      raise exception 'O motivo tem de 3 a 300 letras' using errcode = '22023';
    end if;
    v_motivo := nullif(regexp_replace(trim(coalesce(v_item.value ->> 'motivo', '')), '\s+', ' ', 'g'), '');
    if v_motivo is not null and length(v_motivo) not between 3 and 300 then
      raise exception 'O motivo tem de 3 a 300 letras' using errcode = '22023';
    end if;
    if v_item.value ->> 'decisao' = 'manter' then
      if v_item.value ? 'valor' then
        raise exception 'Cada decisão é manter o valor ou pagar outro' using errcode = '22023';
      end if;
    else
      if jsonb_typeof(v_item.value -> 'valor') is distinct from 'number' or (v_item.value ->> 'valor') !~ '^[0-9]{1,8}$'
         or (v_item.value ->> 'valor')::bigint > 40000000 then
        raise exception 'O valor a pagar vai de R$ 0,00 a R$ 400.000,00' using errcode = '22023';
      end if;
      if (v_item.value ->> 'valor')::bigint = v_calculado then
        raise exception 'Para pagar o valor calculado, escolha manter' using errcode = '22023';
      end if;
      if v_motivo is null then
        raise exception 'Diga o motivo de pagar outro valor: o vendedor vê' using errcode = '22023';
      end if;
    end if;
  end loop;
  if exists (select 1 from public.bonus_contestacoes c where c.fechamento_id = v_f.id and not (v_decisoes ? c.vendedor_id::text)) then
    raise exception 'Decida cada contestação: manter o valor ou pagar outro' using errcode = '22023';
  end if;

  perform set_config('ora.motivo', 'Pagamento do bônus de ' || to_char(v_f.mes, 'MM/YYYY') || ' aprovado pelo dono', true);
  update public.bonus_fechamento_linhas l
  set total_aprovado = case when v_decisoes -> l.vendedor_id::text ->> 'decisao' = 'ajustar'
                            then (v_decisoes -> l.vendedor_id::text ->> 'valor')::bigint else l.total_calculado end,
      ajuste_motivo = case when v_decisoes -> l.vendedor_id::text ->> 'decisao' = 'ajustar'
                           then regexp_replace(trim(v_decisoes -> l.vendedor_id::text ->> 'motivo'), '\s+', ' ', 'g') end,
      aprovado_em = now()
  where l.fechamento_id = v_f.id;
  update public.bonus_contestacoes c
  set decisao = case when v_decisoes -> c.vendedor_id::text ->> 'decisao' = 'ajustar' then 'ajustado' else 'mantido' end,
      resposta = nullif(regexp_replace(trim(coalesce(v_decisoes -> c.vendedor_id::text ->> 'motivo', '')), '\s+', ' ', 'g'), ''),
      decidida_por = (select auth.uid()),
      decidida_em = now()
  where c.fechamento_id = v_f.id;
  v_total := (select coalesce(sum(l.total_aprovado), 0) from public.bonus_fechamento_linhas l where l.fechamento_id = v_f.id);
  update public.bonus_fechamentos f
  set situacao = 'aprovado', total_aprovado = v_total, aprovado_por = (select auth.uid()), aprovado_em = now()
  where f.id = v_f.id;
  return v_total;
end;
$$;
revoke all on function public.bonus_fechamento_aprovar(uuid, jsonb) from public, anon;
grant execute on function public.bonus_fechamento_aprovar(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Ler o fechamento de uma loja no mês
-- -----------------------------------------------------------------------------
-- {mes, unidade_id, fechamento (só a gestão; null se ainda não foi enviado), linhas (a gestão, todas; o
-- vendedor, a própria; cada uma com a contestação, que só a gestão lê)}.
create or replace function public.bonus_fechamento_do_mes(p_mes date, p_unidade uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_f public.bonus_fechamentos;
begin
  if p_mes is null or p_unidade is null then
    raise exception 'Informe o mês e a loja' using errcode = '22023';
  end if;
  if not (privado.gestao_do_bonus(p_unidade) or public.tem_permissao('metas.ver_propria', p_unidade)) then
    raise exception 'Sem permissão para ver o fechamento do bônus desta loja' using errcode = '42501';
  end if;
  select * into v_f from public.bonus_fechamentos f where f.unidade_id = p_unidade and f.mes = v_mes;
  return jsonb_build_object(
    'mes', to_char(v_mes, 'YYYY-MM-DD'),
    'unidade_id', p_unidade,
    'fechamento', case when v_f.id is not null then jsonb_build_object(
      'id', v_f.id, 'situacao', v_f.situacao, 'apuracao', v_f.apuracao,
      'total_calculado', v_f.total_calculado, 'total_aprovado', v_f.total_aprovado,
      'enviado_por', v_f.enviado_por, 'enviado_em', v_f.enviado_em,
      'aprovado_por', v_f.aprovado_por, 'aprovado_em', v_f.aprovado_em) end,
    'linhas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'vendedor_id', l.vendedor_id, 'total_calculado', l.total_calculado, 'total_aprovado', l.total_aprovado,
        'ajuste_motivo', l.ajuste_motivo, 'aprovado_em', l.aprovado_em,
        'contestacao', (
          select jsonb_build_object('motivo', c.motivo, 'contestada_em', c.contestada_em, 'decisao', c.decisao,
                                    'resposta', c.resposta, 'decidida_em', c.decidida_em)
          from public.bonus_contestacoes c where c.fechamento_id = l.fechamento_id and c.vendedor_id = l.vendedor_id))
        order by l.total_calculado desc, l.vendedor_id)
      from public.bonus_fechamento_linhas l where l.unidade_id = p_unidade and l.mes = v_mes), '[]'::jsonb)
  );
end;
$$;
comment on function public.bonus_fechamento_do_mes(date, uuid) is
  'Fechamento do bônus (L9b): a apuração gravada no envio, as linhas por vendedor (valor calculado e aprovado, motivo do ajuste) e as contestações, com as regras de leitura de quem chama (security invoker): o vendedor recebe só a própria linha, sem contestação.';
revoke all on function public.bonus_fechamento_do_mes(date, uuid) from public, anon;
grant execute on function public.bonus_fechamento_do_mes(date, uuid) to authenticated;
