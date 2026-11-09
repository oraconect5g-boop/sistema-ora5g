-- Índices das chaves estrangeiras compostas das tabelas de fotos e vendas (advisor 0001 do
-- Supabase depois de 20261108233546). Só índices: nenhuma regra muda.
-- Reversão: supabase/reversao/<mesmo nome>.sql
create index caixas_unidade_organizacao on public.caixas (unidade_id, organizacao_id);
create index fotos_produto_produto_organizacao on public.fotos_produto (produto_id, organizacao_id);
create index vendas_unidade_organizacao on public.vendas (unidade_id, organizacao_id);
