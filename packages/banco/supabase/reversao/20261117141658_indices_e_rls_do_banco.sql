-- Reversão de 20261117141658_indices_e_rls_do_banco (lote BANCO-a): tira os 10 índices das chaves estrangeiras, desliga o RLS
-- de privado.identificadores_itens e apaga os 10 comentários. Nada de dado muda.
drop index public.caixa_saidas_fk_unidade_organizacao;
drop index public.conta_pagar_anexos_fk_organizacao;
drop index public.contas_a_pagar_fk_entrada_organizacao;
drop index public.entradas_estoque_fk_pedido_organizacao;
drop index public.entradas_estoque_fk_unidade_organizacao;
drop index public.fotos_produto_fk_produto_organizacao;
drop index public.inventarios_fk_unidade_organizacao;
drop index public.metas_fk_unidade_organizacao;
drop index public.pedidos_compra_fk_unidade_organizacao;
drop index public.unidade_configuracoes_fk_unidade_organizacao;

alter table privado.identificadores_itens disable row level security;

comment on table privado.cliente_dados is null;
comment on table privado.connect_dados_envio is null;
comment on table privado.connect_segredos is null;
comment on table privado.crm_segredos is null;
comment on table privado.fotos_em_limpeza is null;
comment on table privado.identificadores_itens is null;
comment on table privado.loja_reservas_contato is null;
comment on table privado.notas_destinatarios is null;
comment on table privado.whatsapp_destinos is null;
comment on table public.pedido_compra_itens is null;
