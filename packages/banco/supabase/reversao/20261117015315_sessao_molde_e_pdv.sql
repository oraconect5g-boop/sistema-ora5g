-- Reversão de 20261117015315_sessao_molde_e_pdv (as duas funções só leem: desfazer não perde nenhum
-- registro). Antes de desfazer, volte a plataforma para uma versão que não chame as duas funções.
drop function if exists public.pdv_tela();
drop function if exists public.molde_da_sessao(text[], text[]);
