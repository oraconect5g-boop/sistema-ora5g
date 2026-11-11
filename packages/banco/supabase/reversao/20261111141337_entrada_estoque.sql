-- Reversão de 20261111141337_entrada_estoque (só em banco sem dados reais).
-- O estoque e os custos lançados pelas entradas continuam no livro (são dados); saem as funções, as tabelas e a permissão.
drop function if exists public.estoque_estornar_entrada(uuid, text);
drop function if exists public.estoque_registrar_entrada(uuid, text, uuid, text, jsonb, text, text);
drop function if exists public.fornecedor_salvar(uuid, uuid, text, text, text, boolean, text);
drop table if exists public.entrada_itens;
drop table if exists public.entradas_estoque;
drop table if exists public.fornecedores;
do $$
begin
  perform set_config('ora.motivo', 'Reversão da entrada de mercadoria pela tela', true);
  delete from public.papel_permissoes where permissao = 'estoque.receber';
  delete from public.permissoes where codigo = 'estoque.receber';
end;
$$;
