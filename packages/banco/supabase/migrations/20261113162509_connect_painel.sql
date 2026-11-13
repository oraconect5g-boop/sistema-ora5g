-- =============================================================================
-- Produção do Ora Connect (lote G4a: ORA-PERF-005, ORA-REPORT-004; linhas 15, 23 e 25 da matriz, T1 a T6)
--
-- public.connect_painel(p_inicio, p_fim, p_unidade, p_vendedor): a produção do período inteiro, somada
-- no banco, no total e por dia de São Paulo. É SECURITY INVOKER: valem as regras de leitura (RLS) de
-- quem chama. Chip vendido é venda (a regra de leitura das vendas); operação e produção são do
-- vendedor que as registrou ou de quem tem connect.gerir na loja. Não muda dado.
--
--   T1 chips vendidos        soma da quantidade dos itens de tipo chip das vendas concluídas no período
--                            (concluida_em). Vender o chip não ativa a linha;
--   T2 confirmadas           uma linha de connect_producao por operação (operacao_id é único), por tipo
--                            e por origem (evidência da operadora ou revisão da gerência), pela data
--                            da confirmação;
--   T3 em andamento          operações criadas no período ainda registradas, enviando ou aguardando a
--                            operadora; sem resultado, à parte. Não são produção;
--   T4 valor de face         soma do valor de face das recargas confirmadas (não é receita nem repasse);
--   T6 débito na carteira    soma do débito registrado das operações confirmadas no período. A leitura
--                            de connect_operacoes_custos exige custo.ver na loja: a loja com produção em
--                            que quem chama não tem a permissão fica fora da soma e é contada em
--                            lojas_sem_custo, para o zero não passar por débito zero.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function public.connect_painel(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_unidade uuid default null,
  p_vendedor uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  resultado jsonb;
begin
  if p_inicio is null or p_fim is null or p_fim <= p_inicio or p_fim - p_inicio > interval '400 days' then
    raise exception 'Período inválido: o fim vem depois do início e o período tem no máximo 400 dias' using errcode = '22023';
  end if;

  with
  chips as (
    select v.concluida_em as quando, i.quantidade
    from public.venda_itens i
    join public.vendas v on v.id = i.venda_id
    where i.tipo = 'chip' and v.concluida_em >= p_inicio and v.concluida_em < p_fim
      and (p_unidade is null or v.unidade_id = p_unidade) and (p_vendedor is null or v.vendedor_id = p_vendedor)
  ),
  producao as (
    select p.confirmado_em as quando, p.tipo, p.origem, p.valor_face_centavos, p.operacao_id, p.unidade_id
    from public.connect_producao p
    where p.confirmado_em >= p_inicio and p.confirmado_em < p_fim
      and (p_unidade is null or p.unidade_id = p_unidade) and (p_vendedor is null or p.vendedor_id = p_vendedor)
  ),
  andamento as (
    select o.situacao
    from public.connect_operacoes o
    where o.criado_em >= p_inicio and o.criado_em < p_fim
      and o.situacao in ('registrada', 'enviando', 'aguardando_operadora', 'resultado_desconhecido')
      and (p_unidade is null or o.unidade_id = p_unidade) and (p_vendedor is null or o.vendedor_id = p_vendedor)
  ),
  fatos as (
    select to_char(c.quando at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as periodo, c.quantidade as chips, null::text as tipo from chips c
    union all
    select to_char(p.quando at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'), 0, p.tipo from producao p
  )
  select jsonb_build_object(
    'totais', jsonb_build_object(
      'chips', (select coalesce(sum(c.quantidade), 0) from chips c),
      'ativacoes', (select count(*) from producao p where p.tipo = 'ativacao'),
      'portabilidades', (select count(*) from producao p where p.tipo = 'portabilidade'),
      'recargas', (select count(*) from producao p where p.tipo = 'recarga'),
      'por_evidencia', (select count(*) from producao p where p.origem = 'evidencia_da_operadora'),
      'por_revisao', (select count(*) from producao p where p.origem = 'revisao_da_gerencia'),
      'valor_face_recargas', (select coalesce(sum(p.valor_face_centavos), 0) from producao p where p.tipo = 'recarga'),
      'em_andamento', (select count(*) from andamento a where a.situacao <> 'resultado_desconhecido'),
      'sem_resultado', (select count(*) from andamento a where a.situacao = 'resultado_desconhecido'),
      'debito', (select coalesce(sum(c.valor_debitado_centavos), 0) from producao p join public.connect_operacoes_custos c on c.operacao_id = p.operacao_id),
      'lojas_sem_custo', (select count(distinct p.unidade_id) from producao p where not public.tem_permissao('custo.ver', p.unidade_id))
    ),
    'periodos', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.periodo)
      from (
        select f.periodo, sum(f.chips) as chips,
          count(*) filter (where f.tipo = 'ativacao') as ativacoes,
          count(*) filter (where f.tipo = 'portabilidade') as portabilidades,
          count(*) filter (where f.tipo = 'recarga') as recargas
        from fatos f
        group by f.periodo
      ) d), '[]'::jsonb)
  ) into resultado;

  return resultado;
end;
$$;

comment on function public.connect_painel(timestamptz, timestamptz, uuid, uuid) is
  'Ora Connect (G4a): chips vendidos e operações confirmadas do período, no total e por dia, com as regras de leitura de quem chama (security invoker); débito só das lojas com custo.ver.';

revoke all on function public.connect_painel(timestamptz, timestamptz, uuid, uuid) from public, anon;
grant execute on function public.connect_painel(timestamptz, timestamptz, uuid, uuid) to authenticated;
