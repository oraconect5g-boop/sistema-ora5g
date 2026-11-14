-- =============================================================================
-- Relatórios da assistência (lote L12e: ORA-OS-006, o resto; DEC-U44, seção 2C da Etapa 0, item 5: "relatórios para o
-- dono: OS abertas sem venda, OS por vendedor, tempo de conserto, serviços por loja e peças consumidas × serviços
-- vendidos")
--
-- public.os_relatorio(inicio, fim, loja): uma leitura só, para quem gere a assistência (os.gerir: dono e gerente), das
-- lojas onde a pessoa tem essa permissão (ou de uma delas). O período vale no fuso de São Paulo, até um ano.
--   * resumo e por_loja: OS abertas no período; como se encerraram (entregues e cobradas, devolvidas sem conserto,
--     devolvidas sem cobrar depois do conserto, canceladas); consertos cobrados e o valor (venda concluída no período e
--     não cancelada); peças usadas (as não devolvidas); e, agora, as prontas na loja sem cobrança.
--   * sem_venda: as OS que pedem olho do dono (até 100, as mais recentes primeiro): conserto devolvido sem cobrar
--     (motivo), venda do conserto cancelada depois da entrega, e as prontas paradas na loja (há quantos dias).
--   * por_pessoa: quem abriu OS no período e quem cobrou conserto (quantos e o valor), com o nome.
--   * tempo: consertos concluídos no período (média e maior, em dias desde a abertura) e entregas (média até a entrega).
--   * pecas_x_servicos por loja: consertos cobrados, peças usadas, OS com peça e, delas, as que fecharam sem cobrança.
-- Só leitura, sem custo (o custo das peças é de quem tem custo.ver, em outro lote). Reversão:
-- supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function public.os_relatorio(p_inicio date, p_fim date, p_unidade uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_permitidas uuid[] := array(select u from privado.unidades_com_permissao('os.gerir') u);
  v_lojas uuid[];
  v_de timestamptz;
  v_ate timestamptz;
  resultado jsonb;
begin
  if p_inicio is null or p_fim is null or p_fim < p_inicio or p_fim - p_inicio > 366 then
    raise exception 'Período inválido: de um dia a um ano' using errcode = '22023';
  end if;
  if coalesce(array_length(v_permitidas, 1), 0) = 0 then
    raise exception 'Sem permissão para os relatórios da assistência' using errcode = '42501';
  end if;
  if p_unidade is not null and not (p_unidade = any (v_permitidas)) then
    raise exception 'Sem permissão para os relatórios desta loja' using errcode = '42501';
  end if;
  v_lojas := case when p_unidade is null then v_permitidas else array[p_unidade] end;
  v_de := p_inicio::timestamp at time zone 'America/Sao_Paulo';
  v_ate := (p_fim + 1)::timestamp at time zone 'America/Sao_Paulo';

  with
  os_das_lojas as (
    select o.* from public.ordens_servico o where o.unidade_id = any (v_lojas)
  ),
  lojas as (
    select u.id, u.nome from public.unidades u where u.id in (select distinct z.unidade_id from os_das_lojas z)
  ),
  concluido as (
    select e.os_id, max(e.ocorrido_em) as quando from public.os_eventos e
    where e.tipo = 'servico_concluido' and e.os_id in (select z.id from os_das_lojas z) group by 1
  ),
  de_volta as (
    select e.os_id, max(e.ocorrido_em) as quando from public.os_eventos e
    where e.tipo = 'recebida_na_loja' and e.os_id in (select z.id from os_das_lojas z) group by 1
  ),
  -- O conserto cobrado: item de OS em venda concluída no período, não cancelada.
  cobrancas as (
    select i.os_id, v.vendedor_id, v.concluida_em, i.preco_unitario_centavos * i.quantidade - i.desconto_centavos as valor
    from public.venda_itens i join public.vendas v on v.id = i.venda_id
    where i.os_id in (select z.id from os_das_lojas z) and v.situacao = 'concluida' and v.concluida_em >= v_de and v.concluida_em < v_ate
  ),
  pecas as (
    select p.os_id, p.quantidade from public.os_pecas p
    where p.os_id in (select z.id from os_das_lojas z) and p.devolvida_em is null and p.registrado_em >= v_de and p.registrado_em < v_ate
  ),
  -- Venda do conserto cancelada depois da entrega (a OS ficou entregue sem venda válida).
  canceladas as (
    select o.id as os_id, v.numero as venda, v.cancelada_em as quando
    from os_das_lojas o join public.vendas v on v.id = o.venda_id
    where o.situacao = 'entregue' and v.situacao = 'cancelada' and v.cancelada_em >= v_de and v.cancelada_em < v_ate
  ),
  por_os as (
    select o.id, o.unidade_id,
      (o.aberta_em >= v_de and o.aberta_em < v_ate) as aberta_no_periodo,
      (o.encerrada_em >= v_de and o.encerrada_em < v_ate) as encerrada_no_periodo,
      o.situacao, o.servico,
      (o.situacao = 'aberta' and o.local = 'loja' and o.servico = 'concluido' and o.venda_id is null) as pronta_parada
    from os_das_lojas o
  ),
  resumo_por_loja as (
    select l.id as unidade, l.nome,
      count(*) filter (where p.aberta_no_periodo) as abertas,
      count(*) filter (where p.encerrada_no_periodo and p.situacao = 'entregue') as entregues,
      count(*) filter (where p.encerrada_no_periodo and p.situacao = 'devolvida' and p.servico <> 'concluido') as devolvidas_sem_conserto,
      count(*) filter (where p.encerrada_no_periodo and p.situacao = 'devolvida' and p.servico = 'concluido') as devolvidas_sem_cobrar,
      count(*) filter (where p.encerrada_no_periodo and p.situacao = 'cancelada') as canceladas,
      count(*) filter (where p.pronta_parada) as prontas_paradas,
      (select count(distinct c.os_id) from cobrancas c join os_das_lojas o on o.id = c.os_id where o.unidade_id = l.id) as consertos_cobrados,
      (select coalesce(sum(c.valor), 0) from cobrancas c join os_das_lojas o on o.id = c.os_id where o.unidade_id = l.id) as valor_cobrado,
      (select coalesce(sum(x.quantidade), 0) from pecas x join os_das_lojas o on o.id = x.os_id where o.unidade_id = l.id) as pecas_usadas,
      (select count(distinct x.os_id) from pecas x join os_das_lojas o on o.id = x.os_id where o.unidade_id = l.id) as os_com_peca,
      (select count(distinct x.os_id) from pecas x join os_das_lojas o on o.id = x.os_id
        where o.unidade_id = l.id and (o.situacao = 'devolvida' or (o.situacao = 'entregue' and x.os_id in (select k.os_id from canceladas k)))) as os_com_peca_sem_cobranca
    from lojas l left join por_os p on p.unidade_id = l.id
    group by l.id, l.nome
  ),
  sem_venda as (
    select * from (
      select o.id, o.numero, u.nome as loja, o.aparelho, o.cliente_nome, 'devolvida_sem_cobrar'::text as tipo, o.encerrada_em as quando,
             o.motivo_encerramento as motivo, null::bigint as venda, null::int as dias
      from os_das_lojas o join public.unidades u on u.id = o.unidade_id
      where o.situacao = 'devolvida' and o.servico = 'concluido' and o.encerrada_em >= v_de and o.encerrada_em < v_ate
      union all
      select o.id, o.numero, u.nome, o.aparelho, o.cliente_nome, 'venda_cancelada', k.quando, null, k.venda, null
      from canceladas k join os_das_lojas o on o.id = k.os_id join public.unidades u on u.id = o.unidade_id
      union all
      select o.id, o.numero, u.nome, o.aparelho, o.cliente_nome, 'pronta_parada', coalesce(d.quando, c.quando), null, null,
             greatest(0, ((now() at time zone 'America/Sao_Paulo')::date - (coalesce(d.quando, c.quando, o.aberta_em) at time zone 'America/Sao_Paulo')::date))::int
      from os_das_lojas o join public.unidades u on u.id = o.unidade_id
      left join de_volta d on d.os_id = o.id left join concluido c on c.os_id = o.id
      where o.situacao = 'aberta' and o.local = 'loja' and o.servico = 'concluido' and o.venda_id is null
    ) x
    order by x.quando desc nulls last, x.numero desc
    limit 100
  ),
  pessoas as (
    select x.pessoa, sum(x.abertas)::bigint as abertas, sum(x.cobrados)::bigint as cobrados, sum(x.valor)::bigint as valor
    from (
      select o.aberta_por as pessoa, 1 as abertas, 0 as cobrados, 0::bigint as valor from os_das_lojas o
      where o.aberta_em >= v_de and o.aberta_em < v_ate
      union all
      select c.vendedor_id, 0, 1, c.valor from cobrancas c
    ) x group by x.pessoa
  ),
  tempo as (
    select
      (select count(*) from concluido c join os_das_lojas o on o.id = c.os_id where c.quando >= v_de and c.quando < v_ate) as consertos,
      (select round(avg(extract(epoch from c.quando - o.aberta_em) / 86400)::numeric, 1)
         from concluido c join os_das_lojas o on o.id = c.os_id where c.quando >= v_de and c.quando < v_ate) as media_dias_conserto,
      (select round(max(extract(epoch from c.quando - o.aberta_em) / 86400)::numeric, 1)
         from concluido c join os_das_lojas o on o.id = c.os_id where c.quando >= v_de and c.quando < v_ate) as maior_dias_conserto,
      (select count(*) from os_das_lojas o where o.situacao = 'entregue' and o.encerrada_em >= v_de and o.encerrada_em < v_ate) as entregas,
      (select round(avg(extract(epoch from o.encerrada_em - o.aberta_em) / 86400)::numeric, 1)
         from os_das_lojas o where o.situacao = 'entregue' and o.encerrada_em >= v_de and o.encerrada_em < v_ate) as media_dias_ate_entrega
  )
  select jsonb_build_object(
    'inicio', p_inicio, 'fim', p_fim, 'unidade', p_unidade,
    'lojas', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome) order by u.nome), '[]'::jsonb)
              from public.unidades u where u.id = any (v_permitidas) and u.tipo in ('loja_fisica', 'online')),
    'resumo', (select jsonb_build_object(
        'abertas', coalesce(sum(r.abertas), 0), 'entregues', coalesce(sum(r.entregues), 0),
        'devolvidas_sem_conserto', coalesce(sum(r.devolvidas_sem_conserto), 0), 'devolvidas_sem_cobrar', coalesce(sum(r.devolvidas_sem_cobrar), 0),
        'canceladas', coalesce(sum(r.canceladas), 0), 'prontas_paradas', coalesce(sum(r.prontas_paradas), 0),
        'consertos_cobrados', coalesce(sum(r.consertos_cobrados), 0), 'valor_cobrado', coalesce(sum(r.valor_cobrado), 0),
        'pecas_usadas', coalesce(sum(r.pecas_usadas), 0)) from resumo_por_loja r),
    'por_loja', (select coalesce(jsonb_agg(to_jsonb(r) order by r.nome), '[]'::jsonb) from resumo_por_loja r),
    'sem_venda', (select coalesce(jsonb_agg(to_jsonb(s) order by s.quando desc nulls last, s.numero desc), '[]'::jsonb) from sem_venda s),
    'por_pessoa', (select coalesce(jsonb_agg(jsonb_build_object('pessoa', p.pessoa, 'nome', coalesce(pu.nome, '—'), 'abertas', p.abertas,
                    'cobrados', p.cobrados, 'valor', p.valor) order by p.valor desc, p.abertas desc, pu.nome), '[]'::jsonb)
                   from pessoas p left join public.perfis_usuario pu on pu.id = p.pessoa),
    'tempo', (select to_jsonb(t) from tempo t)
  ) into resultado;
  return resultado;
end;
$$;

revoke all on function public.os_relatorio(date, date, uuid) from public, anon;
grant execute on function public.os_relatorio(date, date, uuid) to authenticated;
