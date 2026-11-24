-- Reversão do lote PAY-014a (o pagamento pelo site pela Asaas). A visão do pedido e o cancelar voltam às versões do
-- ONLINE-d (copiadas da migration 20261118031404_pedido_do_site), antes de as tabelas e as funções novas saírem; a
-- impressão do token do aviso sai dos segredos das rotinas.
create or replace function privado.pedido_do_site_em_json(p_pedido public.loja_pedidos)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'codigo', p_pedido.codigo,
    'situacao', case when p_pedido.situacao = 'reservado' and p_pedido.expira_em <= now() then 'vencido' else p_pedido.situacao end,
    'expira_em', p_pedido.expira_em, 'total_centavos', p_pedido.total_centavos, 'unidades', p_pedido.unidades,
    'itens', (select coalesce(jsonb_agg(jsonb_build_object(
                'produto', (select p.nome from public.variantes v join public.produtos p on p.id = v.produto_id where v.id = r.variante_id),
                'variacao', (select v.nome from public.variantes v where v.id = r.variante_id),
                'preco_centavos', r.preco_centavos) order by r.numero), '[]'::jsonb)
              from public.loja_reservas r where r.pedido_id = p_pedido.id),
    'loja', (select jsonb_build_object('nome', u.nome, 'endereco', u.endereco, 'cidade', u.cidade) from public.unidades u where u.id = p_pedido.unidade_id));
$$;
create or replace function public.loja_pedido_cancelar(p_pedido uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pedido public.loja_pedidos := privado.pedido_do_site_para_a_loja(p_pedido);
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_reserva public.loja_reservas;
begin
  if length(v_motivo) > 200 then
    raise exception 'O motivo tem até 200 letras' using errcode = '22023';
  end if;
  if v_pedido.situacao = 'cancelado' then
    return false;
  end if;
  if v_pedido.situacao = 'atendido' then
    raise exception 'Este pedido já foi atendido: a venda segue no PDV' using errcode = '22023';
  end if;
  -- Cada unidade volta como no cancelamento da reserva avulsa (a reserva de estoque liberada), aqui mesmo: a reserva
  -- que é de um pedido não se cancela sozinha.
  for v_reserva in select r.* from public.loja_reservas r where r.pedido_id = v_pedido.id and r.situacao = 'ativa' order by r.numero for update loop
    perform privado.encerrar_reserva(v_reserva.estoque_reserva_id, 'liberada');
    update public.loja_reservas r
    set situacao = 'cancelada', cancelada_em = now(), cancelada_por = (select auth.uid()), motivo_cancelamento = v_motivo
    where r.id = v_reserva.id;
  end loop;
  update public.loja_pedidos p
  set situacao = 'cancelado', cancelado_em = now(), cancelado_por = (select auth.uid()), motivo_cancelamento = v_motivo
  where p.id = v_pedido.id;
  return true;
end;
$$;
drop function if exists public.loja_pagamento_disponivel();
drop function if exists public.loja_pagamento_pedir(uuid, text, text);
drop function if exists public.pagamento_aviso_receber(text, jsonb);
drop function if exists public.pagamento_configuracao();
drop function if exists public.pagamento_ligar(text, text, text);
drop function if exists public.pagamentos_a_criar(int);
drop function if exists public.pagamento_link_registrar(uuid, text, text);
drop function if exists public.pagamento_criacao_falhou(uuid, text, boolean);
drop function if exists public.pagamento_avisos_a_processar(int);
drop function if exists public.pagamento_aviso_concluir(text, text);
drop function if exists public.pagamento_consulta_aplicar(text, jsonb);
drop function if exists public.pagamentos_a_desativar(int);
drop function if exists public.pagamento_link_desativado(uuid);
drop function if exists privado.pagamento_do_pedido_em_json(public.loja_pedidos);
drop table if exists privado.pagamento_avisos;
drop table if exists public.loja_pagamentos;
drop table if exists privado.pagamento_pelo_site;
delete from privado.segredos_de_rotina where nome = 'asaas_aviso';
