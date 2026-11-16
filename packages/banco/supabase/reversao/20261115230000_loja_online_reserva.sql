-- Reversão de 20261115230000_loja_online_reserva (lote ONLINE-b): as funções da reserva do site saem, a vitrine volta a
-- contar como reservada a reserva vencida ainda não liberada, e as tabelas das reservas do site saem (as reservas feitas
-- se perdem: só em banco sem dados reais; as reservas de estoque de origem "online" ficam como estavam).
drop function if exists public.loja_reservas_liberar_vencidas();
drop function if exists public.loja_reserva_atender(uuid, text);
drop function if exists public.loja_reserva_cancelar(uuid, text);
drop function if exists public.loja_reserva_contato(uuid);
drop function if exists public.loja_reservar(uuid, uuid, uuid, text, text, text);
drop function if exists privado.reserva_do_site_para_a_loja(uuid);
drop function if exists privado.reserva_do_site_em_json(public.loja_reservas);
drop function if exists privado.codigo_de_reserva();

-- privado.ofertas_da_vitrine: de volta à versão de 20261115210812_loja_online_vitrine.sql.
create or replace function privado.ofertas_da_vitrine(p_organizacao uuid, p_produto uuid)
returns table (variante_id uuid, unidade_id uuid, preco_centavos bigint, disponivel int)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, u.id, privado.preco_do_balcao(v.id, u.id), greatest(coalesce(s.quantidade - s.reservado, 0), 0)
  from public.produtos p
  join public.variantes v on v.produto_id = p.id and v.ativa
  join public.unidades u on u.organizacao_id = p.organizacao_id and u.tipo = 'loja_fisica' and u.status = 'ativa'
  left join public.estoque_saldos s on s.unidade_id = u.id and s.variante_id = v.id
  where p.id = p_produto and p.organizacao_id = p_organizacao and p.publicar_online and p.ativo and p.tipo in ('aparelho', 'acessorio')
    and privado.preco_do_balcao(v.id, u.id) is not null;
$$;
revoke all on function privado.ofertas_da_vitrine(uuid, uuid) from public, anon, authenticated;

drop table if exists privado.loja_reservas_contato;
drop table if exists public.loja_reservas;
