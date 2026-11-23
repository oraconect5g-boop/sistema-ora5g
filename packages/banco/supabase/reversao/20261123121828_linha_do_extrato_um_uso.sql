-- Reversão de 20261123121828_linha_do_extrato_um_uso (lote AUD-c, achado F21-02): volta ao que valia antes. A linha casada
-- com um repasse volta a ficar "pendente" no extrato (o repasse casado continua em public.marketplace_repasses), e as
-- funções voltam às definições das migrations 20261117225818 e 20261118202002. ATENÇÃO: com isso volta também o defeito
-- (a mesma linha pode conciliar uma venda e ser de um repasse). Nada se apaga; a auditoria guarda o histórico.
drop trigger if exists marketplace_repasses_nao_muda_de_linha on public.marketplace_repasses;
drop trigger if exists marketplace_repasses_solta_a_linha on public.marketplace_repasses;
drop trigger if exists marketplace_repasses_ocupa_a_linha on public.marketplace_repasses;
drop trigger if exists extrato_linhas_um_uso on public.extrato_linhas;
drop function if exists privado.repasse_nao_muda_de_linha();
drop function if exists privado.repasse_solta_a_linha();
drop function if exists privado.repasse_ocupa_a_linha();
drop function if exists privado.extrato_linha_um_uso();

select set_config('ora.motivo', 'Reversão do AUD-c: a linha casada com um repasse volta a ficar pendente no extrato', true);
update public.extrato_linhas set situacao = 'pendente', decidida_por = null, decidida_em = null where situacao = 'repasse';
alter table public.extrato_linhas drop constraint extrato_linhas_situacao_check;
alter table public.extrato_linhas add constraint extrato_linhas_situacao_check check (situacao in ('pendente', 'conciliada', 'ignorada'));
comment on column public.extrato_linhas.situacao is null;

-- As funções como eram (cópia das migrations de origem).
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

