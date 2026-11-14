-- Reversão de 20261114145505_financeiras_correcoes (só em banco sem dados reais).
-- Voltam os textos de financeira_receber, financeira_desfazer_recebimento e financeiras_a_receber do L7b
-- (20261114012722_financeiras_a_receber) e sai a correção do recebimento.
drop function if exists public.financeira_corrigir_recebimento(uuid, text, bigint, date, text);
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
  select * into v_c from public.contas_a_receber c where c.id = p_conta for no key update;
  select * into v_venda from public.vendas v where v.id = v_c.venda_id;
  if v_c.id is null or not public.tem_permissao('pagamento.conciliar', v_venda.unidade_id) then
    raise exception 'Conta a receber não encontrada para você' using errcode = 'P0002';
  end if;
  if v_c.situacao = 'cancelada' then
    raise exception 'Conta cancelada com a venda: não há o que receber' using errcode = '22023';
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
  v_unidade uuid;
begin
  select * into v_c from public.contas_a_receber c where c.id = p_conta for no key update;
  select v.unidade_id into v_unidade from public.vendas v where v.id = v_c.venda_id;
  if v_c.id is null or not public.tem_permissao('pagamento.conciliar', v_unidade) then
    raise exception 'Conta a receber não encontrada para você' using errcode = 'P0002';
  end if;
  if v_c.situacao <> 'recebida' then
    return false;
  end if;
  perform set_config('ora.motivo', 'Recebimento da financeira desfeito: ' || v_motivo, true);
  update public.contas_a_receber c
  set situacao = 'aberta', recebido_em = null, valor_recebido_centavos = null, referencia_recebimento = null, registrado_por = null, atualizado_em = now()
  where c.id = v_c.id;
  return true;
end;
$$;

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
      select c.*, v.numero as venda_numero, v.concluida_em,
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
          'valor_recebido', c.valor_recebido_centavos, 'referencia', c.referencia_recebimento
        ) order by (c.situacao = 'aberta') desc, c.concluida_em, c.id)
        from contas c), '[]'::jsonb)
    )
  );
end;
$$;
