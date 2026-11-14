-- =============================================================================
-- Repasse das financeiras: desfazer não reabre crédito de venda cancelada (correção da issue #83,
-- achado REV-PLAN-002)
--
-- Registrar o repasse, cancelar a venda e desfazer o repasse deixava a conta a receber "aberta" numa venda
-- cancelada, e um novo repasse era aceito: crédito exigível de uma venda que não existe mais. O cancelamento
-- só cancela a conta ainda aberta (a recebida fica recebida: a financeira pagou e o acerto do contrato
-- cancelado fica no estorno a confirmar). Agora:
--   * public.financeira_receber e public.financeira_desfazer_recebimento travam a venda antes da conta (a
--     mesma ordem do cancelamento): cancelamento e repasse ao mesmo tempo esperam um pelo outro e o estado
--     comercial lido não muda no meio;
--   * receber confere o estado comercial: venda cancelada ou pagamento financiado já estornado não recebe,
--     mesmo com a conta aberta;
--   * desfazer o repasse de venda cancelada deixa a conta cancelada (como teria ficado se o repasse não
--     tivesse sido registrado), nunca aberta; o registro desfeito fica na auditoria com o motivo;
--   * public.financeira_corrigir_recebimento (nova): corrige referência, valor e data de um repasse
--     registrado, com motivo, sem passar por "aberta" (o recebimento continua registrado, também na venda
--     cancelada);
--   * public.financeiras_a_receber: cada conta diz se a venda foi cancelada.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function public.financeira_receber(p_conta uuid, p_referencia text, p_valor_recebido bigint, p_recebido_em date)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c public.contas_a_receber;
  v_venda public.vendas;
  v_referencia text := regexp_replace(trim(coalesce(p_referencia, '')), '\s+', ' ', 'g');
begin
  -- #83: a venda primeiro (a mesma ordem do cancelamento, que trava a venda e depois a conta): o estado
  -- comercial lido aqui não muda até o fim, e cancelamento e repasse ao mesmo tempo esperam um pelo outro.
  select v.* into v_venda from public.vendas v where v.id = (select c.venda_id from public.contas_a_receber c where c.id = p_conta) for share;
  select * into v_c from public.contas_a_receber c where c.id = p_conta for no key update;
  if v_c.id is null or not public.tem_permissao('pagamento.conciliar', v_venda.unidade_id) then
    raise exception 'Conta a receber não encontrada para você' using errcode = 'P0002';
  end if;
  if v_c.situacao = 'cancelada' then
    raise exception 'Conta cancelada com a venda: não há o que receber' using errcode = '22023';
  end if;
  if v_c.situacao = 'aberta' and (v_venda.situacao = 'cancelada' or exists (
       select 1 from public.venda_pagamentos p where p.id = v_c.pagamento_id and p.situacao <> 'confirmado')) then
    raise exception 'Venda cancelada: não há o que receber da financeira' using errcode = '22023';
  end if;
  if length(v_referencia) not between 3 and 80 then
    raise exception 'Informe a referência do repasse (de 3 a 80 letras): código, lote ou linha do extrato' using errcode = '22023';
  end if;
  if p_valor_recebido is null or p_valor_recebido < 0 or p_valor_recebido > v_c.valor_centavos then
    raise exception 'Valor recebido entre zero e o valor a receber' using errcode = '22023';
  end if;
  if p_recebido_em is null or p_recebido_em < (v_venda.concluida_em at time zone 'America/Sao_Paulo')::date
     or p_recebido_em > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data do repasse vai do dia da venda até hoje' using errcode = '22023';
  end if;
  if v_c.situacao = 'recebida' then
    if v_c.referencia_recebimento = v_referencia and v_c.valor_recebido_centavos = p_valor_recebido and v_c.recebido_em = p_recebido_em then
      return false;
    end if;
    raise exception 'Recebimento já registrado: desfaça antes de mudar' using errcode = 'OR030';
  end if;
  perform set_config('ora.motivo', 'Repasse da financeira: ' || v_referencia, true);
  update public.contas_a_receber c
  set situacao = 'recebida', recebido_em = p_recebido_em, valor_recebido_centavos = p_valor_recebido,
      referencia_recebimento = v_referencia, registrado_por = (select auth.uid()), atualizado_em = now()
  where c.id = v_c.id;
  return true;
end;
$$;

