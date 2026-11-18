-- Reversão de 20261118014003_anuncios_com_devolucoes: devolve public.anuncios_painel como estava (a definição de 20261117232910_custo_dos_anuncios,
-- sem mudança). Nenhum registro se perde: a mudança é só na leitura. Antes de desfazer, volte a plataforma para a
-- versão anterior ao lote AUD-a: a tela nova exige os campos novos e, sem eles, mostra falha de leitura.
create or replace function public.anuncios_painel(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  organizacao uuid;
  v_inicio timestamptz;
  v_fim timestamptz;
  resultado jsonb;
begin
  if p_inicio is null or p_fim is null or p_fim < p_inicio or p_fim - p_inicio > 400 then
    raise exception 'Período inválido: o fim vem depois do início e o período tem no máximo 400 dias' using errcode = '22023';
  end if;
  select u.organizacao_id into organizacao from public.unidades u where u.id = (select public.unidade_atual());
  if organizacao is null or organizacao not in (select privado.organizacoes_com_permissao('resultado.ver')) then
    raise exception 'Sem permissão para o custo dos anúncios' using errcode = '42501';
  end if;
  v_inicio := (p_inicio::timestamp at time zone 'America/Sao_Paulo');
  v_fim := ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo');
  with
  custos as (
    select c.campanha_chave as chave, max(c.campanha) as campanha, sum(c.gasto_centavos) as gasto, sum(c.impressoes) as impressoes,
      sum(c.cliques) as cliques, sum(c.resultados) as resultados, count(*) as dias
    from public.anuncios_custos c
    where c.organizacao_id = organizacao and c.plataforma = 'meta' and c.dia between p_inicio and p_fim
    group by c.campanha_chave
  ),
  -- Os contatos do período que dizem a campanha: a reserva do site (a campanha do link) e a oportunidade do CRM (a
  -- campanha digitada por quem atende).
  contatos as (
    select 'reserva' as tipo, r.id, privado.chave_de_campanha(r.utm_campaign) as chave, r.utm_campaign as nome, r.unidade_id, r.venda_id,
      r.criada_em as quando
    from public.loja_reservas r
    where r.organizacao_id = organizacao and r.criada_em >= v_inicio and r.criada_em < v_fim and r.utm_campaign is not null
    union all
    select 'oportunidade', o.id, privado.chave_de_campanha(o.campanha), o.campanha, o.unidade_id, o.venda_id, o.criado_em
    from public.oportunidades o
    where o.organizacao_id = organizacao and o.criado_em >= v_inicio and o.criado_em < v_fim and o.campanha is not null
  ),
  -- Uma venda conta uma vez: se veio de mais de um contato, vale a reserva (o clique no link) e, entre iguais, o mais recente.
  da_campanha as (
    select distinct on (c.venda_id) c.venda_id, c.chave
    from contatos c
    where c.venda_id is not null and c.chave is not null
    order by c.venda_id, (c.tipo = 'reserva') desc, c.quando desc
  ),
  vendas as (
    select x.chave, v.id, v.unidade_id, v.vendedor_id, v.cliente_id, v.total_centavos, v.concluida_em
    from da_campanha x
    join public.vendas v on v.id = x.venda_id and v.situacao = 'concluida'
  ),
  margens as (
    select i.venda_id,
      coalesce(sum(i.preco_unitario_centavos * i.quantidade - i.desconto_centavos - k.custo_unitario_centavos * i.quantidade)
        filter (where k.item_id is not null), 0) as margem,
      count(*) filter (where k.item_id is null) as itens_sem_custo
    from public.venda_itens i
    left join public.venda_itens_custos k on k.item_id = i.id
    where i.venda_id in (select v.id from vendas v)
    group by i.venda_id
  ),
  -- O que já é dinheiro de fato: o dinheiro no caixa e o cartão ou Pix conciliado (o líquido). O resto é estimativa.
  recebidos as (
    select p.venda_id, sum(case when p.situacao <> 'confirmado' then 0 when p.meio = 'dinheiro' then p.valor_centavos
      when p.conciliado_em is not null then coalesce(p.valor_liquido_centavos, 0) else 0 end) as recebido
    from public.venda_pagamentos p
    where p.venda_id in (select v.id from vendas v)
    group by p.venda_id
  ),
  -- Cliente novo: a venda da campanha é a primeira venda concluída do cliente.
  novos as (
    select v.id
    from vendas v
    where v.cliente_id is not null
      and not exists (select 1 from public.vendas a where a.cliente_id = v.cliente_id and a.situacao = 'concluida' and a.concluida_em < v.concluida_em)
  ),
  por_venda as (
    select v.*, coalesce(m.margem, 0) as margem, coalesce(m.itens_sem_custo, 0) as itens_sem_custo, coalesce(r.recebido, 0) as recebido,
      (v.id in (select n.id from novos n)) as cliente_novo
    from vendas v
    left join margens m on m.venda_id = v.id
    left join recebidos r on r.venda_id = v.id
  ),
  chaves as (
    select c.chave from custos c
    union
    select c.chave from contatos c where c.chave is not null
  ),
  por_campanha as (
    select k.chave,
      coalesce((select c.campanha from custos c where c.chave = k.chave), (select min(x.nome) from contatos x where x.chave = k.chave)) as campanha,
      coalesce(c.gasto, 0) as gasto, c.impressoes, c.cliques, c.resultados, coalesce(c.dias, 0) as dias,
      (select count(*) from contatos x where x.chave = k.chave and x.tipo = 'reserva') as reservas,
      (select count(*) from contatos x where x.chave = k.chave and x.tipo = 'oportunidade') as oportunidades,
      (select count(*) from por_venda v where v.chave = k.chave) as vendas,
      (select coalesce(sum(v.total_centavos), 0) from por_venda v where v.chave = k.chave) as receita,
      (select coalesce(sum(v.margem), 0) from por_venda v where v.chave = k.chave) as margem,
      (select count(*) from por_venda v where v.chave = k.chave and v.itens_sem_custo > 0) as vendas_sem_custo,
      (select coalesce(sum(v.recebido), 0) from por_venda v where v.chave = k.chave) as recebido,
      (select count(*) from por_venda v where v.chave = k.chave and v.cliente_novo) as clientes_novos
    from chaves k
    left join custos c on c.chave = k.chave
  )
  select jsonb_build_object(
    'campanhas', coalesce((select jsonb_agg(to_jsonb(p) order by p.gasto desc, p.vendas desc, p.chave) from por_campanha p), '[]'::jsonb),
    'por_loja', coalesce((
      select jsonb_agg(jsonb_build_object('chave', l.chave, 'unidade_id', l.unidade_id, 'loja', u.nome, 'contatos', l.contatos, 'vendas', l.vendas,
        'receita', l.receita) order by l.chave, l.receita desc, u.nome)
      from (
        select c.chave, c.unidade_id, count(*) as contatos,
          (select count(*) from por_venda v where v.chave = c.chave and v.unidade_id = c.unidade_id) as vendas,
          (select coalesce(sum(v.total_centavos), 0) from por_venda v where v.chave = c.chave and v.unidade_id = c.unidade_id) as receita
        from contatos c where c.chave is not null
        group by c.chave, c.unidade_id
      ) l
      join public.unidades u on u.id = l.unidade_id), '[]'::jsonb),
    'por_vendedor', coalesce((
      select jsonb_agg(jsonb_build_object('chave', x.chave, 'vendedor_id', x.vendedor_id, 'vendas', x.vendas, 'receita', x.receita)
        order by x.chave, x.receita desc, x.vendedor_id)
      from (select v.chave, v.vendedor_id, count(*) as vendas, sum(v.total_centavos) as receita from por_venda v group by v.chave, v.vendedor_id) x), '[]'::jsonb),
    'contatos_sem_campanha', (
      (select count(*) from public.loja_reservas r where r.organizacao_id = organizacao and r.criada_em >= v_inicio and r.criada_em < v_fim and r.utm_campaign is null)
      + (select count(*) from public.oportunidades o where o.organizacao_id = organizacao and o.criado_em >= v_inicio and o.criado_em < v_fim and o.campanha is null)),
    'importado_ate', (select max(c.dia) from public.anuncios_custos c where c.organizacao_id = organizacao and c.plataforma = 'meta'))
  into resultado;
  return resultado;
end;
$$;
revoke all on function public.anuncios_painel(date, date) from public, anon;
grant execute on function public.anuncios_painel(date, date) to authenticated;
