-- Reversão de 20261115060000_margem_por_vendedor.sql (lote PERF-003b): só leitura, nada a desfazer além da função.
drop function if exists public.margem_por_vendedor(timestamptz, timestamptz, uuid);
