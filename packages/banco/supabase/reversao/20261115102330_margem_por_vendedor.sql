-- Reversão de 20261115102330_margem_por_vendedor.sql (antes 20261115060000; lote PERF-003b): só leitura, nada a desfazer além da função.
drop function if exists public.margem_por_vendedor(timestamptz, timestamptz, uuid);
