-- Reversão de 20261114202444_pecas_da_os (só em banco sem dados reais). Com peça usada em OS (movimento "consumo_os" no
-- livro, que é só de inserção) ou com evento de peça na trilha, as restrições antigas não voltam e a reversão para, de
-- propósito. privado.venda_item_reservado volta ao texto do L12c (20261114202336_entrega_da_os).
create or replace function privado.venda_item_reservado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_reservado boolean;
begin
  select p.reservado_para = 'ordem_de_servico' into v_reservado
  from public.variantes v join public.produtos p on p.id = v.produto_id
  where v.id = new.variante_id;
  if coalesce(v_reservado, false) and new.os_id is null then
    raise exception 'O conserto só entra na venda pela ordem de serviço' using errcode = '22023';
  end if;
  if new.os_id is not null and not coalesce(v_reservado, false) then
    raise exception 'O item da ordem de serviço é o conserto' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop function if exists public.os_devolver_peca(uuid, text);
drop function if exists public.os_usar_peca(uuid, uuid, int, text, text);
drop function if exists public.catalogo_definir_peca_de_assistencia(uuid, uuid, boolean, text);
drop table if exists public.os_pecas;
drop function if exists privado.os_peca_so_devolucao();
alter table public.os_eventos drop constraint os_eventos_tipo_check;
alter table public.os_eventos add constraint os_eventos_tipo_check
  check (tipo in ('aberta', 'enviada_ao_tecnico', 'recebida_pelo_tecnico', 'devolvida_pelo_tecnico', 'recebida_na_loja',
                  'devolvida_ao_cliente', 'cancelada', 'foto', 'aviso_whatsapp', 'orcamento', 'resposta_do_cliente', 'servico_concluido',
                  'cobrada', 'cobranca_desfeita', 'entregue_ao_cliente'));
alter table public.estoque_movimentos drop constraint if exists movimento_da_os_tem_referencia;
alter table public.estoque_movimentos drop constraint movimento_sinal_do_tipo;
alter table public.estoque_movimentos add constraint movimento_sinal_do_tipo check (
  (tipo in ('entrada_importacao', 'entrada_compra', 'devolucao', 'transferencia_entrada') and quantidade > 0)
  or (tipo in ('venda', 'perda', 'transferencia_saida') and quantidade < 0)
  or tipo in ('ajuste', 'ajuste_conciliacao')
);
alter table public.estoque_movimentos drop constraint estoque_movimentos_tipo_check;
alter table public.estoque_movimentos add constraint estoque_movimentos_tipo_check check (tipo in (
  'entrada_importacao', 'entrada_compra', 'ajuste_conciliacao', 'ajuste', 'perda',
  'venda', 'devolucao', 'transferencia_saida', 'transferencia_entrada'
));
alter table public.categorias drop column if exists peca_de_assistencia;
