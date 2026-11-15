-- =============================================================================
-- Pagamentos por maquininha (lote REPORT-005b: ORA-REPORT-005, o terminal de cada pagamento no relatório por meio)
--
-- public.pagamentos_por_terminal(início, fim, loja): os pagamentos de cada maquininha (o terminal registrado em cada
-- pagamento desde o L7a), na mesma janela do financeiro (a data do registro do pagamento, criado_em), para quem já lê
-- esses pagamentos: roda com as permissões de quem chama (SECURITY INVOKER), então o RLS dos pagamentos, das vendas e
-- das maquininhas decide o recorte. Por maquininha: a loja, o provedor, o número e o apelido; os confirmados (quantos e
-- quanto), quantos e quanto já foram conciliados com o extrato e o líquido que caiu na conta (a diferença é a
-- observada no extrato, não a taxa do contrato); e os estornados, à parte. Só lê.
-- Sem tabela, coluna, política, permissão ou índice novos. Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function public.pagamentos_por_terminal(p_inicio timestamptz, p_fim timestamptz, p_unidade uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_inicio is null or p_fim is null or p_fim <= p_inicio or p_fim - p_inicio > interval '400 days' then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  return (
    with pagamentos as (
      select p.terminal_id, p.situacao, p.valor_centavos, p.conciliado_em, p.valor_liquido_centavos
      from public.venda_pagamentos p
      join public.vendas v on v.id = p.venda_id
      where p.terminal_id is not null and p.criado_em >= p_inicio and p.criado_em < p_fim
        and (p_unidade is null or v.unidade_id = p_unidade)
    ),
    por_terminal as (
      select t.id as terminal, t.unidade_id as unidade, t.provedor, t.identificador, t.apelido, t.ativo,
        count(*) filter (where x.situacao = 'confirmado') as quantidade,
        coalesce(sum(x.valor_centavos) filter (where x.situacao = 'confirmado'), 0) as valor,
        count(*) filter (where x.situacao = 'confirmado' and x.conciliado_em is not null) as conciliados,
        coalesce(sum(x.valor_centavos) filter (where x.situacao = 'confirmado' and x.conciliado_em is not null), 0) as conciliado,
        coalesce(sum(x.valor_liquido_centavos) filter (where x.situacao = 'confirmado' and x.conciliado_em is not null), 0) as liquido,
        count(*) filter (where x.situacao = 'estornado') as estornados,
        coalesce(sum(x.valor_centavos) filter (where x.situacao = 'estornado'), 0) as estornado
      from pagamentos x join public.terminais t on t.id = x.terminal_id
      group by t.id
    )
    select jsonb_build_object(
      'unidade', p_unidade,
      'terminais', coalesce((select jsonb_agg(to_jsonb(r) order by r.valor desc, r.apelido, r.terminal) from por_terminal r), '[]'::jsonb))
  );
end;
$$;

revoke all on function public.pagamentos_por_terminal(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.pagamentos_por_terminal(timestamptz, timestamptz, uuid) to authenticated;
