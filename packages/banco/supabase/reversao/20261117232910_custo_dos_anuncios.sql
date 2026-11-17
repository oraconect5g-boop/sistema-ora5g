-- Reversão de 20261117232910_custo_dos_anuncios (lote META-a): tira o painel, a importação, os custos, as importações e a
-- chave de campanha. Nada mais muda: as reservas, as oportunidades e as vendas ficam como estão.
drop function public.anuncios_painel(date, date);
drop function public.anuncios_importar(text, text, text, jsonb, jsonb);
drop table public.anuncios_custos;
drop table public.anuncios_importacoes;
drop function privado.chave_de_campanha(text);
