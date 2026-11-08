-- Reversão de indices_vendas_e_fotos: só tira os índices.
drop index if exists public.caixas_unidade_organizacao, public.fotos_produto_produto_organizacao, public.vendas_unidade_organizacao;
