-- Reversão de 20261114235000_estoque_valor_em_custo: só leitura, nada a desfazer além da função.
drop function if exists public.estoque_valor_em_custo(uuid);
