-- Reversão de 20261119184550_transferencias_numa_ida (lote VEL-g): tira a leitura única da tela de Transferências. Nada se
-- perde (é só leitura); a tela volta sozinha às leituras de antes, que o app guarda para o banco sem a função.
drop function if exists public.transferencias_tela(int);
