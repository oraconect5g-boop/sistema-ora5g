-- Reversão de 20261113065706_margem_painel (as funções só leem: desfazer não perde nenhum
-- registro).
drop function if exists public.margem_itens(timestamptz, timestamptz, uuid, integer, integer);
drop function if exists public.margem_painel(timestamptz, timestamptz, uuid);
