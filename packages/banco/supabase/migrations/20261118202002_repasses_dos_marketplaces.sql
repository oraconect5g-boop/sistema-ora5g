-- =============================================================================
-- Lote REPASSE-a (ORA-MKTPL-005 e ORA-MKTPL-008, o que o MKTPL-a deixou: o líquido recebido conferido com o extrato do
-- banco, com as divergências por repasse; o pedido do proprietário de 18/11/2026: "feche todas as outras pendências dos
-- outros setores"). Decisão: ADR-018, adendo de 18/11.
--
-- O canal (Mercado Livre, Shopee, TikTok Shop) junta os pedidos e paga de uma vez: o repasse. Aqui, o repasse é o conjunto
-- dos pedidos do mesmo canal com a mesma data de repasse, e o esperado é a soma do líquido deles (o do arquivo; sem ele, o
-- bruto menos as tarifas, o frete e os reembolsos, marcado como estimado, como no painel do MKTPL-a). O dinheiro cai no
-- banco numa linha de crédito do extrato (EXT-a). Casar é dizer "esta linha é este repasse":
--
--   * public.marketplace_repasses: o repasse casado com a linha do extrato, com o esperado e os pedidos no momento de
--     casar, o recebido (o valor da linha) e o motivo, obrigatório quando o recebido não é o esperado (a divergência fica
--     registrada). Uma linha casa com um repasse só, e um repasse com uma linha só;
--   * public.marketplace_repasses_painel(início, fim): os repasses do período (pela data do repasse), cada um com os
--     pedidos, o esperado, o casado (a linha, o extrato, o recebido e a diferença) e, se ainda não casou, as linhas de
--     crédito do extrato do banco que podem ser ele: do dia do repasse até 5 dias depois, ainda livres, o mesmo valor
--     primeiro; e os pedidos do período sem data de repasse;
--   * public.marketplace_repasse_casar e public.marketplace_repasse_desfazer: casar (com o motivo, se diverge) e desfazer
--     (sempre com o motivo; a auditoria guarda o que era).
-- Quem: quem vê o resultado da rede (os pedidos dos canais, resultado.ver) e concilia pela rede (o extrato do banco,
-- pagamento.conciliar): o dono. A linha do extrato não muda de situação: casar o repasse não é conciliar uma venda.
-- Códigos: OR045 a linha já é de outro repasse, ou o repasse já tem linha; P0002 a linha (de outra rede ou inexistente) ou os
-- pedidos do repasse não encontrados.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create table public.marketplace_repasses (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id),
  canal text not null check (canal in ('mercado_livre', 'shopee', 'tiktok_shop')),
  data_repasse date not null,
  linha_id uuid not null references public.extrato_linhas (id),
  pedidos int not null check (pedidos >= 1),
  esperado_centavos bigint not null check (abs(esperado_centavos) <= 100000000000),
  recebido_centavos bigint not null check (recebido_centavos between 1 and 100000000000),
  motivo text check (motivo is null or (length(motivo) between 3 and 200 and motivo = btrim(motivo))),
  casado_por uuid not null references public.perfis_usuario (id),
  casado_em timestamptz not null default now(),
  unique (organizacao_id, canal, data_repasse),
  unique (linha_id),
  constraint repasse_divergente_tem_motivo check (recebido_centavos = esperado_centavos or motivo is not null)
);
comment on table public.marketplace_repasses is
  'REPASSE-a: o repasse do canal (os pedidos com a mesma data de repasse) casado com a linha de crédito do extrato do banco; a divergência tem motivo.';
create index marketplace_repasses_casado_por_idx on public.marketplace_repasses (casado_por);
create trigger marketplace_repasses_auditar after insert or update or delete on public.marketplace_repasses
  for each row execute function privado.auditar_mudanca();

alter table public.marketplace_repasses enable row level security;
revoke all on public.marketplace_repasses from anon, authenticated;
grant select on public.marketplace_repasses to authenticated;
create policy marketplace_repasses_ler on public.marketplace_repasses for select to authenticated
  using (organizacao_id in (select privado.organizacoes_com_permissao('resultado.ver')));

-- O dono de um lado e do outro: os pedidos (resultado.ver) e o extrato do banco da rede (pagamento.conciliar).
create or replace function privado.repasses_da_rede()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o from privado.organizacoes_com_permissao('resultado.ver') o
  intersect
  select o from privado.organizacoes_com_permissao('pagamento.conciliar') o;
$$;
revoke all on function privado.repasses_da_rede() from public, anon;
grant execute on function privado.repasses_da_rede() to authenticated;

