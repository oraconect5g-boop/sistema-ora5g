-- Reversão de 20261114012604_metas_lojas: só a leitura; nenhum dado muda.
drop function if exists public.metas_lojas(date, uuid);
