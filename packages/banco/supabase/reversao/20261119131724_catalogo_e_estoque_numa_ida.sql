-- Reversão de 20261119131724_catalogo_e_estoque_numa_ida (lote VEL-d): tira as duas leituras únicas. Nada se perde (são
-- só leituras); o Catálogo e a lista do Estoque voltam sozinhos às leituras de antes, que o app guarda para o banco sem as
-- funções.
drop function if exists public.estoque_lista(int, int);
drop function if exists public.catalogo_tela(uuid[], boolean, int);
