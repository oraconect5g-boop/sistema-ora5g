-- Reversão de 20261113162509_connect_painel (a função só lê: desfazer não perde nenhum registro).
drop function if exists public.connect_painel(timestamptz, timestamptz, uuid, uuid);
