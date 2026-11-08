-- Índices das chaves estrangeiras compostas de catalogo_estoque apontados pelo verificador do
-- Supabase (unindexed_foreign_keys, 08/11/2026). Só acrescenta índices; não muda dados nem regras.
-- Reversão: supabase/reversao/<mesmo nome>.sql
create index if not exists custos_variante_organizacao on public.custos (variante_id, organizacao_id);
create index if not exists estoque_movimentos_unidade_organizacao on public.estoque_movimentos (unidade_id, organizacao_id);
create index if not exists itens_unidade_organizacao on public.itens_serializados (unidade_id, organizacao_id);
create index if not exists precos_variante_organizacao on public.precos (variante_id, organizacao_id);
create index if not exists produtos_organizacao on public.produtos (organizacao_id);
