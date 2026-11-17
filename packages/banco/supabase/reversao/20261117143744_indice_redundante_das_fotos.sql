-- Reversão de 20261117143744_indice_redundante_das_fotos (lote BANCO-a): cria de novo o índice (produto_id, organizacao_id) das
-- fotos, que repete fotos_organizacao com as colunas em outra ordem.
create index fotos_produto_fk_produto_organizacao on public.fotos_produto (produto_id, organizacao_id);
