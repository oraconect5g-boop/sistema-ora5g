-- Reversão de devolucao_e_troca. SOMENTE em banco sem dados reais: apaga devoluções, reembolsos,
-- vales e usos de vale, o pedido de nota de devolução e os gatilhos; volta a lista de meios sem o
-- vale-troca. Os movimentos de estoque e de caixa lançados ficam (os livros só aceitam inserção).
drop function if exists public.devolver_itens(uuid, jsonb, jsonb, text, text);
drop trigger if exists venda_pagamentos_vale on public.venda_pagamentos;
drop trigger if exists vendas_com_devolucao on public.vendas;
drop function if exists privado.vale_no_pagamento(), privado.proteger_venda_com_devolucao();

alter table public.notas_eventos drop constraint notas_eventos_tipo_check;
alter table public.notas_eventos add constraint notas_eventos_tipo_check check (tipo in (
  'pedida', 'aprovada', 'correcao_solicitada', 'corrigida', 'emitida', 'emitida_sem_aprovacao_previa', 'cancelada'));
delete from public.notas_pedidos where tipo = 'devolucao';
drop index if exists public.notas_um_pedido_por_devolucao;
drop index if exists public.notas_um_pedido_vivo_por_venda;
create unique index notas_um_pedido_vivo_por_venda on public.notas_pedidos (venda_id) where situacao <> 'cancelada';
alter table public.notas_pedidos drop constraint if exists devolucao_tem_referencia;
alter table public.notas_pedidos drop column if exists devolucao_id;
alter table public.notas_pedidos drop column if exists tipo;

drop table if exists public.vales_troca_usos, public.vales_troca, public.venda_devolucao_reembolsos, public.venda_devolucao_itens,
  public.venda_devolucoes;
alter table public.vendas drop column if exists devolvido_centavos;
alter table public.venda_pagamentos drop constraint if exists entrada_sem_vale;

create or replace function privado.meio_valido(p_meio text)
returns boolean language sql immutable set search_path = ''
as $$ select p_meio in ('dinheiro', 'pix_direto', 'pix_picpay', 'cartao_picpay', 'cartao_pagseguro', 'link_pagamento', 'payjoy', 'aiva'); $$;

create or replace function privado.meio_com_comprovante(p_meio text)
returns boolean language sql immutable set search_path = ''
as $$ select p_meio in ('pix_direto', 'pix_picpay', 'cartao_picpay', 'cartao_pagseguro'); $$;