-- O esperado de um repasse agora: os pedidos e a soma do líquido (o do arquivo ou o estimado).
create or replace function privado.repasse_esperado(p_organizacao uuid, p_canal text, p_data date)
returns table (pedidos int, esperado bigint, estimados int)
language sql
stable
set search_path = ''
as $$
  select count(*)::int,
    coalesce(sum(coalesce(m.liquido_centavos, m.bruto_centavos - coalesce(m.tarifas_centavos, 0) - coalesce(m.frete_centavos, 0)
      - coalesce(m.reembolsos_centavos, 0))), 0)::bigint,
    (count(*) filter (where m.liquido_centavos is null))::int
  from public.marketplace_pedidos m
  where m.organizacao_id = p_organizacao and m.canal = p_canal and m.data_repasse = p_data;
$$;
revoke all on function privado.repasse_esperado(uuid, text, date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Casar e desfazer
-- -----------------------------------------------------------------------------
create or replace function public.marketplace_repasse_casar(p_canal text, p_data_repasse date, p_linha uuid, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := (select u.organizacao_id from public.unidades u where u.id = (select public.unidade_atual()));
  v_motivo text := nullif(regexp_replace(btrim(coalesce(p_motivo, '')), '\s+', ' ', 'g'), '');
  v_linha public.extrato_linhas;
  v_extrato public.extratos;
  v_pedidos int;
  v_esperado bigint;
  v_estimados int;
begin
  if v_org is null or v_org not in (select privado.repasses_da_rede()) then
    raise exception 'Só quem vê o resultado e concilia pela rede casa o repasse com o extrato' using errcode = '42501';
  end if;
  if p_canal is null or p_canal not in ('mercado_livre', 'shopee', 'tiktok_shop') or p_data_repasse is null then
    raise exception 'Escolha o canal e a data do repasse' using errcode = '22023';
  end if;
  if v_motivo is not null and length(v_motivo) not between 3 and 200 then
    raise exception 'O motivo tem de 3 a 200 letras' using errcode = '22023';
  end if;
  select * into v_linha from public.extrato_linhas l where l.id = p_linha and l.organizacao_id = v_org;
  if v_linha.id is null then
    raise exception 'Linha do extrato não encontrada' using errcode = 'P0002';
  end if;
  select * into v_extrato from public.extratos e where e.id = v_linha.extrato_id;
  if v_extrato.tipo <> 'banco' or v_extrato.unidade_id is not null then
    raise exception 'A linha tem de ser do extrato do banco da rede' using errcode = '22023';
  end if;
  if v_linha.valor_centavos <= 0 then
    raise exception 'O repasse é dinheiro que entra: escolha uma linha de crédito' using errcode = '22023';
  end if;
  -- Um repasse por vez no mesmo canal e data: o esperado é lido e gravado sem corrida.
  perform pg_advisory_xact_lock(hashtextextended('repasse:' || v_org::text || ':' || p_canal || ':' || p_data_repasse::text, 0));
  select x.pedidos, x.esperado, x.estimados into v_pedidos, v_esperado, v_estimados from privado.repasse_esperado(v_org, p_canal, p_data_repasse) x;
  if v_pedidos = 0 then
    raise exception 'Nenhum pedido deste canal com esta data de repasse' using errcode = 'P0002';
  end if;
  if v_linha.valor_centavos <> v_esperado and v_motivo is null then
    raise exception 'O valor da linha não é o esperado do repasse: diga o motivo da diferença' using errcode = '22023';
  end if;
  if exists (select 1 from public.marketplace_repasses r where r.linha_id = v_linha.id or (r.organizacao_id = v_org and r.canal = p_canal and r.data_repasse = p_data_repasse)) then
    raise exception 'Esta linha já é de outro repasse, ou este repasse já tem linha: desfaça antes' using errcode = 'OR045';
  end if;
  perform set_config('ora.motivo', coalesce(v_motivo, 'Repasse casado com o extrato do banco'), true);
  insert into public.marketplace_repasses (organizacao_id, canal, data_repasse, linha_id, pedidos, esperado_centavos, recebido_centavos, motivo, casado_por)
  values (v_org, p_canal, p_data_repasse, v_linha.id, v_pedidos, v_esperado, v_linha.valor_centavos, v_motivo, (select auth.uid()));
  return jsonb_build_object('pedidos', v_pedidos, 'esperado', v_esperado, 'recebido', v_linha.valor_centavos,
    'diferenca', v_linha.valor_centavos - v_esperado, 'estimados', v_estimados);
end;
$$;
revoke all on function public.marketplace_repasse_casar(text, date, uuid, text) from public, anon;
grant execute on function public.marketplace_repasse_casar(text, date, uuid, text) to authenticated;

create or replace function public.marketplace_repasse_desfazer(p_canal text, p_data_repasse date, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := (select u.organizacao_id from public.unidades u where u.id = (select public.unidade_atual()));
  v_motivo text := nullif(regexp_replace(btrim(coalesce(p_motivo, '')), '\s+', ' ', 'g'), '');
begin
  if v_org is null or v_org not in (select privado.repasses_da_rede()) then
    raise exception 'Só quem vê o resultado e concilia pela rede desfaz o repasse' using errcode = '42501';
  end if;
  if v_motivo is null or length(v_motivo) not between 3 and 200 then
    raise exception 'Informe o motivo de desfazer (de 3 a 200 letras)' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  delete from public.marketplace_repasses r where r.organizacao_id = v_org and r.canal = p_canal and r.data_repasse = p_data_repasse;
  return found;
end;
$$;
revoke all on function public.marketplace_repasse_desfazer(text, date, text) from public, anon;
grant execute on function public.marketplace_repasse_desfazer(text, date, text) to authenticated;

-- -----------------------------------------------------------------------------
-- O painel dos repasses
-- -----------------------------------------------------------------------------
-- Com as regras de leitura de quem chama (security invoker): os pedidos, os repasses e o extrato que a pessoa lê.
create or replace function public.marketplace_repasses_painel(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_org uuid := (select u.organizacao_id from public.unidades u where u.id = (select public.unidade_atual()));
  resultado jsonb;
begin
  if v_org is null or v_org not in (select privado.repasses_da_rede()) then
    raise exception 'Sem permissão para os repasses dos marketplaces' using errcode = '42501';
  end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio or p_fim - p_inicio > 400 then
    raise exception 'Período inválido (até 400 dias, como o painel dos marketplaces)' using errcode = '22023';
  end if;
  with
  repasses as (
    select m.canal, m.data_repasse, count(*)::int as pedidos,
      sum(coalesce(m.liquido_centavos, m.bruto_centavos - coalesce(m.tarifas_centavos, 0) - coalesce(m.frete_centavos, 0)
        - coalesce(m.reembolsos_centavos, 0)))::bigint as esperado,
      (count(*) filter (where m.liquido_centavos is null))::int as estimados
    from public.marketplace_pedidos m
    where m.organizacao_id = v_org and m.data_repasse between p_inicio and p_fim
    group by m.canal, m.data_repasse
  ),
  -- As linhas de crédito do extrato do banco da rede ainda livres (não são de nenhum repasse).
  livres as (
    select l.id, l.data, l.valor_centavos, l.descricao, e.numero as extrato
    from public.extrato_linhas l
    join public.extratos e on e.id = l.extrato_id
    where e.organizacao_id = v_org and e.tipo = 'banco' and e.unidade_id is null and l.valor_centavos > 0
      and l.data between p_inicio and p_fim + 5
      and not exists (select 1 from public.marketplace_repasses r where r.linha_id = l.id)
  )
  select jsonb_build_object(
    'repasses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'canal', x.canal, 'data_repasse', x.data_repasse, 'pedidos', x.pedidos, 'esperado', x.esperado, 'estimados', x.estimados,
        'casado', (
          select jsonb_build_object('linha', r.linha_id, 'extrato', e.numero, 'data', l.data, 'recebido', r.recebido_centavos,
            'esperado_ao_casar', r.esperado_centavos, 'pedidos_ao_casar', r.pedidos, 'motivo', r.motivo, 'casado_em', r.casado_em)
          from public.marketplace_repasses r
          join public.extrato_linhas l on l.id = r.linha_id
          join public.extratos e on e.id = l.extrato_id
          where r.organizacao_id = v_org and r.canal = x.canal and r.data_repasse = x.data_repasse),
        'sugestoes', coalesce((
          select jsonb_agg(jsonb_build_object('linha', s.id, 'extrato', s.extrato, 'data', s.data, 'valor', s.valor_centavos, 'descricao', s.descricao)
            order by (s.valor_centavos = x.esperado) desc, abs(s.valor_centavos - x.esperado), s.data, s.id)
          from (select * from livres f where f.data between x.data_repasse and x.data_repasse + 5
                order by (f.valor_centavos = x.esperado) desc, abs(f.valor_centavos - x.esperado), f.data limit 5) s), '[]'::jsonb)
      ) order by x.data_repasse desc, x.canal)
      from repasses x), '[]'::jsonb),
    'sem_data_de_repasse', (
      select count(*) from public.marketplace_pedidos m
      where m.organizacao_id = v_org and m.data between p_inicio and p_fim and m.data_repasse is null)
  ) into resultado;
  return resultado;
end;
$$;
comment on function public.marketplace_repasses_painel(date, date) is
  'REPASSE-a: os repasses dos marketplaces do período, cada um com o esperado, o casado com o extrato do banco (e a diferença) ou as linhas que podem ser ele; com as regras de leitura de quem chama.';
revoke all on function public.marketplace_repasses_painel(date, date) from public, anon;
grant execute on function public.marketplace_repasses_painel(date, date) to authenticated;
