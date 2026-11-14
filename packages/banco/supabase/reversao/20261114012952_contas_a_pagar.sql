-- Reversão de 20261114012952_contas_a_pagar. ATENÇÃO: apaga as contas a pagar lançadas e as categorias
-- (com os pagamentos registrados nelas). A auditoria guarda o histórico de cada mudança.
drop function if exists public.contas_a_pagar_resumo(uuid, boolean);
drop function if exists public.conta_pagar_categoria_salvar(uuid, text, boolean);
drop function if exists public.conta_pagar_cancelar(uuid, text, boolean);
drop function if exists public.conta_pagar_desfazer_pagamento(uuid, text);
drop function if exists public.conta_pagar_pagar(uuid, date, bigint, text);
drop function if exists public.conta_pagar_corrigir(uuid, jsonb, text);
drop function if exists public.conta_pagar_lancar(jsonb, text);
drop table if exists public.contas_a_pagar;
drop trigger if exists organizacoes_categorias_contas_pagar on public.organizacoes;
drop function if exists privado.contas_pagar_categorias_da_organizacao();
drop function if exists privado.contas_pagar_semear_categorias(uuid);
drop table if exists public.contas_pagar_categorias;
drop function if exists privado.pode_gerir_conta_pagar(uuid, uuid);
do $$
begin
  perform set_config('ora.motivo', 'Reversão das contas a pagar (L8a)', true);
  delete from public.papel_permissoes where permissao = 'conta_pagar.gerir';
  delete from public.permissoes where codigo = 'conta_pagar.gerir';
end;
$$;
