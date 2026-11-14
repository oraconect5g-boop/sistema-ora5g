-- Reversão de 20261115003000_regioes.sql (lote ORG-009). Tira as lojas das regiões e apaga as regiões
-- (a auditoria guarda o que foi feito).
drop function if exists public.loja_definir_regiao(uuid, uuid, text);
drop function if exists public.regiao_salvar(uuid, uuid, text, boolean, text);
drop index if exists public.unidades_regiao;
alter table public.unidades drop constraint if exists unidades_regiao_fkey;
alter table public.unidades drop column if exists regiao_id;
drop table if exists public.regioes;
