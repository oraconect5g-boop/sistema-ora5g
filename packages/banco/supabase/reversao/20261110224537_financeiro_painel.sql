-- Reversão de 20261110224537_financeiro_painel (só em banco sem dados reais; a função só lê).
drop function if exists public.financeiro_painel(timestamptz, timestamptz, uuid, boolean);
