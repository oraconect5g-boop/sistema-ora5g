-- Reversão de 20261123182645_financeiro_conferencia (lote FIN-001a): tira a conferência do período. Nada se perde: a função
-- só lê; a tela do Financeiro some com o cartão da conferência e segue como antes.
drop function if exists public.financeiro_conferencia(timestamptz, timestamptz, uuid);
