-- Reversão de 20261113155426_estoque_painel (a função só lê: desfazer não perde nenhum registro).
drop function if exists public.estoque_painel(uuid);
