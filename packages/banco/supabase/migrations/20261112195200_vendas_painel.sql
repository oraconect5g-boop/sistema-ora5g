-- =============================================================================
-- Painéis do Início, lote G1 (ORA-REPORT-001, ORA-REPORT-002, ORA-REPORT-003, ORA-REPORT-006)
--
-- 1) public.vendas_painel: leitura agregada das VENDAS do período inteiro, feita no banco (nada de
--    somar só as primeiras linhas que a API devolve). É SECURITY INVOKER, como financeiro_painel:
--    valem as regras de leitura (RLS) das tabelas para quem chama. Vendedor soma só as próprias
--    vendas; gerente, a loja do turno; dono e administrador, as lojas da própria rede. Outra rede
--    nunca entra. Não lê custo (a margem fica para o G2, com custo.ver) e não muda dado.
--
--    Fatos, cada um na própria data (dia e hora de São Paulo), na janela [início, fim):
--      * venda concluída (concluida_em), mesmo que cancelada depois: total, subtotal e descontos;
--      * cancelamento de venda já concluída (cancelada_em): o total sai na data do cancelamento.
--        Venda com devolução não se cancela inteira (OR017): os dois nunca abatem o mesmo valor;
--      * devolução (venda_devolucoes.criado_em): o valor devolvido sai na data da devolução.
--
--    Cada grão é somado em separado e só se encontra pela chave (período, tipo, categoria, loja ou
--    vendedor). Não há junção de item com pagamento, e venda com vários itens conta uma vez:
--      * totais e periodos: por venda;
--      * tipos e categorias: por item (preço × quantidade − desconto do item). A soma dos itens de
--        uma venda é o total dela (regra de concluir_venda), então a soma do mix é o vendido. O
--        tipo é o gravado no item; a categoria é a ATUAL do cadastro, não um retrato da venda;
--      * lojas: pela loja da venda; vendedores: pelo vendedor de origem. Cancelar ou devolver por
--        outra pessoa, em outro caixa ou em outro dia não muda a loja nem o vendedor do fato.
--    p_vendedor filtra pelo vendedor de origem (as próprias vendas de quem também gere a loja).
--
-- 2) public.ranking_nomes: o nome de quem aparece no ranking. A leitura de perfis_usuario só vale
--    para o próprio perfil e para quem gere usuários; o gerente tem ranking.ver ("Ver ranking de
--    vendedores") e não lia o nome dos colegas. A função devolve SÓ id e nome de quem tem venda
--    concluída (os fatos que entram no ranking) em loja em que quem chama tem ranking.ver. Não cria
--    permissão nem muda a matriz de papéis: o vendedor continua sem ranking.ver (decisão P3
--    pendente) e recebe resposta vazia.
--
-- 3) Índices pelas datas dos fatos (conclusão, cancelamento e devolução): os painéis filtram por
--    elas, e os índices que existiam eram por criado_em.
--
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create index vendas_concluida_em on public.vendas (concluida_em) where concluida_em is not null;
create index vendas_cancelada_em on public.vendas (cancelada_em) where cancelada_em is not null;
create index venda_devolucoes_criado_em on public.venda_devolucoes (criado_em);

