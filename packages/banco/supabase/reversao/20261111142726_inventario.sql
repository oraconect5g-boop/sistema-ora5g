-- Reversão de 20261111142726_inventario (só em banco sem dados reais).
-- Os ajustes que os inventários aprovados lançaram continuam no livro (são dados); saem as funções e as tabelas.
drop function if exists public.inventario_decidir(uuid, boolean, text);
drop function if exists public.inventario_cancelar(uuid, text);
drop function if exists public.inventario_enviar(uuid, text);
drop function if exists public.inventario_contar(uuid, uuid, int, text[]);
drop function if exists public.inventario_abrir(uuid, uuid[], text, text);
drop table if exists public.inventario_itens;
drop table if exists public.inventarios;