create or replace function public.extrato_conciliar(p_linha uuid, p_pagamento uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l public.extrato_linhas;
  e public.extratos;
  v_venda public.vendas;
  v_pagamento public.venda_pagamentos;
  v_data date;
  v_liquido bigint;
begin
  select * into l from public.extrato_linhas x where x.id = p_linha for update;
  select * into e from public.extratos x where x.id = l.extrato_id;
  if l.id is null or not (select privado.extrato_e_meu(e.organizacao_id, e.unidade_id)) then
    raise exception 'Linha do extrato não encontrada para você' using errcode = '42501';
  end if;
  select * into v_pagamento from public.venda_pagamentos p where p.id = p_pagamento;
  select * into v_venda from public.vendas v where v.id = v_pagamento.venda_id;
  if v_pagamento.id is null or v_venda.organizacao_id <> e.organizacao_id or (e.unidade_id is not null and v_venda.unidade_id <> e.unidade_id)
     or not (select public.tem_permissao('pagamento.conciliar', v_venda.unidade_id)) then
    raise exception 'Pagamento não encontrado para você' using errcode = '42501';
  end if;
  if l.situacao = 'conciliada' and l.pagamento_id = p_pagamento then
    return jsonb_build_object('conciliada', true, 'repetida', true);
  end if;
  if l.situacao <> 'pendente' then
    raise exception 'Esta linha do extrato já foi decidida: desfaça antes' using errcode = '22023';
  end if;
  if not (v_pagamento.meio = any (e.meios)) then
    raise exception 'Este pagamento não é de um meio deste extrato' using errcode = '22023';
  end if;
  if l.valor_centavos <> v_pagamento.valor_centavos then
    raise exception 'O valor da linha não é o do pagamento' using errcode = '22023';
  end if;
  if exists (select 1 from public.extrato_linhas o where o.pagamento_id = p_pagamento and o.situacao = 'conciliada' and o.id <> l.id) then
    raise exception 'Este pagamento já está conciliado com outra linha de extrato' using errcode = '22023';
  end if;
  -- A data em que o dinheiro caiu: a do repasse (ou a da linha), nunca antes do dia da venda.
  v_data := greatest(coalesce(l.data_liquidacao, l.data), (v_venda.concluida_em at time zone 'America/Sao_Paulo')::date);
  if v_data > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'O dinheiro desta linha ainda não caiu: concilie no dia do repasse' using errcode = '22023';
  end if;
  v_liquido := coalesce(l.liquido_centavos, l.valor_centavos - coalesce(l.taxa_centavos, 0));
  -- A conciliação de sempre (L7a), com a referência (a da linha, ou o número do extrato e da linha), o líquido e a data.
  perform public.pagamento_conciliar(p_pagamento,
    case when length(l.referencia) >= 3 then l.referencia else format('Extrato %s, linha %s', e.numero, l.numero) end, v_liquido, v_data);
  update public.extrato_linhas x set situacao = 'conciliada', pagamento_id = p_pagamento, decidida_por = (select auth.uid()), decidida_em = now()
  where x.id = l.id;
  return jsonb_build_object('conciliada', true, 'repetida', false);
end;
$$;

create or replace function public.extrato_ignorar(p_linha uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  l public.extrato_linhas;
  e public.extratos;
begin
  select * into l from public.extrato_linhas x where x.id = p_linha for update;
  select * into e from public.extratos x where x.id = l.extrato_id;
  if l.id is null or not (select privado.extrato_e_meu(e.organizacao_id, e.unidade_id)) then
    raise exception 'Linha do extrato não encontrada para você' using errcode = '42501';
  end if;
  if l.situacao = 'ignorada' then
    return false;
  end if;
  if l.situacao <> 'pendente' then
    raise exception 'Esta linha está conciliada: desfaça antes' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', 'Linha do extrato fora da conta: ' || v_motivo, true);
  update public.extrato_linhas x set situacao = 'ignorada', motivo = left(v_motivo, 200), decidida_por = (select auth.uid()), decidida_em = now()
  where x.id = l.id;
  return true;
end;
$$;

create or replace function public.extrato_desfazer(p_linha uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  l public.extrato_linhas;
  e public.extratos;
  v_unidade uuid;
begin
  select * into l from public.extrato_linhas x where x.id = p_linha for update;
  select * into e from public.extratos x where x.id = l.extrato_id;
  if l.id is null or not (select privado.extrato_e_meu(e.organizacao_id, e.unidade_id)) then
    raise exception 'Linha do extrato não encontrada para você' using errcode = '42501';
  end if;
  if l.situacao = 'pendente' then
    return false;
  end if;
  if l.situacao = 'conciliada' then
    select v.unidade_id into v_unidade from public.venda_pagamentos p join public.vendas v on v.id = p.venda_id where p.id = l.pagamento_id;
    if not (select public.tem_permissao('pagamento.conciliar', v_unidade)) then
      raise exception 'Linha do extrato não encontrada para você' using errcode = '42501';
    end if;
    -- A conciliação de sempre desfaz o pagamento, e o gatilho devolve a linha (o update abaixo só pega o que sobrar).
    perform public.pagamento_desconciliar(l.pagamento_id, v_motivo);
  else
    perform set_config('ora.motivo', 'Linha do extrato de volta à conta: ' || v_motivo, true);
  end if;
  update public.extrato_linhas x set situacao = 'pendente', pagamento_id = null, motivo = null, decidida_por = null, decidida_em = null
  where x.id = l.id and x.situacao <> 'pendente';
  return true;
end;
$$;

create or replace function public.extrato_resumo(p_extrato uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'creditos', count(*) filter (where l.valor_centavos > 0),
    'creditos_centavos', coalesce(sum(l.valor_centavos) filter (where l.valor_centavos > 0), 0),
    'debitos', count(*) filter (where l.valor_centavos < 0),
    'debitos_centavos', coalesce(sum(-l.valor_centavos) filter (where l.valor_centavos < 0), 0),
    'taxas_centavos', coalesce(sum(l.taxa_centavos), 0),
    'liquido_centavos', coalesce(sum(coalesce(l.liquido_centavos, l.valor_centavos - coalesce(l.taxa_centavos, 0))), 0),
    'a_cair_centavos', coalesce(sum(coalesce(l.liquido_centavos, l.valor_centavos - coalesce(l.taxa_centavos, 0)))
      filter (where l.data_liquidacao > (now() at time zone 'America/Sao_Paulo')::date and l.valor_centavos > 0), 0),
    'pendentes', count(*) filter (where l.situacao = 'pendente'),
    'conciliadas', count(*) filter (where l.situacao = 'conciliada'),
    'ignoradas', count(*) filter (where l.situacao = 'ignorada'))
  from public.extrato_linhas l
  where l.extrato_id = p_extrato;
$$;

drop function if exists public.extratos_recentes(int);
create function public.extratos_recentes(p_limite int)
returns table (id uuid, numero bigint, unidade_id uuid, loja text, tipo text, fonte text, arquivo text, periodo_inicio date,
  periodo_fim date, linhas int, importado_em timestamptz, pendentes bigint, conciliadas bigint, ignoradas bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with meus as (
    select e.* from public.extratos e
    where e.organizacao_id in (select v.organizacao_id from privado.vinculos_vigentes() v)
      and privado.extrato_e_meu(e.organizacao_id, e.unidade_id)
    order by e.importado_em desc
    limit least(greatest(coalesce(p_limite, 50), 1), 200)
  )
  select m.id, m.numero, m.unidade_id, u.nome, m.tipo, m.fonte, m.arquivo, m.periodo_inicio, m.periodo_fim, m.linhas, m.importado_em,
    (select count(*) from public.extrato_linhas l where l.extrato_id = m.id and l.situacao = 'pendente'),
    (select count(*) from public.extrato_linhas l where l.extrato_id = m.id and l.situacao = 'conciliada'),
    (select count(*) from public.extrato_linhas l where l.extrato_id = m.id and l.situacao = 'ignorada')
  from meus m
  left join public.unidades u on u.id = m.unidade_id
  order by m.importado_em desc;
$$;
revoke all on function public.extratos_recentes(int) from public, anon;
grant execute on function public.extratos_recentes(int) to authenticated;
