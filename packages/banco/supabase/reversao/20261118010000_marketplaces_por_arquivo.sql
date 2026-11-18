-- Reversão de 20261118010000_marketplaces_por_arquivo (lote MKTPL-a): tira o painel, a importação, os itens, os pedidos e as
-- importações dos marketplaces. Nada mais muda: o catálogo, o estoque e as vendas ficam como estão.
drop function public.marketplace_painel(date, date);
drop function public.marketplace_importar(text, text, text, int, jsonb, jsonb);
drop table public.marketplace_pedido_itens;
drop table public.marketplace_pedidos;
drop table public.marketplace_importacoes;
