-- Reversão da migration 20261107120000_fundacao_acesso.
-- ATENÇÃO: apaga as tabelas de acesso e a auditoria. Usar SOMENTE em banco de
-- desenvolvimento/teste sem dados reais. Em homologação/produção, corrigir com
-- uma nova migration (roll-forward), nunca com esta reversão.
drop table if exists public.contexto_sessao, public.vinculos, public.papel_permissoes,
  public.permissoes, public.papeis, public.perfis_usuario, public.unidades,
  public.empresas, public.organizacoes cascade;
drop trigger if exists auditoria_sem_truncate on public.auditoria;
drop table if exists public.auditoria cascade;
drop function if exists public.selecionar_unidade(uuid), public.tem_permissao(text, uuid),
  public.unidade_atual();
drop schema if exists privado cascade;
