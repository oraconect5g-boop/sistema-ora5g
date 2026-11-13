-- =============================================================================
-- Valores a receber das financeiras (lote L7b: ORA-PAY-003 e ORA-PAY-011, em parte)
--
-- A venda financiada (PayJoy, Aiva) já gera a conta a receber da financeira na conclusão
-- (public.contas_a_receber, "aberta"; "cancelada" com a venda). Faltava registrar que a financeira
-- pagou. Sem integração nem relatório de repasse (E2), o registro é manual, como a conciliação de
-- cartão e Pix do L7a: quem concilia (pagamento.conciliar na loja da venda: dono e gerente) confere o
-- extrato e informa a referência, o valor que caiu e a data; a diferença para o valor a receber é a
-- taxa da financeira. Desfazer pede motivo. Tudo auditado (gatilho da tabela, com o motivo).
--
-- 1) contas_a_receber: recebido_em, valor_recebido_centavos, referencia_recebimento e registrado_por,
--    todos juntos e só na conta "recebida"; o valor recebido vai de zero ao valor a receber.
-- 2) public.financeira_receber: registra o repasse (repetir com os mesmos dados não muda nada).
-- 3) public.financeira_desfazer_recebimento: volta a conta para "aberta", com motivo.
-- 4) public.financeiras_a_receber: as contas da loja do turno (todas as abertas e as recebidas nos
--    últimos 60 dias), com os dias desde a venda e os totais por financeira.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

alter table public.contas_a_receber add column recebido_em date;
alter table public.contas_a_receber add column valor_recebido_centavos bigint;
alter table public.contas_a_receber add column referencia_recebimento text;
alter table public.contas_a_receber add column registrado_por uuid references public.perfis_usuario (id);
alter table public.contas_a_receber add constraint recebimento_completo check (
  (situacao = 'recebida') = (recebido_em is not null)
  and (recebido_em is null) = (valor_recebido_centavos is null)
  and (recebido_em is null) = (referencia_recebimento is null)
  and (recebido_em is null) = (registrado_por is null));
alter table public.contas_a_receber add constraint recebido_ate_o_valor
  check (valor_recebido_centavos is null or valor_recebido_centavos between 0 and valor_centavos);
create index contas_a_receber_registrado_por on public.contas_a_receber (registrado_por);

-- -----------------------------------------------------------------------------
-- Registrar o repasse da financeira
-- -----------------------------------------------------------------------------
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
revoke all on function public.financeira_receber(uuid, text, bigint, date) from public, anon;
grant execute on function public.financeira_receber(uuid, text, bigint, date) to authenticated;

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
revoke all on function public.financeira_desfazer_recebimento(uuid, text) from public, anon;
grant execute on function public.financeira_desfazer_recebimento(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- As contas da loja do turno: todas as abertas e as recebidas nos últimos 60 dias
-- -----------------------------------------------------------------------------
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
revoke all on function public.financeiras_a_receber() from public, anon;
grant execute on function public.financeiras_a_receber() to authenticated;
