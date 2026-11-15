-- Reversão de 20261115170000_segundo_fator (lote ORG-007a): a exigência do segundo fator sai das permissões e da
-- situação da sessão, que volta a ter as cinco colunas de antes. Os fatores cadastrados ficam no Supabase Auth (são
-- do Auth, não do banco do sistema): sem esta exigência, a sessão sem o código volta a ter as permissões.
create or replace function privado.vinculos_vigentes()
returns table (papel text, escopo text, organizacao_id uuid, unidade_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select v.papel, v.escopo, v.organizacao_id, v.unidade_id
  from public.vinculos v
  join public.papeis pa on pa.codigo = v.papel and pa.ativo
  join public.organizacoes o on o.id = v.organizacao_id and o.status = 'ativa'
  left join public.unidades u on u.id = v.unidade_id
  where v.usuario_id = (select auth.uid())
    and (select privado.usuario_ativo())
    and (select privado.sessao_no_turno())
    and v.inicio <= now()
    and (v.fim is null or v.fim > now())
    and (v.unidade_id is null or u.status = 'ativa');
$$;

drop function public.situacao_da_sessao();
create function public.situacao_da_sessao()
returns table (usuario_ativo boolean, sessao_no_turno boolean, unidade_id uuid, unidade_nome text, turno_termina_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select (select privado.usuario_ativo()),
         (select privado.sessao_no_turno()),
         u.id,
         u.nome,
         (select privado.fim_do_turno(s.created_at)
          from auth.sessions s
          where s.id = (select privado.sessao_atual()) and s.user_id = (select auth.uid()))
  from (select (select public.unidade_atual()) as atual) a
  left join public.unidades u on u.id = a.atual;
$$;
revoke all on function public.situacao_da_sessao() from public, anon;
grant execute on function public.situacao_da_sessao() to authenticated;

drop function privado.segundo_fator_em_dia();
