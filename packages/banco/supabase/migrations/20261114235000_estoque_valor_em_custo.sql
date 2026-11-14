-- =============================================================================
-- Valor do estoque a custo (lote G3b: ORA-REPORT-007, o resto; E8 da matriz de painéis)
--
-- public.estoque_valor_em_custo(loja): quanto vale o estoque de agora pelo custo vigente de cada variação (o mesmo de
-- privado.custo_vigente: o último custo gravado, que vale para toda a rede), só para quem tem custo.ver e
-- estoque.consultar no local (o dono na rede, o gerente na loja dele); loja fora disso: 42501. Só leitura.
--   * por local e no total: o valor dos locais que vendem (loja física e online), o dos que não vendem (DEFEITOS,
--     depósito, assistência) à parte, e o que está chegando por transferência enviada e ainda não recebida;
--   * a quantidade com custo e a sem custo (a variação sem custo gravado fica fora da soma e é contada, para a tela
--     dizer o que ficou de fora, nunca somar zero no lugar);
--   * só aparelho, acessório e chip (serviço e recarga não têm estoque).
-- O custo é o da variação (não do item): aparelho com IMEI vale o custo vigente da variação dele.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function public.estoque_valor_em_custo(p_unidade uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_permitidas uuid[] := array(
    select u from privado.unidades_com_permissao('estoque.consultar') u
    intersect
    select u from privado.unidades_com_permissao('custo.ver') u);
  v_locais uuid[];
  resultado jsonb;
begin
  if coalesce(array_length(v_permitidas, 1), 0) = 0 then
    raise exception 'Sem permissão para o valor do estoque a custo' using errcode = '42501';
  end if;
  if p_unidade is not null and not (p_unidade = any (v_permitidas)) then
    raise exception 'Sem permissão para o valor do estoque desta loja' using errcode = '42501';
  end if;
  v_locais := case when p_unidade is null then v_permitidas else array[p_unidade] end;

  with
  locais as (
    select u.id, u.nome, u.tipo in ('loja_fisica', 'online') as vende
    from public.unidades u where u.id = any (v_locais)
  ),
  de_estoque as (
    select v.id as variante_id
    from public.variantes v join public.produtos p on p.id = v.produto_id
    where p.tipo in ('aparelho', 'acessorio', 'chip')
  ),
  -- O que está no físico de cada local (o reservado também é estoque da loja até a venda concluir).
  saldos as (
    select s.unidade_id, s.variante_id, s.quantidade
    from public.estoque_saldos s
    where s.unidade_id = any (v_locais) and s.quantidade > 0 and s.variante_id in (select d.variante_id from de_estoque d)
  ),
  -- O que saiu da origem e ainda não entrou no destino: conta no destino, à parte.
  chegando as (
    select t.destino_id as unidade_id, t.variante_id, sum(t.quantidade) as quantidade
    from public.transferencias t
    where t.situacao = 'enviada' and t.destino_id = any (v_locais) and t.variante_id in (select d.variante_id from de_estoque d)
    group by 1, 2
  ),
  variacoes as (
    select distinct x.variante_id from (select variante_id from saldos union select variante_id from chegando) x
  ),
  custo as (
    select v.variante_id, c.valor_centavos
    from variacoes v
    left join lateral (
      select k.valor_centavos from public.custos k where k.variante_id = v.variante_id
      order by k.inicio desc, k.criado_em desc, k.id desc limit 1
    ) c on true
  ),
  por_local as (
    select l.id as unidade, l.nome, l.vende,
      coalesce((select sum(s.quantidade * c.valor_centavos) from saldos s join custo c on c.variante_id = s.variante_id
                where s.unidade_id = l.id and c.valor_centavos is not null), 0) as valor,
      coalesce((select sum(s.quantidade) from saldos s join custo c on c.variante_id = s.variante_id
                where s.unidade_id = l.id and c.valor_centavos is not null), 0) as itens_com_custo,
      coalesce((select sum(s.quantidade) from saldos s join custo c on c.variante_id = s.variante_id
                where s.unidade_id = l.id and c.valor_centavos is null), 0) as itens_sem_custo,
      coalesce((select sum(h.quantidade * c.valor_centavos) from chegando h join custo c on c.variante_id = h.variante_id
                where h.unidade_id = l.id and c.valor_centavos is not null), 0) as valor_chegando,
      coalesce((select sum(h.quantidade) from chegando h join custo c on c.variante_id = h.variante_id
                where h.unidade_id = l.id and c.valor_centavos is null), 0) as chegando_sem_custo
    from locais l
  ),
  -- As variações sem custo com saldo nos locais que vendem (para a tela dizer quantas são).
  sem_custo as (
    select count(distinct s.variante_id) as variacoes
    from saldos s join custo c on c.variante_id = s.variante_id join locais l on l.id = s.unidade_id
    where c.valor_centavos is null and l.vende
  )
  select jsonb_build_object(
    'unidade', p_unidade,
    'resumo', (select jsonb_build_object(
        'valor', coalesce(sum(p.valor) filter (where p.vende), 0),
        'itens_com_custo', coalesce(sum(p.itens_com_custo) filter (where p.vende), 0),
        'itens_sem_custo', coalesce(sum(p.itens_sem_custo) filter (where p.vende), 0),
        'variacoes_sem_custo', (select s.variacoes from sem_custo s),
        'valor_chegando', coalesce(sum(p.valor_chegando) filter (where p.vende), 0),
        'chegando_sem_custo', coalesce(sum(p.chegando_sem_custo) filter (where p.vende), 0),
        'valor_fora_da_venda', coalesce(sum(p.valor) filter (where not p.vende), 0),
        'itens_fora_da_venda_sem_custo', coalesce(sum(p.itens_sem_custo) filter (where not p.vende), 0))
      from por_local p),
    'por_local', (select coalesce(jsonb_agg(to_jsonb(p) order by p.vende desc, p.nome), '[]'::jsonb) from por_local p)
  ) into resultado;
  return resultado;
end;
$$;

revoke all on function public.estoque_valor_em_custo(uuid) from public, anon;
grant execute on function public.estoque_valor_em_custo(uuid) to authenticated;
