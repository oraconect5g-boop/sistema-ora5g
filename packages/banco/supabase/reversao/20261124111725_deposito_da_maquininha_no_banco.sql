-- Reversão de 20261124111725_deposito_da_maquininha_no_banco (lote FIN-006a): volta ao que valia depois do PAY-011a. Os
-- depósitos casados se apagam e as linhas deles voltam a ficar "pendente" no extrato; as funções voltam às definições das
-- migrations 20261123121828 e 20261124082944. A auditoria guarda o histórico.
-- Primeiro os depósitos saem, com os gatilhos ainda no lugar: o de apagar solta cada linha (a regra de um uso só não deixa
-- soltar a linha de um depósito que ainda existe).
select set_config('ora.motivo', 'Reversão do FIN-006a: os depósitos das maquininhas saem, e as linhas deles voltam a ficar pendentes', true);
delete from public.maquininha_depositos;
drop trigger if exists maquininha_depositos_nao_muda on public.maquininha_depositos;
drop trigger if exists maquininha_depositos_solta_a_linha on public.maquininha_depositos;
drop trigger if exists maquininha_depositos_ocupa_a_linha on public.maquininha_depositos;
drop function if exists public.maquininha_depositos_painel(date, date);
drop function if exists public.maquininha_deposito_desfazer(text, date, text);
drop function if exists public.maquininha_deposito_casar(text, date, uuid, text);
drop function if exists privado.deposito_nao_muda();
drop function if exists privado.deposito_solta_a_linha();
drop function if exists privado.deposito_ocupa_a_linha();
drop function if exists privado.deposito_esperado(uuid, text, date);
drop function if exists privado.meios_da_maquininha(text);

drop table public.maquininha_depositos;
alter table public.extrato_linhas drop constraint extrato_linhas_situacao_check;
alter table public.extrato_linhas add constraint extrato_linhas_situacao_check
  check (situacao in ('pendente', 'conciliada', 'ignorada', 'repasse', 'estorno'));
comment on column public.extrato_linhas.situacao is
  'O uso da linha, um só (AUD-c e PAY-011a): pendente (livre), conciliada (o pagamento de uma venda), repasse (o recebimento de um repasse de marketplace), estorno (o débito do estorno de uma venda) ou ignorada (fora da conta, com motivo).';

