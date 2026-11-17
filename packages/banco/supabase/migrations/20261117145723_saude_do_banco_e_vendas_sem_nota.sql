-- =============================================================================
-- Lote SAUDE-a (plano do proprietário de 16/11, Onda 0.6; ADR-012): o que é fila na Saúde da operação e a leitura leve
-- do banco na página pública /saude.
--
-- public.notas_vendas_sem_pedido(): a fila "Vendas sem pedido de nota" da Saúde da operação, para quem aprova nota
--   (nota.aprovar: dono e gerente), nas lojas onde a pessoa tem essa permissão. Conta as vendas concluídas (as canceladas
--   não entram) sem o pedido vivo da nota de venda e que não foram devolvidas inteiras: é o grupo "sem pedido" da
--   conciliação fiscal (public.notas_conciliacao, L10b), sem período, porque a fila mostra tudo o que espera. Devolve a
--   quantidade e a conclusão da mais antiga. Só leitura. Sem a permissão em loja nenhuma: 42501.
--
-- public.saude_do_banco(p_migracao): a leitura leve que a página /saude faz sem login. Devolve a hora do banco e se a
--   versão de migration pedida (14 dígitos) está no histórico do banco (supabase_migrations.schema_migrations): true, se
--   está; false, se não está; nulo, se a versão não vier certa ou se o histórico não existir. Não lê tabela de negócio
--   nem devolve dado de ninguém: o visitante executa de propósito, como a vitrine da loja online (o inventário de
--   autorização lista). A página manda a última migration da versão publicada: false quer dizer que a plataforma está à
--   frente do banco (a migration do lote vai antes da publicação).
--
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function public.notas_vendas_sem_pedido()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lojas uuid[] := array(select u from privado.unidades_com_permissao('nota.aprovar') u);
  resultado jsonb;
begin
  if coalesce(array_length(v_lojas, 1), 0) = 0 then
    raise exception 'Sem permissão para as notas' using errcode = '42501';
  end if;
  select jsonb_build_object('quantidade', count(*), 'desde', min(v.concluida_em))
    into resultado
  from public.vendas v
  where v.unidade_id = any (v_lojas)
    and v.situacao = 'concluida'
    and not (coalesce(v.devolvido_centavos, 0) > 0 and v.devolvido_centavos >= coalesce(v.total_centavos, 0))
    and not exists (
      select 1 from public.notas_pedidos p where p.venda_id = v.id and p.tipo = 'venda' and p.situacao <> 'cancelada'
    );
  return resultado;
end;
$$;

create or replace function public.saude_do_banco(p_migracao text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tem boolean;
begin
  if p_migracao ~ '^[0-9]{14}$' and to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'select exists (select 1 from supabase_migrations.schema_migrations where version = $1)' into v_tem using p_migracao;
  end if;
  return jsonb_build_object('hora', now(), 'migracao', v_tem);
end;
$$;

revoke all on function public.notas_vendas_sem_pedido() from public, anon;
grant execute on function public.notas_vendas_sem_pedido() to authenticated;
revoke all on function public.saude_do_banco(text) from public;
grant execute on function public.saude_do_banco(text) to anon, authenticated;
