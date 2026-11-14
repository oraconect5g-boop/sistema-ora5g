-- Reversão de 20261114193000_relatorio_da_assistencia: só leitura, nada a desfazer além da função.
drop function if exists public.os_relatorio(date, date, uuid);
