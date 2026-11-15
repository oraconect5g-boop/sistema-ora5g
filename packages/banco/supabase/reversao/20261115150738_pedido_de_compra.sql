-- Reversão de 20261115150738_pedido_de_compra (antes 20261115150000; lote INV-009a; só em banco sem dados reais): as funções, a ligação da
-- entrada ao pedido e as tabelas dos pedidos.
drop function if exists public.pedido_compra(uuid);
drop function if exists public.pedidos_compra(uuid, text);
drop function if exists public.pedido_compra_ligar_entrada(uuid, uuid, text);
drop function if exists public.pedido_compra_encerrar(uuid, text);
drop function if exists public.pedido_compra_criar(uuid, uuid, text, date, jsonb, text, text);
drop function if exists privado.recebido_do_pedido(uuid);
alter table public.entradas_estoque drop constraint if exists entradas_estoque_pedido_fkey;
alter table public.entradas_estoque drop column if exists pedido_id;
drop table if exists public.pedido_compra_itens;
drop table if exists public.pedidos_compra;
drop function if exists privado.pedido_compra_so_encerramento();
drop policy auditoria_ler on public.auditoria;
create policy auditoria_ler on public.auditoria for select to authenticated
  using (
    (
      (unidade_id is not null and (select public.tem_permissao('auditoria.ver', unidade_id)))
      or (
        unidade_id is null
        and organizacao_id is not null
        and organizacao_id in (select privado.organizacoes_com_permissao('auditoria.ver'))
      )
    )
    and (
      alvo_tipo is distinct from 'entradas_estoque'
      or (unidade_id is not null and (select public.tem_permissao('custo.ver', unidade_id)))
    )
    and (
      alvo_tipo is distinct from 'custos'
      or organizacao_id in (select privado.organizacoes_com_permissao('custo.ver'))
    )
  );
