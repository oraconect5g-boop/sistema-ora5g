-- =============================================================================
-- Os avisos do Supabase sobre o banco (lote BANCO-a; plano de 16/11/2026, onda 0, item 5; ORA-QUAL-002 e ORA-ORG-004,
-- coerência):
--
-- 1) Índices para as 10 chaves estrangeiras sem cobertura (aviso "unindexed foreign keys"): cada índice começa pelas
--    colunas da chave, na mesma ordem. Sem eles, apagar ou mudar a linha referenciada (uma loja, uma empresa, uma
--    entrada) obriga o banco a varrer a tabela inteira para conferir a chave. A base de hoje é pequena; o custo
--    aparece com os dados reais. Os índices ainda sem uso que o Supabase aponta ficam: a base está quase vazia.
-- 2) RLS ligado em privado.identificadores_itens (IMEI, IMEI2 e ICCID num só conjunto), a única tabela do esquema
--    privado sem ele. Não era risco (nenhum papel da API tem privilégio nela): é coerência. Só duas funções a usam,
--    as duas SECURITY DEFINER do dono do banco, que não passam pelo RLS.
-- 3) O comentário "acesso só por função" nas tabelas com RLS ligado e nenhuma política, de propósito (aviso "RLS
--    enabled no policy"): o acesso é só pelas funções do banco, como o comentário de public.pedidos_compra já dizia.
--
-- Nada muda em dado, função, política ou permissão.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Os índices das chaves estrangeiras (as colunas da chave, na mesma ordem)
-- -----------------------------------------------------------------------------
create index caixa_saidas_fk_unidade_organizacao on public.caixa_saidas (unidade_id, organizacao_id);
create index conta_pagar_anexos_fk_organizacao on public.conta_pagar_anexos (organizacao_id);
create index contas_a_pagar_fk_entrada_organizacao on public.contas_a_pagar (entrada_id, organizacao_id);
create index entradas_estoque_fk_pedido_organizacao on public.entradas_estoque (pedido_id, organizacao_id);
create index entradas_estoque_fk_unidade_organizacao on public.entradas_estoque (unidade_id, organizacao_id);
create index fotos_produto_fk_produto_organizacao on public.fotos_produto (produto_id, organizacao_id);
create index inventarios_fk_unidade_organizacao on public.inventarios (unidade_id, organizacao_id);
create index metas_fk_unidade_organizacao on public.metas (unidade_id, organizacao_id);
create index pedidos_compra_fk_unidade_organizacao on public.pedidos_compra (unidade_id, organizacao_id);
create index unidade_configuracoes_fk_unidade_organizacao on public.unidade_configuracoes (unidade_id, organizacao_id);

-- -----------------------------------------------------------------------------
-- 2) RLS na última tabela do privado sem ele
-- -----------------------------------------------------------------------------
alter table privado.identificadores_itens enable row level security;
revoke all on privado.identificadores_itens from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3) O comentário nas tabelas com RLS e nenhuma política, de propósito
-- -----------------------------------------------------------------------------
comment on table privado.cliente_dados is
  'Os dados que identificam o cliente: documento, telefone, e-mail, nascimento e endereço (L5a). Acesso só por função: RLS ligado e nenhuma política, de propósito; cada leitura fica registrada.';
comment on table privado.connect_dados_envio is
  'Os dados de cada operação da Ora Connect que vão à Nogle (ADR-005). Acesso só por função: RLS ligado e nenhuma política, de propósito.';
comment on table privado.connect_segredos is
  'O segredo por empresa para o resumo do titular na Ora Connect. Acesso só por função: RLS ligado e nenhuma política, de propósito; ninguém de fora lê, nem o worker.';
comment on table privado.crm_segredos is
  'O segredo por empresa para o resumo do documento e do telefone dos clientes (L5a). Acesso só por função: RLS ligado e nenhuma política, de propósito; ninguém de fora lê.';
comment on table privado.fotos_em_limpeza is
  'As fotos separadas para a limpeza do Storage (INTEG-b, #98). Acesso só por função: RLS ligado e nenhuma política, de propósito.';
comment on table privado.identificadores_itens is
  'IMEI, IMEI2 e ICCID dos itens num só conjunto, sem repetição (REV-020). Acesso só por função: RLS ligado e nenhuma política, de propósito; escreve o gatilho privado.registrar_identificadores, lê o inventário.';
comment on table privado.loja_reservas_contato is
  'O WhatsApp de quem reservou no site (ONLINE-b). Acesso só por função: RLS ligado e nenhuma política, de propósito; a loja vê pela função, com auditoria.';
comment on table privado.notas_destinatarios is
  'O destinatário da nota (documento, endereço e cliente) só até a emissão ou o cancelamento do pedido (ADR-006). Acesso só por função: RLS ligado e nenhuma política, de propósito.';
comment on table privado.whatsapp_destinos is
  'O telefone de cada envio da nota pelo WhatsApp (K1c). Acesso só por função: RLS ligado e nenhuma política, de propósito; o worker lê pela função.';
comment on table public.pedido_compra_itens is
  'Os itens do pedido de compra (INV-009a, ORA-INV-009). Acesso só por função: RLS ligado e nenhuma política, de propósito; lidos pelas funções pedidos_compra e pedido_compra.';