create or replace function public.financeira_desfazer_recebimento(p_conta uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_c public.contas_a_receber;
  v_venda public.vendas;
  v_cancelada boolean;
begin
  -- #83: a venda primeiro, como no registro do repasse e no cancelamento.
  select v.* into v_venda from public.vendas v where v.id = (select c.venda_id from public.contas_a_receber c where c.id = p_conta) for share;
  select * into v_c from public.contas_a_receber c where c.id = p_conta for no key update;
  if v_c.id is null or not public.tem_permissao('pagamento.conciliar', v_venda.unidade_id) then
    raise exception 'Conta a receber não encontrada para você' using errcode = 'P0002';
  end if;
  if v_c.situacao <> 'recebida' then
    return false;
  end if;
  -- Venda cancelada (ou o pagamento financiado já estornado): desfazer não reabre crédito que ninguém deve.
  -- A conta fica cancelada, como teria ficado se o repasse não tivesse sido registrado; o registro desfeito
  -- fica na auditoria, com o motivo. Se o dinheiro caiu e só a referência estava errada, corrija o
  -- recebimento (financeira_corrigir_recebimento), que mantém a conta recebida.
  v_cancelada := v_venda.situacao = 'cancelada' or exists (
    select 1 from public.venda_pagamentos p where p.id = v_c.pagamento_id and p.situacao <> 'confirmado');
  perform set_config('ora.motivo', 'Recebimento da financeira desfeito: ' || v_motivo
    || case when v_cancelada then ' (venda cancelada: a conta fica cancelada)' else '' end, true);
  update public.contas_a_receber c
  set situacao = case when v_cancelada then 'cancelada' else 'aberta' end,
      recebido_em = null, valor_recebido_centavos = null, referencia_recebimento = null, registrado_por = null, atualizado_em = now()
  where c.id = v_c.id;
  return true;
end;
$$;

create or replace function public.financeira_corrigir_recebimento(
  p_conta uuid, p_referencia text, p_valor_recebido bigint, p_recebido_em date, p_motivo text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_c public.contas_a_receber;
  v_venda public.vendas;
  v_referencia text := regexp_replace(trim(coalesce(p_referencia, '')), '\s+', ' ', 'g');
begin
  select v.* into v_venda from public.vendas v where v.id = (select c.venda_id from public.contas_a_receber c where c.id = p_conta) for share;
  select * into v_c from public.contas_a_receber c where c.id = p_conta for no key update;
  if v_c.id is null or not public.tem_permissao('pagamento.conciliar', v_venda.unidade_id) then
    raise exception 'Conta a receber não encontrada para você' using errcode = 'P0002';
  end if;
  if v_c.situacao <> 'recebida' then
    raise exception 'Só se corrige um repasse já registrado' using errcode = '22023';
  end if;
  if length(v_referencia) not between 3 and 80 then
    raise exception 'Informe a referência do repasse (de 3 a 80 letras): código, lote ou linha do extrato' using errcode = '22023';
  end if;
  if p_valor_recebido is null or p_valor_recebido < 0 or p_valor_recebido > v_c.valor_centavos then
    raise exception 'Valor recebido entre zero e o valor a receber' using errcode = '22023';
  end if;
  if p_recebido_em is null or p_recebido_em < (v_venda.concluida_em at time zone 'America/Sao_Paulo')::date
     or p_recebido_em > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data do repasse vai do dia da venda até hoje' using errcode = '22023';
  end if;
  if v_c.referencia_recebimento = v_referencia and v_c.valor_recebido_centavos = p_valor_recebido and v_c.recebido_em = p_recebido_em then
    return false;
  end if;
  perform set_config('ora.motivo', 'Recebimento da financeira corrigido: ' || v_motivo, true);
  update public.contas_a_receber c
  set recebido_em = p_recebido_em, valor_recebido_centavos = p_valor_recebido, referencia_recebimento = v_referencia,
      registrado_por = (select auth.uid()), atualizado_em = now()
  where c.id = v_c.id;
  return true;
end;
$$;
revoke all on function public.financeira_corrigir_recebimento(uuid, text, bigint, date, text) from public, anon;
grant execute on function public.financeira_corrigir_recebimento(uuid, text, bigint, date, text) to authenticated;

create or replace function public.financeiras_a_receber()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_unidade is null or not public.tem_permissao('pagamento.conciliar', v_unidade) then
    raise exception 'Sem permissão para conciliar pagamentos nesta loja' using errcode = '42501';
  end if;
  return (
    with contas as (
      select c.*, v.numero as venda_numero, v.concluida_em, v.situacao = 'cancelada' as venda_cancelada,
        v_hoje - (v.concluida_em at time zone 'America/Sao_Paulo')::date as dias
      from public.contas_a_receber c
      join public.vendas v on v.id = c.venda_id
      where v.unidade_id = v_unidade
        and (c.situacao = 'aberta' or (c.situacao = 'recebida' and c.recebido_em >= v_hoje - 60))
    )
    select jsonb_build_object(
      'por_devedor', coalesce((
        select jsonb_agg(jsonb_build_object(
          'devedor', x.devedor, 'abertas', x.abertas, 'valor_aberto', x.valor_aberto, 'mais_antiga_dias', x.mais_antiga,
          'recebidas', x.recebidas, 'valor_recebido', x.valor_recebido, 'taxa_observada', x.taxa
        ) order by x.devedor)
        from (
          select c.devedor,
            count(*) filter (where c.situacao = 'aberta') as abertas,
            coalesce(sum(c.valor_centavos) filter (where c.situacao = 'aberta'), 0) as valor_aberto,
            max(c.dias) filter (where c.situacao = 'aberta') as mais_antiga,
            count(*) filter (where c.situacao = 'recebida') as recebidas,
            coalesce(sum(c.valor_recebido_centavos) filter (where c.situacao = 'recebida'), 0) as valor_recebido,
            coalesce(sum(c.valor_centavos - c.valor_recebido_centavos) filter (where c.situacao = 'recebida'), 0) as taxa
          from contas c group by c.devedor
        ) x), '[]'::jsonb),
      'contas', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id, 'venda_id', c.venda_id, 'venda_numero', c.venda_numero, 'concluida_em', c.concluida_em, 'devedor', c.devedor,
          'valor', c.valor_centavos, 'situacao', c.situacao, 'dias', c.dias, 'recebido_em', c.recebido_em,
          'valor_recebido', c.valor_recebido_centavos, 'referencia', c.referencia_recebimento, 'venda_cancelada', c.venda_cancelada
        ) order by (c.situacao = 'aberta') desc, c.concluida_em, c.id)
        from contas c), '[]'::jsonb)
    )
  );
end;
$$;
