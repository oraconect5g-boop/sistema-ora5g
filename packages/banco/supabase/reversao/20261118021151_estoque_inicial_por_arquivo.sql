-- Reversão de 20261118021151_estoque_inicial_por_arquivo: tira as funções e as tabelas da carga do estoque inicial por
-- arquivo. O que as cargas aplicadas lançaram no livro de estoque fica (o livro só aceita inserção): para devolver as
-- quantidades, desfaça cada carga aplicada antes de reverter (public.estoque_carga_desfazer). Antes de desfazer, volte a
-- plataforma para a versão anterior ao lote REIN-b: a tela da carga lê estas tabelas.
drop function if exists public.estoque_carga_desfazer(uuid, text);
drop function if exists public.estoque_carga_descartar(uuid, text);
drop function if exists public.estoque_carga_aplicar(uuid, text);
drop function if exists public.estoque_carga_previa(uuid, uuid, text, text, timestamptz, jsonb, jsonb);
drop table if exists public.estoque_carga_linhas;
drop table if exists public.estoque_cargas;
