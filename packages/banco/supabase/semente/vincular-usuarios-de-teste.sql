-- =============================================================================
-- Liga ao banco de DESENVOLVIMENTO os usuários de teste que o proprietário criou no painel do
-- Supabase (Authentication → Users), com "+vendedor" ou "+dono" antes do @ no e-mail.
-- Não contém e-mail nem senha: encontra os usuários pelo sufixo. Pode rodar de novo.
--   +vendedor → vendedor na Santa Cândida (teste) e na Loja de teste 2 (testa a troca de loja)
--   +dono     → dono da organização de desenvolvimento (vê todas as lojas)
-- Rodar só depois de supabase/semente/desenvolvimento.sql.
-- =============================================================================
begin;
select set_config('ora.motivo', 'Usuários de teste do desenvolvimento', true);

insert into public.perfis_usuario (id, nome, email)
select u.id,
       case when u.email ilike '%+vendedor@%' then 'Vendedor de teste' else 'Dono de teste' end,
       lower(u.email)
from auth.users u
where u.email ilike '%+vendedor@%' or u.email ilike '%+dono@%'
on conflict (id) do nothing;

insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, unidade_id, motivo)
select p.id, '0a5e0000-0000-4000-8000-000000000001', 'vendedor', 'unidade', loja.id, 'Usuário de teste'
from public.perfis_usuario p
cross join (values ('0a5e0000-0000-4000-8000-000000000020'::uuid), ('0a5e0000-0000-4000-8000-000000000021'::uuid)) as loja (id)
where p.email ilike '%+vendedor@%'
on conflict do nothing;

insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, unidade_id, motivo)
select p.id, '0a5e0000-0000-4000-8000-000000000001', 'dono', 'organizacao', null, 'Usuário de teste'
from public.perfis_usuario p
where p.email ilike '%+dono@%'
on conflict do nothing;

commit;
