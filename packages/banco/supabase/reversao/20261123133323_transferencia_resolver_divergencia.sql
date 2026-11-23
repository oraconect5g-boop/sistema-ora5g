-- Reversão de 20261123133323_transferencia_resolver_divergencia (lote TRF-d): tira a resolução da divergência do
-- recebimento e volta a tela de Transferências à definição do VEL-g. As resoluções gravadas se perdem (a auditoria guarda
-- cada uma); os movimentos que elas lançaram no livro do estoque FICAM, e o estoque continua certo. Antes de reverter com
-- resoluções gravadas, confira com o proprietário.
drop function if exists public.transferencia_resolver_divergencia(uuid, text, text[], int, text, text);
drop table if exists public.transferencia_resolucoes;
drop function if exists privado.resolucao_nao_muda();
alter table public.transferencias drop constraint if exists divergencia_resolvida_so_com_divergencia;
alter table public.transferencias drop column if exists divergencia_resolvida_em;

create or replace function public.transferencias_tela(p_limite int default 50)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with
  u as (select public.unidade_atual() as id),
  lista as (
    select t.id, t.numero, t.origem_id, t.destino_id, t.variante_id, t.quantidade, t.motivo, t.situacao, t.solicitado_por,
      t.quantidade_recebida, t.observacao, t.solicitado_em, t.remessa_id
    from public.transferencias t
    where t.origem_id = (select u.id from u) or t.destino_id = (select u.id from u)
    order by t.numero desc
    limit greatest(1, least(coalesce(p_limite, 50), 200))
  ),
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
      'solicitado_em', l.solicitado_em, 'remessa_id', l.remessa_id) order by l.numero desc) from lista l), '[]'::jsonb),
    'variantes', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'nome', v.nome, 'sku', v.sku, 'tipo', v.tipo) order by v.id)
      from variantes_da_lista v), '[]'::jsonb),
    'unidades', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'tipo', x.tipo) order by x.id)
      from public.unidades x where x.id in (select lj.id from lojas lj)), '[]'::jsonb),
    'itens', coalesce((select jsonb_agg(jsonb_build_object('transferencia_id', i.transferencia_id, 'item_serializado_id', i.item_serializado_id,
      'recebido', i.recebido) order by i.transferencia_id, i.item_serializado_id)
      from public.transferencia_itens i where i.transferencia_id in (select l.id from lista l)), '[]'::jsonb),
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
comment on function public.transferencias_tela(int) is
  'VEL-g: a tela de Transferências numa ida (a lista da loja do turno, os produtos, as lojas, os aparelhos separados, as remessas, os saldos e os aparelhos livres a separar), com o RLS de quem chama (security invoker).';
revoke all on function public.transferencias_tela(int) from public, anon;
grant execute on function public.transferencias_tela(int) to authenticated;
