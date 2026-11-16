-- =============================================================================
-- Velocidade das telas com login, lote VEL-a (ORA-QUAL-010, ORA-POS-002, D-047)
--
-- Medido no servidor da homologação em 16/11/2026: cada ida ao banco custa de 0,16 s (conexão
-- reaproveitada) a 0,42 s (conexão nova), e as telas faziam muitas idas em fila. Toda tela com menu
-- fazia 2 idas para a sessão e mais 34 pedidos para o molde (30 permissões, o nome e os vínculos, e
-- depois 2 contagens). O PDV com venda aberta fazia de 10 a 13 idas em fila.
--
-- 1) public.molde_da_sessao: numa ida só, a situação da sessão, as permissões pedidas pelo menu, o
--    nome, os vínculos (para o papel mostrado no topo) e as duas contagens do menu. Não decide nada
--    por conta própria:
--      * a situação é a linha de public.situacao_da_sessao() (a decisão de sessão de sempre:
--        usuário ativo, turno, loja escolhida, segundo fator);
--      * cada permissão é respondida pela MESMA public.tem_permissao que as telas e as ações usam:
--        as da loja com a loja do turno (ou nula, quando ainda não há loja escolhida, como já era),
--        as da rede sem loja;
--      * o nome, os vínculos e as contagens são leituras comuns, com as regras de leitura (RLS) de
--        quem chama. As contagens só são feitas para quem tem a permissão da fila, como já era.
--    Não cria permissão, não muda a matriz de papéis e não grava nada. Limite de 80 permissões por
--    chamada (o menu pede 30), para a função não virar um jeito de pedir trabalho sem fim.
--
-- 2) public.pdv_tela: numa ida só, o que o PDV mostra antes de qualquer busca: o caixa aberto de
--    quem chama na loja do turno, a venda em andamento de quem chama nessa loja, o carrinho (cada
--    item com o nome e o SKU da variação, o IMEI ou ICCID, a regra de preço gravada no item, a ordem
--    de serviço do conserto e a situação da aprovação de desconto mais recente) e as maquininhas
--    ativas da loja. É a mesma leitura que a tela já fazia em várias idas, com as mesmas regras de
--    leitura (RLS): o que quem chama não lê vem nulo ou vazio, nunca de outra loja ou de outro
--    vendedor. Não lê custo, não lê estoque e não grava nada.
--
-- As duas são SECURITY INVOKER, como vendas_painel e financeiro_painel, e não ficam abertas para
-- quem não entrou (anon).
--
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function public.molde_da_sessao(
  p_permissoes_da_loja text[],
  p_permissoes_da_rede text[] default '{}'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_eu constant uuid := (select auth.uid());
  v_situacao jsonb;
  v_unidade uuid;
  v_permissoes jsonb;
  v_nome text;
  v_vinculos jsonb;
  v_aprovacoes bigint := 0;
  v_notas bigint := 0;
begin
  if coalesce(cardinality(p_permissoes_da_loja), 0) + coalesce(cardinality(p_permissoes_da_rede), 0) > 80 then
    raise exception 'Permissões demais numa leitura só: no máximo 80' using errcode = '22023';
  end if;

  -- A decisão da sessão é a de sempre: situacao_da_sessao devolve exatamente uma linha.
  select to_jsonb(s) into v_situacao from public.situacao_da_sessao() s;
  v_unidade := (v_situacao ->> 'unidade_id')::uuid;

  -- Cada permissão pela mesma função das telas e das ações. Sessão bloqueada, fora do turno,
  -- encerrada ou com segundo fator pendente: tem_permissao nega todas, e a lista sai vazia.
  select coalesce(jsonb_agg(x.permissao order by x.permissao), '[]'::jsonb)
  into v_permissoes
  from (
    select l.permissao
    from unnest(coalesce(p_permissoes_da_loja, '{}'::text[])) as l(permissao)
    where public.tem_permissao(l.permissao, v_unidade)
    union
    select r.permissao
    from unnest(coalesce(p_permissoes_da_rede, '{}'::text[])) as r(permissao)
    where public.tem_permissao(r.permissao)
  ) x;

  select p.nome into v_nome from public.perfis_usuario p where p.id = v_eu;

  select coalesce(
    jsonb_agg(jsonb_build_object('papel', v.papel, 'escopo', v.escopo, 'unidade_id', v.unidade_id) order by v.criado_em, v.id),
    '[]'::jsonb)
  into v_vinculos
  from public.vinculos v
  where v.usuario_id = v_eu and v.fim is null;

  -- As duas filas do menu, só para quem pode atender cada uma (como o molde já fazia).
  if v_unidade is not null and public.tem_permissao('desconto.aprovar', v_unidade) then
    select count(*) into v_aprovacoes
    from public.aprovacoes_desconto a
    where a.unidade_id = v_unidade and a.situacao = 'pendente';
  end if;
  if v_unidade is not null and public.tem_permissao('nota.aprovar', v_unidade) then
    select count(*) into v_notas
    from public.notas_pedidos n
    where n.unidade_id = v_unidade and n.situacao in ('aguardando_aprovacao', 'aprovada');
  end if;

  return jsonb_build_object(
    'situacao', v_situacao,
    'permissoes', v_permissoes,
    'nome', v_nome,
    'vinculos', v_vinculos,
    'pendencias', jsonb_build_object('aprovacoes', v_aprovacoes, 'notas', v_notas)
  );
end;
$$;

comment on function public.molde_da_sessao(text[], text[]) is
  'VEL-a: numa ida só, a situação da sessão (situacao_da_sessao), as permissões pedidas (cada uma por tem_permissao), o nome, os vínculos e as contagens do menu. Só lê; não decide permissão por conta própria.';

revoke all on function public.molde_da_sessao(text[], text[]) from public, anon;
grant execute on function public.molde_da_sessao(text[], text[]) to authenticated;

create or replace function public.pdv_tela()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_eu constant uuid := (select auth.uid());
  v_unidade constant uuid := (select public.unidade_atual());
  v_caixa jsonb;
  v_venda_id uuid;
  v_venda jsonb;
  v_itens jsonb := '[]'::jsonb;
  v_terminais jsonb := '[]'::jsonb;
begin
  -- Sem sessão ou sem loja do turno não há PDV: resposta vazia (a tela já manda escolher a loja).
  if v_eu is null or v_unidade is null then
    return jsonb_build_object('caixa', null, 'venda', null, 'itens', '[]'::jsonb, 'terminais', '[]'::jsonb);
  end if;

  select jsonb_build_object('id', c.id, 'aberto_em', c.aberto_em)
  into v_caixa
  from public.caixas c
  where c.operador_id = v_eu and c.unidade_id = v_unidade and c.situacao = 'aberto'
  order by c.aberto_em desc, c.id
  limit 1;

  select v.id, jsonb_build_object('id', v.id, 'numero', v.numero, 'situacao', v.situacao)
  into v_venda_id, v_venda
  from public.vendas v
  where v.vendedor_id = v_eu and v.unidade_id = v_unidade and v.situacao in ('rascunho', 'aguardando_aprovacao')
  order by v.criado_em desc, v.id
  limit 1;

  if v_venda_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id,
        'variante_id', i.variante_id,
        'item_serializado_id', i.item_serializado_id,
        'tipo', i.tipo,
        'quantidade', i.quantidade,
        'preco_unitario_centavos', i.preco_unitario_centavos,
        'desconto_centavos', i.desconto_centavos,
        'preco_id', i.preco_id,
        'os_id', i.os_id,
        'variante', (select jsonb_build_object('sku', va.sku, 'nome', va.nome) from public.variantes va where va.id = i.variante_id),
        'serial', (select jsonb_build_object('imei', s.imei, 'iccid', s.iccid) from public.itens_serializados s where s.id = i.item_serializado_id),
        -- A regra de preço gravada no item (L6b): a tela só mostra quando é campanha.
        'preco', (select jsonb_build_object('id', p.id, 'origem', p.origem, 'unidade_id', p.unidade_id, 'motivo', p.motivo, 'fim', p.fim)
                  from public.precos p where p.id = i.preco_id),
        -- O conserto da ordem de serviço no carrinho (L12c).
        'os', (select jsonb_build_object('id', o.id, 'numero', o.numero, 'situacao', o.situacao) from public.ordens_servico o where o.id = i.os_id),
        -- O pedido de aprovação de desconto mais recente do item.
        'aprovacao', (select a.situacao from public.aprovacoes_desconto a
                      where a.venda_id = i.venda_id and a.item_id = i.id
                      order by a.solicitado_em desc, a.id desc limit 1)
      ) order by i.criado_em, i.id), '[]'::jsonb)
    into v_itens
    from public.venda_itens i
    where i.venda_id = v_venda_id;
  end if;

  -- Maquininhas ativas da loja (L7a): quem paga por maquininha escolhe qual foi usada.
  select coalesce(
    jsonb_agg(jsonb_build_object('id', t.id, 'provedor', t.provedor, 'apelido', t.apelido, 'identificador', t.identificador) order by t.apelido, t.id),
    '[]'::jsonb)
  into v_terminais
  from public.terminais t
  where t.unidade_id = v_unidade and t.ativo;

  return jsonb_build_object('caixa', v_caixa, 'venda', v_venda, 'itens', v_itens, 'terminais', v_terminais);
end;
$$;

comment on function public.pdv_tela() is
  'VEL-a: numa ida só, o caixa aberto e a venda em andamento de quem chama na loja do turno, o carrinho (variação, IMEI ou ICCID, regra de preço, ordem de serviço e aprovação de desconto) e as maquininhas ativas. Só lê, com as regras de leitura de quem chama.';

revoke all on function public.pdv_tela() from public, anon;
grant execute on function public.pdv_tela() to authenticated;
