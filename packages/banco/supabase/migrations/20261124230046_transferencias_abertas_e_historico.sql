-- =============================================================================
-- Lote TRF-f (24/11/2026; ORA-INV-007, que segue testado; achado F24-01 da revisão do Codex de 24/11, P1): a transferência
-- em andamento não some da tela. public.transferencias_tela trazia as 50 transferências mais novas da loja do turno, de
-- qualquer situação: uma pedida antiga, ainda reservando estoque, sumia atrás de 50 canceladas depois dela (reproduzido
-- pelo Codex em PGlite). Agora:
--   * as em andamento (solicitada, separada, enviada, ou recebida com divergência ainda sem destino) vêm sempre, com
--     páginas próprias (p_pagina_abertas), antes do histórico;
--   * o histórico (recebida, recusada, cancelada, divergência resolvida) tem as suas páginas (p_pagina);
--   * a busca pelo número (p_numero) traz só aquela transferência, se a loja do turno for a origem ou o destino;
--   * a resposta diz quantas há em andamento e no histórico e a página de cada parte; cada transferência diz se está
--     em andamento ("aberta").
-- O tamanho da página segue o p_limite (de 1 a 200; padrão 50). As regras do estoque não mudam: só a leitura. A
-- assinatura muda (ganha a página das em andamento, a do histórico e o número): sai a função de um argumento e entra a
-- de quatro; o site de antes, que chama só com o p_limite, segue funcionando entre esta migration e a publicação.
-- A função de antes é a em vigor (o md5 do corpo conferido no ora5g-dev).
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

drop function public.transferencias_tela(int);

