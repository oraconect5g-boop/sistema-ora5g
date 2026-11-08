-- Reversão de auditoria_automatica_acesso. Os eventos já gravados ficam na auditoria (ela só aceita inserção).
drop trigger if exists organizacoes_auditar on public.organizacoes;
drop trigger if exists empresas_auditar on public.empresas;
drop trigger if exists unidades_auditar on public.unidades;
drop trigger if exists perfis_usuario_auditar on public.perfis_usuario;
drop trigger if exists papeis_auditar on public.papeis;
drop trigger if exists permissoes_auditar on public.permissoes;
drop trigger if exists papel_permissoes_auditar on public.papel_permissoes;
drop trigger if exists vinculos_auditar on public.vinculos;
drop function if exists privado.auditar_mudanca();
drop index if exists public.auditoria_alvo;
