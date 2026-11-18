-- =============================================================================
-- Lote CONNECT-c (ORA-CONNECT-009, "não iniciado" até aqui; a orientação do proprietário de 18/11: "ORA-CONNECT-009 não
-- pode ficar esquecido"; o movimento externo se liga ao registro interno, com confirmação e reconciliação): a
-- conciliação da produção da Ora Connect com os relatórios oficiais da Nogle.
--
-- A fonte é a documentação oficial (a coleção de 07/11): GET /relatorios/ativacoes e GET /relatorios/recargas, com
-- { data_de, data_ate, page } no corpo, devolvem a linha, o ICCID, o dia da operação, o plano e o valor. O worker lê cada
-- relatório (packages/dominio/src/nogle.ts, lerRelatorio) e entrega as linhas aqui; o banco liga cada uma à operação
-- local confirmada e registra o que não fecha:
--   * public.connect_conciliacoes: cada conciliação (o relatório, o período e os totais), lida por quem gere a Ora Connect
--     na rede (connect.gerir);
--   * public.connect_conciliacao_linhas: cada linha da Nogle, sem o nome nem o documento do cliente (minimização), com o
--     resultado: conferida, valor_diferente (ligada à operação, com outro valor), so_na_nogle (pode ser a renovação feita
--     pelo cliente, ou uma operação que não passou pela Ora) ou sem_identificacao (sem linha e sem ICCID);
--   * public.connect_conciliacao_so_aqui: as operações confirmadas na Ora, no período, que a Nogle não trouxe;
--   * public.connect_worker_registrar_conciliacao: só o worker (service_role) chama. A ligação procura a operação do mesmo
--     tipo, confirmada, da mesma rede, pelo ICCID ou pela linha (a do pedido ou a ativada), no mesmo dia ou no dia vizinho
--     (o fuso do relatório não é documentado), e cada operação se liga a uma linha só.
-- Fica de fora, com a dependência registrada: o extrato do saldo (o exemplo oficial não traz os campos da resposta) e as
-- comissões e bonificações (a Nogle respondeu em 10/11 que não há na API: a fonte oficial precisa ser indicada; D-016).
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create table public.connect_conciliacoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null references public.organizacoes (id),
  relatorio text not null check (relatorio in ('ativacoes', 'recargas')),
  de date not null,
  ate date not null,
  recebida_em timestamptz not null default now(),
  totais jsonb not null default '{}'::jsonb,
  constraint connect_conciliacoes_periodo check (ate >= de and ate - de <= 62)
);
comment on table public.connect_conciliacoes is
  'CONNECT-c (ORA-CONNECT-009): cada conciliação da produção com um relatório oficial da Nogle; gravada só pelo worker.';
create index connect_conciliacoes_organizacao on public.connect_conciliacoes (organizacao_id, recebida_em desc);

create table public.connect_conciliacao_linhas (
  conciliacao_id uuid not null references public.connect_conciliacoes (id),
  ordem int not null check (ordem between 1 and 100000),
  linha text check (linha is null or privado.linha_valida(linha)),
  iccid text check (iccid is null or iccid ~ '^89[0-9]{17,18}$'),
  dia date,
  plano text check (plano is null or length(plano) <= 120),
  valor_centavos bigint check (valor_centavos is null or valor_centavos >= 0),
  tipo_linha text check (tipo_linha is null or length(tipo_linha) <= 40),
  forma_pagto text check (forma_pagto is null or length(forma_pagto) <= 40),
  operacao_id uuid references public.connect_operacoes (id),
  resultado text not null check (resultado in ('conferida', 'valor_diferente', 'so_na_nogle', 'sem_identificacao')),
  primary key (conciliacao_id, ordem),
  constraint connect_conciliacao_linhas_ligacao check ((operacao_id is not null) = (resultado in ('conferida', 'valor_diferente')))
);
comment on table public.connect_conciliacao_linhas is
  'CONNECT-c: cada linha do relatório da Nogle, sem o nome nem o documento do cliente, ligada (ou não) à operação local.';
