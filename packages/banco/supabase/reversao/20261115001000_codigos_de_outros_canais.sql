-- Reversão de 20261115001000_codigos_de_outros_canais.sql (lote CAT-009). Apaga os códigos de outros canais
-- (a auditoria guarda o que foi ligado e desligado).
drop function if exists public.catalogo_variante_por_codigo(text, text);
drop function if exists public.catalogo_desligar_codigo(uuid, text);
drop function if exists public.catalogo_ligar_codigo(uuid, text, text, text, text);
drop table if exists public.variante_codigos_externos;
drop function if exists privado.variante_codigo_so_desligamento();
