-- Reversão de 20261112195200_vendas_painel (as funções só leem e os índices não guardam dado:
-- desfazer não perde nenhum registro).
drop function if exists public.ranking_nomes(uuid[]);
drop function if exists public.vendas_painel(timestamptz, timestamptz, uuid, boolean, uuid);
drop index if exists public.venda_devolucoes_criado_em;
drop index if exists public.vendas_cancelada_em;
drop index if exists public.vendas_concluida_em;