create index connect_conciliacao_linhas_operacao on public.connect_conciliacao_linhas (operacao_id);

create table public.connect_conciliacao_so_aqui (
  conciliacao_id uuid not null references public.connect_conciliacoes (id),
  operacao_id uuid not null references public.connect_operacoes (id),
  primary key (conciliacao_id, operacao_id)
);
comment on table public.connect_conciliacao_so_aqui is
  'CONNECT-c: as operações confirmadas na Ora, no período da conciliação, que o relatório da Nogle não trouxe.';
create index connect_conciliacao_so_aqui_operacao on public.connect_conciliacao_so_aqui (operacao_id);

create trigger connect_conciliacoes_auditar after insert or update on public.connect_conciliacoes
  for each row execute function privado.auditar_mudanca();

alter table public.connect_conciliacoes enable row level security;
alter table public.connect_conciliacao_linhas enable row level security;
alter table public.connect_conciliacao_so_aqui enable row level security;
revoke all on public.connect_conciliacoes, public.connect_conciliacao_linhas, public.connect_conciliacao_so_aqui from anon, authenticated;
revoke all on sequence public.connect_conciliacoes_numero_seq from anon, authenticated;
grant select on public.connect_conciliacoes, public.connect_conciliacao_linhas, public.connect_conciliacao_so_aqui to authenticated;
create policy connect_conciliacoes_ler on public.connect_conciliacoes for select to authenticated
  using (organizacao_id in (select privado.organizacoes_com_permissao('connect.gerir')));
create policy connect_conciliacao_linhas_ler on public.connect_conciliacao_linhas for select to authenticated
  using (conciliacao_id in (select c.id from public.connect_conciliacoes c));
create policy connect_conciliacao_so_aqui_ler on public.connect_conciliacao_so_aqui for select to authenticated
  using (conciliacao_id in (select c.id from public.connect_conciliacoes c));

