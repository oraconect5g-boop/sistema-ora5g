-- Reversão de 20261111193816_crm_funil_e_agenda (só em banco sem dados reais).
-- Saem as funções, as tabelas do funil e da agenda e as duas permissões.
drop function if exists public.crm_agenda();
drop function if exists public.crm_funil();
drop function if exists public.oportunidade_detalhe(uuid);
drop function if exists public.atividade_encerrar(uuid, boolean, text);
drop function if exists public.atividade_criar(jsonb, text);
drop function if exists public.oportunidade_anotar(uuid, text);
drop function if exists public.oportunidade_atribuir(uuid, uuid, text);
drop function if exists public.oportunidade_mover(uuid, text, jsonb);
drop function if exists public.oportunidade_registrar(uuid, jsonb, text);
drop function if exists privado.crm_proximo_passo(jsonb, timestamptz);
drop function if exists privado.crm_evento(uuid, uuid, text, text, text, text);
drop function if exists privado.crm_atende_na_loja(uuid, uuid);
drop function if exists privado.crm_pode_conduzir(uuid, uuid);
drop table if exists public.atividades;
drop table if exists public.oportunidade_eventos;
drop table if exists public.oportunidades;
do $$
begin
  perform set_config('ora.motivo', 'Reversão do funil de oportunidades e da agenda', true);
  delete from public.papel_permissoes where permissao in ('crm.atender', 'crm.gerir');
  delete from public.permissoes where codigo in ('crm.atender', 'crm.gerir');
end;
$$;
