-- =============================================================================
-- Equipe: pessoas por papel (lote G5: linha 7 da matriz, U1)
--
-- public.equipe_por_papel(p_organizacao): quantas pessoas têm acesso vigente na rede (vínculo que já
-- começou e não terminou), no total e por papel. Quem tem dois papéis (vendedor numa loja e gerente
-- em outra) conta em cada um, e uma vez só no total; vendedor em duas lojas conta uma vez como
-- vendedor. Vínculo encerrado ou ainda por começar fica fora. A pessoa bloqueada continua contada (o
-- vínculo segue), e aparece à parte. Só para quem cuida da equipe da rede (usuarios.gerir num papel
-- da rede: dono e administrador); os demais recebem 42501, em vez de uma contagem parcial.
-- SECURITY INVOKER e STABLE: valem as regras de leitura de vínculos e perfis de quem chama.
-- Não cria tabela, coluna, política, permissão nem índice; não muda dado.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function public.equipe_por_papel(p_organizacao uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_organizacao is null or p_organizacao not in (select privado.organizacoes_com_permissao('usuarios.gerir')) then
    raise exception 'Sem permissão para ver a equipe desta rede' using errcode = '42501';
  end if;
  return (
    with
    vigentes as (
      select v.usuario_id, v.papel from public.vinculos v
      where v.organizacao_id = p_organizacao and v.inicio <= now() and (v.fim is null or v.fim > now())
    ),
    pessoas as (
      select p.id, p.status from public.perfis_usuario p
      where p.id in (select g.usuario_id from vigentes g)
    ),
    por_papel as (
      select g.papel, count(distinct g.usuario_id) as pessoas,
        count(distinct g.usuario_id) filter (where p.status = 'bloqueado') as bloqueadas
      from vigentes g
      join pessoas p on p.id = g.usuario_id
      group by g.papel
    )
    select jsonb_build_object(
      'pessoas', (select count(*) from pessoas),
      'bloqueadas', (select count(*) from pessoas p where p.status = 'bloqueado'),
      'papeis', coalesce((
        select jsonb_agg(jsonb_build_object('papel', x.papel, 'pessoas', x.pessoas, 'bloqueadas', x.bloqueadas) order by x.papel)
        from por_papel x), '[]'::jsonb)
    )
  );
end;
$$;
comment on function public.equipe_por_papel(uuid) is
  'Equipe (G5): pessoas com acesso vigente na rede, no total e por papel (quem tem dois papéis conta em cada um), com as bloqueadas à parte. Só para quem tem usuarios.gerir num papel da rede (security invoker).';
revoke all on function public.equipe_por_papel(uuid) from public, anon;
grant execute on function public.equipe_por_papel(uuid) to authenticated;
