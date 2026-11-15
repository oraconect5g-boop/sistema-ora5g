-- Reversão de 20261115043059_pagamentos_por_terminal.sql (antes 20261115030000; lote REPORT-005b): só leitura, nada a desfazer além da função.
drop function if exists public.pagamentos_por_terminal(timestamptz, timestamptz, uuid);