create function public.transferencias_tela(
  p_limite int default 50, p_pagina int default 1, p_pagina_abertas int default 1, p_numero bigint default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with
  u as (select public.unidade_atual() as id),
  tamanho as (select greatest(1, least(coalesce(p_limite, 50), 200)) as n),
  -- TRF-f (F24-01): as transferências da loja do turno, cada uma dizendo se ainda pede ação (solicitada, separada,
  -- enviada, ou recebida com divergência que ainda não teve destino). As em andamento e o histórico têm páginas
  -- próprias: antes, as 50 mais novas de tudo escondiam a pendência antiga atrás das canceladas depois dela.
  da_loja as (
    select t.id, t.numero, t.origem_id, t.destino_id, t.variante_id, t.quantidade, t.motivo, t.situacao, t.solicitado_por,
      t.quantidade_recebida, t.observacao, t.solicitado_em, t.remessa_id, t.divergencia_resolvida_em,
      (t.situacao in ('solicitada', 'separada', 'enviada')
        or (t.situacao = 'recebida_com_divergencia' and t.divergencia_resolvida_em is null)) as aberta
    from public.transferencias t
    where t.origem_id = (select u.id from u) or t.destino_id = (select u.id from u)
  ),
  contas as (
    select count(*) filter (where d.aberta)::int as abertas, count(*) filter (where not d.aberta)::int as historico from da_loja d
  ),
  paginas as (
    select x.de_abertas, x.de_historico,
      least(greatest(coalesce(p_pagina_abertas, 1), 1), x.de_abertas) as abertas_em,
      least(greatest(coalesce(p_pagina, 1), 1), x.de_historico) as historico_em
    from (select greatest(1, ceil(c.abertas::numeric / t.n))::int as de_abertas, greatest(1, ceil(c.historico::numeric / t.n))::int as de_historico
          from contas c, tamanho t) x
  ),
  abertas as (
    select d.* from da_loja d where d.aberta and p_numero is null
    order by d.numero desc
    limit (select t.n from tamanho t) offset (select (p.abertas_em - 1) * t.n from paginas p, tamanho t)
  ),
  historico as (
    select d.* from da_loja d where not d.aberta and p_numero is null
    order by d.numero desc
    limit (select t.n from tamanho t) offset (select (p.historico_em - 1) * t.n from paginas p, tamanho t)
  ),
  -- A busca pelo número: só a transferência daquele número, se a loja do turno for a origem ou o destino.
  achada as (select d.* from da_loja d where p_numero is not null and d.numero = p_numero),
  lista as (select * from abertas union all select * from historico union all select * from achada),
  variantes_da_lista as (
    select v.id, v.nome, v.sku, p.tipo
    from public.variantes v
    left join public.produtos p on p.id = v.produto_id
    where v.id in (select l.variante_id from lista l)
  ),
  lojas as (
    select x.id from lista l cross join lateral (values (l.origem_id), (l.destino_id)) as x(id) group by x.id
  ),
  a_separar as (
    select distinct l.variante_id
    from lista l join variantes_da_lista v on v.id = l.variante_id
    where l.situacao = 'solicitada' and l.origem_id = (select u.id from u) and v.tipo in ('aparelho', 'chip')
  )
  select jsonb_build_object(
    'transferencias', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'numero', l.numero, 'origem_id', l.origem_id,
      'destino_id', l.destino_id, 'variante_id', l.variante_id, 'quantidade', l.quantidade, 'motivo', l.motivo, 'situacao', l.situacao,
      'solicitado_por', l.solicitado_por, 'quantidade_recebida', l.quantidade_recebida, 'observacao', l.observacao,
      'solicitado_em', l.solicitado_em, 'remessa_id', l.remessa_id, 'divergencia_resolvida_em', l.divergencia_resolvida_em,
      'aberta', l.aberta)
      order by l.aberta desc, l.numero desc) from lista l), '[]'::jsonb),
    -- TRF-f: quantas há em andamento e no histórico, e a página de cada uma.
    'abertas', (select c.abertas from contas c), 'historico', (select c.historico from contas c),
    'pagina_abertas', (select p.abertas_em from paginas p), 'paginas_abertas', (select p.de_abertas from paginas p),
    'pagina', (select p.historico_em from paginas p), 'paginas', (select p.de_historico from paginas p),
    'variantes', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'nome', v.nome, 'sku', v.sku, 'tipo', v.tipo) order by v.id)
      from variantes_da_lista v), '[]'::jsonb),
    'unidades', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'tipo', x.tipo) order by x.id)
      from public.unidades x where x.id in (select lj.id from lojas lj)), '[]'::jsonb),
    'itens', coalesce((select jsonb_agg(jsonb_build_object('transferencia_id', i.transferencia_id, 'item_serializado_id', i.item_serializado_id,
      'recebido', i.recebido) order by i.transferencia_id, i.item_serializado_id)
      from public.transferencia_itens i where i.transferencia_id in (select l.id from lista l)), '[]'::jsonb),
    'resolucoes', coalesce((select jsonb_agg(jsonb_build_object('transferencia_id', r.transferencia_id, 'decisao', r.decisao,
      'quantidade', r.quantidade, 'item_serializado_id', r.item_serializado_id, 'motivo', r.motivo, 'criado_em', r.criado_em)
      order by r.criado_em, r.id)
      from public.transferencia_resolucoes r where r.transferencia_id in (select l.id from lista l)), '[]'::jsonb),
    'remessas', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'numero', r.numero, 'origem_id', r.origem_id) order by r.numero)
      from public.transferencia_remessas r where r.id in (select l.remessa_id from lista l)), '[]'::jsonb),
    'saldos', coalesce((select jsonb_agg(jsonb_build_object('unidade_id', s.unidade_id, 'variante_id', s.variante_id, 'quantidade', s.quantidade,
      'reservado', s.reservado) order by s.unidade_id, s.variante_id)
      from public.estoque_saldos s where s.unidade_id in (select lj.id from lojas lj) and s.variante_id in (select l.variante_id from lista l)), '[]'::jsonb),
    'disponiveis', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'variante_id', d.variante_id, 'imei', d.imei, 'iccid', d.iccid)
      order by d.variante_id, d.id) from (
        select i.id, i.variante_id, i.imei, i.iccid
        from public.itens_serializados i
        where i.unidade_id = (select u.id from u) and i.em_estoque and i.situacao = 'disponivel'
          and i.variante_id in (select a.variante_id from a_separar a)
        order by i.variante_id, i.id
        limit 100
      ) d), '[]'::jsonb)
  );
$$;
comment on function public.transferencias_tela(int, int, int, bigint) is
  'VEL-g, TRF-d e TRF-f: a tela de Transferências numa ida: as em andamento e o histórico da loja do turno, cada parte com as suas páginas, e a busca pelo número; os produtos, as lojas, os aparelhos separados, as resoluções do que faltou, as remessas, os saldos e os aparelhos livres a separar, com o RLS de quem chama.';
revoke all on function public.transferencias_tela(int, int, int, bigint) from public, anon;
grant execute on function public.transferencias_tela(int, int, int, bigint) to authenticated;