-- -----------------------------------------------------------------------------
-- O registro de uma conciliação, pelo worker
-- -----------------------------------------------------------------------------
create or replace function public.connect_worker_registrar_conciliacao(p_organizacao uuid, p_relatorio text, p_de date, p_ate date, p_linhas jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tipo text;
  v_id uuid;
  v_numero bigint;
  v_linha jsonb;
  v_ordem int;
  v_l text;
  v_i text;
  v_dia date;
  v_valor bigint;
  v_op public.connect_operacoes;
  v_resultado text;
  v_usadas uuid[] := '{}';
  v_totais jsonb;
begin
  if p_organizacao is null or not exists (select 1 from public.organizacoes o where o.id = p_organizacao) then
    raise exception 'Rede desconhecida' using errcode = '22023';
  end if;
  if p_relatorio is null or p_relatorio not in ('ativacoes', 'recargas') then
    raise exception 'Relatório desconhecido: ativacoes ou recargas' using errcode = '22023';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 62 then
    raise exception 'Período inválido (até 62 dias)' using errcode = '22023';
  end if;
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) > 20000 then
    raise exception 'As linhas do relatório vêm numa lista (até 20.000)' using errcode = '22023';
  end if;
  v_tipo := case p_relatorio when 'ativacoes' then 'ativacao' else 'recarga' end;
  -- Uma conciliação de cada relatório por vez na rede: duas ao mesmo tempo não disputam as mesmas operações.
  perform pg_advisory_xact_lock(privado.trava_da_chave('connect_conciliacoes', p_organizacao, p_relatorio));
  perform set_config('ora.motivo', format('Conciliação com o relatório de %s da Nogle (%s a %s)', p_relatorio,
    to_char(p_de, 'DD/MM/YYYY'), to_char(p_ate, 'DD/MM/YYYY')), true);
  insert into public.connect_conciliacoes (organizacao_id, relatorio, de, ate)
  values (p_organizacao, p_relatorio, p_de, p_ate)
  returning id, numero into v_id, v_numero;

  for v_linha in select e from jsonb_array_elements(p_linhas) e loop
    if jsonb_typeof(v_linha) <> 'object' or coalesce(v_linha ->> 'ordem', '') !~ '^[0-9]{1,6}$'
       or (v_linha ? 'valor_centavos' and jsonb_typeof(v_linha -> 'valor_centavos') not in ('number', 'null'))
       or coalesce(v_linha ->> 'dia', '0000-01-01') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Linha do relatório em formato inválido' using errcode = '22023';
    end if;
    v_ordem := (v_linha ->> 'ordem')::int;
    v_l := nullif(regexp_replace(coalesce(v_linha ->> 'linha', ''), '[^0-9]', '', 'g'), '');
    v_i := nullif(regexp_replace(coalesce(v_linha ->> 'iccid', ''), '[^0-9]', '', 'g'), '');
    v_dia := (v_linha ->> 'dia')::date;
    v_valor := case when coalesce(v_linha ->> 'valor_centavos', '') ~ '^[0-9]{1,12}$' then (v_linha ->> 'valor_centavos')::bigint end;
    v_op := null;
    if v_l is null and v_i is null then
      v_resultado := 'sem_identificacao';
    else
      select * into v_op from public.connect_operacoes o
      where o.organizacao_id = p_organizacao and o.tipo = v_tipo and o.situacao = 'confirmada'
        and not (o.id = any (v_usadas))
        and ((v_i is not null and o.iccid = v_i)
             or (v_l is not null and (o.linha = v_l or regexp_replace(coalesce(o.numero_ativado, ''), '[^0-9]', '', 'g') = v_l)))
        and (v_dia is null or abs((o.concluida_em at time zone 'America/Sao_Paulo')::date - v_dia) <= 1)
      order by (v_i is not null and o.iccid = v_i) desc,
               abs((o.concluida_em at time zone 'America/Sao_Paulo')::date - coalesce(v_dia, (o.concluida_em at time zone 'America/Sao_Paulo')::date)),
               o.concluida_em, o.id
      limit 1;
      if v_op.id is null then
        v_resultado := 'so_na_nogle';
      else
        v_usadas := v_usadas || v_op.id;
        v_resultado := case when v_valor is not null and v_op.valor_face_centavos is not null and v_valor <> v_op.valor_face_centavos
                            then 'valor_diferente' else 'conferida' end;
      end if;
    end if;
    insert into public.connect_conciliacao_linhas (conciliacao_id, ordem, linha, iccid, dia, plano, valor_centavos, tipo_linha, forma_pagto,
                                                   operacao_id, resultado)
    values (v_id, v_ordem, v_l, v_i, v_dia, left(nullif(trim(v_linha ->> 'plano'), ''), 120), v_valor,
            left(nullif(trim(v_linha ->> 'tipo_linha'), ''), 40), left(nullif(trim(v_linha ->> 'forma_pagto'), ''), 40), v_op.id, v_resultado);
  end loop;

  insert into public.connect_conciliacao_so_aqui (conciliacao_id, operacao_id)
  select v_id, o.id from public.connect_operacoes o
  where o.organizacao_id = p_organizacao and o.tipo = v_tipo and o.situacao = 'confirmada'
    and (o.concluida_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
    and not (o.id = any (v_usadas));

  select jsonb_build_object(
      'linhas', count(*),
      'conferidas', count(*) filter (where l.resultado = 'conferida'),
      'valor_diferente', count(*) filter (where l.resultado = 'valor_diferente'),
      'so_na_nogle', count(*) filter (where l.resultado = 'so_na_nogle'),
      'sem_identificacao', count(*) filter (where l.resultado = 'sem_identificacao'))
    || jsonb_build_object('so_aqui', (select count(*) from public.connect_conciliacao_so_aqui s where s.conciliacao_id = v_id))
  into v_totais
  from public.connect_conciliacao_linhas l where l.conciliacao_id = v_id;
  update public.connect_conciliacoes c set totais = v_totais where c.id = v_id;
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'totais', v_totais);
end;
$$;
revoke all on function public.connect_worker_registrar_conciliacao(uuid, text, date, date, jsonb) from public, anon, authenticated;
grant execute on function public.connect_worker_registrar_conciliacao(uuid, text, date, date, jsonb) to service_role;
