-- =============================================================================
-- Lote FIN-001a (ORA-FIN-001: "resumo diário de vendas x recebimentos x produção comercial", com as categorias
-- reconciliáveis; a ordem recomendada da auditoria integral do Codex de 21/11/2026, item 6: fechar PDV, caixa e financeiro,
-- com os números batendo com o livro de movimentos): a conferência do período.
--
-- O Financeiro somava as vendas, os pagamentos e os caixas, cada um por si. Não havia, em lugar nenhum, a conta que diz
-- se eles fecham entre si e com os livros. Esta função faz essa conta, venda a venda, para as vendas CONCLUÍDAS no
-- período (as que foram canceladas depois continuam na conta: o pagamento delas aparece como desfeito):
--
--   * pagamentos: o que foi pago em cada venda, menos o troco, tem de ser o total dela. O total do período se divide em
--     recebido na loja (dinheiro com o troco descontado, Pix, cartões e a entrada do financiamento), financiado (a parte
--     que a financeira deve), vale-troca e pagamentos desfeitos (de venda cancelada depois);
--   * livro do caixa: o que cada venda recebeu na loja (e o troco que saiu) tem de estar no livro dos caixas, lançado
--     para aquela venda;
--   * livro do estoque: cada unidade vendida de aparelho, chip ou acessório tem de ter a saída por venda no livro do
--     estoque, ligada àquela venda. Serviço e recarga não têm estoque e ficam fora.
--
-- Cada conferência devolve os dois lados, a diferença, quantas vendas não fecham e até 20 delas (o número e o
-- identificador), para alguém abrir e ver. A diferença somada pode dar zero com duas vendas erradas em sentidos opostos:
-- por isso vale a contagem das vendas, e não só a soma.
--
-- Quem: quem vê as vendas da loja ou da rede (venda.ver_unidade ou venda.ver_todas, as mesmas permissões do Financeiro),
-- só nas lojas em que tem essa permissão. O vendedor, que vê só as próprias vendas, não confere. A função roda com os
-- direitos do dono dela (SECURITY DEFINER) para ler os três livros inteiros da loja: com as regras de leitura de cada
-- tabela, quem não lê um dos livros veria uma diferença que não existe. Só devolve somas, contagens e números de venda,
-- que quem tem essas permissões já vê.
-- Códigos: 42501 quem não vê as vendas de nenhuma loja pedida; 22023 período inválido (até 400 dias, como o Financeiro).
-- Só lê. Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function public.financeiro_conferencia(p_inicio timestamptz, p_fim timestamptz, p_unidade uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lojas uuid[];
  resultado jsonb;
begin
  if p_inicio is null or p_fim is null or p_fim <= p_inicio or p_fim - p_inicio > interval '400 days' then
    raise exception 'Período inválido: o fim vem depois do início e o período tem no máximo 400 dias' using errcode = '22023';
  end if;
  select coalesce(array_agg(x.id), '{}') into lojas
  from (select u as id from privado.unidades_com_permissao('venda.ver_unidade') u
        union
        select u from privado.unidades_com_permissao('venda.ver_todas') u) x
  where p_unidade is null or x.id = p_unidade;
  if cardinality(lojas) = 0 then
    raise exception 'A conferência é de quem vê as vendas da loja ou da rede' using errcode = '42501';
  end if;

  with
  v as (
    select x.id, x.numero, x.total_centavos as total, x.troco_centavos as troco
    from public.vendas x
    where x.concluida_em >= p_inicio and x.concluida_em < p_fim and x.unidade_id = any (lojas)
  ),
  pag as (
    select p.venda_id,
      sum(p.valor_centavos) as pago,
      sum(case when p.situacao = 'confirmado' and not privado.meio_financeira(p.meio) and p.meio <> 'vale_troca' then p.valor_centavos else 0 end) as loja_bruto,
      sum(case when p.situacao = 'confirmado' and privado.meio_financeira(p.meio) then p.entrada_centavos else 0 end) as entradas,
      sum(case when p.situacao = 'confirmado' and privado.meio_financeira(p.meio) then p.valor_centavos - p.entrada_centavos else 0 end) as financiado,
      sum(case when p.situacao = 'confirmado' and p.meio = 'vale_troca' then p.valor_centavos else 0 end) as vale,
      sum(case when p.situacao <> 'confirmado' then p.valor_centavos else 0 end) as desfeito_bruto,
      -- O troco sai do dinheiro: se o dinheiro da venda segue confirmado, desconta do recebido; se foi desfeito, do desfeito.
      coalesce(bool_or(p.meio = 'dinheiro' and p.situacao = 'confirmado'), false) as dinheiro_confirmado,
      -- O que a venda põe no livro do caixa: cada pagamento que não é de financeira e a entrada do financiamento.
      sum(case when privado.meio_financeira(p.meio) then p.entrada_centavos else p.valor_centavos end) as para_o_caixa
    from public.venda_pagamentos p
    where p.venda_id in (select v.id from v)
    group by p.venda_id
  ),
  cx as (
    select m.venda_id, sum(m.valor_centavos) as no_livro
    from public.caixa_movimentos m
    where m.venda_id in (select v.id from v) and m.tipo in ('recebimento', 'troco')
    group by m.venda_id
  ),
  it as (
    select i.venda_id, sum(i.quantidade) as unidades
    from public.venda_itens i
    where i.venda_id in (select v.id from v) and i.tipo in ('aparelho', 'chip', 'acessorio')
    group by i.venda_id
  ),
  mv as (
    select m.referencia_id as venda, -sum(m.quantidade) as no_livro
    from public.estoque_movimentos m
    where m.tipo = 'venda' and m.referencia_tipo = 'venda' and m.referencia_id in (select v.id::text from v)
    group by m.referencia_id
  ),
  linha as (
    select v.id, v.numero, v.total,
      coalesce(pag.loja_bruto, 0) + coalesce(pag.entradas, 0) - case when coalesce(pag.dinheiro_confirmado, false) then v.troco else 0 end as recebido_na_loja,
      coalesce(pag.financiado, 0) as financiado,
      coalesce(pag.vale, 0) as vale,
      coalesce(pag.desfeito_bruto, 0) - case when coalesce(pag.dinheiro_confirmado, false) then 0 else v.troco end as desfeitos,
      coalesce(pag.pago, 0) - v.troco - v.total as dif_pagamentos,
      coalesce(pag.para_o_caixa, 0) - v.troco as caixa_esperado,
      coalesce(cx.no_livro, 0) as caixa_no_livro,
      coalesce(it.unidades, 0) as unidades,
      coalesce(mv.no_livro, 0) as estoque_no_livro
    from v
    left join pag on pag.venda_id = v.id
    left join cx on cx.venda_id = v.id
    left join it on it.venda_id = v.id
    left join mv on mv.venda = v.id::text
  )
  select jsonb_build_object(
    'vendas', count(*),
    'vendido', coalesce(sum(l.total), 0),
    'pagamentos', jsonb_build_object(
      'recebido_na_loja', coalesce(sum(l.recebido_na_loja), 0),
      'financiado', coalesce(sum(l.financiado), 0),
      'vale_troca', coalesce(sum(l.vale), 0),
      'desfeitos', coalesce(sum(l.desfeitos), 0),
      'diferenca', coalesce(sum(l.dif_pagamentos), 0),
      'vendas_com_diferenca', count(*) filter (where l.dif_pagamentos <> 0),
      'exemplos', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'numero', e.numero) order by e.numero)
                            from (select x.id, x.numero from linha x where x.dif_pagamentos <> 0 order by x.numero limit 20) e), '[]'::jsonb)),
    'caixa', jsonb_build_object(
      'esperado', coalesce(sum(l.caixa_esperado), 0),
      'no_livro', coalesce(sum(l.caixa_no_livro), 0),
      'diferenca', coalesce(sum(l.caixa_no_livro - l.caixa_esperado), 0),
      'vendas_com_diferenca', count(*) filter (where l.caixa_no_livro <> l.caixa_esperado),
      'exemplos', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'numero', e.numero) order by e.numero)
                            from (select x.id, x.numero from linha x where x.caixa_no_livro <> x.caixa_esperado order by x.numero limit 20) e), '[]'::jsonb)),
    'estoque', jsonb_build_object(
      'unidades', coalesce(sum(l.unidades), 0),
      'no_livro', coalesce(sum(l.estoque_no_livro), 0),
      'diferenca', coalesce(sum(l.estoque_no_livro - l.unidades), 0),
      'vendas_com_diferenca', count(*) filter (where l.estoque_no_livro <> l.unidades),
      'exemplos', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'numero', e.numero) order by e.numero)
                            from (select x.id, x.numero from linha x where x.estoque_no_livro <> x.unidades order by x.numero limit 20) e), '[]'::jsonb))
  ) into resultado
  from linha l;

  return resultado;
end;
$$;

comment on function public.financeiro_conferencia(timestamptz, timestamptz, uuid) is
  'FIN-001a: a conferência do período, venda a venda: os pagamentos fecham com o total, o que entrou na loja está no livro do caixa e cada unidade vendida tem a saída no livro do estoque. Para quem vê as vendas da loja ou da rede, só nas lojas em que tem essa permissão. Só lê.';

revoke all on function public.financeiro_conferencia(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.financeiro_conferencia(timestamptz, timestamptz, uuid) to authenticated;
