-- Reversão de 20261118165816_pendencias_numa_ida (lote VEL-c): o sino e o Início voltam a contar as pendências uma a
-- uma (a tela usa esse caminho quando o banco não tem a função). Nada é gravado pela função; nada se perde.
drop function if exists public.pendencias_da_loja();
