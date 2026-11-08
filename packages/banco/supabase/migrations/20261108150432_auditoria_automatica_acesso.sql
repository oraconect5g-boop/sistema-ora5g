-- =============================================================================
-- ORA-ORG-005 — Auditoria automática das mudanças de acesso e configuração
-- Toda inclusão, alteração ou remoção em organizações, empresas, unidades, perfis,
-- papéis, permissões, matriz papel × permissão e vínculos gera um evento na auditoria,
-- na mesma transação: quem (usuário logado ou papel do banco), quando, alvo, antes,
-- depois e motivo. Ninguém consegue mudar o acesso sem deixar rastro, nem pelo painel.
--
-- Motivo: vínculo usa a própria coluna "motivo"; as demais ações informam com
--   select set_config('ora.motivo', 'texto', true);   -- vale só até o fim da transação
-- Isolamento (REV-002): o evento pertence à organização do alvo. Mudança de perfil vira um
-- evento por organização em que a pessoa tem vínculo; sem vínculo, só o sistema vê.
-- Não audita: mudança apenas do último acesso (a entrada já é auditada por
-- selecionar_unidade) e alteração que não muda nada.
-- Reversão: supabase/reversao/<mesmo nome>.sql
-- =============================================================================

create or replace function privado.auditar_mudanca()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  antes jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  depois jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  linha jsonb := coalesce(depois, antes);
  ator uuid := (select auth.uid());
  acao text;
  alvo text;
  unidade uuid;
  organizacoes uuid[];
  motivo text;
  organizacao uuid;
begin
  if tg_op = 'UPDATE' and (antes - 'ultimo_acesso_em') = (depois - 'ultimo_acesso_em') then
    return null;
  end if;

  acao := tg_table_name || '.' || case tg_op when 'INSERT' then 'criado' when 'UPDATE' then 'alterado' else 'removido' end;
  if tg_table_name = 'vinculos' and tg_op = 'UPDATE' and antes ->> 'fim' is null and depois ->> 'fim' is not null then
    acao := 'vinculos.encerrado';
  elsif tg_table_name = 'perfis_usuario' and tg_op = 'UPDATE' and antes ->> 'status' is distinct from depois ->> 'status' then
    acao := 'perfis_usuario.' || case depois ->> 'status' when 'bloqueado' then 'bloqueado' else 'desbloqueado' end;
  end if;

  alvo := case tg_table_name
    when 'papel_permissoes' then (linha ->> 'papel') || ':' || (linha ->> 'permissao')
    when 'papeis' then linha ->> 'codigo'
    when 'permissoes' then linha ->> 'codigo'
    else linha ->> 'id'
  end;

  -- Tabelas futuras com unidade_id/organizacao_id (ex.: categorias) entram sem mudar esta função.
  unidade := case
    when tg_table_name = 'unidades' then (linha ->> 'id')::uuid
    when linha ? 'unidade_id' then (linha ->> 'unidade_id')::uuid
  end;

  organizacoes := case
    when tg_table_name = 'organizacoes' then array[(linha ->> 'id')::uuid]
    when tg_table_name = 'perfis_usuario' then (
      select array_agg(distinct v.organizacao_id) from public.vinculos v where v.usuario_id = (linha ->> 'id')::uuid
    )
    when linha ? 'organizacao_id' then array[(linha ->> 'organizacao_id')::uuid]
  end;
  -- Organização removida não pode ser dona do evento (a chave estrangeira recusaria a remoção).
  if tg_table_name = 'organizacoes' and tg_op = 'DELETE' then
    organizacoes := null;
  end if;

  motivo := coalesce(
    nullif(current_setting('ora.motivo', true), ''),
    case when tg_table_name = 'vinculos' then linha ->> 'motivo' end
  );

  foreach organizacao in array coalesce(organizacoes, array[null::uuid]) loop
    insert into public.auditoria (usuario_id, unidade_id, organizacao_id, acao, alvo_tipo, alvo_id, antes, depois, motivo, origem)
    values (ator, unidade, organizacao, acao, tg_table_name, alvo, antes, depois, motivo,
            case when ator is not null then 'aplicacao'
                 else coalesce('api:' || (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), 'banco:' || session_user)
            end);
  end loop;
  return null;
end;
$$;

revoke all on function privado.auditar_mudanca() from public, anon, authenticated;

create trigger organizacoes_auditar after insert or update or delete on public.organizacoes
  for each row execute function privado.auditar_mudanca();
create trigger empresas_auditar after insert or update or delete on public.empresas
  for each row execute function privado.auditar_mudanca();
create trigger unidades_auditar after insert or update or delete on public.unidades
  for each row execute function privado.auditar_mudanca();
create trigger perfis_usuario_auditar after insert or update or delete on public.perfis_usuario
  for each row execute function privado.auditar_mudanca();
create trigger papeis_auditar after insert or update or delete on public.papeis
  for each row execute function privado.auditar_mudanca();
create trigger permissoes_auditar after insert or update or delete on public.permissoes
  for each row execute function privado.auditar_mudanca();
create trigger papel_permissoes_auditar after insert or update or delete on public.papel_permissoes
  for each row execute function privado.auditar_mudanca();
create trigger vinculos_auditar after insert or update or delete on public.vinculos
  for each row execute function privado.auditar_mudanca();

create index if not exists auditoria_alvo on public.auditoria (alvo_tipo, alvo_id, ocorrido_em desc);