-- As funções como eram (cópia das migrations de origem).
create or replace function privado.extrato_linha_um_uso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  casada boolean := exists (select 1 from public.marketplace_repasses r where r.linha_id = new.id);
begin
  if new.situacao = 'repasse' and not casada then
    raise exception 'A linha do extrato só fica como repasse casada com um repasse' using errcode = 'OR046';
  end if;
  if new.situacao <> 'repasse' and casada then
    raise exception 'Esta linha é o recebimento de um repasse de marketplace: desfaça o repasse antes' using errcode = 'OR046';
  end if;
  return new;
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
  -- AUD-c: a linha que é o recebimento de um repasse não concilia uma venda (a mesma trava de casar o repasse).
  if l.situacao = 'repasse' or exists (select 1 from public.marketplace_repasses r where r.linha_id = l.id) then
    raise exception 'Esta linha é o recebimento de um repasse de marketplace: desfaça o repasse antes' using errcode = 'OR046';
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
  v_repasse public.marketplace_repasses;
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
  -- As travas, sempre nesta ordem: o repasse (um por vez no mesmo canal e data) e depois a linha (a mesma trava de
  -- conciliar, tirar da conta e desfazer). O uso da linha é lido já com a trava.
  perform pg_advisory_xact_lock(hashtextextended('repasse:' || v_org::text || ':' || p_canal || ':' || p_data_repasse::text, 0));
  select * into v_linha from public.extrato_linhas l where l.id = p_linha and l.organizacao_id = v_org for update;
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
  select x.pedidos, x.esperado, x.estimados into v_pedidos, v_esperado, v_estimados from privado.repasse_esperado(v_org, p_canal, p_data_repasse) x;
  select * into v_repasse from public.marketplace_repasses r
  where r.organizacao_id = v_org and r.canal = p_canal and r.data_repasse = p_data_repasse;
  -- O mesmo pedido de novo (o toque repetido): devolve o que já está gravado, sem gravar outra vez.
  if v_repasse.id is not null and v_repasse.linha_id = v_linha.id then
    return jsonb_build_object('pedidos', v_repasse.pedidos, 'esperado', v_repasse.esperado_centavos, 'recebido', v_repasse.recebido_centavos,
      'diferenca', v_repasse.recebido_centavos - v_repasse.esperado_centavos, 'estimados', v_estimados, 'repetida', true);
  end if;
  if v_repasse.id is not null or exists (select 1 from public.marketplace_repasses r where r.linha_id = v_linha.id) then
    raise exception 'Esta linha já é de outro repasse, ou este repasse já tem linha: desfaça antes' using errcode = 'OR045';
  end if;
  if v_linha.situacao = 'conciliada' then
    raise exception 'Esta linha já está conciliada com o pagamento de uma venda: desfaça a conciliação antes' using errcode = 'OR046';
  end if;
  if v_linha.situacao <> 'pendente' then
    raise exception 'Esta linha está fora da conta: volte a linha para a conta antes' using errcode = 'OR046';
  end if;
  if v_pedidos = 0 then
    raise exception 'Nenhum pedido deste canal com esta data de repasse' using errcode = 'P0002';
  end if;
  if v_linha.valor_centavos <> v_esperado and v_motivo is null then
    raise exception 'O valor da linha não é o esperado do repasse: diga o motivo da diferença' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', coalesce(v_motivo, 'Repasse casado com o extrato do banco'), true);
  -- O gatilho do repasse marca a linha (situação "repasse").
  insert into public.marketplace_repasses (organizacao_id, canal, data_repasse, linha_id, pedidos, esperado_centavos, recebido_centavos, motivo, casado_por)
  values (v_org, p_canal, p_data_repasse, v_linha.id, v_pedidos, v_esperado, v_linha.valor_centavos, v_motivo, (select auth.uid()));
  return jsonb_build_object('pedidos', v_pedidos, 'esperado', v_esperado, 'recebido', v_linha.valor_centavos,
    'diferenca', v_linha.valor_centavos - v_esperado, 'estimados', v_estimados, 'repetida', false);
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
  -- AUD-c: a linha de um repasse não sai da conta com o repasse casado.
  if l.situacao = 'repasse' then
    raise exception 'Esta linha é o recebimento de um repasse de marketplace: desfaça o repasse antes' using errcode = 'OR046';
  end if;
  -- PAY-011a: o débito que é o estorno de uma venda já tem o uso dele.
  if l.situacao = 'estorno' then
    raise exception 'Este débito é o estorno de uma venda: ele já tem o uso dele' using errcode = 'OR046';
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
  -- AUD-c: a linha de um repasse só se solta desfazendo o repasse (lá a trava do repasse vem antes da linha; daqui, a
  -- ordem seria a inversa).
  if l.situacao = 'repasse' then
    raise exception 'Esta linha é o recebimento de um repasse de marketplace: desfaça o repasse na tela dos repasses' using errcode = 'OR046';
  end if;
  -- PAY-011a: o débito de um estorno. O que só guardou a prova de um estorno já confirmado se solta, com o motivo; o que
  -- confirmou o estorno fica (a confirmação não se desfaz, e a linha solta confirmaria outro estorno com o mesmo débito).
  if l.situacao = 'estorno' then
    if l.confirmou_o_estorno then
      raise exception 'Este débito confirmou o estorno de uma venda: a confirmação não se desfaz, e a linha fica como a prova dele' using errcode = 'OR047';
    end if;
    perform set_config('ora.motivo', format('Débito do extrato solto do estorno nº %s: %s',
      (select s.numero from public.estornos_externos s where s.id = l.estorno_id), v_motivo), true);
    update public.extrato_linhas x
    set situacao = 'pendente', estorno_id = null, confirmou_o_estorno = null, chargeback = null, decidida_por = null, decidida_em = null
    where x.id = l.id;
    return true;
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
    'ignoradas', count(*) filter (where l.situacao = 'ignorada'),
    'repasses', count(*) filter (where l.situacao = 'repasse'),
    'estornos', count(*) filter (where l.situacao = 'estorno'))
  from public.extrato_linhas l
  where l.extrato_id = p_extrato;
$$;

-- A coluna nova muda o retorno: a função é refeita.
drop function public.extratos_recentes(int);
create function public.extratos_recentes(p_limite int)
returns table (id uuid, numero bigint, unidade_id uuid, loja text, tipo text, fonte text, arquivo text, periodo_inicio date,
  periodo_fim date, linhas int, importado_em timestamptz, pendentes bigint, conciliadas bigint, ignoradas bigint, repasses bigint, estornos bigint)
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
    (select count(*) from public.extrato_linhas l where l.extrato_id = m.id and l.situacao = 'ignorada'),
    (select count(*) from public.extrato_linhas l where l.extrato_id = m.id and l.situacao = 'repasse'),
    (select count(*) from public.extrato_linhas l where l.extrato_id = m.id and l.situacao = 'estorno')
  from meus m
  left join public.unidades u on u.id = m.unidade_id
  order by m.importado_em desc;
$$;
revoke all on function public.extratos_recentes(int) from public, anon;
grant execute on function public.extratos_recentes(int) to authenticated;
