-- Reversão de 20261107140000_correcoes_revisao_codex. SOMENTE em banco sem dados reais:
-- remover a coluna organizacao_id apaga a informação de dono dos eventos de auditoria.
-- Em homologação/produção, corrigir com nova migration (roll-forward).
drop index if exists public.vinculos_um_aberto;
create unique index vinculos_um_aberto
  on public.vinculos (usuario_id, papel, coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where fim is null;
drop policy if exists auditoria_ler on public.auditoria;
drop trigger if exists auditoria_organizacao on public.auditoria;
drop function if exists privado.auditoria_completar_organizacao();
drop index if exists public.auditoria_organizacao_data;
alter table public.auditoria drop column if exists organizacao_id;
drop policy if exists perfis_ler on public.perfis_usuario;
drop function if exists privado.perfis_que_gero();
drop function if exists privado.organizacoes_com_permissao(text);
-- As políticas originais estão na migration 20261107120000_fundacao_acesso.sql e precisam
-- ser recriadas a partir dela (perfis_ler e auditoria_ler) e validar_vinculo restaurada.
