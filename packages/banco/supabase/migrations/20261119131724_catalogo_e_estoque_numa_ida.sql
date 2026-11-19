-- =============================================================================
-- Lote VEL-d (ORA-QUAL-010; o resto do VEL-c que a orientação do proprietário de 18/11/2026 pediu: "medir antes/depois em
-- celular autenticado; não remover RLS ou cachear permissões entre usuários"): o Catálogo e a lista do Estoque numa ida só
-- ao banco. Decisão: ADR-010, "O que veio no VEL-d".
--
-- O antes, medido em 19/11 com a conta de teste do vendedor num celular simulado (o log de tempos da homologação, da
-- linha 4734): o Catálogo fazia 9 idas ao banco em 8 rodadas, uma depois da outra (1,5 s no banco); a lista do Estoque,
-- 4 idas em 4 rodadas (1,2 s).
--
--   * public.catalogo_tela(p_produtos, p_so_pendentes, p_limite): numa resposta, as pendências de foto, os produtos ativos
--     (os achados pela busca, ou todos, em ordem de nome, até o limite, e se há mais), as variações ativas deles, as fotos
--     em uso e os saldos da loja do turno;
--   * public.estoque_lista(p_pagina, p_por_pagina): a página da lista do estoque da loja do turno (as variações com saldo
--     ali, em ordem de nome), o total para a paginação (a página pedida além da última vira a última) e as fotos em uso dos
--     produtos da página.
-- As duas são SECURITY INVOKER: leem com o RLS de quem chama, como as leituras que elas substituem. Nenhuma permissão nova
-- e nada guardado entre pessoas. A tela usa o caminho antigo enquanto o banco não tiver a função.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function public.catalogo_tela(p_produtos uuid[], p_so_pendentes boolean, p_limite int)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with
  limite as (select greatest(1, least(coalesce(p_limite, 200), 1000)) as n),
  pendencias as (select x.produto_id, x.variante_id, x.sku, x.nome, x.motivo from public.pendencias_de_foto() x),
  achados as (
    select p.id, p.nome, p.tipo, p.organizacao_id
    from public.produtos p
    where p.ativo
      and (p_produtos is null or p.id = any (p_produtos))
      and (not coalesce(p_so_pendentes, false) or p.id in (select pe.produto_id from pendencias pe))
    order by p.nome, p.id
    limit (select n + 1 from limite)
  ),
  lista as (select a.* from achados a order by a.nome, a.id limit (select n from limite)),
  variantes as (
    select v.id, v.produto_id, v.sku, v.nome, v.cor
    from public.variantes v
    where v.ativa and v.produto_id in (select l.id from lista l)
  )
  select jsonb_build_object(
    'pendencias', coalesce((select jsonb_agg(jsonb_build_object('produto_id', pe.produto_id, 'variante_id', pe.variante_id,
      'sku', pe.sku, 'nome', pe.nome, 'motivo', pe.motivo) order by pe.nome, pe.sku) from pendencias pe), '[]'::jsonb),
    'produtos', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'nome', l.nome, 'tipo', l.tipo,
      'organizacao_id', l.organizacao_id) order by l.nome, l.id) from lista l), '[]'::jsonb),
    'mais', (select count(*) from achados) > (select count(*) from lista),
    'variantes', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'produto_id', v.produto_id, 'sku', v.sku,
      'nome', v.nome, 'cor', v.cor) order by v.sku, v.id) from variantes v), '[]'::jsonb),
    'fotos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'produto_id', f.produto_id, 'variante_id', f.variante_id,
      'caminho', f.caminho, 'ilustracao', f.ilustracao) order by f.id)
      from public.fotos_produto f where f.produto_id in (select l.id from lista l) and f.substituida_em is null), '[]'::jsonb),
    'saldos', coalesce((select jsonb_agg(jsonb_build_object('variante_id', s.variante_id, 'quantidade', s.quantidade,
      'reservado', s.reservado) order by s.variante_id)
      from public.estoque_saldos s
      where s.unidade_id = (select public.unidade_atual()) and s.variante_id in (select v.id from variantes v)), '[]'::jsonb)
  );
$$;
comment on function public.catalogo_tela(uuid[], boolean, int) is
  'VEL-d: a tela do Catálogo numa ida (pendências de foto, produtos, variações, fotos e saldos da loja do turno), com o RLS de quem chama (security invoker).';
revoke all on function public.catalogo_tela(uuid[], boolean, int) from public, anon;
grant execute on function public.catalogo_tela(uuid[], boolean, int) to authenticated;

create or replace function public.estoque_lista(p_pagina int, p_por_pagina int)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  v_por int := greatest(1, least(coalesce(p_por_pagina, 50), 500));
  v_total int;
  v_pagina int;
  resultado jsonb;
begin
  select count(*) into v_total
  from public.variantes v
  join public.estoque_saldos s on s.variante_id = v.id and s.unidade_id = v_unidade;
  v_pagina := least(greatest(coalesce(p_pagina, 1), 1), greatest(1, ceil(v_total::numeric / v_por)::int));
  with linhas as (
    select v.id, v.nome, v.sku, v.estoque_minimo, v.produto_id, s.quantidade, s.reservado
    from public.variantes v
    join public.estoque_saldos s on s.variante_id = v.id and s.unidade_id = v_unidade
    order by v.nome, v.id
    offset (v_pagina - 1) * v_por
    limit v_por
  )
  select jsonb_build_object(
    'total', v_total,
    'pagina', v_pagina,
    'linhas', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'nome', l.nome, 'sku', l.sku, 'estoque_minimo', l.estoque_minimo,
      'produto_id', l.produto_id, 'quantidade', l.quantidade, 'reservado', l.reservado) order by l.nome, l.id) from linhas l), '[]'::jsonb),
    'fotos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'produto_id', f.produto_id, 'variante_id', f.variante_id,
      'caminho', f.caminho, 'ilustracao', f.ilustracao) order by f.id)
      from public.fotos_produto f where f.produto_id in (select l.produto_id from linhas l) and f.substituida_em is null), '[]'::jsonb)
  ) into resultado;
  return resultado;
end;
$$;
comment on function public.estoque_lista(int, int) is
  'VEL-d: a página da lista do estoque da loja do turno numa ida (as variações com saldo, o total e as fotos), com o RLS de quem chama (security invoker).';
revoke all on function public.estoque_lista(int, int) from public, anon;
grant execute on function public.estoque_lista(int, int) to authenticated;
