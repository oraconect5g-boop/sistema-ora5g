-- =============================================================================
-- Painéis do estoque (lote G3: ORA-REPORT-007; ORA-INV-001 e ORA-INV-004; linha 21 da matriz, E1 a E7)
--
-- public.estoque_painel(p_unidade): a posição de AGORA do estoque, somada no banco (sem o corte de 500
-- linhas da tela de hoje), por local, por modelo e por categoria, com as pendências de cada local.
-- É SECURITY INVOKER: valem as regras de leitura (RLS) de quem chama, e os locais são só os que quem
-- chama consulta (estoque.consultar). p_unidade restringe a um desses locais. Não muda dado e não lê
-- custo (o valor em custo, E8, fica para depois, com custo.ver).
--
--   E1 físico        soma de estoque_saldos.quantidade;
--   E2 reservado     soma de estoque_saldos.reservado (reservas ativas de venda e de transferência);
--   E3 disponível    físico − reservado. Só os locais que vendem (loja física e online) entram nos
--                    números de venda; o físico dos outros locais (DEFEITOS, depósito, assistência) vem
--                    à parte, em "fora_da_venda";
--   E4 em trânsito   transferência enviada e ainda não recebida: saiu do físico da origem e ainda não
--                    entrou no do destino. Conta em "chegando" no destino;
--   E5 mínimo        o mínimo é da variação e vale igual em toda loja que vende: cada par (loja,
--                    variação ativa com mínimo) com disponível abaixo dele conta, inclusive a loja que
--                    não tem saldo nenhum da variação. O mínimo de um modelo é a soma dos pares;
--   E6 parado        aparelho e chip: item disponível na loja desde a última entrada nela, há mais de 60
--                    dias. Os demais: saldo disponível sem venda e sem entrada na loja nos últimos 60
--                    dias (mercadoria que acabou de chegar não é estoque parado);
--   E7 pendências    transferências a separar, a enviar e a receber; inventários em contagem ou
--                    aguardando decisão; retornos de venda cancelada a conferir (pela regra de leitura
--                    das vendas); aparelhos e chips no estoque sem a conferência de hoje.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function public.estoque_painel(p_unidade uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  resultado jsonb;
  corte constant timestamptz := now() - interval '60 days';
  inicio_de_hoje constant timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  with
  locais as (
    select u.id, u.nome, u.tipo, u.tipo in ('loja_fisica', 'online') as vende
    from public.unidades u
    where u.id in (select privado.unidades_com_permissao('estoque.consultar'))
      and (p_unidade is null or u.id = p_unidade)
  ),
  catalogo as (
    select v.id as variante_id, v.estoque_minimo, v.ativa, p.id as produto_id, p.nome as produto, p.tipo, p.categoria_id, c.nome as categoria
    from public.variantes v
    join public.produtos p on p.id = v.produto_id
    left join public.categorias c on c.id = p.categoria_id
    where p.tipo in ('aparelho', 'acessorio', 'chip')
  ),
  saldos as (
    select s.unidade_id, s.variante_id, s.quantidade, s.reservado
    from public.estoque_saldos s
    where s.unidade_id in (select l.id from locais l)
  ),
  chegando as (
    select t.destino_id as unidade_id, t.variante_id, sum(t.quantidade) as quantidade
    from public.transferencias t
    where t.situacao = 'enviada' and t.destino_id in (select l.id from locais l)
    group by 1, 2
  ),
  -- Cada par (loja que vende, variação de estoque) com saldo, com mínimo ou com mercadoria chegando.
  pares as (
    select l.id as unidade_id, k.variante_id, k.tipo, coalesce(s.quantidade, 0) as fisico, coalesce(s.reservado, 0) as reservado,
      case when k.ativa and k.estoque_minimo > 0 then k.estoque_minimo else 0 end as minimo, coalesce(ch.quantidade, 0) as chegando
    from locais l
    join catalogo k on true
    left join saldos s on s.unidade_id = l.id and s.variante_id = k.variante_id
    left join chegando ch on ch.unidade_id = l.id and ch.variante_id = k.variante_id
    where l.vende and (s.variante_id is not null or ch.variante_id is not null or (k.ativa and k.estoque_minimo > 0))
  ),
  -- E6 de aparelho e chip: a última entrada do item na loja em que ele está.
  itens_parados as (
    select i.unidade_id, i.variante_id, count(*) as quantidade
    from public.itens_serializados i
    where i.unidade_id in (select l.id from locais l where l.vende) and i.em_estoque and i.situacao = 'disponivel'
      and coalesce((select max(m.ocorrido_em) from public.estoque_movimentos m
                    where m.item_serializado_id = i.id and m.unidade_id = i.unidade_id and m.quantidade > 0), i.criado_em) < corte
    group by 1, 2
  ),
  -- E6 dos demais: houve venda ou entrada na loja nos últimos 60 dias.
  movimento_recente as (
    select distinct m.unidade_id, m.variante_id
    from public.estoque_movimentos m
    where m.unidade_id in (select l.id from locais l) and m.ocorrido_em >= corte and (m.tipo = 'venda' or m.quantidade > 0)
  ),
  por_par as (
    select p.unidade_id, p.variante_id, p.fisico, p.reservado, p.fisico - p.reservado as disponivel, p.minimo,
      (p.minimo > 0 and p.fisico - p.reservado < p.minimo) as abaixo, p.chegando,
      case when p.tipo in ('aparelho', 'chip') then coalesce(ip.quantidade, 0)
           when p.fisico - p.reservado > 0 and r.variante_id is null then p.fisico - p.reservado
           else 0 end as parado
    from pares p
    left join itens_parados ip on ip.unidade_id = p.unidade_id and ip.variante_id = p.variante_id
    left join movimento_recente r on r.unidade_id = p.unidade_id and r.variante_id = p.variante_id
  ),
  modelos as (
    select k.produto_id, k.produto, k.tipo, k.categoria_id, k.categoria,
      sum(x.fisico) as fisico, sum(x.reservado) as reservado, sum(x.disponivel) as disponivel, sum(x.minimo) as minimo,
      count(*) filter (where x.abaixo) as abaixo_do_minimo, sum(x.parado) as parado, sum(x.chegando) as chegando
    from por_par x
    join catalogo k on k.variante_id = x.variante_id
    group by 1, 2, 3, 4, 5
  ),
  categorias as (
    select m.categoria_id, m.categoria,
      sum(m.fisico) as fisico, sum(m.reservado) as reservado, sum(m.disponivel) as disponivel,
      sum(m.abaixo_do_minimo) as abaixo_do_minimo, sum(m.parado) as parado, sum(m.chegando) as chegando
    from modelos m
    group by 1, 2
  ),
  por_local as (
    select l.id as unidade_id, l.nome, l.tipo, l.vende,
      coalesce((select sum(s.quantidade) from saldos s where s.unidade_id = l.id), 0) as fisico,
      coalesce((select sum(s.reservado) from saldos s where s.unidade_id = l.id), 0) as reservado,
      coalesce((select sum(x.disponivel) from por_par x where x.unidade_id = l.id), 0) as disponivel,
      coalesce((select count(*) filter (where x.abaixo) from por_par x where x.unidade_id = l.id), 0) as abaixo_do_minimo,
      coalesce((select sum(x.parado) from por_par x where x.unidade_id = l.id), 0) as parado,
      coalesce((select sum(ch.quantidade) from chegando ch where ch.unidade_id = l.id), 0) as chegando,
      (select count(*) from public.transferencias t where t.origem_id = l.id and t.situacao = 'solicitada') as a_separar,
      (select count(*) from public.transferencias t where t.origem_id = l.id and t.situacao = 'separada') as a_enviar,
      (select count(*) from public.transferencias t where t.destino_id = l.id and t.situacao = 'enviada') as a_receber,
      (select count(*) from public.inventarios i where i.unidade_id = l.id and i.situacao in ('em_contagem', 'enviado')) as inventarios_abertos,
      (select count(*) from public.venda_retornos r where r.unidade_id = l.id and r.situacao = 'pendente') as retornos_a_conferir,
      (select count(*) from public.itens_serializados i
        where i.unidade_id = l.id and i.em_estoque and (i.conferido_em is null or i.conferido_em < inicio_de_hoje)) as sem_conferencia_hoje
    from locais l
  )
  select jsonb_build_object(
    'totais', (
      select jsonb_build_object(
        'fisico', coalesce(sum(x.fisico), 0), 'reservado', coalesce(sum(x.reservado), 0), 'disponivel', coalesce(sum(x.disponivel), 0),
        'abaixo_do_minimo', count(*) filter (where x.abaixo), 'parado', coalesce(sum(x.parado), 0), 'chegando', coalesce(sum(x.chegando), 0),
        'fora_da_venda', coalesce((select sum(s.quantidade) from saldos s join locais l on l.id = s.unidade_id where not l.vende), 0))
      from por_par x),
    'locais', coalesce((select jsonb_agg(to_jsonb(x) order by x.vende desc, x.nome) from por_local x), '[]'::jsonb),
    'modelos', coalesce((select jsonb_agg(to_jsonb(m) order by m.disponivel desc, m.produto)
                         from modelos m where m.fisico > 0 or m.minimo > 0 or m.chegando > 0), '[]'::jsonb),
    'categorias', coalesce((select jsonb_agg(to_jsonb(c) order by c.disponivel desc, c.categoria) from categorias c), '[]'::jsonb)
  ) into resultado;

  return resultado;
end;
$$;

comment on function public.estoque_painel(uuid) is
  'Estoque (G3): posição de agora por local, modelo e categoria, com mínimo, trânsito, parado há 60 dias e pendências, com as regras de leitura de quem chama (security invoker). Sem custo.';

revoke all on function public.estoque_painel(uuid) from public, anon;
grant execute on function public.estoque_painel(uuid) to authenticated;
