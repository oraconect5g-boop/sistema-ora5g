-- Reversão de 20261115000320_estoque_valor_em_custo (antes 20261114235000): só leitura, nada a desfazer além da função.
drop function if exists public.estoque_valor_em_custo(uuid);
