-- Reversão de 20261114161903_recebiveis_painel (só em banco sem dados reais).
-- A leitura só lê: apagar a função não muda dado nenhum.
drop function if exists public.recebiveis_painel(uuid, int);
