-- Reversão de vendas_pagamentos_e_caixa. SOMENTE em banco sem dados reais: apaga vendas, itens,
-- pagamentos, valores a receber, aprovações e caixas, e a permissão venda.cancelar. Os movimentos
-- de estoque que as vendas lançaram ficam no livro (ele só aceita inserção); a auditoria também.
drop function if exists public.abrir_caixa(bigint, text), public.movimentar_caixa(text, bigint, text, text),
  public.fechar_caixa(bigint, text), public.conferir_caixa(uuid, text), public.criar_venda(text),
  public.adicionar_item(uuid, uuid, uuid, int, text), public.remover_item(uuid), public.aplicar_desconto(uuid, bigint),
  public.pedir_aprovacao(uuid, text), public.decidir_aprovacao(uuid, boolean, text),
  public.concluir_venda(uuid, jsonb, jsonb, text), public.cancelar_venda(uuid, text);
drop function if exists privado.atualizar_espera_de_aprovacao(uuid), privado.abaixo_do_custo(public.venda_itens),
  privado.maximo_sem_aprovacao(public.venda_itens), privado.conteudo_do_item(public.venda_itens),
  privado.minha_venda_aberta(uuid), privado.meu_caixa_aberto(), privado.dinheiro_no_caixa(uuid);
drop table if exists public.contas_a_receber, public.venda_pagamentos, public.aprovacoes_desconto, public.venda_itens_custos,
  public.venda_itens, public.vendas, public.caixa_movimentos, public.caixas;
drop function if exists privado.meio_com_comprovante(text), privado.meio_financeira(text), privado.meio_valido(text), privado.so_insercao();
do $$
begin
  perform set_config('ora.motivo', 'Reversão de vendas_pagamentos_e_caixa', true);
  delete from public.papel_permissoes where permissao = 'venda.cancelar';
  delete from public.permissoes where codigo = 'venda.cancelar';
end;
$$;
