-- =============================================================================
-- O segundo fator (lote ORG-007a: ORA-ORG-007, "autenticação reforçada para perfis privilegiados"; ADR-002 §2.6)
--
-- A verificação em duas etapas é a do próprio Supabase Auth (o código de 6 algarismos de um aplicativo autenticador
-- no celular, TOTP; gratuita e ligada em todo projeto): cada pessoa liga na tela "Segurança da conta" e, ao entrar,
-- digita o código depois da senha. Aqui o banco passa a EXIGIR o código de quem o ligou: a sessão de quem tem um fator
-- verificado e ainda não passou por ele (o JWT diz aal1) não ganha permissão nenhuma, nem pela tela nem pela API direta
-- com a chave pública. Sem isso o código seria enfeite: quem tivesse só a senha usaria a API.
--   * privado.segundo_fator_em_dia(): a sessão passou pelo segundo fator (aal2), ou a pessoa não tem fator verificado
--     (quem não ligou segue como antes);
--   * privado.vinculos_vigentes(), por onde passam todas as permissões (tem_permissao, unidades_com_permissao,
--     organizacoes_com_permissao, unidades_visiveis e a loja atual), passa a exigir o segundo fator em dia;
--   * public.situacao_da_sessao() ganha segundo_fator_pendente, para a tela levar ao código em vez de dizer que falta
--     permissão.
-- Tornar o código obrigatório para o dono e o administrador (ADR-002) é a decisão D-046, num lote seguinte.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function privado.segundo_fator_em_dia()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid()) and f.status = 'verified'
      );
$$;
revoke all on function privado.segundo_fator_em_dia() from public, anon, authenticated;

-- Igual à versão do acesso à sessão e à equipe (20261108202654), mais o segundo fator em dia.
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
    and (select privado.segundo_fator_em_dia())
    and v.inicio <= now()
    and (v.fim is null or v.fim > now())
    and (v.unidade_id is null or u.status = 'ativa');
$$;

-- A tela decide para onde levar: com o código pendente, para a tela do código (e não para "sem permissão").
-- A coluna nova muda o tipo devolvido: a função sai e volta, com as mesmas permissões.
drop function public.situacao_da_sessao();
create function public.situacao_da_sessao()
returns table (usuario_ativo boolean, sessao_no_turno boolean, unidade_id uuid, unidade_nome text, turno_termina_em timestamptz,
               segundo_fator_pendente boolean)
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
          where s.id = (select privado.sessao_atual()) and s.user_id = (select auth.uid())),
         not (select privado.segundo_fator_em_dia())
  from (select (select public.unidade_atual()) as atual) a
  left join public.unidades u on u.id = a.atual;
$$;
revoke all on function public.situacao_da_sessao() from public, anon;
grant execute on function public.situacao_da_sessao() to authenticated;
