-- Reversão de 20261111132621_catalogo_cadastro (só em banco sem dados reais).
-- Os cadastros feitos pelas funções continuam (são dados); saem as funções, os gatilhos, a chave do formulário e a permissão.
drop function if exists public.catalogo_salvar_variante(uuid, uuid, text, text, text, text, text, int, boolean, text);
drop function if exists public.catalogo_salvar_produto(uuid, uuid, text, text, uuid, uuid, text, text, boolean, boolean, text, text);
drop function if exists public.catalogo_salvar_marca(uuid, uuid, text, text);
drop function if exists public.catalogo_definir_politica_desconto(uuid, int, int, text);
drop function if exists public.catalogo_salvar_categoria(uuid, uuid, text, boolean, text);
drop function if exists privado.variante_usada(uuid);
drop function if exists privado.variante_com_estoque(uuid);
drop function if exists privado.gere_catalogo(uuid);
drop trigger if exists variantes_auditar on public.variantes;
drop trigger if exists produtos_auditar on public.produtos;
drop trigger if exists marcas_auditar on public.marcas;
drop index if exists public.produtos_chave_criacao;
alter table public.produtos drop column if exists chave_criacao;
do $$
begin
  perform set_config('ora.motivo', 'Reversão do cadastro do catálogo pela tela', true);
  delete from public.papel_permissoes where permissao = 'catalogo.gerir';
  delete from public.permissoes where codigo = 'catalogo.gerir';
end;
$$;
