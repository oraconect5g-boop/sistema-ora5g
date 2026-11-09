-- Índices das chaves estrangeiras da Ora Connect apontados pelo advisor do Supabase (0001).
create index connect_habilitacoes_alterado_por on public.connect_habilitacoes (alterado_por);
create index connect_operacoes_unidade_organizacao on public.connect_operacoes (unidade_id, organizacao_id);
create index connect_producao_unidade_organizacao on public.connect_producao (unidade_id, organizacao_id);
