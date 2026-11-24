-- Reversão de 20261124082944_debito_do_extrato_confirma_o_estorno (lote PAY-011a): volta ao que valia depois do AUD-c. O
-- débito ligado a um estorno volta a ficar "pendente" no extrato. ATENÇÃO: o estorno que um débito confirmou CONTINUA
-- confirmado (a confirmação não se desfaz), com a referência da linha no comprovante e na observação; só a ligação com a
-- linha se perde, e a auditoria guarda o histórico. As funções voltam às definições da migration 20261123121828.
drop trigger if exists extrato_linhas_de_estorno on public.extrato_linhas;
drop function if exists privado.extrato_linha_de_estorno();
drop function if exists public.extrato_casar_estorno(uuid, uuid, boolean);
drop function if exists public.extrato_estorno_chargeback(uuid, boolean, text);
drop function if exists public.extrato_sugestoes_de_estorno(uuid);

select set_config('ora.motivo', 'Reversão do PAY-011a: o débito ligado a um estorno volta a ficar pendente no extrato', true);
update public.extrato_linhas set situacao = 'pendente', estorno_id = null, confirmou_o_estorno = null, chargeback = null, decidida_por = null, decidida_em = null
where situacao = 'estorno';
drop index if exists public.extrato_linhas_um_estorno;
alter table public.extrato_linhas drop constraint linha_de_estorno;
alter table public.extrato_linhas drop column estorno_id, drop column confirmou_o_estorno, drop column chargeback;
alter table public.extrato_linhas drop constraint extrato_linhas_situacao_check;
alter table public.extrato_linhas add constraint extrato_linhas_situacao_check
  check (situacao in ('pendente', 'conciliada', 'ignorada', 'repasse'));
comment on column public.extrato_linhas.situacao is
  'AUD-c: o uso da linha, um só: pendente (livre), conciliada (o pagamento de uma venda), repasse (o recebimento de um repasse de marketplace) ou ignorada (fora da conta, com motivo).';

-- As funções como eram (cópia da migration 20261123121828).
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

-- O resumo do extrato (lido com a permissão de quem pede: o RLS das linhas), agora com as linhas de repasse.
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
    'repasses', count(*) filter (where l.situacao = 'repasse'))
  from public.extrato_linhas l
  where l.extrato_id = p_extrato;
$$;

-- A lista dos extratos de quem concilia, com as linhas por situação (a coluna nova muda o retorno: a função é refeita).
drop function public.extratos_recentes(int);
create function public.extratos_recentes(p_limite int)
returns table (id uuid, numero bigint, unidade_id uuid, loja text, tipo text, fonte text, arquivo text, periodo_inicio date,
  periodo_fim date, linhas int, importado_em timestamptz, pendentes bigint, conciliadas bigint, ignoradas bigint, repasses bigint)
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
    (select count(*) from public.extrato_linhas l where l.extrato_id = m.id and l.situacao = 'repasse')
  from meus m
  left join public.unidades u on u.id = m.unidade_id
  order by m.importado_em desc;
$$;
revoke all on function public.extratos_recentes(int) from public, anon;
grant execute on function public.extratos_recentes(int) to authenticated;