create or replace function public.vendas_painel(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_unidade uuid default null,
  p_por_hora boolean default false,
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
  -- Os três fatos de venda do período, já no escopo pedido. Cada um é lido uma vez.
  concluidas as (
    select v.id, v.unidade_id, v.vendedor_id, v.concluida_em as quando,
      coalesce(v.total_centavos, 0) as total,
      coalesce(v.subtotal_centavos, 0) as subtotal,
      coalesce(v.desconto_centavos, 0) as desconto
    from public.vendas v
    where v.concluida_em >= p_inicio and v.concluida_em < p_fim
      and (p_unidade is null or v.unidade_id = p_unidade)
      and (p_vendedor is null or v.vendedor_id = p_vendedor)
  ),
  canceladas as (
    select v.id, v.unidade_id, v.vendedor_id, v.cancelada_em as quando, coalesce(v.total_centavos, 0) as total
    from public.vendas v
    where v.situacao = 'cancelada' and v.concluida_em is not null
      and v.cancelada_em >= p_inicio and v.cancelada_em < p_fim
      and (p_unidade is null or v.unidade_id = p_unidade)
      and (p_vendedor is null or v.vendedor_id = p_vendedor)
  ),
  devolucoes as (
    select d.id, v.unidade_id, v.vendedor_id, d.criado_em as quando, d.valor_centavos as total
    from public.venda_devolucoes d
    join public.vendas v on v.id = d.venda_id
    where d.criado_em >= p_inicio and d.criado_em < p_fim
      and (p_unidade is null or v.unidade_id = p_unidade)
      and (p_vendedor is null or v.vendedor_id = p_vendedor)
  ),
  -- Grão da venda: uma linha por fato.
  fatos as (
    select c.quando, 'concluida' as fato, c.unidade_id, c.vendedor_id, c.total, c.subtotal, c.desconto
    from concluidas c
    union all
    select x.quando, 'cancelada', x.unidade_id, x.vendedor_id, x.total, 0, 0
    from canceladas x
    union all
    select d.quando, 'devolucao', d.unidade_id, d.vendedor_id, d.total, 0, 0
    from devolucoes d
  ),
  totais as (
    select
      count(*) filter (where f.fato = 'concluida') as vendas,
      coalesce(sum(f.total) filter (where f.fato = 'concluida'), 0) as vendido,
      coalesce(sum(f.subtotal) filter (where f.fato = 'concluida'), 0) as subtotal,
      coalesce(sum(f.desconto) filter (where f.fato = 'concluida'), 0) as descontos,
      count(*) filter (where f.fato = 'concluida' and f.desconto > 0) as vendas_com_desconto,
      count(*) filter (where f.fato = 'cancelada') as cancelamentos,
      coalesce(sum(f.total) filter (where f.fato = 'cancelada'), 0) as cancelado,
      count(*) filter (where f.fato = 'devolucao') as devolucoes,
      coalesce(sum(f.total) filter (where f.fato = 'devolucao'), 0) as devolvido
    from fatos f
  ),
  periodos as (
    select
      to_char(date_trunc(case when p_por_hora then 'hour' else 'day' end, f.quando at time zone 'America/Sao_Paulo'),
              case when p_por_hora then 'YYYY-MM-DD"T"HH24' else 'YYYY-MM-DD' end) as periodo,
      count(*) filter (where f.fato = 'concluida') as vendas,
      coalesce(sum(f.total) filter (where f.fato = 'concluida'), 0) as vendido,
      coalesce(sum(f.subtotal) filter (where f.fato = 'concluida'), 0) as subtotal,
      coalesce(sum(f.desconto) filter (where f.fato = 'concluida'), 0) as descontos,
      count(*) filter (where f.fato = 'cancelada') as cancelamentos,
      coalesce(sum(f.total) filter (where f.fato = 'cancelada'), 0) as cancelado,
      count(*) filter (where f.fato = 'devolucao') as devolucoes,
      coalesce(sum(f.total) filter (where f.fato = 'devolucao'), 0) as devolvido
    from fatos f
    group by 1
  ),
  por_loja as (
    select f.unidade_id,
      count(*) filter (where f.fato = 'concluida') as vendas,
      coalesce(sum(f.total) filter (where f.fato = 'concluida'), 0) as vendido,
      count(*) filter (where f.fato = 'cancelada') as cancelamentos,
      coalesce(sum(f.total) filter (where f.fato = 'cancelada'), 0) as cancelado,
      count(*) filter (where f.fato = 'devolucao') as devolucoes,
      coalesce(sum(f.total) filter (where f.fato = 'devolucao'), 0) as devolvido
    from fatos f
    group by 1
  ),
  lojas as (
    select l.unidade_id, u.nome, l.vendas, l.vendido, l.cancelamentos, l.cancelado, l.devolucoes, l.devolvido
    from por_loja l
    left join public.unidades u on u.id = l.unidade_id
  ),
  vendedores as (
    select f.vendedor_id,
      count(*) filter (where f.fato = 'concluida') as vendas,
      coalesce(sum(f.total) filter (where f.fato = 'concluida'), 0) as vendido,
      count(*) filter (where f.fato = 'cancelada') as cancelamentos,
      coalesce(sum(f.total) filter (where f.fato = 'cancelada'), 0) as cancelado,
      count(*) filter (where f.fato = 'devolucao') as devolucoes,
      coalesce(sum(f.total) filter (where f.fato = 'devolucao'), 0) as devolvido
    from fatos f
    group by 1
  ),
  -- Grão do item: uma linha por item vendido, cancelado ou devolvido. Não passa por pagamento.
  fatos_de_item as (
    select 'vendido' as fato, i.tipo, i.variante_id, i.quantidade,
      i.preco_unitario_centavos * i.quantidade - i.desconto_centavos as valor
    from public.venda_itens i
    join concluidas c on c.id = i.venda_id
    union all
    select 'cancelado', i.tipo, i.variante_id, i.quantidade,
      i.preco_unitario_centavos * i.quantidade - i.desconto_centavos
    from public.venda_itens i
    join canceladas x on x.id = i.venda_id
    union all
    select 'devolvido', i.tipo, i.variante_id, di.quantidade, di.valor_centavos
    from public.venda_devolucao_itens di
    join devolucoes d on d.id = di.devolucao_id
    join public.venda_itens i on i.id = di.venda_item_id
  ),
  tipos as (
    select f.tipo,
      coalesce(sum(f.quantidade) filter (where f.fato = 'vendido'), 0) as itens,
      coalesce(sum(f.valor) filter (where f.fato = 'vendido'), 0) as vendido,
      coalesce(sum(f.quantidade) filter (where f.fato = 'cancelado'), 0) as itens_cancelados,
      coalesce(sum(f.valor) filter (where f.fato = 'cancelado'), 0) as cancelado,
      coalesce(sum(f.quantidade) filter (where f.fato = 'devolvido'), 0) as itens_devolvidos,
      coalesce(sum(f.valor) filter (where f.fato = 'devolvido'), 0) as devolvido
    from fatos_de_item f
    group by 1
  ),
  por_categoria as (
    select p.categoria_id,
      coalesce(sum(f.quantidade) filter (where f.fato = 'vendido'), 0) as itens,
      coalesce(sum(f.valor) filter (where f.fato = 'vendido'), 0) as vendido,
      coalesce(sum(f.quantidade) filter (where f.fato = 'cancelado'), 0) as itens_cancelados,
      coalesce(sum(f.valor) filter (where f.fato = 'cancelado'), 0) as cancelado,
      coalesce(sum(f.quantidade) filter (where f.fato = 'devolvido'), 0) as itens_devolvidos,
      coalesce(sum(f.valor) filter (where f.fato = 'devolvido'), 0) as devolvido
    from fatos_de_item f
    left join public.variantes va on va.id = f.variante_id
    left join public.produtos p on p.id = va.produto_id
    group by 1
  ),
  categorias as (
    select c.categoria_id, k.nome as categoria, c.itens, c.vendido, c.itens_cancelados, c.cancelado,
      c.itens_devolvidos, c.devolvido
    from por_categoria c
    left join public.categorias k on k.id = c.categoria_id
  )
  select jsonb_build_object(
    'totais', (select to_jsonb(t) from totais t),
    'periodos', coalesce((select jsonb_agg(to_jsonb(x) order by x.periodo) from periodos x), '[]'::jsonb),
    'tipos', coalesce((select jsonb_agg(to_jsonb(x) order by x.tipo) from tipos x), '[]'::jsonb),
    'categorias', coalesce((select jsonb_agg(to_jsonb(x) order by x.categoria nulls last, x.categoria_id) from categorias x), '[]'::jsonb),
    'lojas', coalesce((select jsonb_agg(to_jsonb(x) order by x.nome nulls last, x.unidade_id) from lojas x), '[]'::jsonb),
    'vendedores', coalesce((select jsonb_agg(to_jsonb(x) order by x.vendido desc, x.vendedor_id) from vendedores x), '[]'::jsonb)
  ) into resultado;

  return resultado;
end;
$$;

comment on function public.vendas_painel(timestamptz, timestamptz, uuid, boolean, uuid) is
  'Painéis do Início (G1): vendas do período inteiro por período, tipo de item, categoria, loja e vendedor de origem, com as regras de leitura de quem chama (security invoker). Não lê custo.';

revoke all on function public.vendas_painel(timestamptz, timestamptz, uuid, boolean, uuid) from public, anon;
grant execute on function public.vendas_painel(timestamptz, timestamptz, uuid, boolean, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Nome de quem aparece no ranking (só para quem tem ranking.ver na loja da venda)
-- -----------------------------------------------------------------------------
create or replace function public.ranking_nomes(p_vendedores uuid[])
returns table (id uuid, nome text)
language sql
stable
security definer
set search_path = ''
as $$
  with lojas as (
    -- tem_permissao já separa papel de organização (qualquer loja dela) de papel de loja (só a do turno).
    select u.id
    from public.unidades u
    where u.organizacao_id in (select v.organizacao_id from privado.vinculos_vigentes() v)
      and public.tem_permissao('ranking.ver', u.id)
  )
  select p.id, p.nome
  from public.perfis_usuario p
  where p.id = any (p_vendedores)
    and exists (
      select 1
      from public.vendas v
      where v.vendedor_id = p.id and v.concluida_em is not null and v.unidade_id in (select l.id from lojas l)
    );
$$;

comment on function public.ranking_nomes(uuid[]) is
  'Ranking de vendedores (G1): id e nome de quem tem venda concluída em loja em que quem chama tem ranking.ver. Não devolve e-mail nem situação.';

revoke all on function public.ranking_nomes(uuid[]) from public, anon;
grant execute on function public.ranking_nomes(uuid[]) to authenticated;
