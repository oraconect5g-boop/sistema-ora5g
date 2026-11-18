-- Reversão de 20261118095048_precos_em_lote: tira a leitura do preço em lote. Antes, volte a plataforma para a versão
-- anterior ao lote VEL-b (a busca do PDV a usa).
drop function if exists public.precos_vigentes(uuid[], uuid);
