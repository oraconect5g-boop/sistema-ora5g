-- Índices para as chaves estrangeiras apontadas pelo verificador do Supabase
-- (unindexed_foreign_keys). Só acrescenta índices; não muda dados nem regras.
-- Reversão: supabase/reversao/20261107130000_indices_chaves_estrangeiras.sql
create index if not exists contexto_sessao_unidade on public.contexto_sessao (unidade_atual_id);
create index if not exists papel_permissoes_permissao on public.papel_permissoes (permissao);
create index if not exists unidades_empresa_organizacao on public.unidades (empresa_id, organizacao_id);
create index if not exists unidades_emissora on public.unidades (unidade_emissora_id);
create index if not exists vinculos_criado_por on public.vinculos (criado_por);
create index if not exists vinculos_organizacao on public.vinculos (organizacao_id);
create index if not exists vinculos_papel on public.vinculos (papel);
