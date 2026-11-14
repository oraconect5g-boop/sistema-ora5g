-- Reversão de 20261114215050_conciliacao_fiscal: as duas funções e a tabela das conferências (as conferências
-- registradas se perdem: só em banco sem dados reais).
drop function if exists public.notas_conferir_divergencia(uuid, text, text);
drop function if exists public.notas_conciliacao(date, date, uuid);
drop table if exists public.notas_divergencias_conferidas;
drop index if exists public.notas_pedidos_numero_emitida;
