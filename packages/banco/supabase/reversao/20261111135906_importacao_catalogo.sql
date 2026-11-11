-- Reversão de 20261111135906_importacao_catalogo (só em banco sem dados reais).
-- O que as importações gravaram no catálogo continua (são dados); saem as funções e as tabelas da importação.
drop function if exists public.importacao_descartar(uuid, text);
drop function if exists public.importacao_desfazer(uuid, text);
drop function if exists public.importacao_aplicar(uuid, text);
drop function if exists public.importacao_catalogo_previa(uuid, text, text, jsonb, jsonb);
drop function if exists privado.trocar_preco_geral(uuid, uuid, bigint, text);
drop function if exists privado.custo_atual(uuid);
drop function if exists privado.preco_geral_aberto(uuid);
drop table if exists public.importacao_linhas;
drop table if exists public.importacoes;
